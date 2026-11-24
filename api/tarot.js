// POST /api/tarot — an English (B1–B2) reading, a Vietnamese explanation and 5–8 vocabulary items
// for three cards the person drew. Needs ANTHROPIC_API_KEY (and optionally BUDDY_MODEL) in Vercel.
//
// The server checks the cards against its own deck (stable ids, our own meanings), so the model only
// ever sees the real draw. The reply is validated before it is returned; vocabulary items must appear
// in the English text. Signed-in users only, rate limited, nothing stored here.
import { authUser } from './_auth.js';
import '../tarot.js';

const T = globalThis.TAROT;
const MODEL = process.env.BUDDY_MODEL || 'claude-haiku-5-5';
const hits = new Map();
function limited(uid) {
  const now = Date.now(), h = (hits.get(uid) || []).filter(t => now - t < 864e5);
  if (h.filter(t => now - t < 60e3).length >= 6 || h.length >= 60) { hits.set(uid, h); return true; }
  h.push(now); hits.set(uid, h); if (hits.size > 2000) hits.delete(hits.keys().next().value);
  return false;
}
export function cleanDraw(b) {
  const list = b && Array.isArray(b.cards) ? b.cards : null;
  if (!list || list.length !== 3) return null;
  const out = list.map((c, i) => c && T.byId[c.id] ? { card: T.byId[c.id], reversed: c.reversed === true, pos: T.positions[i] } : null);
  if (out.some(x => !x) || new Set(out.map(x => x.card.id)).size !== 3) return null;
  return out;
}
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : '';
export function cleanReading(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  let o; try { o = JSON.parse(m ? m[0] : ''); } catch { return null; }
  const en = str(o && o.en, 3000), vi = str(o && o.vi, 3500);
  if (en.length < 200 || vi.length < 150) return null;
  const low = en.toLowerCase(), seen = new Set();
  const vocab = (Array.isArray(o.vocab) ? o.vocab : []).map(v => ({
    term: str(v && v.term, 60), pos: str(v && v.pos, 30), def: str(v && v.def, 240), vi: str(v && v.vi, 160),
    example: str(v && v.example, 240), context: str(v && v.context, 300),
  })).filter(v => v.term && v.def && /^[A-Za-z][A-Za-z' -]{0,59}$/.test(v.term) && low.includes(v.term.toLowerCase())
    && !seen.has(v.term.toLowerCase()) && seen.add(v.term.toLowerCase())).slice(0, 8);
  if (vocab.length < 3) return null;
  return { en, vi, vocab };
}
const SYSTEM = `You write short Tarot readings for English learners (mostly Vietnamese) in the Thuverse app.
Tarot here is entertainment and a tool for self-reflection, never a prediction. Do not make claims about health, death, money, legal or other high-stakes outcomes, and do not tell people to make important decisions because of a reading.
Use only the three cards, positions, orientations and meanings you are given. Do not add or change cards.
Answer with one JSON object and nothing else:
{"en": string, "vi": string, "vocab": [{"term","pos","def","vi","example","context"}]}
- "en": 140–220 words of natural English at B1–B2 level. Cover Past, Present and Future, show how the cards connect, and end with an overall theme or gentle takeaway. Plain paragraphs, no markdown.
- "vi": a natural Vietnamese explanation of the same reading (not word for word), 120–220 words.
- "vocab": 6 to 8 useful words or short phrases that appear exactly (same spelling) in "en": everyday, emotional or descriptive vocabulary and common collocations a B1–B2 learner can reuse. For each: "pos" part of speech, "def" a simple English definition, "vi" Vietnamese meaning, "example" a new everyday example sentence, "context" the sentence from "en" where it appears.`;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  return new Promise(resolve => { let d = '', n = 0;
    req.on('data', c => { n += c.length; if (n > 8192) { req.destroy(); resolve(null); } else d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve(null); } }); req.on('error', () => resolve(null)); });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 501, { error: 'ai_not_configured' });
  const uid = await authUser(req);
  if (!uid) return send(res, 401, { error: 'sign_in_required' });
  const draw = cleanDraw(await readBody(req));
  if (!draw) return send(res, 400, { error: 'invalid_cards' });
  if (limited(uid)) return send(res, 429, { error: 'rate_limited' });
  const desc = draw.map(d => `${d.pos.label} (${d.pos.hint.toLowerCase()}): ${d.card.name}, ${d.reversed ? 'reversed' : 'upright'} — ${(d.reversed ? d.card.rev : d.card.up).replace(/\.$/, '')}.`).join('\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1800, system: SYSTEM, messages: [{ role: 'user', content: `The three cards drawn:\n${desc}\n\nWrite the reading.` }] }),
        signal: AbortSignal.timeout(40000),
      });
    } catch (e) { return send(res, 504, { error: 'timeout' }); }
    if (r.status === 429 || r.status === 529) return send(res, 429, { error: 'ai_busy' });
    if (r.status === 401 || r.status === 403) return send(res, 502, { error: 'ai_key_rejected' });
    if (!r.ok) return send(res, 502, { error: 'ai_error' });
    const data = await r.json().catch(() => null);
    const text = data && Array.isArray(data.content) ? data.content.filter(b => b.type === 'text').map(b => b.text).join('') : '';
    const out = cleanReading(text);
    if (out) return send(res, 200, { ...out, cards: draw.map(d => ({ id: d.card.id, reversed: d.reversed })), model: MODEL });
  }
  return send(res, 502, { error: 'ai_invalid' });
}
