#!/bin/zsh
# 端到端场景测试：用无头 Chrome 跑脚本化输入，打印游戏状态摘要
# 用法：pnpm build && scripts/e2e.sh [名称过滤]
# 场景格式：名称|查询串（参数见 src/main.ts：room,x,y,items,eggs,keys,flames,frames,script）
# script 语法：逗号分隔的 <按键>:<帧数>，按键 l r u d j(跳) x(道具) c(切换) m(地图) e(确认)，空按键表示等待
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://$(printf '%s' "$ROOT/dist/index.html" | sed 's/ /%20/g')"
run() {
  local name="$1" q="$2"
  local out
  out=$("$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --mute-audio --user-data-dir=/tmp/animal-well-chrome-e2e --window-size=640,352 --virtual-time-budget=3000 --enable-logging=stderr --v=0 --screenshot=/tmp/animal-well-e2e.png "${URL}?log=1&${q}" 2>&1 | grep -o 'STATE .*' | head -1 | sed 's/^STATE //; s/", source:.*$//; s/\\"/"/g')
  echo "### $name"
  echo "$out" | python3 -I -c '
import sys, json
raw = sys.stdin.read().strip().strip("\"")
try:
    d = json.loads(raw)
except Exception:
    print("  (parse fail)", raw[:300]); sys.exit(0)
keys = ["state","room","x","y","vy","onGround","onBubble","inWater","hearts","deaths","item","lanternOn","eggs","keys","firecrackers","flames","placed","doors","broken","banners"]
print("  " + ", ".join(f"{k}={json.dumps(d.get(k), ensure_ascii=False)}" for k in keys if d.get(k) not in (None, [], False, 0) or k in ("state","room","x","y","hearts")))
ents = [e for e in d.get("entities", []) if e["kind"] not in ("pickup","phone","pedestal")]
if ents: print("  entities: " + "; ".join(json.dumps(e, ensure_ascii=False) for e in ents[:8]))
'
}
while IFS='|' read -r name q; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ -n "$1" && "$name" != *"$1"* ]] && continue
  run "$name" "$q"
done <<'CASES'
jump3_ledge|room=3,3&x=220&y=110&frames=90&script=r:20,rj:16,r:8,:40
gap4_pit|room=3,3&x=134&y=110&frames=80&script=rj:14,r:26,:30
fall_pit_then_drop|room=3,3&x=158&y=110&frames=260&script=:60,dj:1,:40,dj:1,:40,dj:1,:60
shaft_up_to_3_2|room=3,3&x=164&y=30&frames=120&script=j:14,:30,j:14,:60
exit_left_to_2_3|room=3,3&x=12&y=110&frames=70&script=l:60
phone_save|room=3,3&x=114&y=110&frames=30&script=u:1,:20
bubble_ride|room=1,3&items=bubble&x=100&y=110&frames=70&script=x:1,:20,j:14,:35
bubble_ride_late|room=1,3&items=bubble&x=100&y=110&frames=90&script=x:1,:45,j:14,:30
item_pickup_wand|room=1,3&x=140&y=102&frames=40&script=r:30
egg_pickup|room=4,5&x=176&y=110&frames=40&script=r:30
flame_pickup|room=4,4&items=all&x=236&y=78&frames=30&script=r:12
ghost_touch_hurts|room=2,3&x=130&y=110&frames=200&script=:200
firecracker_ghost|room=2,3&items=firecracker&x=130&y=110&frames=150&script=x:1,:140
lantern_repels|room=2,3&items=lantern&x=130&y=110&frames=240&script=x:1,:230
disc_hold_button|room=5,4&items=disc&x=73&y=110&frames=90&script=dx:1,:20,r:30,:30
disc_recall_closes|room=5,4&items=disc&x=73&y=110&frames=170&script=dx:1,:20,r:30,:30,x:1,:60
dog_chases_disc|room=4,4&items=disc&x=40&y=110&frames=120&script=x:1,:110
yoyo_lever|room=5,2&items=yoyo&x=262&y=110&frames=60&script=l:2,x:1,:50
yoyo_stun_snail|room=4,3&items=yoyo&x=84&y=110&frames=60&script=l:2,x:1,:40
key_door|room=1,4&keys=1&x=60&y=110&frames=90&script=l:80
egg_door|room=2,1&eggs=8&x=60&y=110&frames=90&script=l:80
swim_pool|room=0,3&x=250&y=110&frames=200&script=l:120,j:1,:20,j:1,:20,j:1,:15
chameleon_tongue|room=2,5&x=30&y=110&frames=120&script=r:50,:70
spikes_death|room=2,4&x=60&y=110&frames=420&script=r:400
pedestal_ending|room=3,3&flames=all&x=58&y=110&frames=40&script=u:1,:30
audio_smoke|audio=1&room=3,3&items=all&x=114&y=110&frames=120&script=x:1,:30,c:1,x:1,:20,c:1,x:1,:20,c:1,x:1,:5,c:1,x:1,:10
CASES
