// 地砖渲染：程序化生成每个区域的墙砖（按四邻拼接）与固定地砖精灵

import { type Sprite, rasterize, makeCanvas, ctx2d } from '../engine/gfx';
import { hash2, rgba } from '../engine/util';
import { PAL } from './palette';
import * as A from './sprites';
import { REGION, TILE, VIEW_W, VIEW_H, type RegionId } from './constants';
import { T } from './tiletypes';

export { T } from './tiletypes';

export interface Tileset {
  wall: Sprite[];        // 16 种邻接 × 2 纹理变体
  platform: Sprite;
  spikes: Sprite[];      // U D L R
  bars: Sprite;
  breakable: Sprite;
  door: Sprite;
  locked: Sprite;
  eggdoor: Sprite;
  grass: Sprite[];
  pebble: Sprite[];
  mushroom: Sprite;
  candle: Sprite;
  doorOpen: Sprite;      // 开门后的门框
}

const cache = new Map<RegionId, Tileset>();

export function buildTileset(region: RegionId): Tileset {
  const hit = cache.get(region);
  if (hit) return hit;
  const st = REGION[region];
  const wall: Sprite[] = [];
  for (let mask = 0; mask < 16; mask++) {
    for (let v = 0; v < 2; v++) {
      const c = makeCanvas(TILE, TILE);
      const ctx = ctx2d(c);
      ctx.fillStyle = st.wall; ctx.fillRect(0, 0, TILE, TILE);
      // 纹理斑点
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const h = hash2(x + v * 31, y + mask * 7, 11);
        if (h < 0.10) { ctx.fillStyle = st.wallDark; ctx.fillRect(x, y, 1, 1); }
        else if (h > 0.94) { ctx.fillStyle = st.wallLight; ctx.fillRect(x, y, 1, 1); }
      }
      // 砖缝
      ctx.fillStyle = st.wallDark;
      const seamY = v === 0 ? 3 : 5;
      ctx.fillRect(0, seamY, TILE, 1);
      ctx.fillRect(v === 0 ? 5 : 2, seamY + 1, 1, TILE - seamY - 1);
      ctx.fillRect(v === 0 ? 2 : 6, 0, 1, seamY);
      const nOpen = mask & 1, eOpen = mask & 2, sOpen = mask & 4, wOpen = mask & 8;
      if (nOpen) { ctx.fillStyle = st.wallRim; ctx.fillRect(0, 0, TILE, 1); ctx.fillStyle = st.wallLight; ctx.fillRect(0, 1, TILE, 1); }
      if (sOpen) { ctx.fillStyle = st.wallDark; ctx.fillRect(0, TILE - 1, TILE, 1); }
      if (wOpen) { ctx.fillStyle = st.wallLight; ctx.fillRect(0, 0, 1, TILE); }
      if (eOpen) { ctx.fillStyle = st.wallDark; ctx.fillRect(TILE - 1, 0, 1, TILE); }
      if (nOpen && wOpen) { ctx.fillStyle = st.wallRim; ctx.fillRect(0, 0, 1, 1); }
      wall.push({ img: c, w: TILE, h: TILE });
    }
  }
  const spikesR = A.rotateCW(A.SPIKES_UP);
  const doorOpenArt: A.Art = ['s......s', 's......s', 's......s', 's......s', 's......s', 's......s', 's......s', 's......s'];
  const ts: Tileset = {
    wall,
    platform: rasterize(A.PLATFORM_TILE, PAL),
    spikes: [rasterize(A.SPIKES_UP, PAL), rasterize(A.flipV(A.SPIKES_UP), PAL), rasterize(A.flipHArt(spikesR), PAL), rasterize(spikesR, PAL)],
    bars: rasterize(A.BARS_TILE, PAL),
    breakable: rasterize(A.BREAK_TILE, { ...PAL, S: st.wallLight, s: st.wallDark }),
    door: rasterize(A.DOOR_TILE, PAL),
    locked: rasterize(A.LOCKED_TILE, PAL),
    eggdoor: rasterize(A.EGGDOOR_TILE, PAL),
    grass: A.GRASS.map((g) => rasterize(g, PAL)),
    pebble: A.PEBBLES.map((g) => rasterize(g, { ...PAL, S: st.wallLight, s: st.wallDark })),
    mushroom: rasterize(A.MUSHROOM, PAL),
    candle: rasterize(A.CANDLE, PAL),
    doorOpen: rasterize(doorOpenArt, PAL),
  };
  cache.set(region, ts);
  return ts;
}

/** 四邻掩码：bit0 北开 bit1 东开 bit2 南开 bit3 西开 */
export function wallMask(isWall: (tx: number, ty: number) => boolean, tx: number, ty: number): number {
  let m = 0;
  if (!isWall(tx, ty - 1)) m |= 1;
  if (!isWall(tx + 1, ty)) m |= 2;
  if (!isWall(tx, ty + 1)) m |= 4;
  if (!isWall(tx - 1, ty)) m |= 8;
  return m;
}

const bgCache = new Map<string, HTMLCanvasElement>();
/** 程序化背景（远景砖墙 + 钟乳石），每个区域一张 */
export function buildBackground(region: RegionId, seed: number): HTMLCanvasElement {
  const key = `${region}:${seed}`;
  const hit = bgCache.get(key);
  if (hit) return hit;
  const st = REGION[region];
  const W = VIEW_W + 16, H = VIEW_H + 16;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, st.bgDark); grad.addColorStop(0.5, st.bg); grad.addColorStop(1, st.bgDark);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  // 大砖块
  ctx.fillStyle = rgba(st.bgDark, 0.8);
  for (let y = 0; y < H; y += 12) {
    ctx.fillRect(0, y, W, 1);
    const off = ((y / 12) % 2) * 12;
    for (let x = off; x < W; x += 24) ctx.fillRect(x, y, 1, 12);
  }
  // 随机亮暗块
  for (let y = 0; y < H; y += 12) for (let x = 0; x < W; x += 24) {
    const h = hash2(x, y, seed);
    if (h < 0.08) { ctx.fillStyle = rgba(st.wallLight, 0.08); ctx.fillRect(x + 1, y + 1, 23, 11); }
    else if (h > 0.9) { ctx.fillStyle = rgba(st.bgDark, 0.6); ctx.fillRect(x + 1, y + 1, 23, 11); }
  }
  // 钟乳石剪影
  ctx.fillStyle = rgba(st.bgDark, 0.9);
  for (let x = 0; x < W; x += 6) {
    const h = hash2(x, 1, seed + 3);
    const len = Math.floor(h * h * 30);
    for (let i = 0; i < len; i++) ctx.fillRect(x + Math.floor(i / 6), i, Math.max(1, 4 - Math.floor(i / 6)), 1);
  }
  bgCache.set(key, c);
  return c;
}
