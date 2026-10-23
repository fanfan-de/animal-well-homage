// 房间定义格式与解析（纯逻辑，可在 Node 中跑校验）

import { ROOM_W, ROOM_H, type RegionId } from './constants';
import { T } from './tiletypes';

export interface RoomDef {
  id: string;
  name: string;                 // 地图上显示的中文名
  region: RegionId;
  map: string;                  // 22 行 × 40 列
  legend?: Record<string, string>;
  ambient?: number;             // 覆盖区域环境光
  music?: number;               // 音乐密度
}

export interface Spawn {
  kind: string;      // 'dog' | 'button' | 'item' ...
  arg: string;       // 'button:1' 的 '1'，'item:bubble' 的 'bubble'
  tx: number; ty: number;
  x: number; y: number;
}

export interface ParsedRoom {
  tiles: Uint8Array;
  doorIds: Uint8Array;
  spawns: Spawn[];
}

/** 默认图例：字符 → 规格 */
export const BASE_LEGEND: Readonly<Record<string, string>> = {
  '#': 'wall', ' ': 'empty', '.': 'empty', '-': 'platform',
  '^': 'spikeU', 'v': 'spikeD', '<': 'spikeL', '>': 'spikeR',
  '~': 'water', '|': 'bars', '%': 'break', '?': 'fake',
  '1': 'door:1', '2': 'door:2', '3': 'door:3', '4': 'door:4', '5': 'door:5', '6': 'door:6',
  'D': 'locked', '0': 'eggdoor',
  '"': 'grass', ',': 'pebble', 'o': 'mushroom', 'c': 'candle',
  'b': 'button:1', 'h': 'hold:1', 'l': 'lever:1',
  'P': 'spawn', 'T': 'phone', 'E': 'egg', 'K': 'key', 'f': 'crate', '@': 'pedestal',
  'I': 'item:?', 'F': 'flame:?',
  'G': 'ghostcat', 'W': 'dog', 'V': 'bird', 'S': 'snail', 'Q': 'fish', 'M': 'seahorse', 'X': 'chameleon', 'O': 'ostrich',
};

const TILE_SPECS: Readonly<Record<string, number>> = {
  wall: T.WALL, empty: T.EMPTY, platform: T.PLATFORM,
  spikeU: T.SPIKE_U, spikeD: T.SPIKE_D, spikeL: T.SPIKE_L, spikeR: T.SPIKE_R,
  water: T.WATER, bars: T.BARS, break: T.BREAK, fake: T.FAKE,
  locked: T.LOCKED, eggdoor: T.EGGDOOR,
  grass: T.GRASS, pebble: T.PEBBLE, mushroom: T.MUSHROOM, candle: T.CANDLE,
};

export const ENTITY_KINDS = new Set([
  'button', 'hold', 'lever', 'spawn', 'phone', 'egg', 'key', 'crate', 'pedestal', 'item', 'flame',
  'ghostcat', 'dog', 'bird', 'snail', 'fish', 'seahorse', 'chameleon', 'ostrich',
]);

export function roomLines(def: RoomDef): string[] {
  const lines = def.map.split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

/** 返回错误列表（空数组表示合法） */
export function validateRoomDef(def: RoomDef): string[] {
  const errs: string[] = [];
  const lines = roomLines(def);
  if (lines.length !== ROOM_H) errs.push(`${def.id}: 行数 ${lines.length} ≠ ${ROOM_H}`);
  lines.forEach((ln, i) => { if (ln.length !== ROOM_W) errs.push(`${def.id}: 第 ${i} 行长度 ${ln.length} ≠ ${ROOM_W}`); });
  const legend = { ...BASE_LEGEND, ...(def.legend ?? {}) };
  const seen = new Set<string>();
  for (const ln of lines) for (const ch of ln) {
    if (seen.has(ch)) continue; seen.add(ch);
    const spec = legend[ch];
    if (!spec) { errs.push(`${def.id}: 未知字符 '${ch}'`); continue; }
    const [kind, arg] = spec.split(':');
    if (kind !== 'door' && !(kind in TILE_SPECS) && !ENTITY_KINDS.has(kind)) errs.push(`${def.id}: 未知规格 '${spec}'（字符 '${ch}'）`);
    if ((kind === 'item' || kind === 'flame') && (!arg || arg === '?')) errs.push(`${def.id}: '${ch}' 需要在 legend 里指定 ${kind}:xxx`);
    if (kind === 'door' && !(arg && /^[1-6]$/.test(arg))) errs.push(`${def.id}: 门编号非法 '${spec}'`);
  }
  return errs;
}

export function parseRoom(def: RoomDef): ParsedRoom {
  const lines = roomLines(def);
  const legend = { ...BASE_LEGEND, ...(def.legend ?? {}) };
  const tiles = new Uint8Array(ROOM_W * ROOM_H);
  const doorIds = new Uint8Array(ROOM_W * ROOM_H);
  const spawns: Spawn[] = [];
  for (let ty = 0; ty < ROOM_H; ty++) {
    const ln = lines[ty] ?? '';
    for (let tx = 0; tx < ROOM_W; tx++) {
      const ch = ln[tx] ?? ' ';
      const spec = legend[ch];
      if (!spec) throw new Error(`${def.id}: 未知字符 '${ch}' at ${tx},${ty}`);
      const [kind, arg = ''] = spec.split(':');
      const i = ty * ROOM_W + tx;
      if (kind in TILE_SPECS) { tiles[i] = TILE_SPECS[kind]; continue; }
      if (kind === 'door') { tiles[i] = T.DOOR; doorIds[i] = parseInt(arg, 10); continue; }
      if (!ENTITY_KINDS.has(kind)) throw new Error(`${def.id}: 未知规格 '${spec}'`);
      tiles[i] = T.EMPTY;
      spawns.push({ kind, arg, tx, ty, x: tx * 8, y: ty * 8 });
    }
  }
  return { tiles, doorIds, spawns };
}
