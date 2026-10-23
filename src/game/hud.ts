// 高分辨率文字叠加层：游戏画面是 320×176 像素，中文字在上面会糊，所以文字单独画在全分辨率画布上

import { ctx2d } from '../engine/gfx';
import { VIEW_W, VIEW_H } from './constants';

export interface TextOpts {
  size?: number;          // 以低分辨率像素计的字号
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number;
  bold?: boolean;
  shadow?: boolean;
  glow?: string;
  font?: string;
}

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

export class Overlay {
  ctx: CanvasRenderingContext2D;
  scale = 1;
  dpr = 1;
  constructor(public canvas: HTMLCanvasElement) { this.ctx = ctx2d(canvas); }

  resize(scale: number, dpr: number): void {
    this.scale = scale; this.dpr = dpr;
    this.canvas.width = Math.round(VIEW_W * scale * dpr);
    this.canvas.height = Math.round(VIEW_H * scale * dpr);
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
  }

  clear(): void { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  /** x,y 使用低分辨率坐标 */
  text(str: string, x: number, y: number, o: TextOpts = {}): void {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    const size = (o.size ?? 7) * k;
    ctx.save();
    ctx.font = `${o.bold ? 'bold ' : ''}${size}px ${o.font ?? FONT}`;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'top';
    ctx.globalAlpha = o.alpha ?? 1;
    const px = x * k, py = y * k;
    if (o.glow) {
      ctx.shadowColor = o.glow; ctx.shadowBlur = size * 0.8;
      ctx.fillStyle = o.glow;
      ctx.fillText(str, px, py);
      ctx.shadowBlur = 0;
    }
    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(str, px + k * 0.6, py + k * 0.6);
    }
    ctx.fillStyle = o.color ?? '#e8e8f4';
    ctx.fillText(str, px, py);
    ctx.restore();
  }

  measure(str: string, size = 7, bold = false): number {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    ctx.font = `${bold ? 'bold ' : ''}${size * k}px ${FONT}`;
    return ctx.measureText(str).width / k;
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    const k = this.scale * this.dpr;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * k, y * k, w * k, h * k);
    this.ctx.restore();
  }
}
