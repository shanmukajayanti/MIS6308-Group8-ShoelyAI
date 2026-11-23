// UC7 — Identify & Flag Overstock/Deadstock (Section 10.7 rules).
import { all, get, insert } from '../db.js';
import { now, today, addDays, daysBetween, itemLabel, storeManager, storeById, notify } from '../util.js';
import { getForecast } from './forecast.js';

export async function runStockHealth() {
  const flagged = [], excluded = [], clean = [];
  const t = today();
  for (const inv of all(`SELECT * FROM inventory_record`)) {
    const item = get(`SELECT * FROM item WHERE item_id=?`, inv.item_id);
    const sales = get(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN sale_date>? THEN quantity_sold END),0) last90 FROM sales_record WHERE item_id=? AND store_id=?`, addDays(t, -90), inv.item_id, inv.store_id);
    if (!sales.n) { excluded.push({ itemId: inv.item_id, storeId: inv.store_id, why: 'No sales history' }); continue; } // rule 1
    const fc = await getForecast(inv.item_id, inv.store_id, { trigger: 'Scheduled Cycle' });
    if (!fc || fc.predicted_demand == null) { excluded.push({ itemId: inv.item_id, storeId: inv.store_id, why: 'No usable forecast' }); continue; }
    const days = daysBetween(fc.period_start, fc.period_end) + 1;
    const perDay = fc.predicted_demand / days;
    const dos = perDay === 0 ? null : inv.quantity_on_hand / perDay;                    // rule 2 (null = unlimited)
    const noSales = sales.last90 === 0;
    let type = null;
    if (inv.quantity_on_hand > 0 && (dos === null || dos > 180 || noSales)) type = 'Deadstock Risk'; // rule 3
    else if (dos !== null && dos > 90) type = 'Overstock';                                          // rule 4
    if (!type) { clean.push(inv.item_id); continue; }
    const dup = get(`SELECT 1 FROM stock_flag WHERE item_id=? AND store_id=? AND flag_type=? AND acknowledged_by IS NULL`, inv.item_id, inv.store_id, type);
    if (!dup) insert('stock_flag', { item_id: inv.item_id, store_id: inv.store_id, flag_type: type, flagged_at: now(), quantity_on_hand: inv.quantity_on_hand, forecasted_demand: fc.predicted_demand, days_of_supply: dos === null ? null : Math.round(dos * 10) / 10 });
    flagged.push({ itemId: inv.item_id, storeId: inv.store_id, label: itemLabel(item), store: storeById(inv.store_id).store_name, type, daysOfSupply: dos === null ? null : Math.round(dos) });
  }
  if (flagged.length) { const byStore = {}; flagged.forEach((f) => (byStore[f.storeId] ||= []).push(f)); for (const [sid, fl] of Object.entries(byStore)) notify(storeManager(Number(sid)).manager_id, 'stock_health', `${fl.length} overstock/deadstock flags`, fl.map((f) => `${f.label}: ${f.type}`).join('; ')); }
  return { flagged: flagged.length, excluded: excluded.length, ok: clean.length, results: flagged, excludedItems: excluded };
}
export const listFlags = () => all(`SELECT f.*, i.item_name, i.size, i.colorway, s.store_name FROM stock_flag f JOIN item i USING(item_id) JOIN store s USING(store_id) ORDER BY f.flag_id DESC`);
