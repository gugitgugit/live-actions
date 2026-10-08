#!/bin/sh
# Renders the extension icons from docs/icon.svg, and the Chrome Web Store images: the store
# icon (artwork 96 px inside 128 px, as the store guidelines ask) and the small promo tile.
# Usage: sh scripts/render-icons.sh [extension|store]   (both when omitted)
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# page, width, height, output
shoot() {
  rm -f "$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --user-data-dir="$tmp/profile-$(echo "$4" | tr / -)" --window-size="$2,$3" --screenshot="$PWD/$4" "file://$1" 2>/dev/null &
  # Chrome can stay up after writing the screenshot: stop it once the file is there
  pid=$!
  i=0
  while [ ! -s "$4" ] && [ $i -lt 180 ]; do sleep 1; i=$((i + 1)); done
  sleep 1
  kill $pid 2>/dev/null || true
  [ -s "$4" ] || { echo "failed: $4" >&2; return 1; }
}

# size, padding, output
icon() {
  inner=$(($1 - 2 * $2))
  page="$tmp/$1-$2.html"
  printf '<html><body style="margin:0;background:transparent"><img src="file://%s/docs/icon.svg" style="display:block;margin:%spx;width:%spx;height:%spx"></body></html>' \
    "$PWD" "$2" "$inner" "$inner" > "$page"
  shoot "$page" "$1" "$1" "$3"
}

if [ -z "$1" ] || [ "$1" = extension ]; then
  for size in 16 32 48 128; do icon "$size" 0 "public/icons/icon-$size.png" & done
fi
if [ -z "$1" ] || [ "$1" = store ]; then
  icon 128 16 docs/store/icon-128.png &
  shoot "$PWD/docs/store/promo-tile.html" 440 280 docs/store/promo-440x280.png &
fi
wait
