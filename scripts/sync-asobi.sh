#!/bin/sh
# asobi（あそび2人用：ヨット・リバーシ・チェスなど）を、ひび手帳の asobi/ に写す。
# タイムラインでアラームを出した状態で、もう一度左端から右へスワイプすると開く。
#   使い方: sh scripts/sync-asobi.sh [asobi のフォルダ]   （省略時は ../asobi）
# ひび手帳の中（iframe）では iPhone の上下のあき（env(safe-area-inset-*)）が 0 になるので、
# 写すときに var(--hibi-sa-top, env(...)) の形に書きかえ、ひび手帳の側から本当のあきを入れる（単独で開いたときは今までどおり）。
# sw.js（オフライン用）は写さない：ひび手帳のアプリの中に入っているので要らず、古いまま残るのを防ぐ。
set -eu
SRC="${1:-$(dirname "$0")/../../asobi}"
DST="$(dirname "$0")/../asobi"
test -f "$SRC/index.html" || { echo "asobi が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
for f in index.html manifest.webmanifest; do cp "$SRC/$f" "$DST/$f"; done
for d in css js icons; do cp -R "$SRC/$d" "$DST/$d"; done
rm -rf "$DST/icons/proposals"
find "$DST" -name '*.css' -o -name '*.html' | while read -r f; do
  sed -E -i 's/env\(safe-area-inset-(top|bottom|left|right)(, *0(px)?)?\)/var(--hibi-sa-\1, env(safe-area-inset-\1, 0px))/g' "$f"
done
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "asobi を asobi/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
