// 像素画布与精灵：ASCII 像素画 → Canvas

export interface Sprite { img: HTMLCanvasElement; w: number; h: number; }

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** 把一组字符串（每个字符一个像素）光栅化为精灵。'.' 和 ' ' 为透明。 */
export function rasterize(rows: readonly string[], pal: Readonly<Record<string, string>>): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = makeCanvas(Math.max(1, w), Math.max(1, h));
  const ctx = ctx2d(c);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) throw new Error(`palette missing '${ch}'`);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { img: c, w, h };
}

const flipCache = new WeakMap<Sprite, Sprite>();
export function flipH(s: Sprite): Sprite {
  let f = flipCache.get(s);
  if (f) return f;
  const c = makeCanvas(s.w, s.h);
  const ctx = ctx2d(c);
  ctx.translate(s.w, 0); ctx.scale(-1, 1);
  ctx.drawImage(s.img, 0, 0);
  f = { img: c, w: s.w, h: s.h };
  flipCache.set(s, f);
  return f;
}

const tintCache = new WeakMap<Sprite, Map<string, Sprite>>();
/** 单色剪影（受伤闪白、幽灵等） */
export function silhouette(s: Sprite, color: string): Sprite {
  let m = tintCache.get(s);
  if (!m) { m = new Map(); tintCache.set(s, m); }
  const hit = m.get(color);
  if (hit) return hit;
  const c = makeCanvas(s.w, s.h);
  const ctx = ctx2d(c);
  ctx.drawImage(s.img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s.w, s.h);
  const out = { img: c, w: s.w, h: s.h };
  m.set(color, out);
  return out;
}

/** 低分辨率绘图封装 */
export class Gfx {
  ctx: CanvasRenderingContext2D;
  constructor(public canvas: HTMLCanvasElement) { this.ctx = ctx2d(canvas); }
  get w(): number { return this.canvas.width; }
  get h(): number { return this.canvas.height; }
  clear(color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.w, this.h); }
  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  px(x: number, y: number, color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  hline(x: number, y: number, len: number, color: string): void { this.rect(x, y, len, 1, color); }
  vline(x: number, y: number, len: number, color: string): void { this.rect(x, y, 1, len, color); }
  circle(cx: number, cy: number, r: number, color: string): void {
    // 像素圆（中点法近似）
    this.ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      this.ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
    }
  }
  ring(cx: number, cy: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    const steps = Math.max(8, Math.floor(r * 6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
  sprite(s: Sprite, x: number, y: number, flip = false, alpha = 1): void {
    const img = flip ? flipH(s).img : s.img;
    if (alpha < 1) { this.ctx.globalAlpha = alpha; }
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
    if (alpha < 1) { this.ctx.globalAlpha = 1; }
  }
  /** 带透明度的任意图像 */
  image(img: CanvasImageSource, x: number, y: number, alpha = 1): void {
    if (alpha < 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
    if (alpha < 1) this.ctx.globalAlpha = 1;
  }
}
