// UC2 — Forecast Demand for SKU. LLM-first (Section 10.2 prompt), deterministic statistical fallback.
import { all, get, insert } from '../db.js';
import { now, today, addDays, hoursSince } from '../util.js';
import { jsonTask, hasKey, MODEL } from '../llm.js';

const SYSTEM = `You are the Shoely Demand Forecasting Agent for a footwear retailer. Forecast demand for one item (style, size, colorway) at one store for the requested period.
Rules: use only the data provided; never invent sales. If sales history is missing/insufficient set forecastConfidence "Low" or "Unreliable", reviewFlag "Yes", and state why; if "Unreliable" predictedDemand must be null.
"High" = history covers a consistent trend; "Medium" = partial history or mixed trend; "Low" = sparse/inconsistent; "Unreliable" = not enough data.
If predictedDemand differs >50% from the average demand of the most recent comparable period set reviewFlag "Yes". predictedDemand is a whole number of pairs, >= 0, rounded up.
Output JSON: {"predictedDemand":number|null,"forecastConfidence":"High|Medium|Low|Unreliable","forecastJustification":string,"reviewFlag":"Yes|No"}`;

export function salesHistory(itemId, storeId, days = 120) {
  return all(`SELECT sale_date, quantity_sold, sell_through_rate FROM sales_record WHERE item_id=? AND store_id=? AND sale_date>=? ORDER BY sale_date`, itemId, storeId, addDays(today(), -days));
}
export const latestForecast = (itemId, storeId) =>
  get(`SELECT * FROM demand_forecast WHERE item_id=? AND store_id=? ORDER BY forecast_id DESC LIMIT 1`, itemId, storeId);

/** Pure statistical baseline. */
export function statForecast(hist, season, horizon) {
  const t = today();
  const sum = (a, b) => hist.filter((h) => h.sale_date > addDays(t, -a) && h.sale_date <= addDays(t, -b)).reduce((s, h) => s + h.quantity_sold, 0);
  const last28 = sum(28, 0), prev28 = sum(56, 28), recentComparable = sum(horizon, 0);
  const histDays = hist.length ? Math.round((new Date(t) - new Date(hist[0].sale_date)) / 86400e3) : 0;
  const idx = season?.seasonality_index ?? 1;
  const trendFactor = prev28 > 0 ? Math.min(1.5, Math.max(0.6, last28 / prev28)) : 1;
  const perDay = last28 / 28;
  const predicted = Math.ceil(perDay * horizon * idx * (1 + (trendFactor - 1) * 0.5));
  let conf = 'Unreliable';
  if (histDays >= 84 && hist.length >= 20) conf = 'High'; else if (histDays >= 42) conf = 'Medium'; else if (histDays >= 14) conf = 'Low';
  const wild = prev28 > 0 && (trendFactor > 1.4 || trendFactor < 0.7);
  if (conf === 'High' && wild) conf = 'Medium';
  return { predicted: conf === 'Unreliable' ? null : predicted, conf, last28, prev28, recentComparable, histDays, idx, trendFactor };
}

/** Get (or generate) a forecast. Reuses a forecast < maxAgeHours old unless force. */
export async function getForecast(itemId, storeId, { trigger = 'Reorder Trigger', horizon = 30, force = false, maxAgeHours = 24 } = {}) {
  const cur = latestForecast(itemId, storeId);
  if (cur && !force && hoursSince(cur.created_at) < maxAgeHours) return cur;
  const t = today(), end = addDays(t, horizon - 1);
  const hist = salesHistory(itemId, storeId);
  const season = get(`SELECT * FROM seasonality_data WHERE item_id=? AND period_end>=? ORDER BY period_start LIMIT 1`, itemId, t);
  const s = statForecast(hist, season, horizon);
  const requestId = insert('forecast_request', { item_id: itemId, store_id: storeId, period_start: t, period_end: end, trigger_type: trigger, requested_at: now() });

  let predicted = s.predicted, conf = s.conf, review = 'No', model = 'stat-v1', outdated = 'No';
  let just = `${s.histDays} days of history. Last 28 days sold ${s.last28} (prior 28: ${s.prev28}), trend x${s.trendFactor.toFixed(2)}, seasonality index ${s.idx}${season ? ` (${season.trend_direction})` : ''}.`;
  if (conf === 'Unreliable') just = `Not enough sales history (${s.histDays} days) to forecast reliably.`;

  if (hasKey()) {
    const llm = await jsonTask('forecast', SYSTEM, JSON.stringify({
      forecastRequest: { itemId, storeId, periodStart: t, periodEnd: end },
      salesHistory: hist.slice(-84).map((h) => ({ date: h.sale_date, qty: h.quantity_sold, sellThrough: h.sell_through_rate })),
      seasonality: season ? { index: season.seasonality_index, trend: season.trend_direction } : null,
      statisticalBaseline: { predicted: s.predicted, last28Days: s.last28, prior28Days: s.prev28 },
      businessRules: 'Whole pairs. Round up. Do not forecast below zero.',
    }));
    if (llm && ['High', 'Medium', 'Low', 'Unreliable'].includes(llm.forecastConfidence) && (llm.predictedDemand === null || Number.isFinite(llm.predictedDemand))) {
      predicted = llm.predictedDemand === null ? null : Math.max(0, Math.ceil(llm.predictedDemand));
      conf = llm.forecastConfidence; just = String(llm.forecastJustification || just); model = MODEL;
      if (llm.reviewFlag === 'Yes') review = 'Yes';
    } else if (llm === null) { // E2: LLM failed twice -> fall back to the stored forecast flagged outdated, else statistical
      if (cur) { insert('demand_forecast', { ...strip(cur), request_id: requestId, outdated_flag: 'Yes', review_flag: 'Yes', created_at: now() }); return latestForecast(itemId, storeId); }
    }
  }
  if (conf === 'Unreliable') { predicted = null; review = 'Yes'; }
  else if (conf === 'Low') review = 'Yes';
  // E4: deviation > 50% vs most recent comparable period -> review
  if (predicted != null && s.recentComparable > 0 && Math.abs(predicted - s.recentComparable) / s.recentComparable > 0.5) {
    review = 'Yes'; just += ` Flagged: forecast deviates ${Math.round(100 * (predicted - s.recentComparable) / s.recentComparable)}% from the last ${horizon} days (${s.recentComparable}).`;
  }
  const id = insert('demand_forecast', { request_id: requestId, item_id: itemId, store_id: storeId, period_start: t, period_end: end, predicted_demand: predicted, forecast_confidence: conf, model_version: model, forecast_justification: just, review_flag: review, outdated_flag: outdated, created_at: now() });
  return get(`SELECT * FROM demand_forecast WHERE forecast_id=?`, id);
}
const strip = (r) => { const { forecast_id, ...rest } = r; return rest; };
