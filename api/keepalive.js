// Daily Vercel cron: one tiny read against Supabase so a free project that
// you haven't opened for a few days still sees activity. Best effort only.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) { res.statusCode = 401; return res.end('unauthorised'); }
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !anon) { res.statusCode = 200; return res.end('supabase not configured'); }
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/rest/v1/records?select=id&limit=1`, { headers: { apikey: anon }, signal: AbortSignal.timeout(8000) });
    res.statusCode = 200; res.end(`ok ${r.status}`);
  } catch (e) { res.statusCode = 502; res.end('unreachable'); }
}
