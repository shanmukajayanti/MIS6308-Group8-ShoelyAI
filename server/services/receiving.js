// UC6 — Receive Shipment & Reconcile Discrepancies (Section 10.6 rules).
import { all, get, run, insert, update, tx } from '../db.js';
import { now, hoursSince, itemById, itemLabel, storeManager, regionalManager, notify, logAction } from '../util.js';
import { getPO } from './orders.js';

const ACTIONS = ['request_credit', 'request_replacement', 'accept_variance', 'return_to_supplier', 'contact_supplier'];

/** Rule 2/4/5: classify one variance. Deterministic; the LLM may refine the plain-language summary only. */
export function classify({ ordered, received, condition, onPO }) {
  const pct = ordered > 0 ? Math.abs(received - ordered) / ordered : 1;
  if (!onPO) return { type: 'wrong_item', severity: 'high', action: 'return_to_supplier' };
  if (condition === 'damaged') return { type: 'damaged_goods', severity: 'high', action: 'return_to_supplier' };
  if (condition === 'partial_damage') return { type: 'damaged_goods', severity: 'medium', action: 'request_replacement' };
  const severity = pct > 0.25 ? 'high' : pct > 0.10 ? 'medium' : 'low';
  if (received < ordered) return { type: 'short_shipment', severity, action: severity === 'high' ? 'contact_supplier' : 'request_credit' };
  return { type: 'over_shipment', severity, action: severity === 'high' ? 'return_to_supplier' : 'accept_variance' };
}
const routeTo = (type, severity) => (type === 'short_shipment' && severity === 'low' ? 'Receiving Lead' : type === 'over_shipment' && severity !== 'high' ? 'Store Manager' : 'Supplier Relations');

export async function receiveShipment(poId, rows, { receivedBy = 'CLK-004', carrier = null, tracking = null } = {}) {
  const po = getPO(poId);
  if (!po) throw new Error(`PO-${poId} not found`);
  if (!['sent', 'acknowledged', 'in_production', 'shipped', 'delayed'].includes(po.status)) throw new Error(`PO-${poId} is ${po.status}; not open for receiving`);
  if (!rows?.length) throw new Error('No received lines supplied');
  const mgr = storeManager(po.store_id);
  const poQty = Object.fromEntries(po.lines.map((l) => [l.item_id, l.quantity_ordered]));
  const lines = new Map();
  for (const r of rows) { // aggregate scans per item
    const cur = lines.get(r.itemId) || { itemId: r.itemId, qty: 0, condition: 'good', photo: null };
    cur.qty += Number(r.qty) || 0;
    if (r.condition && r.condition !== 'good') cur.condition = r.condition;
    if (r.photo) cur.photo = r.photo;
    lines.set(r.itemId, cur);
  }
  for (const id of Object.keys(poQty)) if (!lines.has(Number(id))) lines.set(Number(id), { itemId: Number(id), qty: 0, condition: 'good', photo: null }); // not received at all

  const outcome = tx(() => {
    const receiptId = insert('shipment_receipt', { po_id: poId, received_by: receivedBy, received_at: now(), carrier, tracking_number: tracking });
    let matched = 0, variance = 0, goodLines = 0; const discs = [];
    for (const l of lines.values()) {
      const onPO = l.itemId in poQty, ordered = poQty[l.itemId] || 0;
      insert('received_line_item', { receipt_id: receiptId, item_id: l.itemId, quantity_expected: ordered, quantity_received: l.qty, item_condition: l.condition, photo_evidence: l.photo });
      const isMatch = onPO && l.qty === ordered && l.condition === 'good';
      if (isMatch) { matched += l.qty; goodLines++; continue; }
      const c = classify({ ordered, received: l.qty, condition: l.condition, onPO });
      const v = c.type === 'damaged_goods' ? Math.max(l.qty, 1) : l.qty - ordered;
      matched += onPO && l.condition === 'good' ? Math.min(l.qty, ordered) : 0;
      variance += Math.abs(c.type === 'damaged_goods' ? l.qty : l.qty - ordered);
      const needsPhoto = c.type === 'damaged_goods' && !l.photo;                             // rule 6
      discs.push({ ...l, ...c, variance: v, ordered, status: needsPhoto ? 'pending_documentation' : 'open' });
    }
    const matchStatus = discs.length === 0 ? 'full_match' : goodLines === 0 ? 'mismatch' : 'partial_match';
    insert('reconciliation_result', { receipt_id: receiptId, po_id: poId, match_status: matchStatus, total_quantity_matched: matched, total_quantity_variance: variance, rationale: null });
    const ids = [];
    for (const d of discs) {
      const item = itemById(d.itemId);
      const summary = { short_shipment: `Received ${d.qty} of ${d.ordered} ordered (${-d.variance} short).`, over_shipment: `Received ${d.qty} vs ${d.ordered} ordered (${d.variance} over).`, damaged_goods: `${d.qty} pairs reported ${d.condition.replace('_', ' ')}${d.photo ? ' (photo attached)' : ' — photo evidence required before a supplier claim'}.`, wrong_item: `${item.item_name} size ${item.size} was shipped but is not on the PO (${d.qty} pairs).`, quality_mismatch: 'Quality differs from order.' }[d.type];
      const id = insert('discrepancy', { receipt_id: receiptId, po_id: poId, item_id: d.itemId, discrepancy_type: d.type, quantity_variance: d.variance, severity: d.severity, status: d.status, recommended_action: d.action, summary: `${itemLabel(item)}: ${summary}`, photo_evidence: d.photo, flagged_at: now() });
      if (d.status === 'open') routeDiscrepancy(id);
      ids.push(id);
    }
    // goods that are good and expected go into stock now; damaged/disputed goods wait for the manager's resolution
    for (const l of lines.values()) if (l.itemId in poQty && l.condition === 'good') addStock(l.itemId, po.store_id, Math.min(l.qty, poQty[l.itemId]));
    update('purchase_order', 'po_id', poId, { status: 'delivered', updated_at: now() });
    return { receiptId, matchStatus, matched, variance, discrepancyIds: ids };
  });
  const summary = outcome.matchStatus === 'full_match' ? `Receipt ${outcome.receiptId} fully reconciled against PO-${poId}; inventory updated.` : `Receipt ${outcome.receiptId} against PO-${poId}: ${outcome.matchStatus}, ${outcome.discrepancyIds.length} discrepancies flagged.`;
  if (outcome.matchStatus !== 'full_match') notify(mgr.manager_id, 'exception', `Receiving discrepancies on PO-${poId}`, summary);
  return { ...outcome, summary, reconciliation: reconciliationFor(outcome.receiptId) };
}

function addStock(itemId, storeId, qty) {
  if (qty <= 0) return;
  const ex = get(`SELECT 1 FROM inventory_record WHERE item_id=? AND store_id=?`, itemId, storeId);
  if (ex) run(`UPDATE inventory_record SET quantity_on_hand=quantity_on_hand+?, last_updated_at=? WHERE item_id=? AND store_id=?`, qty, now(), itemId, storeId);
  else insert('inventory_record', { item_id: itemId, store_id: storeId, quantity_on_hand: qty, last_updated_at: now() });
}

function routeDiscrepancy(id) {
  const d = get(`SELECT * FROM discrepancy WHERE discrepancy_id=?`, id);
  insert('exception_routing', { discrepancy_id: id, routed_to: routeTo(d.discrepancy_type, d.severity), reason: d.summary, recommended_action: d.recommended_action, priority: d.severity, routed_at: now() });
}

export function reconciliationFor(receiptId) {
  const rr = get(`SELECT * FROM reconciliation_result WHERE receipt_id=?`, receiptId);
  if (!rr) return null;
  rr.lines = all(`SELECT l.*, i.item_name, i.size, i.colorway FROM received_line_item l JOIN item i USING(item_id) WHERE receipt_id=?`, receiptId);
  rr.discrepancies = all(`SELECT d.*, i.item_name, i.size, e.routed_to FROM discrepancy d JOIN item i USING(item_id) LEFT JOIN exception_routing e USING(discrepancy_id) WHERE receipt_id=?`, receiptId);
  return rr;
}

/** Clerk attaches photo evidence -> pending_documentation discrepancy becomes open and is routed. */
export function attachPhoto(discId, photo) {
  const d = get(`SELECT * FROM discrepancy WHERE discrepancy_id=?`, discId);
  if (!d) throw new Error('Discrepancy not found');
  update('discrepancy', 'discrepancy_id', discId, { photo_evidence: photo || 'photo-attached.jpg', status: d.status === 'pending_documentation' ? 'open' : d.status });
  if (d.status === 'pending_documentation') routeDiscrepancy(discId);
  return get(`SELECT * FROM discrepancy WHERE discrepancy_id=?`, discId);
}

/** Store Manager resolves; the agent never resolves on its own. */
export function resolveDiscrepancy(discId, managerId, action) {
  const d = get(`SELECT * FROM discrepancy WHERE discrepancy_id=?`, discId);
  if (!d) throw new Error('Discrepancy not found');
  if (d.status === 'resolved') throw new Error('Already resolved');
  if (d.status === 'pending_documentation') throw new Error('Photo evidence is required before this discrepancy can be actioned');
  action = action || d.recommended_action;
  if (!ACTIONS.includes(action)) throw new Error('Unknown action');
  const po = get(`SELECT * FROM purchase_order WHERE po_id=?`, d.po_id);
  if (action === 'accept_variance' && d.discrepancy_type !== 'wrong_item') {
    const rl = get(`SELECT quantity_received q FROM received_line_item WHERE receipt_id=? AND item_id=?`, d.receipt_id, d.item_id);
    if (d.discrepancy_type === 'damaged_goods' || d.discrepancy_type === 'over_shipment') addStock(d.item_id, po.store_id, d.discrepancy_type === 'over_shipment' ? d.quantity_variance : rl.q);
  }
  update('discrepancy', 'discrepancy_id', discId, { status: 'resolved', resolution: action, resolved_at: now() });
  if (['request_credit', 'request_replacement', 'return_to_supplier', 'contact_supplier'].includes(action)) insert('llm_supplier_prompt', { po_id: d.po_id, channel: 'Email', tone: 'escalation', subject: `PO-${d.po_id} ${action}`, body: `Re PO-${d.po_id}: ${d.summary} Requested resolution: ${action.replace(/_/g, ' ')}.`, created_at: now() });
  logAction(managerId, po.store_id, 'Instruction', `Resolved discrepancy DS-${discId} with ${action}`);
  return get(`SELECT * FROM discrepancy WHERE discrepancy_id=?`, discId);
}

/** 48h reminder; 5 business days (~7 days) escalation to Regional/Ops. */
export function discrepancyTimers() {
  const out = [];
  for (const d of all(`SELECT d.*, p.store_id FROM discrepancy d JOIN purchase_order p USING(po_id) WHERE d.status IN ('open','under_review')`)) {
    const h = hoursSince(d.flagged_at);
    if (h > 24 * 7) { update('discrepancy', 'discrepancy_id', d.discrepancy_id, { status: 'escalated' }); notify(regionalManager().manager_id, 'escalation', `Escalated: DS-${d.discrepancy_id} unresolved`, d.summary); out.push(`DS-${d.discrepancy_id} escalated`); }
    else if (h > 48 && !get(`SELECT 1 FROM notification WHERE kind='reminder' AND subject LIKE ?`, `%DS-${d.discrepancy_id}%`)) { notify(storeManager(d.store_id).manager_id, 'reminder', `Reminder: DS-${d.discrepancy_id} awaiting resolution`, d.summary); out.push(`DS-${d.discrepancy_id} reminder`); }
  }
  return out;
}
