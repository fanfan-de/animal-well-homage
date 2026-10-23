// 轻量粒子系统

import type { Gfx } from './gfx';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  color: string; size: number;
  grav: number; drag: number;
  blink: boolean;
}

export interface BurstOpts {
  n?: number; speed?: number; colors?: string[]; life?: number; size?: number;
  grav?: number; drag?: number; angle?: number; spread?: number; blink?: boolean; vy?: number;
}

export class Particles {
  list: Particle[] = [];
  private rnd = Math.random;

  emit(p: Partial<Particle> & { x: number; y: number; color: string }): void {
    if (this.list.length > 600) this.list.shift();
    this.list.push({
      vx: 0, vy: 0, life: 30, max: 30, size: 1, grav: 0, drag: 1, blink: false,
      ...p,
    });
    const last = this.list[this.list.length - 1];
    last.max = last.life;
  }

  burst(x: number, y: number, o: BurstOpts = {}): void {
    const n = o.n ?? 8, speed = o.speed ?? 1.5, colors = o.colors ?? ['#ffffff'];
    const angle = o.angle ?? 0, spread = o.spread ?? Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = angle + (this.rnd() - 0.5) * spread;
      const s = speed * (0.4 + this.rnd() * 0.8);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.vy ?? 0),
        life: Math.floor((o.life ?? 30) * (0.6 + this.rnd() * 0.8)),
        color: colors[Math.floor(this.rnd() * colors.length)],
        size: o.size ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 1, blink: o.blink ?? false,
      });
    }
  }

  update(): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.vy += p.grav; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      if (--p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); }
    }
  }

  draw(g: Gfx): void {
    const ctx = g.ctx;
    for (const p of this.list) {
      const f = p.life / p.max;
      if (p.blink && ((p.life >> 2) & 1)) continue;
      ctx.globalAlpha = f < 0.4 ? f / 0.4 : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void { this.list.length = 0; }
}
