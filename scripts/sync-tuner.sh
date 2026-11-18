#!/bin/sh
# tuner（チューナー・メトロノーム。コード・純正律つき）を、ひび手帳の tuner/ に写す。「ふりかえり」の右端からのスワイプで開く。
#   使い方: sh scripts/sync-tuner.sh [tuner のフォルダ]   （省略時は ../tuner）
set -eu
SRC="${1:-$(dirname "$0")/../../tuner}"
DST="$(dirname "$0")/../tuner"
test -f "$SRC/index.html" || { echo "tuner が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
for f in index.html version.json manifest.webmanifest; do cp "$SRC/$f" "$DST/$f"; done
for d in icons chords just; do cp -R "$SRC/$d" "$DST/$d"; done
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "tuner を tuner/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
