// 实体基类

import type { Gfx } from '../engine/gfx';
import { rectsOverlap } from '../engine/util';
import type { Ctx } from './types';

export interface Rect { x: number; y: number; w: number; h: number; }

export abstract class Entity implements Rect {
  x: number; y: number; w: number; h: number;
  dead = false;
  /** 绘制顺序：小的先画 */
  layer = 0;
  /** 类型标签（'disc'、'bubble'、'dog'……） */
  kind = 'entity';
  /** 能压住按钮 */
  pressesButtons = false;

  constructor(x: number, y: number, w = 8, h = 8) { this.x = x; this.y = y; this.w = w; this.h = h; }
  /** 进入房间后、首帧前调用 */
  init?(c: Ctx): void;
  update(_c: Ctx): void {}
  draw(_g: Gfx, _c: Ctx): void {}
  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  overlaps(o: Rect): boolean { return rectsOverlap(this.x, this.y, this.w, this.h, o.x, o.y, o.w, o.h); }
  /** 被溜溜球击中 */
  onYoyo?(c: Ctx): void;
  /** 被鞭炮吓到（x,y 为爆炸点） */
  onScare?(c: Ctx, x: number, y: number): void;
}
