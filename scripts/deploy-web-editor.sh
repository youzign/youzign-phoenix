#!/usr/bin/env bash
# Deploy the web editor snapshot to Vercel project yz-editor-k4x7,
# served at https://www.youzign.com/editor via youzign-landing rewrites.
#
# The app must be built with base /editor/ (the default for a plain
# `pnpm -r build`; only Tauri builds get base /). Files are staged under
# an editor/ prefix and the project root 307s to /editor/ so the old
# canonical URL (yz-editor-k4x7.vercel.app) keeps working — same origin,
# so existing users' locally-saved designs survive.
#
# Usage: pnpm -r build && ./scripts/deploy-web-editor.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/apps/editor/dist"
STAGE="$(mktemp -d /tmp/yz-editor-deploy.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

grep -q '/editor/assets/' "$DIST/index.html" || {
  echo "dist/index.html is not an /editor/-based build — run a plain 'pnpm -r build' first (no TAURI_ENV_*)." >&2
  exit 1
}

mkdir -p "$STAGE/editor"
cp -R "$DIST/." "$STAGE/editor/"
cat > "$STAGE/vercel.json" <<'JSON'
{
  "redirects": [
    { "source": "/", "destination": "/editor/", "permanent": false }
  ]
}
JSON

cd "$STAGE"
vercel link --yes --scope youzign --project yz-editor-k4x7 > /dev/null
vercel deploy --prod --yes

echo "Deployed. Verify: https://www.youzign.com/editor"
