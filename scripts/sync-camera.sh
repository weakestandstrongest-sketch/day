#!/bin/sh
# 無音カメラ（リポジトリ camera）を、ひび手帳の camera/ に写す。タイムラインの右端から左へのスワイプで開く。
#   使い方: sh scripts/sync-camera.sh [camera のフォルダ]   （省略時は ../camera）
set -eu
SRC="${1:-$(dirname "$0")/../../camera}"
DST="$(dirname "$0")/../camera"
test -f "$SRC/app.js" || { echo "camera が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"; mkdir -p "$DST/icons"
for f in index.html app.js style.css manifest.webmanifest; do cp "$SRC/$f" "$DST/$f"; done
cp "$SRC"/icons/*.png "$DST/icons/"
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "camera を camera/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
