// Shared helper (files starting with "_" are not deployed as endpoints).
// When Supabase is configured, a request must carry a valid Supabase session token.
const tokens = new Map(); // token -> {exp, id}

// Returns the signed-in user's id, 'anon' when auth isn't configured, or null.
export async function authUser(req) {
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !anon || process.env.LOOKUP_REQUIRE_AUTH === 'false') return 'anon';
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const hit = tokens.get(token);
  if (hit && hit.exp > Date.now()) return hit.id;
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const u = await r.json().catch(() => ({}));
    if (tokens.size > 200) tokens.clear();
    const id = (u && u.id) || 'user';
    tokens.set(token, { exp: Date.now() + 10 * 60e3, id });
    return id;
  } catch { return null; }
}
export async function signedIn(req) { return Boolean(await authUser(req)); }
