# Thuverse

Personal English and IELTS learning app. It's a static page (`index.html` + `content.js`) with three small Vercel functions. There's no build step and there are no npm dependencies.

```
index.html          the whole app (UI, SRS, sessions, analytics, dictionary UI)
content.js          built-in library: collections, lessons
api/config.js       GET /api/config: public runtime settings (Supabase URL and publishable key)
api/lookup.js       GET /api/lookup?url=…: server-side dictionary proxy (allow-listed sources only)
api/keepalive.js    daily cron that runs one tiny query so the free Supabase project stays active
supabase/schema.sql database table, row-level security, realtime
vercel.json         security headers, cron
```

## How it runs

| | On claude.ai (artifact) | On its own website (Vercel) |
|---|---|---|
| Sign-in | Claude account | Supabase Auth (email + password, or emailed link) |
| Storage | Claude's per-user database | Supabase Postgres `records` table, one row per record |
| Offline | browser cache | browser cache; queued changes upload when back online |
| Dictionary | Parallel Search connector | `/api/lookup` |

The page detects which mode it's in, so both keep working.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | the **publishable** key (`sb_publishable_…`). Public by design; security comes from row-level security. **Never** use the secret/service-role key. |
| `MW_API_KEY` | no | Merriam-Webster Learner's key. Lookups stay server-side; the key never reaches the browser. |
| `CONTACT` | no | email or URL added to the User-Agent sent to Wiktionary (Wikimedia asks for one) |
| `LOOKUP_REQUIRE_AUTH` | no | `false` allows lookups without signing in (default: sign-in required) |
| `CRON_SECRET` | recommended | protects `/api/keepalive`; Vercel sends it with cron calls automatically |

## Supabase setup

1. Run `supabase/schema.sql` in the SQL editor (already done for the `thuverse` project).
2. Authentication → URL Configuration: set **Site URL** to the production address (e.g. `https://thuverse.vercel.app`) and add it under **Redirect URLs**. Confirmation, sign-in-link and password-reset emails send people there.
3. Free-plan notes: 500 MB database, 50,000 monthly active users, and the project pauses after a week without activity (the daily keepalive cron helps; data is kept and the project can be restored from the dashboard). Free projects have no automatic backups, so use Preferences → Backup now and then.

## Dictionary sources

`/api/lookup` accepts only these URL shapes, rebuilds the upstream URL from validated parts, adds server-side keys, caches results for 24 hours and requires a valid Supabase session:

- Free Dictionary API: `api.dictionaryapi.dev/api/v2/entries/en/<word>`
- Wiktionary Action API: `en.wiktionary.org/w/api.php?action=parse…` (sections / wikitext)
- Datamuse: `api.datamuse.com/words?rel_syn|rel_ant|rel_jjb|rel_jja|rel_bga=<word>&max≤20`. Datamuse plans to require a key from 1 January 2027; until one is configured those fields show as unavailable.
- Merriam-Webster Learner's: `dictionaryapi.com/api/v3/references/learners/json/<word>` (only when `MW_API_KEY` is set)

## Moving data from the Claude version

In the Claude version: Preferences → Backup → Copy backup. On the website, sign in, then Preferences → Backup → Import and paste it. Records keep their ids, so importing twice doesn't create duplicates.
