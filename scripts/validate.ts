// 关卡校验：尺寸/字符、相邻房间出口是否对齐、基于跳跃模型的可达性、道具门控与软锁检查
// 运行：pnpm validate

declare const process: { exit(code: number): void; argv: string[] };
import { allRooms, START_ROOM } from '../src/game/world';
import { validateRoomDef, parseRoom, type ParsedRoom } from '../src/game/roomdef';
import { ROOM_W, ROOM_H, EGG_DOOR_COUNT, type ItemId } from '../src/game/constants';
import { T, blocks, isHazard, isWater, isPlatform } from '../src/game/tiletypes';

const errors: string[] = [];
const warnings: string[] = [];
const rooms = allRooms();
const parsed = new Map<string, ParsedRoom>();
const verbose = process.argv.includes('-v');

for (const { col, row, def } of rooms) {
  const errs = validateRoomDef(def);
  errors.push(...errs);
  if (!errs.length) parsed.set(`${col},${row}`, parseRoom(def));
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ---- 出口对齐 ----
const passable = (p: ParsedRoom, tx: number, ty: number) => !blocks(p.tiles[ty * ROOM_W + tx], 'player');
for (const { col, row } of rooms) {
  const p = parsed.get(`${col},${row}`)!;
  const right = parsed.get(`${col + 1},${row}`);
  for (let ty = 0; ty < ROOM_H; ty++) {
    const a = passable(p, ROOM_W - 1, ty);
    if (right) { const b = passable(right, 0, ty); if (a !== b) errors.push(`出口不对齐：(${col},${row}) 右边 行${ty} ${a ? '开' : '闭'} vs (${col + 1},${row}) 左边 ${b ? '开' : '闭'}`); }
    else if (a) warnings.push(`(${col},${row}) 右边 行${ty} 开口通向不存在的房间`);
    const l = passable(p, 0, ty);
    if (!parsed.get(`${col - 1},${row}`) && l) warnings.push(`(${col},${row}) 左边 行${ty} 开口通向不存在的房间`);
  }
  const below = parsed.get(`${col},${row + 1}`);
  for (let tx = 0; tx < ROOM_W; tx++) {
    const a = passable(p, tx, ROOM_H - 1);
    if (below) { const b = passable(below, tx, 0); if (a !== b) errors.push(`出口不对齐：(${col},${row}) 下边 列${tx} ${a ? '开' : '闭'} vs (${col},${row + 1}) 上边 ${b ? '开' : '闭'}`); }
    else if (a) warnings.push(`(${col},${row}) 下边 列${tx} 开口通向不存在的房间`);
    const u = passable(p, tx, 0);
    if (!parsed.get(`${col},${row - 1}`) && u) warnings.push(`(${col},${row}) 上边 列${tx} 开口通向不存在的房间`);
  }
}

// ---- 可达性（近似跳跃模型）----
// 玩家占 1 列 × 2 行（脚所在行 ty 与 ty-1）。
interface Caps { bubble: boolean; disc: boolean; yoyo: boolean; keys: number; eggs: number; }
type Cell = [string, number, number];

function tileOf(p: ParsedRoom, tx: number, ty: number): number {
  if (tx < 0 || tx >= ROOM_W || ty < 0 || ty >= ROOM_H) return -1;
  return p.tiles[ty * ROOM_W + tx];
}

interface Found {
  items: Set<string>; eggs: Set<string>; keys: Set<string>; flames: Set<string>;
  buttons: Set<string>; holds: Set<string>; levers: Set<string>; locked: Set<string>; eggdoors: Set<string>;
  breaks: Set<string>; phones: Set<string>; pedestal: boolean;
}

function simulate(caps: Caps, openDoors: Set<string>, brokenTiles: Set<string>, startCell?: Cell): { seen: Set<string>; found: Found; firstSeen: Map<string, Cell> } {
  const eff = (key: string, p: ParsedRoom, tx: number, ty: number): number => {
    const t = tileOf(p, tx, ty);
    if (t === -1) return -1;
    const i = ty * ROOM_W + tx;
    if (t === T.DOOR && openDoors.has(`${key}:${p.doorIds[i]}`)) return T.EMPTY;
    if ((t === T.BREAK || t === T.LOCKED || t === T.EGGDOOR) && brokenTiles.has(`${key}:${tx},${ty}`)) return T.EMPTY;
    if (t === T.FAKE) return T.EMPTY;
    return t;
  };
  const free = (key: string, p: ParsedRoom, tx: number, ty: number): boolean => {
    for (const yy of [ty, ty - 1]) {
      const t = eff(key, p, tx, yy);
      if (t === -1) { if (yy < 0) continue; return false; }
      if (blocks(t, 'player') || isHazard(t)) return false;
    }
    return true;
  };
  const standing = (key: string, p: ParsedRoom, tx: number, ty: number): boolean => {
    const t = eff(key, p, tx, ty + 1);
    if (t === -1) return false;
    return blocks(t, 'player') || isPlatform(t) || isWater(eff(key, p, tx, ty));
  };
  // 下落（带少量空中控制）：返回所有可能的落点
  const settle = (key: string, tx: number, ty: number, out: Cell[], depth = 0): void => {
    const p = parsed.get(key); if (!p) return;
    const visited = new Set<string>();
    const stack: [number, number, number][] = [[tx, ty, 0]]; // x, y, drift
    while (stack.length) {
      const [x, y, drift] = stack.pop()!;
      const k = `${x},${y}`;
      if (visited.has(k)) continue; visited.add(k);
      if (x < 0 || x >= ROOM_W) continue;
      if (!free(key, p, x, y)) continue;
      if (standing(key, p, x, y)) { out.push([key, x, y]); continue; }
      if (y + 1 >= ROOM_H) {
        const [c, r] = key.split(',').map(Number);
        if (parsed.get(`${c},${r + 1}`) && depth < 3) settle(`${c},${r + 1}`, x, 0, out, depth + 1);
        continue;
      }
      stack.push([x, y + 1, drift]);
      if (Math.abs(drift) < 2) { stack.push([x - 1, y + 1, drift - 1]); stack.push([x + 1, y + 1, drift + 1]); }
    }
  };

  const seen = new Set<string>();
  const firstSeen = new Map<string, Cell>();
  const queue: Cell[] = [];
  const found: Found = { items: new Set(), eggs: new Set(), keys: new Set(), flames: new Set(), buttons: new Set(), holds: new Set(), levers: new Set(), locked: new Set(), eggdoors: new Set(), breaks: new Set(), phones: new Set(), pedestal: false };
  const push = (key: string, tx: number, ty: number) => {
    const landings: Cell[] = [];
    settle(key, tx, ty, landings);
    for (const r of landings) {
      const id = `${r[0]}:${r[1]},${r[2]}`;
      if (!seen.has(id)) { seen.add(id); queue.push(r); if (!firstSeen.has(r[0])) firstSeen.set(r[0], r); }
    }
  };
  if (startCell) push(startCell[0], startCell[1], startCell[2]);
  else {
    const start = parsed.get(`${START_ROOM.col},${START_ROOM.row}`)!;
    const sp = start.spawns.find((s) => s.kind === 'spawn')!;
    push(`${START_ROOM.col},${START_ROOM.row}`, sp.tx, sp.ty);
  }

  const discReaches = (key: string, p: ParsedRoom, tx: number, ty: number, sx: number, sy: number): boolean => {
    // 飞盘从玩家处沿水平或向下滑/落到 (sx,sy)：中间不能有挡飞盘的砖
    if (sy === ty || sy === ty - 1) {
      if (Math.abs(sx - tx) > 6) return false;
      const d = Math.sign(sx - tx);
      for (let x = tx + d; x !== sx; x += d) if (blocks(eff(key, p, x, sy), 'disc')) return false;
      return true;
    }
    if (sx === tx && sy > ty && sy - ty <= 4) {
      for (let y = ty + 1; y <= sy; y++) if (blocks(eff(key, p, tx, y), 'disc')) return false;
      return true;
    }
    return false;
  };
  const touches = (key: string, p: ParsedRoom, tx: number, ty: number) => {
    for (const s of p.spawns) {
      const near = Math.abs(s.tx - tx) <= 1 && Math.abs(s.ty - ty) <= 1 || (s.tx === tx && s.ty === ty - 2);
      const on = s.tx === tx && (s.ty === ty || s.ty === ty - 1);
      if (s.kind === 'item' && near) found.items.add(s.arg);
      if (s.kind === 'crate' && near) found.items.add('firecracker');
      if (s.kind === 'egg' && near) found.eggs.add(`${key}:${s.tx},${s.ty}`);
      if (s.kind === 'key' && near) found.keys.add(`${key}:${s.tx},${s.ty}`);
      if (s.kind === 'flame' && near) found.flames.add(s.arg);
      if (s.kind === 'button' && (on || (caps.disc && discReaches(key, p, tx, ty, s.tx, s.ty)))) found.buttons.add(`${key}:${s.arg}`);
      if (s.kind === 'hold' && caps.disc && (on || discReaches(key, p, tx, ty, s.tx, s.ty))) found.holds.add(`${key}:${s.arg}`);
      if (s.kind === 'lever' && Math.abs(s.tx - tx) <= 3 && Math.abs(s.ty - ty) <= 1 && caps.yoyo) found.levers.add(`${key}:${s.arg}`);
      if (s.kind === 'phone' && on) found.phones.add(key);
      if (s.kind === 'pedestal' && Math.abs(s.tx + 2 - tx) <= 3 && Math.abs(s.ty - ty) <= 2) found.pedestal = true;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [1, -1], [-1, -1], [0, -2], [0, 1]]) {
      const t = eff(key, p, tx + dx, ty + dy);
      if (t === T.LOCKED && caps.keys > 0) found.locked.add(`${key}:${tx + dx},${ty + dy}`);
      if (t === T.EGGDOOR && caps.eggs >= EGG_DOOR_COUNT) found.eggdoors.add(`${key}:${tx + dx},${ty + dy}`);
    }
    if (caps.disc) {
      for (const yy of [ty, ty - 1]) for (const dir of [1, -1]) {
        for (let d = 1; d < ROOM_W; d++) {
          const t = eff(key, p, tx + dir * d, yy);
          if (t === -1) break;
          if (t === T.BREAK) { found.breaks.add(`${key}:${tx + dir * d},${yy}`); break; }
          if (blocks(t, 'disc')) break;
        }
      }
    }
  };

  while (queue.length) {
    const [key, tx, ty] = queue.shift()!;
    const p = parsed.get(key)!;
    const [c, r] = key.split(',').map(Number);
    touches(key, p, tx, ty);
    const inWater = isWater(eff(key, p, tx, ty));
    const maxUp = caps.bubble ? 9 : 3;
    const reach = (dy: number): number => {
      if (caps.bubble) return dy <= -4 ? 3 : 9 + dy;
      return dy === -3 ? 1 : dy === -2 ? 3 : dy === -1 ? 4 : 5;
    };
    const tryMove = (nx: number, ny: number) => {
      if (nx < 0) { if (parsed.get(`${c - 1},${r}`)) push(`${c - 1},${r}`, ROOM_W - 1, ny); return; }
      if (nx >= ROOM_W) { if (parsed.get(`${c + 1},${r}`)) push(`${c + 1},${r}`, 0, ny); return; }
      if (ny < 1) { if (parsed.get(`${c},${r - 1}`)) push(`${c},${r - 1}`, nx, ROOM_H - 1 + ny); return; }
      push(key, nx, ny);
    };
    if (inWater) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || nx >= ROOM_W || ny < 0) { tryMove(nx, ny); continue; }
        if (ny >= ROOM_H) { if (parsed.get(`${c},${r + 1}`)) push(`${c},${r + 1}`, nx, 0); continue; }
        if (!free(key, p, nx, ny)) continue;
        if (isWater(eff(key, p, nx, ny)) || isWater(eff(key, p, nx, ny + 1))) {
          const id = `${key}:${nx},${ny}`;
          if (!seen.has(id)) { seen.add(id); queue.push([key, nx, ny]); }
        } else tryMove(nx, ny);
      }
      for (let dy = -1; dy >= -3; dy--) for (let dx = -2; dx <= 2; dx++) {
        const nx = tx + dx, ny = ty + dy;
        let ok = true;
        for (let yy = ty - 1; yy >= ny; yy--) if (yy >= 0 && !free(key, p, tx, yy)) { ok = false; break; }
        if (!ok) continue;
        for (let xx = Math.min(tx, nx); xx <= Math.max(tx, nx); xx++) if (xx >= 0 && xx < ROOM_W && ny >= 0 && !free(key, p, xx, ny)) { ok = false; break; }
        if (ok) tryMove(nx, ny);
      }
      continue;
    }
    for (const dx of [1, -1]) {
      const nx = tx + dx;
      if (nx < 0 || nx >= ROOM_W) { tryMove(nx, ty); continue; }
      if (free(key, p, nx, ty)) tryMove(nx, ty);
    }
    if (isPlatform(eff(key, p, tx, ty + 1))) {
      if (ty + 2 < ROOM_H) { if (free(key, p, tx, ty + 2)) push(key, tx, ty + 2); }
      else if (parsed.get(`${c},${r + 1}`)) push(`${c},${r + 1}`, tx, 0);
    }
    // 向下跳：先小跳一格，再横向移动并下落
    for (let dy = 1; dy <= 3; dy++) {
      if (!free(key, p, tx, ty - 1)) break;
      for (const dir of [1, -1]) {
        for (let d = 1; d <= (dy === 3 ? 4 : 5); d++) {
          const nx = tx + dir * d;
          if (nx < 0 || nx >= ROOM_W) { tryMove(nx, ty - 1); break; }
          if (!free(key, p, nx, ty - 1)) break;
          push(key, nx, ty - 1);
        }
      }
      break;
    }
    // 泡泡棒：在开阔的竖直空间里可以一路往上“搭泡泡”，不需要落脚点
    if (caps.bubble) {
      for (let yy = ty - 1; yy >= -1; yy--) {
        if (yy >= 0 && !free(key, p, tx, yy)) break;
        if (yy < 1) { if (parsed.get(`${c},${r - 1}`)) push(`${c},${r - 1}`, tx, ROOM_H - 1 + yy); break; }
        const id = `${key}:${tx},${yy}`;
        if (!seen.has(id)) { seen.add(id); queue.push([key, tx, yy]); }
      }
    }
    for (let dy = 0; dy >= -maxUp; dy--) {
      let ok = true;
      for (let yy = ty - 1; yy >= ty + dy; yy--) { if (yy < 0) break; if (!free(key, p, tx, yy)) { ok = false; break; } }
      if (!ok) break;
      const w = reach(dy);
      for (let dx = -w; dx <= w; dx++) {
        const nx = tx + dx, ny = ty + dy;
        let clear = true;
        for (let xx = Math.min(tx, nx); xx <= Math.max(tx, nx); xx++) {
          if (xx < 0 || xx >= ROOM_W) continue;
          if (ny >= 0 && !free(key, p, xx, ny)) { clear = false; break; }
        }
        if (!clear) continue;
        tryMove(nx, ny);
      }
    }
  }
  return { seen, found, firstSeen };
}

/** 把锁门/蛋门/裂墙的相邻同类砖一起标记为打开 */
function openGroup(brokenTiles: Set<string>, tileKey: string): void {
  const [key, pos] = tileKey.split(':');
  const p = parsed.get(key)!;
  const [sx, sy] = pos.split(',').map(Number);
  const t = tileOf(p, sx, sy);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = `${key}:${x},${y}`;
    if (brokenTiles.has(k)) continue;
    if (tileOf(p, x, y) !== t) continue;
    brokenTiles.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

const caps: Caps = { bubble: false, disc: false, yoyo: false, keys: 0, eggs: 0 };
const openDoors = new Set<string>();
const brokenTiles = new Set<string>();
const log: string[] = [];
const items = new Set<string>();
let usedKeys = 0;
const levels: { caps: Caps; openDoors: Set<string>; brokenTiles: Set<string>; firstSeen: Map<string, Cell>; seen: Set<string> }[] = [];
for (let iter = 0; iter < 12; iter++) {
  const { seen, found, firstSeen } = simulate(caps, openDoors, brokenTiles);
  levels.push({ caps: { ...caps }, openDoors: new Set(openDoors), brokenTiles: new Set(brokenTiles), firstSeen, seen });
  let changed = false;
  for (const it of found.items) if (!items.has(it)) { items.add(it); changed = true; log.push(`第 ${iter + 1} 轮：拿到道具 ${it}`); }
  caps.bubble = items.has('bubble'); caps.disc = items.has('disc'); caps.yoyo = items.has('yoyo');
  const keysAvail = found.keys.size - usedKeys;
  if (keysAvail !== caps.keys) { caps.keys = keysAvail; changed = true; }
  if (found.eggs.size !== caps.eggs) { caps.eggs = found.eggs.size; changed = true; log.push(`第 ${iter + 1} 轮：蛋 ${found.eggs.size} 颗`); }
  for (const b of [...found.buttons, ...found.holds, ...found.levers]) if (!openDoors.has(b)) { openDoors.add(b); changed = true; log.push(`第 ${iter + 1} 轮：打开门 ${b}`); }
  for (const b of [...found.breaks, ...found.eggdoors]) if (!brokenTiles.has(b)) { openGroup(brokenTiles, b); changed = true; log.push(`第 ${iter + 1} 轮：打开 ${b}`); }
  for (const b of found.locked) if (!brokenTiles.has(b) && caps.keys > 0) { openGroup(brokenTiles, b); caps.keys--; usedKeys++; changed = true; log.push(`第 ${iter + 1} 轮：用钥匙开门 ${b}`); }
  if (!changed) {
    const roomsSeen = new Set([...seen].map((s) => s.split(':')[0]));
    console.log(`\n== 可达性分析（${iter + 1} 轮收敛）==`);
    console.log(log.join('\n'));
    console.log(`可达房间 ${roomsSeen.size}/${rooms.length}`);
    const unreachable = rooms.filter((r) => !roomsSeen.has(`${r.col},${r.row}`)).map((r) => `(${r.col},${r.row}) ${r.def.name}`);
    if (unreachable.length) warnings.push(`不可达房间：${unreachable.join('、')}`);
    const allItems: ItemId[] = ['firecracker', 'bubble', 'disc', 'lantern', 'yoyo'];
    for (const it of allItems) if (!items.has(it)) warnings.push(`道具不可达：${it}`);
    console.log(`火焰可达：${[...found.flames].join(', ') || '无'}`);
    for (const f of ['seahorse', 'dog', 'ostrich', 'chameleon']) if (!found.flames.has(f)) warnings.push(`火焰不可达：${f}`);
    let totalEggs = 0; for (const p of parsed.values()) totalEggs += p.spawns.filter((s) => s.kind === 'egg').length;
    console.log(`蛋可达：${found.eggs.size}/${totalEggs}；钥匙可达 ${found.keys.size}；存档点可达 ${found.phones.size}；基座可达 ${found.pedestal}`);
    if (found.eggs.size < totalEggs) {
      const all = new Set<string>();
      for (const [k, p] of parsed) for (const s of p.spawns) if (s.kind === 'egg') all.add(`${k}:${s.tx},${s.ty}`);
      warnings.push(`蛋不可达：${[...all].filter((e) => !found.eggs.has(e)).join('、')}`);
    }
    break;
  }
}

// ---- 软锁检查：每个层级首次到达的房间，都要能回到起点 ----
const startKey = `${START_ROOM.col},${START_ROOM.row}`;
for (let i = 0; i < levels.length; i++) {
  const lv = levels[i];
  for (const [room, cell] of lv.firstSeen) {
    if (i > 0 && levels[i - 1].firstSeen.has(room)) continue; // 之前层级已检查
    const back = simulate(lv.caps, lv.openDoors, lv.brokenTiles, cell);
    const ok = [...back.seen].some((s) => s.startsWith(startKey + ':'));
    if (!ok) warnings.push(`软锁：第 ${i + 1} 轮到达 (${room}) 后无法回到起点（道具：${Object.entries(lv.caps).filter(([, v]) => v === true).map(([k]) => k).join(',') || '无'}）`);
  }
}

const dumpArg = process.argv.find((a) => a.startsWith('-dump='));
if (dumpArg) {
  const room = dumpArg.slice(6);
  const p = parsed.get(room);
  if (p) {
    const def = rooms.find((r) => `${r.col},${r.row}` === room)!.def;
    const lines = def.map.split('\n').filter((l) => l.length === ROOM_W);
    for (const lv of levels) {
      const grid = lines.map((l) => l.split(''));
      for (const s of lv.seen) { const [k, pos] = s.split(':'); if (k !== room) continue; const [x, y] = pos.split(',').map(Number); if (grid[y]) grid[y][x] = '@'; }
      console.log(`\n-- (${room}) 层级 ${levels.indexOf(lv) + 1}（@ = 可站立/可达格子）--`);
      console.log(grid.map((g, i) => String(i).padStart(2, ' ') + ' ' + g.join('')).join('\n'));
      if (levels.indexOf(lv) >= 1) break;
    }
  }
}

if (verbose) {
  // 打印每个房间首次到达的层级
  for (const { col, row, def } of rooms) {
    const lvl = levels.findIndex((l) => l.firstSeen.has(`${col},${row}`));
    console.log(`  (${col},${row}) ${def.name.padEnd(6, '　')} 第 ${lvl + 1} 轮`);
  }
}

let totalEggs = 0, totalPhones = 0;
for (const p of parsed.values()) { totalEggs += p.spawns.filter((s) => s.kind === 'egg').length; totalPhones += p.spawns.filter((s) => s.kind === 'phone').length; }
console.log(`\n房间 ${rooms.length} 个，蛋 ${totalEggs} 颗，电话 ${totalPhones} 部`);
if (warnings.length) console.log(`\n警告（${warnings.length}）：\n` + warnings.map((w) => '  - ' + w).join('\n'));
if (errors.length) { console.error(`\n错误（${errors.length}）：\n` + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
console.log('\n校验通过 ✔');
