// End-to-end test of UC1–UC8 on a throwaway DB, LLM disabled (statistical/rule-based paths).
process.env.SHOELY_DB = '/tmp/shoely-test.db'; process.env.SHOELY_NO_LLM = '1'; process.env.SHOELY_NO_LISTEN = '1';
import { rmSync } from 'node:fs'; rmSync('/tmp/shoely-test.db', { force: true });
const { all, get } = await import('./db.js');
const { resetData } = await import('./seed.js');
const { runMonitoring } = await import('./services/monitoring.js');
const { approveRecommendation, rejectRecommendation, decideRequisition, reviseRequisition, getRequisition, reviewTimers } = await import('./services/requisition.js');
const { ingestSupplierMessage, processOrderTimers, getPO } = await import('./services/orders.js');
const { receiveShipment, attachPhoto, resolveDiscrepancy } = await import('./services/receiving.js');
const { runStockHealth } = await import('./services/stockhealth.js');
const { chat } = await import('./services/chat.js');
const { setSetting, clockOffsetHours } = await import('./util.js');
resetData();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); console.log(c ? ' ok ' : 'FAIL', m); };

console.log('UC1 monitoring');
const m = await runMonitoring();
console.log('  ', { checked: m.checked, recs: m.reorderRecommended, flagged: m.flagged, no: m.noReorder });
ok(m.reorderRecommended >= 5, 'recommendations created for breached SKUs');
ok(m.flagged >= 2, 'missing threshold / stale data flagged for review');
const m2 = await runMonitoring();
ok(m2.reorderRecommended === 0, 'no duplicate open recommendations on re-run');
const recs = all(`SELECT r.*, i.item_name, i.size FROM reorder_recommendation r JOIN item i USING(item_id) WHERE recommendation_status='Pending'`);
const rec = (n, s, st) => recs.find((r) => r.item_name === n && r.size === s && r.store_id === st);
const weak = rec('Aero Trainer', '9', 1);
ok(weak && weak.review_flag === 'Yes', 'new SKU (low-confidence forecast) -> reviewFlag Yes');

console.log('UC2 forecast');
const f = get(`SELECT * FROM demand_forecast WHERE item_id=? AND store_id=1 ORDER BY forecast_id DESC`, rec('Trail Runner 2', '9', 1).item_id);
ok(f && f.predicted_demand > 0 && ['High', 'Medium'].includes(f.forecast_confidence), `forecast ${f?.predicted_demand} (${f?.forecast_confidence})`);

console.log('UC3/4 requisition');
const a = await approveRecommendation(rec('Trail Runner 2', '10', 1).recommendation_id, 1);
console.log('  ', a.draft.decision, a.requisition?.requisition_status, a.requisition?.total_estimated_cost);
ok(['auto_approved', 'routed_to_manager'].includes(a.draft.decision), 'requisition drafted & routed by cost');
const hold = await approveRecommendation(rec('Harbor Chelsea Boot', '10', 1).recommendation_id, 1);
ok(hold.requisition.requisition_status === 'On Hold', 'invalid cheapest supplier -> On Hold');
const redo = await reviseRequisition(hold.requisition.requisition_id, { supplierId: 1 });
ok(['auto_approved', 'routed_to_manager'].includes(redo.decision), 'revision with valid supplier proceeds: ' + redo.decision);
const w = await approveRecommendation(weak.recommendation_id, 1);
ok(w.requisition.approval_method === 'Manager', 'low-confidence forecast forces manager approval regardless of cost');
let threw = false; try { await decideRequisition(w.requisition.requisition_id, 1, 'Rejected', ''); } catch { threw = true; }
ok(threw, 'rejection without reason refused');
const dec = await decideRequisition(w.requisition.requisition_id, 1, 'Approved');
ok(dec.po?.po_id, 'manager approval issues PO-' + dec.po?.po_id);
rejectRecommendation(rec('Court Classic Low', '8', 2).recommendation_id, 1, 'not now');

console.log('UC5 PO tracking');
const msg = 'Hi team, production ran behind. We now expect to ship around ' + new Date(Date.now() + 14 * 86400e3).toLocaleString('en-US', { month: 'long', day: 'numeric' }) + ' and delivery should be about ' + new Date(Date.now() + 24 * 86400e3).toLocaleString('en-US', { month: 'long', day: 'numeric' });
const r = await ingestSupplierMessage(1, msg);
console.log('  ', r);
ok(r.decision === 'manager_alert' && r.delayDays > 0, `delay detected (${r.delayDays}d, ${r.severity})`);
const bad = await ingestSupplierMessage(1, 'Thanks!');
ok(bad.decision === 'needs_manual_review', 'ambiguous supplier message -> manual review, no guessing');
setSetting('clock_offset_hours', 30);
const t = await processOrderTimers();
ok(t.some((x) => /follow-up/.test(x)), 'no ack in 24h -> follow-up: ' + t.join('; '));
ok(t.some((x) => /escalated/.test(x)), 'critical delay unacked >4h -> escalated');
setSetting('clock_offset_hours', 0);

console.log('UC6 receiving');
const po = getPO(3), it = po.lines[0];
const rc = await receiveShipment(3, [{ itemId: it.item_id, qty: it.quantity_ordered - 6, condition: 'partial_damage' }, { itemId: 99, qty: 4 }].slice(0, 1));
console.log('  ', rc.reconciliation.match_status, rc.reconciliation.discrepancies.map((d) => `${d.discrepancy_type}/${d.severity}/${d.status}`));
const d = rc.reconciliation.discrepancies[0];
ok(d.status === 'pending_documentation', 'damage without photo -> pending_documentation, not routed');
let blocked = false; try { resolveDiscrepancy(d.discrepancy_id, 1, 'request_replacement'); } catch { blocked = true; }
ok(blocked, 'cannot resolve until documentation provided');
attachPhoto(d.discrepancy_id, 'dmg.jpg');
ok(resolveDiscrepancy(d.discrepancy_id, 1, 'request_replacement').status === 'resolved', 'manager resolves after photo');
const po1 = getPO(1), l1 = po1.lines[0];
const full = await receiveShipment(1, [{ itemId: l1.item_id, qty: l1.quantity_ordered, condition: 'good' }]);
ok(full.matchStatus === 'full_match', 'full match reconciles');

console.log('UC7 stock health');
const sh = await runStockHealth();
ok(sh.results.some((x) => x.type === 'Deadstock Risk'), 'deadstock flagged (' + sh.flagged + ' flags)');
ok(sh.results.some((x) => x.label.includes('Dusty Oxford')), 'item with no sales in 90d flagged');

console.log('UC8 chatbot (fallback engine)');
const c1 = await chat(1, 1, 'How many Trail Runner 2 size 9 do we have?');
console.log('  ', c1.reply.split('\n')[0]);
ok(/Trail Runner 2/.test(c1.reply), 'inventory query answered from DB');
const c2 = await chat(1, 1, 'Set the reorder threshold for Coast Slide size 8 to 40');
ok(/40/.test(c2.reply) && get(`SELECT reorder_threshold t FROM monitoring_parameter WHERE store_id=1 AND item_id=(SELECT item_id FROM item WHERE item_name='Coast Slide' AND size='8')`).t === 40, 'instruction executed + persisted');
ok(get(`SELECT COUNT(*) n FROM action_log WHERE intent='Instruction'`).n >= 1, 'action logged');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
