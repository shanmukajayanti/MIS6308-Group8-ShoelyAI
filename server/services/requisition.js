// UC3 — Draft Purchase Requisition / PO,  UC4 — Review & Approve/Reject Requisition (Section 10.3 / 10.4 rules).
import { all, get, insert, update, tx } from '../db.js';
import { now, hoursSince, approvalLimit, itemById, itemLabel, storeById, storeManager, regionalManager, notify, logAction } from '../util.js';
import { getForecast } from './forecast.js';
import { draftText } from '../llm.js';
import { issuePO } from './orders.js';

const OPEN_REQ = `('Draft','Flagged','On Hold','Pending Auto Approval','Pending Manager Review','Approved')`;
export const openRequisition = (itemId, storeId) => get(
  `SELECT r.* FROM requisition r JOIN requisition_line_item l USING(requisition_id) WHERE l.item_id=? AND r.store_id=? AND r.requisition_status IN ${OPEN_REQ}`, itemId, storeId);
export const openOrderFor = (itemId, storeId) => get(
  `SELECT p.* FROM purchase_order p JOIN po_line_item l USING(po_id) WHERE l.item_id=? AND p.store_id=? AND p.status NOT IN ('delivered','cancelled')`, itemId, storeId);

export function supplierOptions(itemId) {
  return all(`SELECT s.*, p.unit_price FROM supplier_item_price p JOIN supplier s USING(supplier_id) WHERE p.item_id=? ORDER BY p.unit_price`, itemId);
}

export function getRequisition(id) {
  const r = get(`SELECT r.*, s.store_name, sp.supplier_name, sp.supplier_valid_flag, sp.lead_time_days FROM requisition r JOIN store s USING(store_id) LEFT JOIN supplier sp USING(supplier_id) WHERE requisition_id=?`, id);
  if (!r) return null;
  r.lines = all(`SELECT l.*, i.item_name, i.size, i.colorway, i.sku FROM requisition_line_item l JOIN item i USING(item_id) WHERE requisition_id=?`, id);
  r.forecast = r.forecast_id ? get(`SELECT * FROM demand_forecast WHERE forecast_id=?`, r.forecast_id) : null;
  r.decisions = all(`SELECT d.*, m.manager_name FROM approval_decision d LEFT JOIN manager m ON m.manager_id=d.reviewed_by WHERE requisition_id=? ORDER BY decision_id DESC`, id);
  r.po = get(`SELECT po_id, status FROM purchase_order WHERE requisition_id=?`, id);
  return r;
}

/** Approve a pending recommendation (manager action) and hand it to requisition drafting. */
export async function approveRecommendation(recId, managerId) {
  const rec = get(`SELECT * FROM reorder_recommendation WHERE recommendation_id=?`, recId);
  if (!rec) throw new Error(`Recommendation RR-${recId} not found`);
  if (rec.recommendation_status !== 'Pending') throw new Error(`RR-${recId} is ${rec.recommendation_status}, not Pending`);
  update('reorder_recommendation', 'recommendation_id', recId, { recommendation_status: 'Approved' });
  logAction(managerId, rec.store_id, 'Approval', `Approved recommendation RR-${recId}`, { recommendationId: recId });
  const req = await draftRequisition(recId);
  return { recommendation: get(`SELECT * FROM reorder_recommendation WHERE recommendation_id=?`, recId), requisition: req.requisitionId ? getRequisition(req.requisitionId) : null, draft: req };
}
export function rejectRecommendation(recId, managerId, reason) {
  const rec = get(`SELECT * FROM reorder_recommendation WHERE recommendation_id=?`, recId);
  if (!rec) throw new Error(`Recommendation RR-${recId} not found`);
  if (rec.recommendation_status !== 'Pending') throw new Error(`RR-${recId} is ${rec.recommendation_status}, not Pending`);
  update('reorder_recommendation', 'recommendation_id', recId, { recommendation_status: 'Rejected' });
  logAction(managerId, rec.store_id, 'Rejection', `Rejected recommendation RR-${recId}${reason ? ': ' + reason : ''}`, { recommendationId: recId });
  return get(`SELECT * FROM reorder_recommendation WHERE recommendation_id=?`, recId);
}

export async function draftRequisition(recId, { supplierId = null } = {}) {
  const rec = get(`SELECT * FROM reorder_recommendation WHERE recommendation_id=?`, recId);
  const item = itemById(rec.item_id), store = storeById(rec.store_id), mgr = storeManager(rec.store_id);
  const inv = get(`SELECT * FROM inventory_record WHERE item_id=? AND store_id=?`, rec.item_id, rec.store_id);
  const limit = approvalLimit();

  const dup = openRequisition(rec.item_id, rec.store_id);                                   // rule 3
  if (dup) return { decision: 'flagged', reason: `Open requisition REQ-${dup.requisition_id} already exists for this item and store`, requisitionId: null };

  const fc = await getForecast(rec.item_id, rec.store_id);
  const opts = supplierOptions(rec.item_id);
  const sup = supplierId ? opts.find((o) => o.supplier_id === supplierId) : opts[0];
  const level = inv ? inv.quantity_on_hand : null;
  const confident = fc && fc.predicted_demand != null && ['High', 'Medium'].includes(fc.forecast_confidence);
  let qty = confident ? fc.predicted_demand - (level ?? 0) : rec.suggested_quantity;     // rule 4
  qty = Math.max(qty || 0, 0);
  const cp = item.case_pack || 1; if (qty > 0 && cp > 1) qty = Math.ceil(qty / cp) * cp;
  const cost = sup && qty ? Math.round(qty * sup.unit_price * 100) / 100 : null;       // rule 5

  let status, method = null, note = null;
  if (level == null || !fc || !sup || qty <= 0) { status = 'Flagged'; note = !sup ? 'No supplier available for this item' : !fc ? 'Forecast missing' : qty <= 0 ? 'Recommended quantity is zero (stock already covers forecast)' : 'Inventory data missing'; } // rule 1
  else if (sup.supplier_valid_flag === 'No') { status = 'On Hold'; note = `Supplier ${sup.supplier_name} is not valid — correct supplier information or choose another supplier`; }          // rule 2
  else if (!confident || fc.review_flag === 'Yes' || rec.review_flag === 'Yes') { status = 'Pending Manager Review'; method = 'Manager'; note = 'Forecast confidence low or flagged — manager review required'; }                       // rule 6
  else if (cost <= limit) { status = 'Pending Auto Approval'; method = 'Auto'; }                                                                                                                                  // rule 7
  else { status = 'Pending Manager Review'; method = 'Manager'; note = `Cost $${cost.toFixed(2)} exceeds auto-approval limit $${limit.toFixed(2)}`; }

  const template = fc && qty > 0 ? `Forecast shows ${fc.predicted_demand ?? 'n/a'} pairs over the next 30 days (${fc.forecast_confidence} confidence) against ${level} on hand (threshold ${rec.reorder_threshold}). Ordering ${qty} pairs covers projected demand through the ${sup?.lead_time_days ?? '?'}-day supplier lead time. ${fc.forecast_justification}` : (note || 'Insufficient data');
  const justification = await draftText('requisition_justification', 'You are Shoely, an inventory agent. Write a 2-3 sentence forecast-based justification for a purchase requisition. Use only the facts given; do not invent numbers.', JSON.stringify({ item: itemLabel(item), store: store.store_name, onHand: level, threshold: rec.reorder_threshold, predictedDemand30d: fc?.predicted_demand, confidence: fc?.forecast_confidence, quantity: qty, supplier: sup?.supplier_name, leadTimeDays: sup?.lead_time_days }), template);

  const id = tx(() => {
    const rid = insert('requisition', { recommendation_id: recId, store_id: rec.store_id, forecast_id: fc?.forecast_id ?? null, supplier_id: sup?.supplier_id ?? null, inventory_level: level ?? 0, reorder_threshold: rec.reorder_threshold, total_estimated_cost: cost, approval_limit: limit, approval_method: method, requisition_status: status, status_note: note, created_at: now() });
    if (qty > 0) insert('requisition_line_item', { requisition_id: rid, item_id: rec.item_id, recommended_quantity: qty, unit_price: sup?.unit_price ?? null, forecast_justification: justification });
    return rid;
  });
  update('reorder_recommendation', 'recommendation_id', recId, { recommendation_status: 'Approved' });

  if (status === 'Pending Auto Approval') {
    insert('approval_decision', { requisition_id: id, reviewed_by: null, decision_type: 'Auto Approved', reviewed_at: now(), reason: `Within auto-approval limit $${limit}` });
    const po = await issuePO(id);
    return { decision: 'auto_approved', requisitionId: id, poId: po.po_id };
  }
  if (status === 'Pending Manager Review') notify(mgr.manager_id, 'approval', `Requisition REQ-${id} needs your review`, `${itemLabel(item)} · ${qty} pairs · $${cost?.toFixed(2)}. ${note || ''}`);
  else notify(mgr.manager_id, 'exception', `Requisition REQ-${id} ${status}`, note || '');
  return { decision: status === 'Pending Manager Review' ? 'routed_to_manager' : status === 'On Hold' ? 'on_hold' : 'flagged', requisitionId: id, status, note };
}

export async function decideRequisition(reqId, managerId, type, reason) {
  const r = get(`SELECT * FROM requisition WHERE requisition_id=?`, reqId);
  if (!r) throw new Error(`REQ-${reqId} not found`);
  if (!['Approved', 'Rejected', 'Returned For Revision'].includes(type)) throw new Error('Decision must be Approved, Rejected or Returned For Revision');
  if (['Rejected', 'Returned For Revision'].includes(type) && !reason?.trim()) throw new Error('A reason is required for rejection or return');
  if (type === 'Approved' && r.requisition_status !== 'Pending Manager Review') throw new Error(`REQ-${reqId} is "${r.requisition_status}" and cannot be approved`);
  if (!OPEN_REQ.includes(r.requisition_status)) throw new Error(`REQ-${reqId} is already ${r.requisition_status}`);
  const esc = /escalated/.test(r.status_note || '');
  insert('approval_decision', { requisition_id: reqId, reviewed_by: managerId, decision_type: type, reviewed_at: now(), reason: reason || null, escalated_flag: esc ? 'Yes' : 'No', escalated_date: esc ? now().slice(0, 10) : null });
  update('requisition', 'requisition_id', reqId, { requisition_status: type, approval_method: r.approval_method || 'Manager' });
  logAction(managerId, r.store_id, type === 'Approved' ? 'Approval' : 'Rejection', `${type} requisition REQ-${reqId}${reason ? ': ' + reason : ''}`);
  if (type === 'Approved') await issuePO(reqId);
  return getRequisition(reqId);
}

/** Agent revision after a return/rejection (or on-hold fix): closes the old requisition and redrafts with fresh data. */
export async function reviseRequisition(reqId, { supplierId = null } = {}) {
  const r = get(`SELECT * FROM requisition WHERE requisition_id=?`, reqId);
  if (!r?.recommendation_id) throw new Error('Requisition has no source recommendation');
  if (['PO Issued', 'Approved'].includes(r.requisition_status)) throw new Error('Requisition already approved');
  if (['Flagged', 'On Hold', 'Pending Manager Review', 'Draft'].includes(r.requisition_status)) update('requisition', 'requisition_id', reqId, { requisition_status: 'Returned For Revision', status_note: 'Superseded by revision' });
  return draftRequisition(r.recommendation_id, { supplierId });
}

/** UC4 E3: reminder after 24h, escalation to Regional/Ops after 48h without a manager response. */
export function reviewTimers() {
  const out = [];
  for (const r of all(`SELECT * FROM requisition WHERE requisition_status='Pending Manager Review'`)) {
    const h = hoursSince(r.created_at), note = r.status_note || '';
    if (h > 48 && !/escalated/.test(note)) {
      const reg = regionalManager(); notify(reg.manager_id, 'escalation', `Escalated: REQ-${r.requisition_id} unreviewed for ${Math.round(h)}h`, 'Store Manager has not responded.');
      update('requisition', 'requisition_id', r.requisition_id, { status_note: note + ' [escalated]' }); out.push(`REQ-${r.requisition_id} escalated`);
    } else if (h > 24 && !/reminded|escalated/.test(note)) {
      const m = storeManager(r.store_id); notify(m.manager_id, 'reminder', `Reminder: REQ-${r.requisition_id} awaiting review`, `Pending ${Math.round(h)}h.`);
      update('requisition', 'requisition_id', r.requisition_id, { status_note: note + ' [reminded]' }); out.push(`REQ-${r.requisition_id} reminder`);
    }
  }
  return out;
}
