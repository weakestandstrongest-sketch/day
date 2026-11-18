#!/bin/sh
# keisanki（Mathspace：数で遊べる計算空間）を、ひび手帳の keisanki/ に写す。
# カレンダーで計算機を出した状態で、もう一度右端から左へスワイプすると開く。
#   使い方: sh scripts/sync-keisanki.sh [keisanki のフォルダ]   （省略時は ../keisanki）
# ひび手帳の中（iframe）では iPhone の上下のあき（env(safe-area-inset-*)）が 0 になるので、
# 写すときに var(--hibi-sa-top, env(...)) の形に書きかえ、ひび手帳の側から本当のあきを入れる（単独で開いたときは今までどおり）。
set -eu
SRC="${1:-$(dirname "$0")/../../keisanki}"
DST="$(dirname "$0")/../keisanki"
test -f "$SRC/index.html" || { echo "keisanki が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
for f in index.html style.css manifest.webmanifest; do cp "$SRC/$f" "$DST/$f"; done
for d in js icons; do cp -R "$SRC/$d" "$DST/$d"; done
for f in "$DST/style.css" "$DST/index.html"; do
  sed -E -i 's/env\(safe-area-inset-(top|bottom|left|right)(, *0(px)?)?\)/var(--hibi-sa-\1, env(safe-area-inset-\1, 0px))/g' "$f"
done
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/VERSION.txt" 2>/dev/null || true
echo "keisanki を keisanki/ に写しました（$(head -c 7 "$DST/VERSION.txt" 2>/dev/null)）"
