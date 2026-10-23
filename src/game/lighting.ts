// 光照：环境光 + 径向光源，最后以 multiply 叠加到画面上

import { makeCanvas, ctx2d } from '../engine/gfx';
import { hexToRgb } from '../engine/util';
import { VIEW_W, VIEW_H } from './constants';
import type { Light } from './types';

export class Lighting {
  canvas = makeCanvas(VIEW_W, VIEW_H);
  ctx = ctx2d(this.canvas);

  render(lights: readonly Light[], ambient: number, tint: string): HTMLCanvasElement {
    const ctx = this.ctx;
    const [r, g, b] = hexToRgb(tint);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${Math.round(r * ambient)},${Math.round(g * ambient)},${Math.round(b * ambient)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.r <= 0 || l.a <= 0) continue;
      const [lr, lg, lb] = hexToRgb(l.color);
      const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(${lr},${lg},${lb},${Math.min(1, l.a)})`);
      grad.addColorStop(0.45, `rgba(${lr},${lg},${lb},${Math.min(1, l.a) * 0.45})`);
      grad.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    return this.canvas;
  }

  /** 估算某点的光照强度（用于变色龙等） */
  static levelAt(lights: readonly Light[], ambient: number, x: number, y: number): number {
    let v = ambient;
    for (const l of lights) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < l.r) v += l.a * (1 - d / l.r);
    }
    return Math.min(1, v);
  }
}
