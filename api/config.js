// GET /api/config — public runtime settings for the browser.
// Only values that are safe to expose: the Supabase project URL and its
// publishable (anon) key are public by design; access is enforced by
// row-level security in the database. Secret keys are never returned.
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    app: 'thuverse',
    supabaseUrl: url,
    supabaseAnonKey: anon,
    // where confirmation / sign-in / reset emails send people back to (production only)
    siteUrl: process.env.SITE_URL || '',
    mw: Boolean(process.env.MW_API_KEY),
  }));
}
