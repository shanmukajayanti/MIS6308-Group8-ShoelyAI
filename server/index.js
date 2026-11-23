// Shoely AI HTTP server: REST API + static frontend. Zero dependencies (node:http, node:sqlite).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run } from './db.js';
import './seed.js';
import { resetData } from './seed.js';
import { now, today, setSetting, getSetting, approvalLimit, clockOffsetHours, storeManager, itemLabel } from './util.js';
import { hasKey, MODEL } from './llm.js';
import { runMonitoring, setThreshold } from './services/monitoring.js';
import { getForecast, salesHistory } from './services/forecast.js';
import { approveRecommendation, rejectRecommendation, decideRequisition, reviseRequisition, getRequisition, reviewTimers } from './services/requisition.js';
import { getPO, ingestSupplierMessage, acknowledgeFlag, processOrderTimers } from './services/orders.js';
import { receiveShipment, attachPhoto, resolveDiscrepancy, reconciliationFor, discrepancyTimers } from './services/receiving.js';
import { runStockHealth, listFlags } from './services/stockhealth.js';
import { chat, history } from './services/chat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const REC_SQL = `SELECT r.*, i.item_name, i.size, i.colorway, s.store_name FROM reorder_recommendation r JOIN item i USING(item_id) JOIN store s USING(store_id)`;
const REQ_SQL = `SELECT r.*, s.store_name, sp.supplier_name, (SELECT group_concat(i.item_name||' · Size '||i.size, '; ') FROM requisition_line_item l JOIN item i USING(item_id) WHERE l.requisition_id=r.requisition_id) items, (SELECT SUM(recommended_quantity) FROM requisition_line_item l WHERE l.requisition_id=r.requisition_id) qty FROM requisition r JOIN store s USING(store_id) LEFT JOIN supplier sp USING(supplier_id)`;

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });
const int = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// ---- read endpoints
route('GET', '/api/meta', () => ({ llm: hasKey() ? MODEL : null, today: today(), clockOffsetHours: clockOffsetHours(), approvalLimit: approvalLimit(), managers: all(`SELECT * FROM manager`), stores: all(`SELECT * FROM store`) }));
route('GET', '/api/dashboard', ({ q }) => {
  const c = (sql) => get(sql).n;
  return {
    kpis: { pendingRecs: c(`SELECT COUNT(*) n FROM reorder_recommendation WHERE recommendation_status='Pending'`), reviewRecs: c(`SELECT COUNT(*) n FROM reorder_recommendation WHERE recommendation_status='Pending' AND review_flag='Yes'`), openPOs: c(`SELECT COUNT(*) n FROM purchase_order WHERE status NOT IN ('delivered','cancelled')`), delayedPOs: c(`SELECT COUNT(*) n FROM purchase_order WHERE status='delayed'`), pendingReqs: c(`SELECT COUNT(*) n FROM requisition WHERE requisition_status IN ('Pending Manager Review','Flagged','On Hold')`), stockFlags: c(`SELECT COUNT(*) n FROM stock_flag WHERE acknowledged_by IS NULL`), deadstock: c(`SELECT COUNT(*) n FROM stock_flag WHERE flag_type='Deadstock Risk' AND acknowledged_by IS NULL`), openDiscrepancies: c(`SELECT COUNT(*) n FROM discrepancy WHERE status NOT IN ('resolved')`) },
    recs: all(`${REC_SQL} WHERE recommendation_status='Pending' ORDER BY (review_flag='Yes') DESC, recommendation_id DESC LIMIT 6`),
    pos: all(`SELECT p.*, s.supplier_name FROM purchase_order p JOIN supplier s USING(supplier_id) WHERE p.status IN ('delayed','sent','in_production','shipped','acknowledged') ORDER BY (p.status='delayed') DESC, po_id DESC LIMIT 6`),
    log: all(`SELECT l.*, i.item_name, i.size, s.store_name FROM monitoring_log l JOIN item i USING(item_id) JOIN store s USING(store_id) ORDER BY log_id DESC LIMIT 8`),
    notifications: all(`SELECT * FROM notification ORDER BY notification_id DESC LIMIT 8`),
  };
});
route('GET', '/api/inventory', () => all(`SELECT inv.*, i.item_name, i.size, i.colorway, i.sku, s.store_name, mp.reorder_threshold, mp.review_frequency, (SELECT predicted_demand FROM demand_forecast f WHERE f.item_id=inv.item_id AND f.store_id=inv.store_id ORDER BY forecast_id DESC LIMIT 1) forecast FROM inventory_record inv JOIN item i USING(item_id) JOIN store s USING(store_id) LEFT JOIN monitoring_parameter mp ON mp.item_id=inv.item_id AND mp.store_id=inv.store_id ORDER BY s.store_id, i.item_name, i.size`));
route('GET', '/api/recommendations', () => all(`${REC_SQL} ORDER BY recommendation_id DESC`));
route('GET', '/api/monitoring-log', () => all(`SELECT l.*, i.item_name, i.size, s.store_name FROM monitoring_log l JOIN item i USING(item_id) JOIN store s USING(store_id) ORDER BY log_id DESC LIMIT 60`));
route('GET', '/api/forecast/:item/:store', async ({ p, q }) => {
  const f = await getForecast(int(p.item), int(p.store), { force: q.get('force') === '1' });
  const hist = salesHistory(int(p.item), int(p.store), 84), weeks = [];
  for (let w = 11; w >= 0; w--) { const to = new Date(Date.parse(today()) - w * 7 * 86400e3), from = new Date(to - 7 * 86400e3); weeks.push({ week: to.toISOString().slice(5, 10), units: hist.filter((h) => h.sale_date > from.toISOString().slice(0, 10) && h.sale_date <= to.toISOString().slice(0, 10)).reduce((s, h) => s + h.quantity_sold, 0) }); }
  return { forecast: f, weeks, item: get(`SELECT * FROM item WHERE item_id=?`, int(p.item)), store: get(`SELECT * FROM store WHERE store_id=?`, int(p.store)) };
});
route('GET', '/api/requisitions', () => all(`${REQ_SQL} ORDER BY requisition_id DESC`));
route('GET', '/api/requisitions/:id', ({ p }) => getRequisition(int(p.id)) || { error: 'not found' });
route('GET', '/api/purchase-orders', () => all(`SELECT p.*, s.supplier_name, st.store_name, (SELECT group_concat(i.item_name||' · '||i.size, '; ') FROM po_line_item l JOIN item i USING(item_id) WHERE l.po_id=p.po_id) items FROM purchase_order p JOIN supplier s USING(supplier_id) JOIN store st USING(store_id) ORDER BY po_id DESC`));
route('GET', '/api/purchase-orders/:id', ({ p }) => getPO(int(p.id)) || { error: 'not found' });
route('GET', '/api/receipts/:id', ({ p }) => reconciliationFor(int(p.id)));
route('GET', '/api/discrepancies', () => all(`SELECT d.*, i.item_name, i.size, e.routed_to, e.priority FROM discrepancy d JOIN item i USING(item_id) LEFT JOIN exception_routing e USING(discrepancy_id) ORDER BY discrepancy_id DESC`));
route('GET', '/api/stock-flags', () => listFlags());
route('GET', '/api/notifications', () => all(`SELECT n.*, m.manager_name FROM notification n JOIN manager m USING(manager_id) ORDER BY notification_id DESC LIMIT 50`));
route('GET', '/api/action-log', () => all(`SELECT a.*, m.manager_name FROM action_log a LEFT JOIN manager m USING(manager_id) ORDER BY log_id DESC LIMIT 40`));
route('GET', '/api/llm-log', () => all(`SELECT call_id, kind, model, ok, created_at, substr(prompt,1,200) prompt FROM llm_call_log ORDER BY call_id DESC LIMIT 30`));
route('GET', '/api/chat/history', ({ q }) => history(int(q.get('manager')) || 1));
route('GET', '/api/suppliers/:item', ({ p }) => all(`SELECT s.*, x.unit_price FROM supplier_item_price x JOIN supplier s USING(supplier_id) WHERE item_id=? ORDER BY unit_price`, int(p.item)));
route('GET', '/api/schema', () => all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map((t) => ({ table: t.name, rows: get(`SELECT COUNT(*) n FROM ${t.name}`).n })));

// ---- actions
route('POST', '/api/monitoring/run', ({ b }) => runMonitoring({ periodic: !!b.periodic, storeId: b.storeId }));
route('POST', '/api/monitoring/threshold', ({ b }) => { setThreshold(int(b.itemId), int(b.storeId), int(b.threshold), int(b.managerId) || 1); return { ok: true }; });
route('POST', '/api/recommendations/:id/approve', ({ p, b }) => approveRecommendation(int(p.id), int(b.managerId) || 1));
route('POST', '/api/recommendations/:id/reject', ({ p, b }) => rejectRecommendation(int(p.id), int(b.managerId) || 1, b.reason));
route('POST', '/api/requisitions/:id/decide', ({ p, b }) => decideRequisition(int(p.id), int(b.managerId) || 1, b.decision, b.reason));
route('POST', '/api/requisitions/:id/revise', ({ p, b }) => reviseRequisition(int(p.id), { supplierId: int(b.supplierId) }));
route('POST', '/api/purchase-orders/:id/supplier-message', ({ p, b }) => ingestSupplierMessage(int(p.id), String(b.text || ''), b.source || 'supplier_email'));
route('POST', '/api/delay-flags/:id/acknowledge', ({ p, b }) => { acknowledgeFlag(int(p.id), int(b.managerId) || 1); return { ok: true }; });
route('POST', '/api/receipts', ({ b }) => receiveShipment(int(b.poId), b.lines, { receivedBy: b.receivedBy, carrier: b.carrier, tracking: b.tracking }));
route('POST', '/api/discrepancies/:id/photo', ({ p, b }) => attachPhoto(int(p.id), b.photo));
route('POST', '/api/discrepancies/:id/resolve', ({ p, b }) => resolveDiscrepancy(int(p.id), int(b.managerId) || 1, b.action));
route('POST', '/api/stock-health/run', () => runStockHealth());
route('POST', '/api/stock-flags/:id/acknowledge', ({ p, b }) => { run(`UPDATE stock_flag SET acknowledged_by=? WHERE flag_id=?`, int(b.managerId) || 1, int(p.id)); return { ok: true }; });
route('POST', '/api/chat', ({ b }) => chat(int(b.managerId) || 1, int(b.storeId) || 1, String(b.text || '')));
route('POST', '/api/settings/approval-limit', ({ b }) => { setSetting('approval_limit', Number(b.value)); return { approvalLimit: approvalLimit() }; });
route('POST', '/api/clock/advance', async ({ b }) => { setSetting('clock_offset_hours', clockOffsetHours() + Number(b.hours || 0)); return tick(); });
route('POST', '/api/tick', () => tick());
route('POST', '/api/reset', () => { resetData(); return { ok: true }; });

async function tick() { return { clockOffsetHours: clockOffsetHours(), actions: [...(await processOrderTimers()), ...reviewTimers(), ...discrepancyTimers()] }; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(404, { error: 'not found' });
      let b = {};
      if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); try { b = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return send(400, { error: 'bad json' }); } }
      return send(200, await r.fn({ p: url.pathname.match(r.re).groups || {}, q: url.searchParams, b }));
    }
    const file = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUB)) return send(403, 'forbidden', 'text/plain');
    send(200, await readFile(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(404, 'not found', 'text/plain');
    send(400, { error: e.message });
  }
});

const PORT = Number(process.env.PORT || 3000);
if (process.env.SHOELY_NO_LISTEN !== '1') server.listen(PORT, () => console.log(`Shoely AI → http://localhost:${PORT}  (LLM: ${hasKey() ? MODEL : 'no ANTHROPIC_API_KEY — using statistical/rule-based fallbacks'})`));
export { server };
