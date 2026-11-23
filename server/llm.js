import { insert } from './db.js';
import { now } from './util.js';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const hasKey = () => !!process.env.ANTHROPIC_API_KEY && process.env.SHOELY_NO_LLM !== '1';

/** Raw Messages API call (no SDK dependency). */
export async function callClaude({ system, messages, tools, maxTokens = 1500 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
const textOf = (r) => r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
const audit = (kind, prompt, response, ok) => { try { insert('llm_call_log', { kind, model: MODEL, prompt: prompt.slice(0, 4000), response: (response || '').slice(0, 4000), ok: ok ? 1 : 0, created_at: now() }); } catch {} };

/** Structured-JSON task, per Section 10 prompts. Retries once on API/parse failure; returns null if LLM unavailable. */
export async function jsonTask(kind, system, user) {
  if (!hasKey()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callClaude({ system: system + '\nReturn ONLY a valid JSON object, no prose, no code fences.', messages: [{ role: 'user', content: user }] });
      const t = textOf(r);
      const parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      audit(kind, user, t, true);
      return parsed;
    } catch (e) { audit(kind, user, String(e.message), false); }
  }
  return null;
}
/** Free-text drafting (supplier emails, requisition justifications). Falls back to the supplied template. */
export async function draftText(kind, system, user, fallback) {
  if (!hasKey()) return fallback;
  try { const t = textOf(await callClaude({ system, messages: [{ role: 'user', content: user }], maxTokens: 600 })); audit(kind, user, t, true); return t.trim() || fallback; }
  catch (e) { audit(kind, user, String(e.message), false); return fallback; }
}
export { textOf, audit };
