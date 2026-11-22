// GET /api/config — public runtime settings for the browser.
// Only values that are safe to expose: the Supabase project URL and its
// publishable (anon) key are public by design; access is enforced by
// row-level security in the database. Secret keys are never returned.
let providersCache = { at: 0, value: null };

// Which sign-in providers are switched on in Supabase (public endpoint, cached 5 min).
async function providers(url, anon) {
  if (!url || !anon) return {};
  if (providersCache.value && Date.now() - providersCache.at < 5 * 60e3) return providersCache.value;
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(4000) });
    const j = r.ok ? await r.json() : null;
    const value = j && j.external ? { google: Boolean(j.external.google), email: Boolean(j.external.email) } : {};
    providersCache = { at: Date.now(), value };
    return value;
  } catch { return {}; }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    app: 'thuverse',
    supabaseUrl: url,
    supabaseAnonKey: anon,
    // where confirmation / sign-in / reset / OAuth flows send people back to (production only)
    siteUrl: process.env.SITE_URL || '',
    providers: await providers(url, anon),
    mw: Boolean(process.env.MW_API_KEY),
    // Lumi's free chat is on only when the server has an AI key (the key itself never leaves the server)
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
  }));
}
