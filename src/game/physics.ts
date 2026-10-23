// 纯函数的瓦片 AABB 物理：按像素步进，支持单向平台

import { TILE } from './constants';

export interface Body {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  rx: number; ry: number;          // 亚像素余量
  onGround: boolean;
  hitWall: number;                 // -1/0/1：本帧撞到左/无/右墙
  hitCeil: boolean;
}

export const makeBody = (x: number, y: number, w: number, h: number): Body =>
  ({ x: Math.round(x), y: Math.round(y), w, h, vx: 0, vy: 0, rx: 0, ry: 0, onGround: false, hitWall: 0, hitCeil: false });

export type TileTest = (tx: number, ty: number) => boolean;

export interface MoveOpts {
  solid: TileTest;
  platform?: TileTest;
  dropThrough?: boolean;
}

/** 矩形是否与任何“实心”瓦片重叠 */
export function rectHits(x: number, y: number, w: number, h: number, test: TileTest): boolean {
  const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 1) / TILE);
  const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (test(tx, ty)) return true;
  return false;
}

/** 底边正好压在单向平台上 */
function onPlatformEdge(b: Body, platform: TileTest): boolean {
  const bottom = b.y + b.h;
  if (bottom % TILE !== 0) return false;
  const ty = bottom / TILE;
  const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 1) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) if (platform(tx, ty)) return true;
  return false;
}

export function moveBody(b: Body, o: MoveOpts): void {
  b.hitWall = 0; b.hitCeil = false;
  // ---- X ----
  b.rx += b.vx;
  let mx = Math.round(b.rx);
  b.rx -= mx;
  const sx = Math.sign(mx);
  while (mx !== 0) {
    if (rectHits(b.x + sx, b.y, b.w, b.h, o.solid)) { b.vx = 0; b.rx = 0; b.hitWall = sx; break; }
    b.x += sx; mx -= sx;
  }
  // ---- Y ----
  b.ry += b.vy;
  let my = Math.round(b.ry);
  b.ry -= my;
  const sy = Math.sign(my);
  b.onGround = false;
  while (my !== 0) {
    if (sy > 0 && !o.dropThrough && o.platform && onPlatformEdge(b, o.platform)) { b.vy = 0; b.ry = 0; b.onGround = true; break; }
    if (rectHits(b.x, b.y + sy, b.w, b.h, o.solid)) {
      if (sy > 0) b.onGround = true; else b.hitCeil = true;
      b.vy = 0; b.ry = 0; break;
    }
    b.y += sy; my -= sy;
  }
  if (!b.onGround && b.vy >= 0) {
    // 静止时也要知道是否站在地上
    if (rectHits(b.x, b.y + 1, b.w, b.h, o.solid)) b.onGround = true;
    else if (!o.dropThrough && o.platform && onPlatformEdge(b, o.platform)) b.onGround = true;
  }
}

/** 从实心瓦片中挤出（例如门在身上关闭） */
export function unstick(b: Body, solid: TileTest): void {
  if (!rectHits(b.x, b.y, b.w, b.h, solid)) return;
  for (let r = 1; r < 24; r++) {
    for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r]]) {
      if (!rectHits(b.x + dx, b.y + dy, b.w, b.h, solid)) { b.x += dx; b.y += dy; return; }
    }
  }
}
