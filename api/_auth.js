// Shared helper (files starting with "_" are not deployed as endpoints).
// When Supabase is configured, a request must carry a valid Supabase session token.
const tokens = new Map(); // token -> expiry ms

export async function signedIn(req) {
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
