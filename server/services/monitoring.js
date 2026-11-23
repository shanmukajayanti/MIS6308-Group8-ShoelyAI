// UC1 — Monitor Inventory Levels & Detect Reorder Trigger (decision rules from Section 10.1).
import { all, get, insert, update } from '../db.js';
import { now, hoursSince, storeManager, notify, itemLabel, itemById, storeById } from '../util.js';
import { getForecast } from './forecast.js';
import { openRequisition, openOrderFor } from './requisition.js';

const STALE_HOURS = 48;
const openRec = (itemId, storeId) => get(`SELECT * FROM reorder_recommendation WHERE item_id=? AND store_id=? AND recommendation_status IN ('Pending','Handed Off')`, itemId, storeId);
const mlog = (itemId, storeId, result, detail) => insert('monitoring_log', { item_id: itemId, store_id: storeId, monitor_result: result, detail, log_at: now() });

/** Evaluate one SKU at one store. Returns {decision, ...}. */
export async function evaluate(inv, { periodic = false } = {}) {
  const { item_id: itemId, store_id: storeId } = inv;
  const item = itemById(itemId), label = itemLabel(item), store = storeById(storeId);
  const flag = (why) => { mlog(itemId, storeId, 'Flagged For Review', why); return { decision: 'flagged_for_review', itemId, storeId, label, why }; };

  if (hoursSince(inv.last_updated_at) > STALE_HOURS) return flag(`Inventory data outdated (last updated ${Math.round(hoursSince(inv.last_updated_at))}h ago)`); // rule 1
  const param = get(`SELECT * FROM monitoring_parameter WHERE item_id=? AND store_id=?`, itemId, storeId);
  if (!param) return flag('Reorder threshold missing — Store Manager must set one');                                                              // rule 2
  if (openRec(itemId, storeId)) { mlog(itemId, storeId, 'No Reorder', 'Open recommendation already exists'); return { decision: 'no_reorder', itemId, storeId, label, why: 'open recommendation exists' }; } // rule 3

  const inflight = openRequisition(itemId, storeId) || openOrderFor(itemId, storeId);
  if (inflight) { mlog(itemId, storeId, 'No Reorder', 'Replenishment already in flight (requisition/PO open)'); return { decision: 'no_reorder', itemId, storeId, label, why: 'order in flight' }; }
  const qty = inv.quantity_on_hand, th = param.reorder_threshold;
  const breach = qty <= th;
  if (!breach && !periodic) { mlog(itemId, storeId, 'No Reorder', `On hand ${qty} > threshold ${th}`); return { decision: 'no_reorder', itemId, storeId, label, why: 'above threshold' }; }

  let fc = null, review = 'No', suggested, trigger = breach ? 'Threshold Breach' : 'Periodic Review', basis;
  fc = await getForecast(itemId, storeId, { trigger: breach ? 'Reorder Trigger' : 'Scheduled Cycle' });
  const weak = !fc || fc.predicted_demand == null || ['Low', 'Unreliable'].includes(fc.forecast_confidence);
  if (!breach && (weak || fc.predicted_demand <= qty)) { mlog(itemId, storeId, 'No Reorder', 'Periodic review: forecast covered by stock'); return { decision: 'no_reorder', itemId, storeId, label, why: 'periodic review: covered' }; } // rule 5
  if (weak) { suggested = Math.max(th - qty, 1); review = 'Yes'; basis = `Forecast ${fc ? fc.forecast_confidence : 'missing'} — recommendation based on threshold breach only; quantity restores stock to threshold.`; } // rule 7
  else { suggested = Math.max(fc.predicted_demand - qty, th - qty, 1); basis = `Predicted demand ${fc.predicted_demand} over next 30 days (${fc.forecast_confidence} confidence) vs ${qty} on hand.`; if (fc.review_flag === 'Yes') review = 'Yes'; } // rule 6
  const rationale = `${trigger}: ${qty} on hand vs threshold ${th}. ${basis}`;
  const id = insert('reorder_recommendation', { item_id: itemId, store_id: storeId, quantity_on_hand: qty, reorder_threshold: th, suggested_quantity: suggested, recommended_action: `Reorder ${suggested} pairs`, rationale, trigger_type: trigger, review_flag: review, recommendation_status: 'Pending', created_at: now() });
  const mgr = storeManager(storeId);
  notify(mgr.manager_id, 'reorder', `Reorder recommended: ${label} @ ${store.store_name}`, `${rationale} Suggested ${suggested} pairs. Approval required.`, id);
  mlog(itemId, storeId, 'Reorder Recommended', rationale);
  return { decision: 'reorder_recommended', itemId, storeId, label, recommendationId: id, suggested, review };
}

export async function runMonitoring({ periodic = false, storeId = null } = {}) {
  const rows = all(`SELECT * FROM inventory_record ${storeId ? 'WHERE store_id=' + Number(storeId) : ''} ORDER BY store_id, item_id`);
  const results = [];
  for (const r of rows) {
    try { results.push(await evaluate(r, { periodic })); }
    catch (e) { mlog(r.item_id, r.store_id, 'Flagged For Review', `System error: ${e.message}`); results.push({ decision: 'flagged_for_review', itemId: r.item_id, storeId: r.store_id, why: e.message }); } // E5
  }
  const count = (d) => results.filter((x) => x.decision === d).length;
  return { checked: rows.length, reorderRecommended: count('reorder_recommended'), noReorder: count('no_reorder'), flagged: count('flagged_for_review'), results };
}

export function setThreshold(itemId, storeId, threshold, managerId, frequency = 'Daily') {
  const ex = get(`SELECT * FROM monitoring_parameter WHERE item_id=? AND store_id=?`, itemId, storeId);
  if (ex) update('monitoring_parameter', 'parameter_id', ex.parameter_id, { reorder_threshold: threshold, set_by: managerId });
  else insert('monitoring_parameter', { item_id: itemId, store_id: storeId, reorder_threshold: threshold, review_frequency: frequency, set_by: managerId });
}
