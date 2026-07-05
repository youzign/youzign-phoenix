#!/usr/bin/env bash
# Youzign release download counts from GitHub.
# Usage: ./scripts/check-downloads.sh
set -euo pipefail

gh api repos/youzign/youzign-phoenix/releases --paginate --jq '
  .[] | "\(.tag_name) (published \(.published_at))",
  (.assets[] | "  \(.name): \(.download_count)"),
  "  TOTAL: \([.assets[].download_count] | add)"
'
