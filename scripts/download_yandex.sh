#!/usr/bin/env bash
# Download a public resource from Yandex.Disk via public API.
# Usage: download_yandex.sh <public_url> <output_file>
set -euo pipefail

PUBLIC_URL="$1"
OUTPUT="$2"

ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PUBLIC_URL")
API="https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${ENCODED}"

DIRECT=$(curl -s "$API" | python3 -c "import json,sys; print(json.load(sys.stdin).get('href',''))")

if [ -z "$DIRECT" ]; then
  echo "ERROR: no download href" >&2
  exit 1
fi

curl -L -o "$OUTPUT" "$DIRECT"
echo "Saved: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
