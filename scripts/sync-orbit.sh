#!/bin/sh
# Orbit（リポジトリ browser2）のコードを、ひび手帳の iPhone アプリの中に写す。
#   使い方: sh scripts/sync-orbit.sh [browser2 のフォルダ]   （省略時は ../browser2）
# Orbit 単独のアプリの入口（OrbitApp.swift）と画像の置き場（Resources）は写さない。
# 入口は native/hibi-llm/ios/Sources/HibiLLMPlugin/OrbitHost.swift（ひび手帳の上に重ねて開く）。
set -eu
SRC="${1:-$(dirname "$0")/../../browser2}"
DST="$(dirname "$0")/../native/hibi-llm/ios/Sources/HibiLLMPlugin/Orbit"
test -f "$SRC/Orbit/App/AppModel.swift" || { echo "browser2 が見つかりません: $SRC" >&2; exit 1; }
rm -rf "$DST"
mkdir -p "$DST"
for d in AI Browser LocalAI Models Support Views; do cp -R "$SRC/Orbit/$d" "$DST/$d"; done
mkdir -p "$DST/App" && cp "$SRC/Orbit/App/AppModel.swift" "$DST/App/"
( cd "$SRC" && git log -1 --format='%H %s' ) > "$DST/../../../../orbit-version.txt" 2>/dev/null || true
echo "Orbit を写しました: $(find "$DST" -name '*.swift' | wc -l) ファイル（$(head -c 7 "$DST/../../../../orbit-version.txt" 2>/dev/null)）"
