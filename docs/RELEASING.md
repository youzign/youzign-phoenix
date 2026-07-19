# Youzign desktop releases

Youzign currently notifies users about updates; it does not patch itself in place. The desktop app checks `https://youzign-landing.vercel.app/version.json` when the dashboard mounts, shows a blue dot on the logo for a newer version, and opens the download page. Users quit Youzign, install the replacement build, and relaunch it. App data stays in the operating system's app-data/browser-profile storage rather than inside the installed bundle.

## Prepare a release

1. Choose `X.Y.Z` and update all release-controlled files in the same commit:
   - `apps/editor/src-tauri/tauri.conf.json`
   - `apps/editor/src-tauri/Cargo.toml` and the Youzign package entry in `Cargo.lock`
   - `landing/version.json` (version, release notes, and download-page URL)
   - `landing/downloads.json` (version and versioned macOS, Windows, and Linux filenames)
2. Update the release notes in all three places (see "Release notes live in three places" below), including the thanks-page changelog entry.
3. Run `pnpm release:check`, `pnpm test`, and `pnpm build`, plus `pnpm test:e2e-export` (real-WebKit export/thumbnail e2e). WebKit is what the macOS app actually runs; Chrome-only checks passed for weeks while Mac exports silently dropped photos (v1.0.3, DEZ-72), so the WebKit run is not optional.
4. Commit the release metadata before tagging. Create and push the exact tag `vX.Y.Z`. The tag is required: `.github/workflows/release.yml` only runs for `v*` tag pushes, and CI rejects a tag that does not match the committed app version.
5. Wait for all three release jobs. They upload a universal macOS DMG, Windows NSIS EXE and MSI, and Linux AppImage, DEB, and RPM to a GitHub **draft** release.
6. Inspect the draft assets, then publish the draft. Publishing is required for `/releases/latest` and `/releases/latest/download/...` to resolve to the new version. Do not deploy the new update metadata before the release is published.
7. Deploy `landing/` to production. There is NO git integration: pushing `main` does not
   deploy the site (learned the hard way shipping 1.0.4). Deploy with the Vercel CLI:
   ```
   cd landing
   vercel link --yes --project youzign-landing --scope youzign   # first time only
   vercel deploy --prod --yes
   ```
   Then verify `/version.json`, `/downloads.json`, the three download redirects, and the
   update panel from an older installed build. Note `version.json` is CDN-cached for up
   to 5 minutes (`max-age=300`); use a cache-busting query string when verifying.

## Release notes live in three places

| Where | File | Audience |
| --- | --- | --- |
| Thanks-page changelog | `landing/thanks.html` | everyone on the download page |
| Update notification text | `landing/version.json` `notes` field | users seeing the blue dot |
| GitHub release | the published release for tag `vX.Y.Z` | technical users |

Voice for all three: plain and concrete, what changed for the user, no hype, no em dashes.

### Maintaining the thanks-page changelog

The changelog section on `landing/thanks.html` stacks releases newest-first and holds
unlimited versions. Never delete an old entry. To add a release:

1. Demote the previous latest: convert its `<article class="release latest">` into a
   collapsed `<details class="release">` whose `<summary class="release-head">` carries
   the version, date, and the chevron svg (copy the shape of an existing collapsed entry,
   for example 1.0.3). Keep its `release-body` (GitHub link + `release-list`) untouched.
2. Add the new version above it as the expanded `<article class="release latest">` with
   the `LATEST` badge, release date, GitHub tag link, and a `release-list` of items.

### Keep the update tutorial in sync

The per-platform update instructions exist in two places and must match: the in-app Help
section "Updating Youzign" (`apps/editor/src/help-content.ts`, id `updating`) and the
"How to update" section on `landing/thanks.html`.

The current workflow does not sign or notarize builds. macOS Gatekeeper and Windows SmartScreen warnings are therefore expected. The configured updater plugin, signed updater manifest, and `.sig` files are absent because this is a manual reinstall flow; the uploaded macOS app tarball alone is not an operational auto-update channel.

## Deterministic local update test

Run `pnpm test:update-e2e`. It starts a local JSON endpoint advertising `9.9.9`, starts Vite with `VITE_VERSION_URL` pointed at that endpoint, and verifies the blue dot, release notes, and download action in Chrome. Unit tests cover newer/same/older versions, missing URLs, HTTP errors, and offline failure.

For a packaged-app check without touching production, start any CORS-enabled local endpoint that returns the same JSON shape, then build or run Tauri with `VITE_VERSION_URL=http://127.0.0.1:PORT/version.json`. Open the dashboard, confirm the blue dot, open the panel, and confirm the download button opens the declared URL.

## Installed-app smoke test

On each operating system, keep a copy of the previous installer/build and a throwaway design:

1. Install the previous version, create a design, upload an asset, and create a brand.
2. Point a test build at a mocked newer endpoint or deploy the release metadata only after the GitHub release is published.
3. Open the dashboard and verify the blue dot and release copy. Follow the download button and confirm the platform-specific artifact.
4. Quit Youzign. On macOS, open the DMG and replace Youzign in Applications. On Windows, run the NSIS EXE over the existing install. On Linux, replace the AppImage (or upgrade with the matching package manager for DEB/RPM).
5. Relaunch Youzign, verify the dot is gone because the installed version now matches, and confirm the design, upload, brand, and settings remain.

A restart/relaunch is required to execute the newly installed code. An already-open app checks on dashboard mount rather than polling continuously, so revisit the dashboard or restart to force another check.
