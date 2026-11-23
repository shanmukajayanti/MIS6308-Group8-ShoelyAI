// Mock data: 3 Texas stores, 12 SKUs, 120 days of deterministic sales, suppliers, thresholds, and a few in-flight orders.
import { db, all, get, insert, run } from './db.js';
import { now, today, addDays, setSetting } from './util.js';
import { fileURLToPath } from 'node:url';

let seedState = 42;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);

export function resetData() {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)) db.exec(`DELETE FROM ${t.name}`);
  db.exec('PRAGMA foreign_keys = ON');
  seedState = 42;
  seed();
}

export function seed() {
  const t = today();
  setSetting('approval_limit', 1500); setSetting('clock_offset_hours', 0);

  // managers & stores
  const stores = [['Dallas Galleria', '13350 Dallas Pkwy, Dallas, TX', 'North'], ['Austin South Congress', '1100 S Congress Ave, Austin, TX', 'Central'], ['Houston Rice Village', '2450 Times Blvd, Houston, TX', 'South']]
    .map(([store_name, store_address, region]) => insert('store', { store_name, store_address, region }));
  const mgrs = {};
  [['Marcus Lee', 'Store Manager', stores[0]], ['Dana Ortiz', 'Store Manager', stores[1]], ['Sam Patel', 'Store Manager', stores[2]], ['Aisha Rahman', 'Regional/Ops Manager', null], ['Priya Nair', 'Procurement Manager', null]]
    .forEach(([n, role, sid]) => (mgrs[n] = insert('manager', { manager_name: n, role, store_id: sid })));

  // suppliers
  const sup = {};
  [['Meridian Sole Works', 'orders@meridiansole.example', 21, 'EDI', 'Yes'], ['Northline Footwear Supply', 'orders@northline.example', 14, 'Email', 'Yes'], ['Apex Trading Co', 'sales@apextrading.example', 10, 'Portal', 'No']]
    .forEach(([n, e, l, c, v]) => (sup[n] = insert('supplier', { supplier_name: n, contact_email: e, lead_time_days: l, preferred_channel: c, supplier_valid_flag: v })));

  // catalog: [name, style, sizes, colorway, cost, case, rate/day base, suppliers{name:price}, trend]
  const catalog = [
    ['Trail Runner 2', 'Trail Runner', ['8', '9', '10'], 'Slate/Lime', 38.5, 1, 1.2, { 'Meridian Sole Works': 41.5, 'Northline Footwear Supply': 43 }, 0.8, 'Up', 1.15],
    ['Court Classic Low', 'Court Classic', ['8', '9', '10'], 'White/Navy', 30, 1, 1.4, { 'Meridian Sole Works': 33, 'Northline Footwear Supply': 34 }, 0.2, 'Flat', 1.05],
    ['Harbor Chelsea Boot', 'Chelsea Boot', ['9', '10'], 'Black', 52, 1, 0.45, { 'Meridian Sole Works': 58.75 }, 0.5, 'Up', 1.2],
    ['Coast Slide', 'Slide', ['7', '8'], 'Sand', 12, 1, 0.3, { 'Northline Footwear Supply': 14 }, -0.5, 'Down', 0.8],
    ['Dusty Oxford', 'Oxford', ['9'], 'Brown', 40, 1, 0.5, { 'Apex Trading Co': 41 }, 0, 'Flat', 0.9],
    ['Aero Trainer', 'Aero Trainer', ['9'], 'Lime/Black', 48, 1, 0.9, { 'Meridian Sole Works': 52 }, 0, 'Up', 1.1],
  ];
  const items = []; // {id, name, size, rate, trend}
  for (const [name, style, sizes, color, cost, cp, rate, prices, trend, dir, idx] of catalog) {
    for (const size of sizes) {
      const id = insert('item', { sku: `${name.split(' ').map((w) => w[0]).join('')}-${size}-${color.slice(0, 2).toUpperCase()}`, item_name: name, style, size, colorway: color, material_category: 'Footwear', unit_cost: cost, case_pack: cp });
      let p = prices;
      if (name === 'Harbor Chelsea Boot' && size === '10') p = { ...prices, 'Apex Trading Co': 55 }; // cheapest supplier is invalid -> On Hold path
      for (const [sn, price] of Object.entries(p)) insert('supplier_item_price', { supplier_id: sup[sn], item_id: id, unit_price: price });
      insert('seasonality_data', { item_id: id, period_start: addDays(t, -30), period_end: addDays(t, 60), seasonality_index: idx, trend_direction: dir });
      items.push({ id, name, size, rate, trend, color });
    }
  }
  const mult = [1, 1.25, 0.8];

  // sales history (120 days, trend-adjusted). Special cases: Dusty Oxford sold only 100-120 days ago; Aero Trainer launched 10 days ago.
  db.exec('BEGIN');
  for (const it of items) for (let s = 0; s < 3; s++) {
    if (it.name === 'Aero Trainer' && s !== 0) continue;
    const sizeAdj = it.size === '9' ? 1 : it.size === '10' ? 0.8 : it.size === '8' ? 0.7 : 0.6;
    for (let d = 120; d >= 1; d--) {
      if (it.name === 'Dusty Oxford' && d < 100) continue;
      if (it.name === 'Aero Trainer' && d > 10) continue;
      const base = it.rate * mult[s] * sizeAdj * (1 + (it.trend * (120 - d)) / 120);
      const qty = Math.round(base * (0.5 + rnd()));
      if (qty > 0) run(`INSERT INTO sales_record(item_id,store_id,sale_date,quantity_sold,sell_through_rate) VALUES(?,?,?,?,?)`, it.id, stores[s], addDays(t, -d), qty, Math.min(0.95, Math.round((0.2 + rnd() * 0.4) * 100) / 100));
    }
  }
  db.exec('COMMIT');

  // inventory + thresholds. [itemSize, store] overrides: [onHand, threshold]
  const ov = { 'Trail Runner 2|9|0': [14, 30], 'Trail Runner 2|10|0': [9, 30], 'Court Classic Low|8|1': [22, 40], 'Court Classic Low|9|2': [18, 40], 'Harbor Chelsea Boot|10|0': [6, 12], 'Aero Trainer|9|0': [6, 15], 'Coast Slide|7|1': [120, 10], 'Coast Slide|8|0': [4, 8], 'Court Classic Low|10|1': [160, 20], 'Dusty Oxford|9|0': [48, 10], 'Dusty Oxford|9|1': [30, 10], 'Dusty Oxford|9|2': [25, 10] };
  const noThreshold = new Set(['Coast Slide|8|2', 'Harbor Chelsea Boot|10|1']);
  const stale = new Set(['Court Classic Low|9|1']);
  for (const it of items) for (let s = 0; s < 3; s++) {
    if (it.name === 'Aero Trainer' && s !== 0) continue;
    const key = `${it.name}|${it.size}|${s}`;
    const sizeAdj = it.size === '9' ? 1 : it.size === '10' ? 0.8 : it.size === '8' ? 0.7 : 0.6;
    const daily = it.rate * mult[s] * sizeAdj;
    let qty = Math.max(8, Math.round(daily * (25 + rnd() * 30))), th = Math.max(6, Math.round(daily * 14));
    if (ov[key]) [qty, th] = ov[key];
    insert('inventory_record', { item_id: it.id, store_id: stores[s], quantity_on_hand: qty, last_updated_at: stale.has(key) ? new Date(Date.now() - 72 * 3600e3).toISOString() : now() });
    if (!noThreshold.has(key)) insert('monitoring_parameter', { item_id: it.id, store_id: stores[s], reorder_threshold: th, review_frequency: 'Daily', set_by: mgrs['Marcus Lee'] });
  }

  // history: one delivered PO and one in-flight (in_production) PO — chosen on SKUs that are not low so monitoring isn't blocked
  const inflight = (it, store, qty, supName, status, sentDaysAgo) => {
    const s = get(`SELECT * FROM supplier WHERE supplier_name=?`, supName), price = get(`SELECT unit_price p FROM supplier_item_price WHERE item_id=? AND supplier_id=?`, it.id, s.supplier_id).p;
    const total = Math.round(qty * price * 100) / 100, issue = addDays(t, -sentDaysAgo);
    const rq = insert('requisition', { store_id: store, supplier_id: s.supplier_id, inventory_level: 40, reorder_threshold: 30, total_estimated_cost: total, approval_limit: 1500, approval_method: total > 1500 ? 'Manager' : 'Auto', requisition_status: 'PO Issued', created_at: new Date(Date.now() - sentDaysAgo * 86400e3).toISOString() });
    insert('requisition_line_item', { requisition_id: rq, item_id: it.id, recommended_quantity: qty, unit_price: price, forecast_justification: 'Seeded historical order.' });
    insert('approval_decision', { requisition_id: rq, reviewed_by: total > 1500 ? mgrs['Marcus Lee'] : null, decision_type: total > 1500 ? 'Approved' : 'Auto Approved', reviewed_at: new Date(Date.now() - sentDaysAgo * 86400e3).toISOString() });
    const po = insert('purchase_order', { requisition_id: rq, supplier_id: s.supplier_id, store_id: store, issue_date: issue, expected_ship_date: addDays(issue, Math.ceil(s.lead_time_days / 2)), expected_delivery_date: addDays(issue, s.lead_time_days), status, total_amount: total, currency: 'USD', sent_at: new Date(Date.now() - sentDaysAgo * 86400e3).toISOString(), acknowledged_at: status === 'delivered' ? null : new Date(Date.now() - (sentDaysAgo - 1) * 86400e3).toISOString(), created_at: now(), updated_at: now() });
    insert('po_line_item', { po_id: po, item_id: it.id, quantity_ordered: qty, unit_price: price, line_total: total });
    insert('llm_supplier_prompt', { po_id: po, channel: s.preferred_channel, tone: 'transmission', subject: `PO-${po} transmission`, body: `Seeded PO-${po} sent to ${s.supplier_name}.`, created_at: issue + 'T09:00:00.000Z' });
    return po;
  };
  const by = (n, sz) => items.find((i) => i.name === n && i.size === sz);
  inflight(by('Trail Runner 2', '8'), stores[1], 60, 'Meridian Sole Works', 'in_production', 8);   // PO-1: demo target for supplier delay messages
  inflight(by('Court Classic Low', '9'), stores[0], 48, 'Northline Footwear Supply', 'delivered', 30); // history
  inflight(by('Trail Runner 2', '9'), stores[2], 36, 'Northline Footwear Supply', 'sent', 1);          // PO-3: awaiting ack
  run(`UPDATE purchase_order SET acknowledged_at=NULL WHERE po_id=3`);

  insert('action_log', { manager_id: mgrs['Marcus Lee'], store_id: stores[0], intent: 'System', action_details: 'Demo data loaded', logged_at: now() });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { resetData(); console.log('Seeded:', get(`SELECT (SELECT COUNT(*) FROM item) items, (SELECT COUNT(*) FROM inventory_record) inventory, (SELECT COUNT(*) FROM sales_record) sales`)); }
if (!get(`SELECT 1 FROM store LIMIT 1`) && process.argv[1] !== fileURLToPath(import.meta.url)) seed();
