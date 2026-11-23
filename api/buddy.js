// POST /api/buddy — Lumi's free chat (used only for questions the app can't answer by itself).
//
// Environment:
//   ANTHROPIC_API_KEY   required to switch the chat on (stays on the server)
//   BUDDY_MODEL         optional, default claude-haiku-5-5
//
// Safety:
//   - signed-in users only (Supabase session), per-user rate limits
//   - input is validated and trimmed; only the message, a few earlier messages,
//     the current page and collection names/counts are sent. No saved entries.
//   - the model never touches the database. It can only suggest actions from a
//     fixed list (open a page, look up a word, open the Add form), and the app
//     checks them again before showing them.
import { authUser } from './_auth.js';

const MODEL = process.env.BUDDY_MODEL || 'claude-haiku-5-5';
const PAGES = ['dashboard', 'library', 'library-ielts', 'library-grammar', 'library-phrases', 'library-structures', 'library-linking', 'review',
  'collections', 'collections-vocabulary', 'collections-collocations', 'collections-linking', 'collections-structures', 'collections-grammar', 'collections-idioms', 'collections-mistakes',
  'reading', 'sources', 'ielts', 'journal', 'preferences'];

const GUIDE = `Thuverse is a personal English-learning app (many users are Vietnamese, preparing for IELTS). What exists — describe ONLY these:
- Top bar: search box (press / ) searching words, notes and journal; "Add" button (or N key) opens "Add to My Collections": choose Word, Collocation, Phrasal verb, Sentence or Linking phrase, type it, and meaning/IPA/Vietnamese/examples fill in from dictionaries; an "Organise" section sets topic and IELTS skills. Avatar menu: Edit profile, Preferences, Learning goals, Appearance (Light/Dark/System), Sign out.
- Dashboard: streak, today's goal, vocabulary progress, learning overview with IELTS target bands.
- Library (shared material): IELTS vocabulary, Grammar (lessons basic to advanced with Vietnamese explanations, mistakes, practice), Collocations & phrasal verbs, Sentence structures, Linking phrases.
- Review: spaced-repetition flashcards. Choose a set, Space flips, rate 1–4 (forgot, hard, remembered, easy). R starts reviewing. Review style (Mixed, Flashcards, Type the answer) is in Preferences.
- My Collections (personal): every entry has a content type set by the app (Word, Collocation, Phrasal verb, Sentence, Linking phrase, Grammar note, Idiom, Mistake), listed by type in sections Vocabulary; Collocations & Phrasal Verbs; Linking Phrases; Sentences & Structures; Grammar Notes; Idioms & Expressions; Common Mistakes. Separately, users create their own collections ("New collection" on My Collections, e.g. Environment, IELTS Writing) that can mix types; the Add form has "Add to collection" (optional, can create a new one). One entry can be in several collections. Content types cannot be created or renamed. Entries have status New, Learning, Mastered.
- Reading list: save articles (paste a link: title and image fill in), read pasted text and select words to save them with their sentence. Sources: curated websites plus your own.
- IELTS Workspace: Listening, Reading, Writing Task 1 and 2, Speaking Parts 1–3, each with strategies, practice logs and useful language.
- Learning Journal: short daily notes. Preferences: name, avatar, goals, review style, pronunciation accent, data export/import, dictionary lookup settings, keyboard shortcuts.
You (Lumi) can, inside this chat, look up words and save them to My Collections.`;

const SYSTEM = `You are Lumi, a small, warm, upbeat learning buddy inside the Thuverse app. Speak naturally and kindly, like a friendly study partner, never like customer support. Keep replies short (under 120 words), use plain sentences or a few numbered steps.
Always reply in the same language the user writes in (Vietnamese, English or any other).
Only describe features listed in the app guide. If something isn't in the guide, say the app doesn't have it rather than inventing buttons, pages or settings. You may briefly explain English language points (meanings, grammar, usage) and give examples.
You can't see or change the user's saved entries; you only know the page they are on and their collection names and counts.
Answer with a single JSON object and nothing else: {"reply": string, "actions": [ ... ]}. Actions are optional, at most 3, each one of:
{"type":"open","page":<one of ${PAGES.join(', ')}>} to offer a button to a page,
{"type":"lookup","term":<word or phrase>} to offer a dictionary lookup in the chat,
{"type":"add"} to offer the Add form.
Use **bold** for button or page names. No other markdown.

App guide:
${GUIDE}`;

/* per-user limits: 12 a minute, 120 a day */
const hits = new Map();
function limited(uid) {
  const now = Date.now(), h = (hits.get(uid) || []).filter(t => now - t < 864e5);
  if (h.filter(t => now - t < 60e3).length >= 12 || h.length >= 120) { hits.set(uid, h); return true; }
  h.push(now); hits.set(uid, h);
  if (hits.size > 2000) hits.delete(hits.keys().next().value);
  return false;
}

const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : '';
export function cleanInput(b) {
  if (!b || typeof b !== 'object') return null;
  const message = str(b.message, 1000);
  if (!message) return null;
  const history = (Array.isArray(b.history) ? b.history : []).slice(-8)
    .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', text: str(m && m.text, 1500) })).filter(m => m.text);
  const c = b.context && typeof b.context === 'object' ? b.context : {};
  const context = {
    page: /^[a-z]{2,20}$/.test(c.page || '') ? c.page : '',
    lang: /^[a-z]{2}$/.test(c.lang || '') ? c.lang : '',
    collections: (Array.isArray(c.collections) ? c.collections : []).slice(0, 10).map(x => ({ name: str(x && x.name, 40), count: Math.max(0, Math.min(1e5, parseInt(x && x.count, 10) || 0)) })).filter(x => x.name),
    topics: (Array.isArray(c.topics) ? c.topics : []).slice(0, 15).map(t => str(t, 40)).filter(Boolean),
  };
  return { message, history, context };
}
export function cleanReply(text) {
  let o = null;
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) { try { o = JSON.parse(m[0]); } catch { o = null; } }
  if (!o || typeof o.reply !== 'string') return { reply: String(text || '').replace(/^```\w*|```$/g, '').trim().slice(0, 2000), actions: [] };
  const actions = (Array.isArray(o.actions) ? o.actions : []).slice(0, 3).map(a => {
    if (!a || typeof a !== 'object') return null;
    if (a.type === 'open' && PAGES.includes(a.page)) return { type: 'open', page: a.page };
    if (a.type === 'lookup' && typeof a.term === 'string' && /^[\p{L}][\p{L}\p{M}' -]{0,59}$/u.test(a.term.trim())) return { type: 'lookup', term: a.term.trim() };
    if (a.type === 'add') return { type: 'add' };
    return null;
  }).filter(Boolean);
  return { reply: o.reply.trim().slice(0, 2000), actions };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  return new Promise(resolve => {
    let d = '', size = 0;
    req.on('data', c => { size += c.length; if (size > 32768) { req.destroy(); resolve(null); } else d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 501, { error: 'ai_not_configured' });
  const uid = await authUser(req);
  if (!uid) return send(res, 401, { error: 'sign_in_required' });
  const input = cleanInput(await readBody(req));
  if (!input) return send(res, 400, { error: 'invalid_input' });
  if (limited(uid)) return send(res, 429, { error: 'rate_limited' });

  const { message, history, context } = input;
  const ctx = `Context: user is on the "${context.page || 'unknown'}" page. Their collections: ${context.collections.map(c => `${c.name} (${c.count})`).join(', ') || 'none yet'}. Their topics: ${context.topics.join(', ') || 'none'}.`;
  const messages = [];
  for (const m of history) {
    if (messages.length && messages[messages.length - 1].role === m.role) messages[messages.length - 1].content += '\n' + m.text;
    else messages.push({ role: m.role, content: m.text });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const last = `${ctx}\n\nUser: ${message}`;
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += '\n\n' + last;
  else messages.push({ role: 'user', content: last });

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    return send(res, e && e.name === 'TimeoutError' ? 504 : 502, { error: e && e.name === 'TimeoutError' ? 'timeout' : 'ai_unreachable' });
  }
  if (r.status === 429 || r.status === 529) return send(res, 429, { error: 'ai_busy' });
  if (r.status === 401 || r.status === 403) return send(res, 502, { error: 'ai_key_rejected' });
  if (!r.ok) return send(res, 502, { error: 'ai_error' });
  const data = await r.json().catch(() => null);
  const text = data && Array.isArray(data.content) ? data.content.filter(b => b.type === 'text').map(b => b.text).join('') : '';
  if (!text) return send(res, 502, { error: 'ai_error' });
  return send(res, 200, cleanReply(text));
}
