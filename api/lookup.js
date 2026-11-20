// GET /api/lookup?url=<upstream dictionary URL>
//
// Server-side dictionary proxy for Thuverse. It does NOT fetch arbitrary URLs:
// each request is matched against a fixed set of source templates, then the
// upstream URL is rebuilt from the validated parts only. API keys live in
// Vercel environment variables and never reach the browser.
//
// Sources (free / openly licensed):
//   Free Dictionary API  https://dictionaryapi.dev           (Wiktionary data, CC BY-SA)
//   Wiktionary Action API https://en.wiktionary.org/w/api.php (CC BY-SA)
//   Datamuse             https://www.datamuse.com/api/
//   Merriam-Webster Learner's (optional, needs MW_API_KEY)  https://dictionaryapi.com
//
// Env:
//   MW_API_KEY            optional Merriam-Webster Learner's key
//   SUPABASE_URL, SUPABASE_ANON_KEY   when set, callers must send a valid Supabase session token
//   LOOKUP_REQUIRE_AUTH   set to "false" to allow anonymous lookups
//   CONTACT               optional contact (email/URL) sent in the User-Agent, as Wikimedia asks

const UA = `Thuverse/1.0 (personal English learning app${process.env.CONTACT ? '; ' + process.env.CONTACT : ''})`;
const WORD = /^[\p{L}\p{M}0-9 '’.\-]{1,64}$/u;
const TTL = 24 * 3600e3;
const cache = new Map();       // url -> {at, status, body}
const tokens = new Map();      // token -> expiry ms

function bad(res, status, error) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error }));
}

function onlyParams(sp, allowed) {
  for (const k of sp.keys()) if (!allowed.includes(k)) return false;
  return true;
}

// Returns {url, source} rebuilt from validated parts, or {error}
export function resolve(raw) {
  let u;
  try { u = new URL(raw); } catch { return { error: 'bad_url' }; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return { error: 'bad_url' };
  const sp = u.searchParams;

  if (u.hostname === 'api.dictionaryapi.dev') {
    const m = u.pathname.match(/^\/api\/v2\/entries\/en\/([^/]+)$/);
    const w = m && decodeURIComponent(m[1]);
    if (!w || !WORD.test(w) || [...sp.keys()].length) return { error: 'bad_request' };
    return { source: 'free', url: `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}` };
  }

  if (u.hostname === 'en.wiktionary.org') {
    if (u.pathname !== '/w/api.php') return { error: 'bad_request' };
    if (!onlyParams(sp, ['action', 'page', 'prop', 'section', 'format', 'formatversion', 'redirects'])) return { error: 'bad_request' };
    const page = sp.get('page') || '', prop = sp.get('prop'), section = sp.get('section');
    if (sp.get('action') !== 'parse' || sp.get('format') !== 'json' || !WORD.test(page)) return { error: 'bad_request' };
    if (!['sections', 'wikitext'].includes(prop)) return { error: 'bad_request' };
    if (prop === 'wikitext' && !/^\d{1,3}$/.test(section || '')) return { error: 'bad_request' };
    const q = new URLSearchParams({ action: 'parse', page, prop, format: 'json', redirects: '1' });
    if (prop === 'wikitext') { q.set('section', section); q.set('formatversion', '2'); }
    return { source: 'wiki', url: `https://en.wiktionary.org/w/api.php?${q}` };
  }

  if (u.hostname === 'api.datamuse.com') {
    if (u.pathname !== '/words') return { error: 'bad_request' };
    const rels = ['rel_syn', 'rel_ant', 'rel_jjb', 'rel_jja', 'rel_bga'];
    if (!onlyParams(sp, [...rels, 'max'])) return { error: 'bad_request' };
    const rel = rels.find(r => sp.has(r));
    const w = rel && sp.get(rel);
    if (!w || !WORD.test(w)) return { error: 'bad_request' };
    const max = Math.min(Math.max(parseInt(sp.get('max') || '12', 10) || 12, 1), 20);
    const q = new URLSearchParams({ [rel]: w, max: String(max) });
    return { source: 'dm', url: `https://api.datamuse.com/words?${q}` };
  }

  if (u.hostname === 'www.dictionaryapi.com') {
    const m = u.pathname.match(/^\/api\/v3\/references\/learners\/json\/([^/]+)$/);
    const w = m && decodeURIComponent(m[1]);
    if (!w || !WORD.test(w) || !onlyParams(sp, ['key'])) return { error: 'bad_request' };
    const key = process.env.MW_API_KEY;
    if (!key) return { error: 'mw_not_configured' };
    return { source: 'mw', url: `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(w)}?key=${encodeURIComponent(key)}` };
  }

  return { error: 'source_not_allowed' };
}

async function authorised(req) {
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !anon || process.env.LOOKUP_REQUIRE_AUTH === 'false') return true;
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return false;
  const exp = tokens.get(token);
  if (exp && exp > Date.now()) return true;
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return false;
    if (tokens.size > 200) tokens.clear();
    tokens.set(token, Date.now() + 10 * 60e3);
    return true;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');
  const raw = new URL(req.url, 'http://local').searchParams.get('url');
  if (!raw) return bad(res, 400, 'missing_url');
  const r = resolve(raw);
  if (r.error) return bad(res, r.error === 'mw_not_configured' ? 409 : 400, r.error);
  if (!(await authorised(req))) return bad(res, 401, 'sign_in_required');

  const hit = cache.get(r.url);
  let status, body;
  if (hit && Date.now() - hit.at < TTL) ({ status, body } = hit);
  else {
    try {
      const up = await fetch(r.url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      body = await up.text();
      status = up.status;
      try { JSON.parse(body); } catch { return bad(res, 502, 'upstream_not_json'); }
      if (status !== 200 && status !== 404) return bad(res, 502, `upstream_${status}`);
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      cache.set(r.url, { at: Date.now(), status, body });
    } catch (e) {
      return bad(res, 504, e && e.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable');
    }
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Lookup-Source', r.source);
  res.end(body);
}
