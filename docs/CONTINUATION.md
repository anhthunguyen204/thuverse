# Thuverse – continuation note (24 Nov 2026)

## Deployment status
- **Production** (https://thuverse.vercel.app) = `main` @ `790854c` "Release checkpoint 1". READY.
  The previous production build (`a31261e`) is still in Vercel and can be restored if anything goes wrong.
- Checkpoint 1 contains: language workspaces + Google login linking, content types vs collections,
  sign-in redesign, Google sign-in fixes, Add-modal search dropdown (plus everything shipped before).
- Feature branches (all merged into `main`): `feature/workspaces`, `feature/collections`, `feature/google-fix`,
  `feature/search-dropdown`, `feature/auth-redesign`, `release/checkpoint-1`. They can be deleted.

## Completed and verified (local Playwright suite + Preview builds)
- **Workspaces** (English, Korean TOPIK): sidebar switcher (`#ws-btn` / `#wspop`), per-workspace data, nav,
  Korean word form (auto romanization `romanize()`), TOPIK Workspace (`#topik`, kinds `topik`, `tscore`),
  Korean dashboard, ko-KR speech, Hangul-safe search (`srFold`).
- **DB** (Supabase `zefcctoulnafolaxdqhg`, migrations applied):
  - `records_language_workspaces`: `records.workspace` column (`en` | `_shared` | `ko`…), id/workspace check,
    trigger forcing `settings` → `_shared`, RLS on header `x-thuverse-workspace` (missing header = English).
    Korean ids are prefixed `ko:`; the client sends the header only when not English (`wsFetch` in `webClient`).
  - `records_content_type_enum`: `body->>'type'` must be a known content type when present; `ucol` needs a name.
- **Content types vs collections**: `item.type` (CONTENT_TYPES), `item.col` kept for compatibility; user
  collections = records `kind:'ucol'` (`uc-<slug>` ids), entries link via `item.collectionIds`.
  One-time per-workspace migration `migrateContentTypes()` (marker record `meta-ct1`) turned topics into collections.
  Routes: `#collections` (grid + entries by type), `#mycol-<id>` (collection page).
- **Login methods** (Preferences): `linkIdentity`/`unlinkIdentity`, return handling `linkReturnInfo()`/`linkFinish()`.
- **Sign-in screen**: canvas skyline `authSky`, glass card, link hierarchy (`.auth-alt`, `.auth-help`, `.auth-foot`).
- **Google sign-in code fixes**: OAuth return messages (`thuverse.oauth` session flag), opt-in diagnostics
  (`localStorage.thuverse.debugAuth = "1"`, error codes only).
- **Add modal**: results in overlay `#av-dd` under `#lk-q`; hint line `#av-hint`; `avDD()`.
- **Lumi** (`/api/buddy`), Reading Sources (`/api/meta`), earlier features unchanged.

## Known issues / unverified
1. **Google sign-in cannot work yet**: the Supabase Google provider is OFF (`/api/config` → `providers.google:false`).
   The user must create the Google OAuth client and enable the provider, and turn on Manual linking
   (exact values are in the chat report of 24 Nov). After that, re-check `/api/config` and test the real round trip.
2. **Korean workspace on real Supabase**: the custom request header `x-thuverse-workspace` was verified with SQL
   (RLS) and locally, but not from a real browser against Supabase. If Supabase blocked the header, switching to
   Korean shows "Couldn't load your Korean workspace" and English is unaffected. Fallback if needed: put the
   workspace into an RPC parameter or a server endpoint instead of a header.
3. Korean live sync between two open devices updates on tab focus, not instantly (Realtime has no header → English only).
4. Items saved by an old app version after a workspace's migration keep their topic text but are not put into a
   collection automatically (the migration runs once per workspace).
5. `ANTHROPIC_API_KEY` is not set, so Lumi's free chat is off (lookups, saving and app help work).
6. Test suite flake: `test/web/goog.py` occasionally times out on the first run and passes on rerun (mock timing).

## Next steps (priority order)
1. **Tarot Corner** (English workspace only). Plan agreed in chat:
   - Cards: static metadata for 78 cards (stable ids `maj-00`…`maj-21`, `wands-01`…`pentacles-14`), upright and
     reversed meanings written by us, in a static JS/JSON file (no AI needed for card meanings).
   - Art: the original 1909 Rider–Waite–Smith artwork (Pamela Colman Smith) is public domain; use scans from
     Wikimedia Commons stored locally (e.g. `/tarot/*.webp`). Avoid the 1971 U.S. Games recoloured edition,
     which is still under copyright. The workspace can't download files, so get the 78 images from the user or
     a build environment with network access. Until then, use a typographic card face (no fake art).
   - AI: new `api/tarot.js` modelled on `api/buddy.js`. The server validates the 3 card ids and orientations
     against its own card list and returns JSON `{en, vi, vocab:[{term,pos,def,vi,example,context}]}`.
     Validate the response before showing it. Without a key, show the card meanings only and never a made-up reading.
   - Vocabulary: highlight `vocab[].term` in the English text; the popup uses `lkLookup` for IPA; save through
     a shared create function (factor `bdCreate` and the Add form's save into one `createItem()`); duplicate check
     with `termKey`; for an existing entry, offer to add it to another collection (update `collectionIds`).
   - Collections: reuse `ucol`; add an optional `desc` field to `ucolNameForm`; inline "Create new collection" in the popup.
   - History: records `kind:'tarot'` (workspace-scoped automatically), saved only with an explicit "Save reading" button.
   - Nav: add "Tarot Corner" to the English sidebar only (`renderNav` groups), route `#tarot`; guard it in `wsAllowed`.
2. User actions: Google OAuth setup, Supabase redirect URLs for Preview, `ANTHROPIC_API_KEY` in Vercel.
3. Optional: delete merged branches; drop the old unused `.auth-links` styles if any remain.

## Working setup
- Repo `anhthunguyen204/thuverse` cloned at `/home/claude/thuverse`. The working copy `/home/claude/hub/index.html`
  is kept identical to the branch being tested.
- Tests: `/home/claude/test` (artifact mode) and `/home/claude/test/web` (web mode, `node server.mjs` mock server
  with mock Supabase incl. workspace RLS emulation). Key suites: `ws.py`, `coll.py`, `dd.py`, `auth.py`, `gauth.py`,
  `bd.py`, `src.py`, `e2e.py`.
- Patch scripts used to build features are in `/home/claude/build/patch_*.py`.
