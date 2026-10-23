#!/bin/zsh
# 无头 Chrome 截图：scripts/shot.sh "<查询串>" <输出.png> [宽] [高]
# 例：scripts/shot.sh "room=3,3&items=all&frames=30" /tmp/heart.png
# 查询串参数见 src/main.ts（room, x, y, items, eggs, keys, flames, frames, script, nolight, state）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
Q="$1"; OUT="$2"; W="${3:-1280}"; H="${4:-704}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://$(printf '%s' "$ROOT/dist/index.html" | sed 's/ /%20/g')"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --mute-audio \
  --user-data-dir=/tmp/animal-well-chrome-profile --window-size=${W},${H} --virtual-time-budget=3000 \
  --screenshot="$OUT" "${URL}?${Q}" >/dev/null 2>&1
echo "saved $OUT"
