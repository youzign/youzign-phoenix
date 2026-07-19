# Legacy Youzign Data Rescue — Trace & Handoff
*Started & paused 2026-07-13 (session ran ~48h). This is the durable trace of the AWS→Backblaze data rescue for DEZ-73, so the work survives a lost chat. Full operational detail + all secrets (B2 keys, AWS creds, test password, SSH key path) live in the private memory note `dez73-aws-legacy-designs.md` — this repo doc deliberately contains NO credentials.*

## Why this happened
Youzign was a web app that stored user designs + uploaded images on AWS (S3 bucket `userdata.youzign.com`, ~35.3M objects / 7.53 TB). The AWS account is about to be closed for cost (past due; on a grace period after a $500 payment ~2026-07-08, so safe for a few more days). We are rescuing the data off AWS before closure, then wiring it into this desktop app (the modern successor) so users can reclaim their old designs.

## What's already safe (independent of AWS)
- **All 2.25M design *definitions*** were never uniquely on AWS — they're in the WordPress DB dumps at `/Users/dezygn/Projects/backup/`:
  - `youzign-db-backup (1).sql.gz` = live `youzign_wpwp` DB — v3 designs as `wp_posts` (post_type=`designs`, `post_content` = designstring XML), 2015–2026. Plus `wp_users` (273k, email+username) for claim lookup.
  - `rescue_youzign_youzign.sql.gz` = v2 `save_editor_design` (85k designs).
  - `rescue_youzign_yz2015.sql.gz`, `rescue_youzign_forums.sql.gz` = older snapshots.
- The **images inside designs** are the only thing that lived solely on AWS — that's what the copy below is about.

## Data copy status — ~80% done (paused)
Destination: **Backblaze B2 bucket `youzign-archive`** (must use rclone *native* b2 backend; S3-compatible endpoint returns "not entitled"). Object keys mirror the original AWS keys (e.g. `wp-content/uploads/x/<year>/…`), so URL rewriting on import only changes the host, not the path. WordPress thumbnail variants (`-WxH.jpg`) were deliberately excluded (regenerable).

**GOT — exact-count verified vs source:**

| Set | Objects |
|---|---|
| 2015 design archive (xml/thumb/img) | 942,199 ✅ |
| Image year 2015 | 412,576 ✅ |
| Image year 2019 | 1,107,153 ✅ |
| Image year 2020 | 1,148,805 ✅ |
| Image year 2021 | 700,742 ✅ |
| Image year 2022 | 505,404 ✅ |
| Image year 2023 | 239,542 ✅ |
| Image year 2024 | 133,766 ✅ |
| Image year 2025 | 34,721 ✅ |
| Image year 2026 | 15,365 ✅ |
| 7 side buckets → `_other_buckets/<bucket>/` | ✅ |
| **Total in B2** | **5,554,447 objects / 2.99 TB** |

**MISSING — still in AWS, untouched, re-copyable (do NOT close AWS until done):**

| Image year | In B2 | Source | |
|---|---|---|---|
| 2016 | 0 | 1,833,868 | ❌ |
| 2017 | 106 | 1,580,078 | ❌ |
| 2018 | 272,606 | 1,312,749 | ❌ partial |

~4.45M objects / ~2.1 TB. **Cause:** these three ran during a self-inflicted server overload; on a huge file-list rclone tried to *traverse* the 35M-object bucket and silently copied ~nothing while still exiting `rc=0`, and the resume checkpoint then skipped them. **Fix:** re-copy with `rclone copy … --no-traverse` (per-file direct, no bucket traversal). The script `/root/rescue/redo.sh` is already staged on the copy server for 2016/2017/2018 — just launch it in tmux and verify per-year counts after.

## Resume infrastructure (all still live)
- **Copy server:** a Hetzner box (kept running for the re-copy; IP + SSH key in memory). Has rclone configured (`s3aws` = AWS read, `b2native` = Backblaze), the per-year file lists in `/root/rescue/lists/`, and `redo.sh` ready.
- **AWS:** read-only IAM user (Bedrock+S3 read). Grace period active; close only after 2016–2018 copied + verified.

## Known gap for the app: Flash-era clipart
Designs reference built-in clipart as Flash `.swf` (e.g. `assets/graphics/shapes/shapes_square.swf`); ~1,755 unique files (1,384 built-in library + 371 user). ~1,650 of these `.swf` are in the B2 copy (under x/2015–2017). This app has **no `.swf` renderer** and `source_svg` is present on only 2 designs — so Flash-era cliparts currently show a placeholder. The designstring format is **continuous** across the Flash→HTML5 eras (same XML), so old designs *import* fine; only clipart *rendering* needs a future `.swf`→SVG conversion. Not a blocker for wiring.

## Wiring status 2026-07-14 — BUILT, awaiting one manual deploy step
Everything below the line is done and sitting in the working tree (uncommitted):
- **Backend** (`supabase/`): migration `0001_yz_legacy.sql`, edge function `youzign-legacy-claim` (lookup + get_design + signed B2 URLs), seed generator. See `supabase/README.md` for the API contract.
- **Test-account data extracted** from the WP dumps to `/Users/dezygn/Projects/backup/dez73-extracts/marketing-6161/`: user row (`marketing` / in@youzign.com), 58 v1 + 92 v2 + 1,210 v3 designs, thumbnail keys resolved against the B2 layout (verified present). Seed SQL generated in `seed/001-024.sql`.
- **Frontend** (`apps/editor/src/library/legacyImport.ts` + Dashboard modal): email-or-username lookup → design grid with B2 thumbnails → import; legacy `s3.amazonaws.com/userdata.youzign.com` refs are rewritten to signed B2 URLs and the images are **inlined as data: URLs at import time** (signed tokens expire in 7 days, so nothing persisted may reference them). Typecheck + 124 unit tests pass.
- **Deploy** is scripted but needs Bertrand (auto-mode blocks prod writes): `bash /Users/dezygn/Projects/backup/dez73-extracts/deploy-legacy-claim.sh` — sets B2 bucket CORS, links the shared `dezygn` Supabase project, sets B2 secrets, applies migration + seed via `supabase db query` (deliberately NOT `db push`, to keep migration history clean on the shared project), deploys the function. Then smoke-test lookup with identifier `marketing` and verify an import end-to-end in the app.
- Known follow-ups: 2016–2018 thumbnails 404 until the AWS re-copy runs (UI shows placeholder); Flash-era clipart still renders as placeholder (see below); full-corpus seeding beyond the test account is a later milestone.

### E2E verified 2026-07-14 (deployed + tested live)
Deployed by Bertrand via the script (B2 CORS + secrets + schema + seed + function). Smoke tests found and fixed two bugs: **(1)** PostgREST's 1000-row cap truncated the design list → function now paginates with `.range()`; **(2)** v3 thumb keys were seeded without the `x/` segment (B2 layout is `wp-content/uploads/x/<year>/…`) → seed script fixed + one SQL UPDATE repaired the rows. v1/v2 keys (`reverse(uid)/<id>/thumb/<id>.png`) were correct as-is. Full in-app e2e passed all 7 steps (see `docs/planning/legacy-claim-progress.html` + `scripts/e2e-legacy-import.mjs`): lookup shows all 1,360 designs with live thumbnails, not-found path friendly, 4/5 designs imported and render in the editor.
**NEW FORMAT DISCOVERED:** 190 of the test account's 1,210 v3 designs (2020–2025) have **JSON** `{"canvasData":…}` in post_content, not designstring XML — a fourth, later editor format the app can't parse yet. These fail import with a per-design "Could not import" message (graceful, non-fatal). Follow-up: JSON→app importer, or at minimum tag them "newer format — coming soon" in the claim grid. Images referenced from missing years 2016–2018 fail inlining with a warning (browser shows it as a CORS error because B2 404s carry no CORS headers — red herring, it's just the missing data).

### JSON-format designs importable 2026-07-15
`convertLegacyJsonDesign()` (apps/editor/src/library/legacyJson.ts) converts the 2020-25 JSON `{"canvasData":…,"pageItems":…}` format to designstring XML at import time — all 190 test-account JSON designs now import (fidelity verified in-browser vs thumbnails; coverage analysis over all 190 real payloads; known lossy bits: whole-canvas `filter` and multi-color `patternColors` have no XML/renderer equivalent). Client-side only — no backend change. `rewriteLegacyAssetUrls` also now maps `youzign.com/wp-content/uploads/<p>` → B2 `wp-content/uploads/x/<p>` (the S3-offloaded subset resolves; the rest 404 into the warning path).
**⚠️ FASTCOMET-ONLY ASSETS CONFIRMED:** JSON-era designs reference assets hosted on youzign.com itself (test account: 52 distinct URLs, mostly clipart SVGs like `wp-content/uploads/2020/12/shapes_square-*.svg` + gap-window images). These are NOT in B2 (never S3-offloaded) and dead on the live site (Vercel 403) — they exist ONLY on the FastComet server (d263.fcomet.com). This is the concrete instance of the Paul-Istoan S3 gap. **Rescue `wp-content/uploads` from FastComet before any server decommission** — use `wp_as3cf_items` to quantify. Until then those images show "unavailable" warnings on import.

### Follow-up: legacy font loader (notes 2026-07-15)
JSON/XML-era designs carry the legacy font NAME (e.g. `FrederickatheGreat`, `fontType: "External Font"`); conversion preserves name + size + placement correctly (matrix fix), but the editor renders a fallback face because the font itself isn't loaded. Plan when we build it:
- **Inventory first**: extract the distinct font names across the corpus (test account + later full corpus) — `grep` the designstrings; most legacy "External Fonts" were Google Fonts with CamelCase names collapsed (`FrederickatheGreat` → "Fredericka the Great"). Build a name→family mapping table; measure hit-rate against the Google Fonts catalog.
- **Loader**: on design open, collect font names from the doc, `FontFace`-load Google-hosted (or self-hosted woff2 — CSP note: the web editor at youzign.com already loads Google Fonts CSS, see console noise) with graceful fallback + a "missing font" indicator instead of silent substitution.
- **User-uploaded fonts** (legacy "My Fonts") lived in wp-content/uploads on the WP server → part of the FastComet rescue below; until rescued, those can only fall back.
- Integration point: `apps/editor/src/fonts.ts` + wherever imported docs register faces; check how the current font picker loads its families and reuse that path.

### FastComet uploads rescue ✅ COMPLETE 2026-07-16
**Done 14:27 UTC: 170,196 files / 463.199 GiB, rc=0, zero errors** (8h15m). Sentinel files verified in B2. The S3-gap is closed for wp-content/uploads: server-only images, clipart SVGs and user fonts now live at `youzign-archive/wp-content/uploads/x/<year>/…`. Designs re-imported from now on resolve their previously-missing images automatically. Also 2026-07-16: **backend migrated to the dedicated free Supabase project `xnxcduqzexwukehavthg`** (new account, bdiouly@gmail.com) — secrets+schema+seed+function all live there, web editor repointed+redeployed, smoke-tested (1,360 designs). Cleanup of the old dezygn-project tables is scripted (`~/cleanup.sh`) but deliberately deferred until Bertrand can review it (he's ill).

### (superseded) FastComet uploads rescue RUNNING 2026-07-16
The server-only files (S3-gap: offloader deleted local copies after pushing, so server ≈ exactly what S3 lacks) are being pulled from FastComet (`d263.fcomet.com`, cPanel user `youzign`, SFTP with cPanel creds — works from anywhere) by the Hetzner box: tmux session `fastcomet`, script `/root/rescue/fc.sh`, log `/root/rescue/logs/fastcomet.log`. Target: `b2native:youzign-archive/wp-content/uploads/x/<year>/…` with `--ignore-existing` (gap-fill only), years 2015–2026, WP resize variants excluded. Server total 470 GiB / 218k files pre-filter. Started 06:12 UTC 2026-07-16. Verify when done: per-year `rclone size` vs server counts, then re-import a design with previously-missing images. NOTE: this does NOT replace the AWS 2016–2018 re-copy (different corpus — S3 had 1.8M objects for 2016 vs 26k on server); `redo.sh` still pending.

### Fidelity fix round 2026-07-16 evening — QA4: 23/26 acceptable
Four fixes landed (all uncommitted, full 421-test suite green): **clipart recolor** (data-URL SVGs weren't recognized as SVG → recolor skipped; also source-less cliparts now render nothing per legacy), **legacy font loader** (name→Google Fonts map, 25/77 names resolve, loaded at document open via existing ensureGoogleFonts path), **rotated-text AABB semantics** (legacy Flash wrote mcWidth/mcHeight as rotated AABB; new textScale/textOrigin in packages/designstring disambiguates AABB vs in-app scale semantics at read time), **canvas img CSS clamp** (Tailwind preflight max-width:100% was shrinking full-bleed images). QA4 re-run: 15 MATCH / 7 MINOR / 4 BROKEN → and one "BROKEN" (Inform 320×225) was a QA harness title-collision artifact (design "InformationImage320X225" imported instead), so truly 3 broken, all reducible to: (a) .swf-only cliparts, (b) proprietary fonts w/o Google equivalent. Evidence: docs/planning/legacy-claim-shots/qa4/ + progress page.
**UNLOCK FOUND:** the legacy editor's own asset library survives on FastComet at `public_html/editor/assets/` — **537 font files (ttf+woff+woff2!) + 411 built-in clipart SVGs** — now copied to B2 `youzign-archive/_editor_assets/`. Next fixes: (1) self-host those fonts for the unmappable names (kills the font-overlap MINOR/BROKENs), (2) rewrite `assets/graphics/*.swf` clipart refs → `_editor_assets/svg/<name>.svg` (kills the .swf gap). Then re-QA and the import feature is announce-ready.

### QA5 final 2026-07-16 night — 24/26 acceptable, zero regressions across 3 runs
16 MATCH / 8 MINOR / 2 BROKEN (qa3 was 9/8/9). Self-hosted fonts (51 woff2 bundled) + swf→SVG cliparts (148 bundled, 87% coverage) + SVG id-namespacing renderer fix landed. **Verdict: safe for soft/opt-in rollout; fix 2 blockers before broad announcement:**
1. "Inform" 13406389 opens 320×225 despite payload saying 1000×1000 — CONFLICTS with the earlier proven-correct local repro; suspect the QA harness opened the sibling design "InformationImage320X225" from the dashboard again (title-matching). Needs ONE manual check before treating as a real bug.
2. "snatchems" 14603375 heading overlap — reports conflict on cause (unmapped font vs pre-existing wrapping/scaleUsed text-layout bug with Arvo). Needs a real diagnosis.
Evidence: docs/planning/legacy-claim-shots/qa5/ + progress page (QA5 entry). Suite green (note: test counts fluctuated between agent reports — run `pnpm -r test` fresh before release).

## Next phase — wiring into this app
Goal: user enters email OR old username → claims their designs → they import and render, images loading from Backblaze. See the "First milestone" and "Key wiring decisions" in memory `dez73-aws-legacy-designs.md`.
- Stubbed entry point: the "Import from youzign.com" card in `apps/editor/src/components/Dashboard.tsx` (~line 646).
- App already parses the same designstring (`packages/designstring`) and stores docs in IndexedDB.
- Test account (real, active since 2015): username `marketing`, WP user_id **6161** (password in memory). Its designs = `save_editor_design.user_id=6161` + `wp_posts.post_author=6161 AND post_type='designs'`.
- Open decisions: front B2 with Cloudflare (free egress) vs signed URLs; rewrite image host `s3.amazonaws.com/userdata.youzign.com/<key>` → B2/CDN; email-or-username claim via a Supabase function; user + design metadata in Supabase.
