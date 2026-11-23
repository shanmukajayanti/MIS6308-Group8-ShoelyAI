// UC5 — Send PO & Track Order Status (Section 10.5 rules).
import { all, get, insert, update, tx } from '../db.js';
import { now, today, addDays, daysBetween, hoursSince, storeManager, regionalManager, notify } from '../util.js';
import { jsonTask, draftText } from '../llm.js';
import { latestForecast } from './forecast.js';

export function getPO(id) {
  const p = get(`SELECT p.*, s.supplier_name, s.preferred_channel, s.contact_email, st.store_name FROM purchase_order p JOIN supplier s USING(supplier_id) JOIN store st USING(store_id) WHERE po_id=?`, id);
  if (!p) return null;
  p.lines = all(`SELECT l.*, i.item_name, i.size, i.colorway, i.sku FROM po_line_item l JOIN item i USING(item_id) WHERE po_id=?`, id);
  p.updates = all(`SELECT * FROM order_status_update WHERE po_id=? ORDER BY update_id DESC`, id);
  p.delayFlags = all(`SELECT * FROM delay_flag WHERE po_id=? ORDER BY flag_id DESC`, id);
  p.alerts = all(`SELECT a.*, m.manager_name FROM manager_alert a LEFT JOIN manager m ON m.manager_id=a.recipient_id WHERE po_id=? ORDER BY alert_id DESC`, id);
  p.correspondence = all(`SELECT * FROM llm_supplier_prompt WHERE po_id=? ORDER BY prompt_id DESC`, id);
  p.receipts = all(`SELECT r.*, rr.match_status FROM shipment_receipt r LEFT JOIN reconciliation_result rr USING(receipt_id) WHERE r.po_id=?`, id);
  return p;
}

/** Create the PO from an approved requisition, then transmit it. Only approved / auto-approved requisitions can be issued. */
export async function issuePO(reqId) {
  const r = get(`SELECT * FROM requisition WHERE requisition_id=?`, reqId);
  const approved = r && (r.requisition_status === 'Approved' || r.requisition_status === 'Pending Auto Approval');
  if (!approved) throw new Error(`REQ-${reqId} is not approved; cannot issue a PO`);
  if (get(`SELECT 1 FROM purchase_order WHERE requisition_id=?`, reqId)) throw new Error('PO already issued');
  const sup = get(`SELECT * FROM supplier WHERE supplier_id=?`, r.supplier_id);
  const lines = all(`SELECT * FROM requisition_line_item WHERE requisition_id=?`, reqId);
  const t = today();
  const poId = tx(() => {
    const id = insert('purchase_order', { requisition_id: reqId, supplier_id: sup.supplier_id, store_id: r.store_id, issue_date: t, expected_ship_date: addDays(t, Math.ceil(sup.lead_time_days * 0.5)), expected_delivery_date: addDays(t, sup.lead_time_days), status: 'drafted', total_amount: r.total_estimated_cost, currency: 'USD', created_at: now(), updated_at: now() });
    for (const l of lines) insert('po_line_item', { po_id: id, item_id: l.item_id, quantity_ordered: l.recommended_quantity, unit_price: l.unit_price, line_total: Math.round(l.recommended_quantity * l.unit_price * 100) / 100 });
    update('requisition', 'requisition_id', reqId, { requisition_status: 'PO Issued' });
    return id;
  });
  await transmit(poId, 'transmission');
  return get(`SELECT * FROM purchase_order WHERE po_id=?`, poId);
}

/** Format and "send" correspondence over the supplier's preferred channel (EDI/Email/Portal are simulated; content is real). */
export async function transmit(poId, tone = 'transmission') {
  const po = getPO(poId);
  const lines = po.lines.map((l) => `${l.quantity_ordered} x ${l.item_name} (Size ${l.size}, ${l.colorway}) @ $${l.unit_price.toFixed(2)}`).join('\n');
  const base = {
    transmission: `Hello ${po.supplier_name} team,\n\nPlease find purchase order PO-${po.po_id} for ${po.store_name}:\n${lines}\n\nTotal: $${po.total_amount.toFixed(2)} USD\nRequested ship by ${po.expected_ship_date}, delivery by ${po.expected_delivery_date}.\nPlease acknowledge receipt and confirm ship date.\n\nThank you,\nShoely Procurement`,
    reminder: `Hello ${po.supplier_name} team,\n\nWe have not yet received an acknowledgment for PO-${po.po_id} (sent ${po.sent_at?.slice(0, 10)}). Please confirm receipt and expected ship date (${po.expected_ship_date}).\n\nThank you,\nShoely Procurement`,
    escalation: `Hello ${po.supplier_name} team,\n\nPO-${po.po_id} was due ${po.expected_delivery_date} and is delayed. We need a firm ship date, or a split shipment, immediately.\n\nShoely Procurement`,
  }[tone];
  const body = await draftText('supplier_email', `You are Shoely, drafting a ${tone} message to a footwear supplier. Keep it professional and concise. Do not change any PO quantities, prices or dates. Output the message body only.`, `Draft this message, preserving all facts:\n${base}`, base);
  insert('llm_supplier_prompt', { po_id: poId, channel: po.preferred_channel, tone, subject: `PO-${poId} ${tone}`, body, created_at: now() });
  if (tone === 'transmission') update('purchase_order', 'po_id', poId, { status: 'sent', sent_at: now(), updated_at: now() });
  return { channel: po.preferred_channel, body };
}

// ---------- supplier message parsing ----------
const PARSE_SYS = `You are the Shoely Order Tracking Agent. Convert a supplier message into a structured status update.
Do not guess: if the message does not clearly give a status or date, use null.
Output JSON: {"reportedStatus":"acknowledged|in_production|shipped|delayed|null","reportedShipDate":"YYYY-MM-DD|null","reportedDeliveryDate":"YYYY-MM-DD|null"}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function regexParse(text, po) {
  const lc = text.toLowerCase();
  let status = null;
  if (/\b(shipped|has shipped|dispatched)\b/.test(lc) && !/(will|expect|should|around).{0,30}ship/.test(lc)) status = 'shipped';
  else if (/(delay|behind|slipp|push(ed)? back|postpone|later than)/.test(lc) || /(expect|now).{0,25}ship/.test(lc)) status = 'delayed';
  else if (/in production|being produced|manufactur/.test(lc)) status = 'in_production';
  else if (/(confirm|acknowledg|received (your|the) (order|po))/.test(lc)) status = 'acknowledged';
  const baseYear = Number(po.expected_delivery_date.slice(0, 4));
  const dates = [];
  const re = /(\d{4}-\d{2}-\d{2})|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    let d = m[1];
    if (!d) { const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; d = `${baseYear}-${String(mo).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`; if (daysBetween(po.expected_ship_date, d) < -150) d = d.replace(String(baseYear), String(baseYear + 1)); }
    const ctx = lc.slice(Math.max(0, m.index - 50), m.index);
    dates.push({ d, kind: ctx.lastIndexOf('deliver') > ctx.lastIndexOf('ship') ? 'delivery' : 'ship' });
  }
  return { reportedStatus: status, reportedShipDate: dates.find((x) => x.kind === 'ship')?.d ?? null, reportedDeliveryDate: dates.find((x) => x.kind === 'delivery')?.d ?? null };
}

export async function ingestSupplierMessage(poId, text, source = 'supplier_email') {
  const po = getPO(poId);
  if (!po) throw new Error(`PO-${poId} not found`);
  let parsed = await jsonTask('supplier_parse', PARSE_SYS, JSON.stringify({ po: { id: poId, expectedShipDate: po.expected_ship_date, expectedDeliveryDate: po.expected_delivery_date }, today: today(), message: text }));
  if (!parsed) parsed = regexParse(text, po);
  const status = ['acknowledged', 'in_production', 'shipped', 'delayed'].includes(parsed.reportedStatus) ? parsed.reportedStatus : null;
  const ship = /^\d{4}-\d{2}-\d{2}$/.test(parsed.reportedShipDate || '') ? parsed.reportedShipDate : null;
  const del = /^\d{4}-\d{2}-\d{2}$/.test(parsed.reportedDeliveryDate || '') ? parsed.reportedDeliveryDate : null;
  const mgr = storeManager(po.store_id);
  const upd = insert('order_status_update', { po_id: poId, reported_status: status, reported_ship_date: ship, reported_delivery_date: del, raw_text: text, source, update_timestamp: now() });
  if (!status && !ship && !del) { // rule 1: do not guess
    notify(mgr.manager_id, 'exception', `PO-${poId}: supplier message needs manual review`, text.slice(0, 200));
    return { decision: 'needs_manual_review', updateId: upd };
  }
  const patch = { updated_at: now() };
  if (status && po.status !== 'delivered') patch.status = status;
  if (status && !po.acknowledged_at) patch.acknowledged_at = now();
  update('purchase_order', 'po_id', poId, patch);

  const shipDelay = ship ? daysBetween(po.expected_ship_date, ship) : 0, delDelay = del ? daysBetween(po.expected_delivery_date, del) : 0;
  const delay = Math.max(shipDelay, delDelay);
  if (delay <= 0) return { decision: status === 'acknowledged' ? 'acknowledged' : 'no_action', updateId: upd, delayDays: 0 };

  // stockout risk: does stock run out before the revised delivery?
  const revised = del || addDays(po.expected_delivery_date, delay);
  let risk = false, minDos = null;
  for (const l of po.lines) {
    const inv = get(`SELECT quantity_on_hand q FROM inventory_record WHERE item_id=? AND store_id=?`, l.item_id, po.store_id);
    const fc = latestForecast(l.item_id, po.store_id);
    if (inv && fc?.predicted_demand > 0) { const dos = inv.q / (fc.predicted_demand / 30); minDos = minDos == null ? dos : Math.min(minDos, dos); if (dos < daysBetween(today(), revised)) risk = true; }
  }
  const severity = delay >= 8 || risk ? 'critical' : delay >= 4 ? 'moderate' : 'minor';
  const useDel = del && delDelay >= shipDelay;
  const flagId = insert('delay_flag', { po_id: poId, expected_date: useDel ? po.expected_delivery_date : po.expected_ship_date, revised_date: useDel ? del : ship, delay_days: delay, severity, reason: text.replace(/\s+/g, ' ').slice(0, 200), notes: risk ? `Stockout risk: ${Math.round(minDos)} days of supply vs revised delivery ${revised}` : null, flagged_at: now() });
  if (severity === 'minor') return { decision: 'delay_logged', updateId: upd, delayDays: delay, severity, flagId };
  update('purchase_order', 'po_id', poId, { status: 'delayed', updated_at: now() });
  const action = severity === 'critical' ? (risk ? 'Expedite shipping or source an alternate supplier; consider a store transfer to cover the gap' : 'Ask supplier to expedite or split the shipment') : 'Ask the supplier to expedite; monitor stock';
  const message = `PO-${poId} (${po.supplier_name}) ${severity.toUpperCase()} delay of ${delay} days. Revised ship ${ship || 'n/a'}, delivery ${del || 'n/a'}. Recommended: ${action}.`;
  const alertId = insert('manager_alert', { po_id: poId, delay_flag_id: flagId, recipient_id: mgr.manager_id, message, priority: severity === 'critical' ? 'high' : 'medium', sent_at: now() });
  notify(mgr.manager_id, 'delay', `PO-${poId} delayed (${severity})`, message);
  return { decision: 'manager_alert', updateId: upd, delayDays: delay, severity, flagId, alertId, recommendedAction: action };
}

export function acknowledgeFlag(flagId, managerId) {
  update('delay_flag', 'flag_id', flagId, { acknowledged_by: managerId, acknowledged_at: now() });
  for (const a of all(`SELECT * FROM manager_alert WHERE delay_flag_id=? AND acknowledged_at IS NULL`, flagId)) update('manager_alert', 'alert_id', a.alert_id, { acknowledged_at: now() });
}

/** Timers: 24h no-ack supplier follow-up; critical delay unacknowledged 4h -> Regional/Ops. */
export async function processOrderTimers() {
  const out = [];
  for (const p of all(`SELECT * FROM purchase_order WHERE status='sent' AND acknowledged_at IS NULL`)) {
    if (p.sent_at && hoursSince(p.sent_at) > 24 && !get(`SELECT 1 FROM llm_supplier_prompt WHERE po_id=? AND tone='reminder'`, p.po_id)) { await transmit(p.po_id, 'reminder'); out.push(`PO-${p.po_id}: supplier follow-up sent`); }
  }
  const reg = regionalManager();
  for (const f of all(`SELECT * FROM delay_flag WHERE severity='critical' AND acknowledged_by IS NULL`)) {
    if (hoursSince(f.flagged_at) > 4 && !get(`SELECT 1 FROM manager_alert WHERE delay_flag_id=? AND recipient_id=?`, f.flag_id, reg.manager_id)) {
      insert('manager_alert', { po_id: f.po_id, delay_flag_id: f.flag_id, recipient_id: reg.manager_id, message: `ESCALATION: critical delay on PO-${f.po_id} unacknowledged by Store Manager for ${Math.round(hoursSince(f.flagged_at))}h.`, priority: 'high', sent_at: now() });
      notify(reg.manager_id, 'escalation', `Escalated: PO-${f.po_id} critical delay`, `Unacknowledged for ${Math.round(hoursSince(f.flagged_at))}h`);
      out.push(`PO-${f.po_id}: escalated to Regional/Ops`);
    }
  }
  return out;
}
