#!/bin/sh
# beauty（候 KŌ：七十二候の時計「候」と、ふたりで遊ぶゲーム「遊」）を、ひび手帳の beauty/ に写す。
# タイムラインでアラームを出した状態で、もう一度左端から右へスワイプすると開く。
#   使い方: sh scripts/sync-beauty.sh [beauty のフォルダ]   （省略時は ../beauty）
# ひび手帳の中（iframe）では iPhone の上下のあき（env(safe-area-inset-*)）が 0 になるので、
# 写すときに var(--hibi-sa-top, env(...)) の形に書きかえ、ひび手帳の側から本当のあきを入れる（単独で開いたときは今までどおり）。
# 画面の見本の画像（desk.png など）は使っていないので写さない。
set -eu
SRC="${1:-$(dirname "$0")/../../beauty}"
DST="$(dirname "$0")/../beauty"
test -f "$SRC/index.html" || { echo "beauty が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
for f in index.html favicon.svg apple-touch-icon.png; do cp "$SRC/$f" "$DST/$f"; done
for d in css js vendor; do cp -R "$SRC/$d" "$DST/$d"; done
find "$DST" -name '*.css' -o -name '*.html' | while read -r f; do
  sed -E -i 's/env\(safe-area-inset-(top|bottom|left|right)(, *0(px)?)?\)/var(--hibi-sa-\1, env(safe-area-inset-\1, 0px))/g' "$f"
done
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "beauty を beauty/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
