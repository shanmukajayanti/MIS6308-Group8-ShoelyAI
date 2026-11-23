import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.SHOELY_DB || path.join(here, '..', 'data', 'shoely.db');
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));

const clean = (p) => p.map((v) => (v === undefined ? null : v));
export const all = (sql, ...p) => db.prepare(sql).all(...clean(p));
export const get = (sql, ...p) => db.prepare(sql).get(...clean(p));
export const run = (sql, ...p) => db.prepare(sql).run(...clean(p));
/** INSERT helper: returns new rowid. */
export const insert = (table, row) => {
  const cols = Object.keys(row);
  const r = run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => row[c]));
  return Number(r.lastInsertRowid);
};
export const update = (table, idCol, id, patch) => {
  const cols = Object.keys(patch);
  run(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE ${idCol}=?`, ...cols.map((c) => patch[c]), id);
};
export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};
