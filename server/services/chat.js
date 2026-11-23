// UC8 — Query Inventory & Issue Instructions via Chatbot. Real Claude tool-use agent with human-in-the-loop guardrails.
import { all, get, insert, update } from '../db.js';
import { now, today, approvalLimit, itemLabel, storeById, logAction } from '../util.js';
import { callClaude, hasKey, textOf, MODEL } from '../llm.js';
import { runMonitoring, setThreshold } from './monitoring.js';
import { getForecast } from './forecast.js';
import { approveRecommendation, rejectRecommendation, decideRequisition, getRequisition, draftRequisition } from './requisition.js';
import { getPO } from './orders.js';
import { runStockHealth, listFlags } from './stockhealth.js';

const SYSTEM = (mgr, store) => `You are the Shoely Conversational Assistant for a footwear retailer. You help Store Managers check inventory, issue instructions, and approve or reject agent-recommended actions in natural language.
Current user: ${mgr.manager_name} (${mgr.role}, Manager ID ${mgr.manager_id}). Their store: ${store.store_name} (Store ID ${store.store_id}). Today is ${today()}. Auto-approval limit: $${approvalLimit()}.

You are AGENTIC: use the tools to fetch real data and carry out multi-step tasks (e.g. check stock -> get forecast -> report). Never invent inventory numbers, IDs or prices; always call a tool.
Rules:
1. Classify every message as Query, Instruction, Approval or Rejection. If intent is unclear, ask a short clarifying question — do not guess.
2. Never approve/reject a recommendation or requisition unless the manager clearly said so. Match approvals to exactly ONE pending recommendation (RR-n) or requisition (REQ-n); if several could match, list the candidates and ask.
3. Significant-impact actions require explicit confirmation: approving a requisition above the auto-approval limit, or a threshold change at more than one store. Call the tool WITHOUT confirm first; if it returns confirmation_required, ask the manager to confirm; only after they say yes in a LATER message call it again with confirm=true.
4. You never alter an issued PO's terms, contact alternate suppliers or cancel orders. Say so if asked.
5. Be concise (2-6 short lines), use plain language, reference IDs like RR-12, REQ-3, PO-5. Do not use markdown tables.`;

const itemByText = (q) => {
  const t = q.toLowerCase(), size = (t.match(/size\s*(\d+(?:\.\d)?)/) || [])[1];
  return all(`SELECT * FROM item`).filter((i) => (t.includes(i.item_name.toLowerCase()) || t.includes(i.style.toLowerCase())) && (!size || i.size === size));
};

// ---------- tools ----------
const TOOLS = [
  { name: 'query_inventory', description: 'Look up on-hand quantity, reorder threshold and days of supply for items. Filter by item name/style text, size, and store.', input_schema: { type: 'object', properties: { item_text: { type: 'string', description: 'e.g. "Trail Runner 2" or "Coast Slide"' }, size: { type: 'string' }, store_id: { type: 'integer', description: 'Omit for the manager\'s own store; use 0 for all stores' }, low_stock_only: { type: 'boolean' } } } },
  { name: 'list_pending', description: 'List pending reorder recommendations (RR) and requisitions awaiting manager review (REQ).', input_schema: { type: 'object', properties: {} } },
  { name: 'get_forecast', description: 'Get (or generate) the 30-day demand forecast for an item at a store.', input_schema: { type: 'object', properties: { item_id: { type: 'integer' }, store_id: { type: 'integer' } }, required: ['item_id', 'store_id'] } },
  { name: 'run_monitoring', description: 'Run inventory monitoring now: detects threshold breaches and creates reorder recommendations.', input_schema: { type: 'object', properties: { periodic: { type: 'boolean' } } } },
  { name: 'approve_recommendation', description: 'Approve ONE pending reorder recommendation. This drafts a purchase requisition (auto-approved/PO issued if within the limit, otherwise routed for manager review).', input_schema: { type: 'object', properties: { recommendation_id: { type: 'integer' } }, required: ['recommendation_id'] } },
  { name: 'reject_recommendation', description: 'Reject ONE pending reorder recommendation.', input_schema: { type: 'object', properties: { recommendation_id: { type: 'integer' }, reason: { type: 'string' } }, required: ['recommendation_id'] } },
  { name: 'decide_requisition', description: 'Approve, reject or return a requisition that is Pending Manager Review. Requisitions above the auto-approval limit need confirm=true after explicit manager confirmation. Reason required for Rejected/Returned For Revision.', input_schema: { type: 'object', properties: { requisition_id: { type: 'integer' }, decision: { type: 'string', enum: ['Approved', 'Rejected', 'Returned For Revision'] }, reason: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['requisition_id', 'decision'] } },
  { name: 'set_reorder_threshold', description: 'Set the reorder threshold for an item at a store (or all stores, which requires confirm=true).', input_schema: { type: 'object', properties: { item_id: { type: 'integer' }, threshold: { type: 'integer' }, store_id: { type: 'integer' }, all_stores: { type: 'boolean' }, confirm: { type: 'boolean' } }, required: ['item_id', 'threshold'] } },
  { name: 'get_order_status', description: 'Get status, expected dates, delay flags and line items for a purchase order, or list open POs if po_id omitted.', input_schema: { type: 'object', properties: { po_id: { type: 'integer' } } } },
  { name: 'get_requisition', description: 'Get full details of a requisition (lines, forecast justification, supplier, cost).', input_schema: { type: 'object', properties: { requisition_id: { type: 'integer' } }, required: ['requisition_id'] } },
  { name: 'run_stock_health', description: 'Run overstock/deadstock analysis and return the flagged items.', input_schema: { type: 'object', properties: {} } },
  { name: 'list_stock_flags', description: 'List currently flagged overstock/deadstock items.', input_schema: { type: 'object', properties: {} } },
];

async function execTool(name, a, ctx) {
  const { mgr, store, messageId } = ctx;
  const limit = approvalLimit();
  try {
    switch (name) {
      case 'query_inventory': {
        const sid = a.store_id === undefined ? store.store_id : a.store_id;
        let items = a.item_text ? itemByText(a.item_text + (a.size ? ' size ' + a.size : '')) : all(`SELECT * FROM item`);
        if (a.size) items = items.filter((i) => i.size === String(a.size));
        if (a.item_text && !items.length) return { error: 'not_found', message: `No item matches "${a.item_text}"${a.size ? ' size ' + a.size : ''}` };
        const rows = [];
        for (const i of items) for (const inv of all(`SELECT * FROM inventory_record WHERE item_id=? ${sid ? 'AND store_id=' + Number(sid) : ''}`, i.item_id)) {
          const th = get(`SELECT reorder_threshold t FROM monitoring_parameter WHERE item_id=? AND store_id=?`, i.item_id, inv.store_id)?.t ?? null;
          const fc = get(`SELECT predicted_demand p, forecast_confidence c FROM demand_forecast WHERE item_id=? AND store_id=? ORDER BY forecast_id DESC LIMIT 1`, i.item_id, inv.store_id);
          const rec = get(`SELECT recommendation_id id, suggested_quantity q FROM reorder_recommendation WHERE item_id=? AND store_id=? AND recommendation_status='Pending'`, i.item_id, inv.store_id);
          rows.push({ item_id: i.item_id, item: itemLabel(i), store_id: inv.store_id, store: storeById(inv.store_id).store_name, on_hand: inv.quantity_on_hand, threshold: th, below_threshold: th != null && inv.quantity_on_hand <= th, forecast_30d: fc?.p ?? null, forecast_confidence: fc?.c ?? null, days_of_supply: fc?.p ? Math.round(inv.quantity_on_hand / (fc.p / 30)) : null, pending_recommendation: rec ? `RR-${rec.id} (${rec.q} pairs)` : null });
        }
        const out = a.low_stock_only ? rows.filter((r) => r.below_threshold) : rows;
        return { count: out.length, rows: out.slice(0, 25), truncated: out.length > 25 };
      }
      case 'list_pending': {
        const recs = all(`SELECT r.recommendation_id id, r.item_id, r.store_id, r.quantity_on_hand, r.reorder_threshold, r.suggested_quantity, r.trigger_type, r.review_flag, r.rationale FROM reorder_recommendation r WHERE recommendation_status='Pending' ORDER BY id`).map((r) => ({ ...r, id: `RR-${r.id}`, item: itemLabel(get(`SELECT * FROM item WHERE item_id=?`, r.item_id)), store: storeById(r.store_id).store_name }));
        const reqs = all(`SELECT requisition_id id, store_id, total_estimated_cost, approval_limit, status_note FROM requisition WHERE requisition_status='Pending Manager Review'`).map((r) => ({ ...r, id: `REQ-${r.id}`, lines: all(`SELECT l.recommended_quantity qty, i.item_name, i.size FROM requisition_line_item l JOIN item i USING(item_id) WHERE requisition_id=?`, Number(String(r.id).slice(4))) }));
        return { recommendations: recs, requisitions_awaiting_review: reqs };
      }
      case 'get_forecast': { const f = await getForecast(a.item_id, a.store_id); return f; }
      case 'run_monitoring': { const r = await runMonitoring({ periodic: !!a.periodic }); return { ...r, results: r.results.filter((x) => x.decision !== 'no_reorder').slice(0, 20) }; }
      case 'approve_recommendation': {
        const r = await approveRecommendation(a.recommendation_id, mgr.manager_id);
        const q = r.requisition;
        return { approved: `RR-${a.recommendation_id}`, outcome: r.draft.decision, requisition: q ? { id: `REQ-${q.requisition_id}`, status: q.requisition_status, quantity: q.lines[0]?.recommended_quantity, cost: q.total_estimated_cost, supplier: q.supplier_name, note: q.status_note, po: q.po ? `PO-${q.po.po_id}` : null } : null, note: r.draft.reason || null };
      }
      case 'reject_recommendation': { rejectRecommendation(a.recommendation_id, mgr.manager_id, a.reason); return { rejected: `RR-${a.recommendation_id}` }; }
      case 'decide_requisition': {
        const r = getRequisition(a.requisition_id);
        if (!r) return { error: 'not_found', message: `REQ-${a.requisition_id} not found` };
        if (a.decision === 'Approved' && (r.total_estimated_cost || 0) > limit && !a.confirm) return { confirmation_required: true, message: `REQ-${r.requisition_id} costs $${r.total_estimated_cost} which is above the $${limit} auto-approval limit. Ask the manager to explicitly confirm before approving.` };
        const out = await decideRequisition(a.requisition_id, mgr.manager_id, a.decision, a.reason);
        return { requisition: `REQ-${out.requisition_id}`, status: out.requisition_status, po: out.po ? `PO-${out.po.po_id}` : null };
      }
      case 'set_reorder_threshold': {
        const targets = a.all_stores ? all(`SELECT store_id FROM store`).map((s) => s.store_id) : [a.store_id ?? store.store_id];
        if (targets.length > 1 && !a.confirm) return { confirmation_required: true, message: `This changes the threshold at ${targets.length} stores. Ask the manager to explicitly confirm.` };
        for (const sid of targets) setThreshold(a.item_id, sid, a.threshold, mgr.manager_id);
        logAction(mgr.manager_id, store.store_id, 'Instruction', `Set reorder threshold for item ${a.item_id} to ${a.threshold} at ${targets.length} store(s)`, { messageId });
        return { updated_stores: targets, threshold: a.threshold, effective: 'next monitoring cycle' };
      }
      case 'get_order_status': {
        if (!a.po_id) return all(`SELECT po_id, status, expected_delivery_date, total_amount FROM purchase_order WHERE status NOT IN ('delivered','cancelled') ORDER BY po_id DESC LIMIT 15`);
        const p = getPO(a.po_id); if (!p) return { error: 'not_found', message: `PO-${a.po_id} not found` };
        return { po: `PO-${p.po_id}`, supplier: p.supplier_name, status: p.status, expected_ship: p.expected_ship_date, expected_delivery: p.expected_delivery_date, total: p.total_amount, lines: p.lines.map((l) => `${l.quantity_ordered} x ${l.item_name} size ${l.size}`), delay_flags: p.delayFlags.map((f) => ({ severity: f.severity, days: f.delay_days, revised: f.revised_date, acknowledged: !!f.acknowledged_by })) };
      }
      case 'get_requisition': return getRequisition(a.requisition_id) || { error: 'not_found' };
      case 'run_stock_health': { const r = await runStockHealth(); return { flagged: r.flagged, items: r.results.slice(0, 20) }; }
      case 'list_stock_flags': return listFlags().slice(0, 20).map((f) => ({ item: `${f.item_name} size ${f.size}`, store: f.store_name, type: f.flag_type, on_hand: f.quantity_on_hand, days_of_supply: f.days_of_supply }));
      default: return { error: 'unknown_tool' };
    }
  } catch (e) { return { error: e.message }; }
}

// ---------- chat orchestration ----------
export async function chat(managerId, storeId, text) {
  const mgr = get(`SELECT * FROM manager WHERE manager_id=?`, managerId), store = storeById(storeId);
  const messageId = insert('manager_message', { manager_id: managerId, store_id: storeId, message_text: text, sent_at: now() });
  const ctx = { mgr, store, messageId };
  let reply, engine, toolTrace = [];
  if (hasKey()) {
    try { ({ reply, toolTrace } = await claudeAgent(ctx, text)); engine = MODEL; }
    catch (e) { reply = `(Claude is unavailable: ${e.message.slice(0, 120)}) Falling back to basic mode.\n` + (await fallback(ctx, text)); engine = 'fallback'; }
  } else { reply = await fallback(ctx, text); engine = 'fallback (set ANTHROPIC_API_KEY for the full Claude agent)'; }
  update('manager_message', 'message_id', messageId, { reply_text: reply, engine });
  return { messageId, reply, engine, tools: toolTrace };
}

async function claudeAgent(ctx, text) {
  // Conversation memory = recent persisted turns for this manager
  const past = all(`SELECT message_text, reply_text FROM manager_message WHERE manager_id=? AND message_id<? AND reply_text IS NOT NULL ORDER BY message_id DESC LIMIT 8`, ctx.mgr.manager_id, ctx.messageId).reverse();
  const messages = [];
  for (const p of past) messages.push({ role: 'user', content: p.message_text }, { role: 'assistant', content: p.reply_text });
  messages.push({ role: 'user', content: text });
  const toolTrace = [];
  for (let step = 0; step < 8; step++) {
    const res = await callClaude({ system: SYSTEM(ctx.mgr, ctx.store), messages, tools: TOOLS, maxTokens: 1200 });
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'tool_use') return { reply: textOf(res).trim() || 'Done.', toolTrace };
    const results = [];
    for (const b of res.content.filter((c) => c.type === 'tool_use')) {
      const out = await execTool(b.name, b.input || {}, ctx);
      toolTrace.push({ tool: b.name, input: b.input, ok: !out?.error });
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out).slice(0, 12000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'I took too many steps on that. Could you narrow the request?', toolTrace };
}

/** Rule-based fallback when no API key: covers the main intents so the app is still usable offline. */
async function fallback(ctx, text) {
  const t = text.toLowerCase(), { mgr, store, messageId } = ctx;
  const idOf = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
  const rr = idOf(/rr-?\s*(\d+)/), req = idOf(/req-?\s*(\d+)/), po = idOf(/po-?\s*(\d+)/);
  const J = (o) => o;
  if (/\bapprove\b/.test(t) && req) { const o = await execTool('decide_requisition', { requisition_id: req, decision: 'Approved' }, ctx); return o.confirmation_required ? `${o.message} Reply "confirm approve REQ-${req}" to proceed.` : o.error || `REQ-${req} approved${o.po ? `, ${o.po} issued` : ''}.`; }
  if (/confirm approve/.test(t) && req) { const o = await execTool('decide_requisition', { requisition_id: req, decision: 'Approved', confirm: true }, ctx); return o.error || `REQ-${req} approved${o.po ? `, ${o.po} issued` : ''}.`; }
  if (/\bapprove\b/.test(t)) {
    let id = rr;
    if (!id) { const c = itemByText(t).flatMap((i) => all(`SELECT recommendation_id FROM reorder_recommendation WHERE item_id=? AND store_id=? AND recommendation_status='Pending'`, i.item_id, store.store_id)); if (c.length === 1) id = c[0].recommendation_id; else if (c.length > 1) return `Several recommendations match: ${c.map((x) => 'RR-' + x.recommendation_id).join(', ')}. Which one?`; }
    if (!id) return 'Which recommendation should I approve? Say e.g. "approve RR-3".';
    const o = await execTool('approve_recommendation', { recommendation_id: id }, ctx);
    return o.error || `RR-${id} approved. Requisition ${o.requisition?.id}: ${o.requisition?.status}${o.requisition?.po ? ` → ${o.requisition.po} sent to ${o.requisition.supplier}` : ''}. ${o.requisition?.note || ''}`;
  }
  if (/\breject\b/.test(t) && rr) { const o = await execTool('reject_recommendation', { recommendation_id: rr, reason: text }, ctx); return o.error || `RR-${rr} rejected.`; }
  const th = t.match(/threshold.*?(?:to|at)\s+(\d+)/);
  if (/set .*threshold/.test(t) && th) { const it = itemByText(t); if (it.length !== 1) return 'Which item (name + size) should I update?'; const o = await execTool('set_reorder_threshold', { item_id: it[0].item_id, threshold: Number(th[1]) }, ctx); return o.error || `Done. Threshold for ${itemLabel(it[0])} is now ${th[1]} at ${store.store_name} (effective next monitoring run).`; }
  if (/run monitoring|check .*(stock|inventory)|reorder/.test(t) && /run|check now|scan/.test(t)) { const o = await execTool('run_monitoring', {}, ctx); return `Checked ${o.checked} SKUs: ${o.reorderRecommended} new recommendations, ${o.flagged} flagged for review.`; }
  if (po) { const o = await execTool('get_order_status', { po_id: po }, ctx); return o.error ? o.message : `PO-${po} (${o.supplier}) is ${o.status}. Expected ship ${o.expected_ship}, delivery ${o.expected_delivery}.${o.delay_flags.length ? ` ${o.delay_flags[0].severity} delay of ${o.delay_flags[0].days} days.` : ''}`; }
  if (/overstock|deadstock|dead stock/.test(t)) { const o = await execTool('list_stock_flags', {}, ctx); return o.length ? o.slice(0, 6).map((f) => `${f.item} @ ${f.store}: ${f.type} (${f.days_of_supply ?? '∞'} days)`).join('\n') : 'No flags. Run stock health first.'; }
  if (/pending|waiting|approval/.test(t)) { const o = await execTool('list_pending', {}, ctx); return `${o.recommendations.length} recommendations pending: ${o.recommendations.map((r) => `${r.id} ${r.item} (${r.suggested_quantity})`).slice(0, 6).join('; ')}. ${o.requisitions_awaiting_review.length} requisitions awaiting review.`; }
  const items = itemByText(t);
  if (items.length || /stock|have|inventory|low/.test(t)) {
    const o = await execTool('query_inventory', { item_text: items[0]?.style, size: (t.match(/size\s*(\d+)/) || [])[1], low_stock_only: /low/.test(t) }, ctx);
    if (o.error) return o.message;
    return o.rows.length ? o.rows.slice(0, 8).map((r) => `${r.item} @ ${r.store}: ${r.on_hand} on hand (threshold ${r.threshold ?? 'not set'})${r.pending_recommendation ? ` — ${r.pending_recommendation} pending` : ''}`).join('\n') : 'Nothing matched.';
  }
  return "I can check stock, list pending recommendations, approve/reject RR-n, set thresholds, track POs, and report overstock. (Full natural-language understanding needs ANTHROPIC_API_KEY.)";
}

export const history = (managerId, limit = 30) => all(`SELECT * FROM manager_message WHERE manager_id=? ORDER BY message_id DESC LIMIT ?`, managerId, limit).reverse();
