#!/bin/sh
# iti（「one」：今日やることを1つだけ決めるアプリ）を、ひび手帳の one/ に写す。カレンダーの左端からのスワイプで開く。
#   使い方: sh scripts/sync-one.sh [iti のフォルダ]   （省略時は ../iti）
set -eu
SRC="${1:-$(dirname "$0")/../../iti}"
DST="$(dirname "$0")/../one"
test -f "$SRC/index.html" || { echo "iti が見つかりません: $SRC" >&2; exit 1; }
mkdir -p "$DST"
for f in index.html matchcut.js icon.svg apple-touch-icon.png; do cp "$SRC/$f" "$DST/$f"; done
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "iti を one/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
