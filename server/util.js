import { get, run, insert } from './db.js';

// Simulated clock: real time + offset, so demos can fast-forward SLA timers (24h supplier ack, 4h escalation...).
export const clockOffsetHours = () => Number(get(`SELECT value FROM setting WHERE key='clock_offset_hours'`)?.value || 0);
export const nowDate = () => new Date(Date.now() + clockOffsetHours() * 3600e3);
export const now = () => nowDate().toISOString();
export const today = () => now().slice(0, 10);
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3);
export const hoursSince = (iso) => (nowDate() - new Date(iso)) / 3600e3;

export const getSetting = (k, d) => { const r = get(`SELECT value FROM setting WHERE key=?`, k); return r ? r.value : d; };
export const setSetting = (k, v) => run(`INSERT INTO setting(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, k, String(v));
export const approvalLimit = () => Number(getSetting('approval_limit', 2500));

export const itemLabel = (i) => `${i.item_name} · Size ${i.size} · ${i.colorway}`;
export const itemById = (id) => get(`SELECT * FROM item WHERE item_id=?`, id);
export const storeById = (id) => get(`SELECT * FROM store WHERE store_id=?`, id);
export const storeManager = (storeId) => get(`SELECT * FROM manager WHERE role='Store Manager' AND store_id=?`, storeId) || get(`SELECT * FROM manager WHERE role='Store Manager'`);
export const regionalManager = () => get(`SELECT * FROM manager WHERE role='Regional/Ops Manager'`);

/** Notification delivery with retry-and-log semantics (E4 in UC1). Delivery channel is simulated in-app. */
export function notify(managerId, kind, subject, body, recommendationId = null) {
  return insert('notification', { manager_id: managerId, recommendation_id: recommendationId, kind, subject, body, delivery_status: 'Sent', retry_count: 0, sent_at: now() });
}
export function logAction(managerId, storeId, intent, details, { recommendationId = null, messageId = null } = {}) {
  return insert('action_log', { manager_id: managerId, store_id: storeId, intent, action_details: details, recommendation_id: recommendationId, message_id: messageId, logged_at: now() });
}
