// 玩家投出的东西：泡泡、飞盘、鞭炮

import { Entity } from './entity';
import type { Ctx } from './types';
import { type Gfx, type Sprite, rasterize } from '../engine/gfx';
import { makeBody, moveBody, rectHits, type Body } from './physics';
import { isHazard, T } from './tiletypes';
import { PAL } from './palette';
import * as A from './sprites';
import { VIEW_W, VIEW_H, TILE } from './constants';

let _spr: { disc: Sprite; cracker: Sprite } | null = null;
function spr() {
  if (!_spr) _spr = { disc: rasterize(A.DISC_SPR, PAL), cracker: rasterize(A.FIRECRACKER_SPR, PAL) };
  return _spr;
}

export class Bubble extends Entity {
  override kind = 'bubble';
  life = 330;
  ridden = 0;
  t = 0;
  fx: number; fy: number;
  vy = -0.3;
  riddenThisFrame = false;
  constructor(x: number, y: number) { super(x, y, 10, 10); this.fx = x; this.fy = y; this.t = Math.floor(Math.random() * 100); }
  pop(c: Ctx): void {
    if (this.dead) return;
    this.dead = true;
    c.sfx('pop');
    c.particles.burst(this.cx, this.cy, { n: 8, speed: 1.2, colors: ['#8df5ff', '#ffffff'], life: 18 });
  }
  override update(c: Ctx): void {
    this.t++; this.life--;
    this.fx += Math.sin(this.t / 14) * 0.25;
    this.fy += this.riddenThisFrame ? -0.5 : this.vy;
    this.riddenThisFrame = false;
    const nx = Math.round(this.fx), ny = Math.round(this.fy);
    if (c.rectSolid(nx, ny, this.w, this.h, 'bubble') || ny < -4) { this.pop(c); return; }
    this.x = nx; this.y = ny;
    if (rectHits(this.x, this.y, this.w, this.h, (tx, ty) => isHazard(c.tileAt(tx, ty)))) { this.pop(c); return; }
    if (this.life <= 0 || this.ridden > 70) { this.pop(c); return; }
    c.addLight({ x: this.cx, y: this.cy, r: 11, color: '#8df5ff', a: 0.25 });
  }
  override draw(g: Gfx): void {
    const wob = Math.sin(this.t / 6);
    const alpha = this.ridden > 50 ? ((this.t >> 1) & 1 ? 0.5 : 0.9) : 0.85;
    g.ctx.globalAlpha = alpha;
    g.ring(this.cx - 0.5, this.cy - 0.5 + wob * 0.3, 4.5, '#8df5ff');
    g.px(this.x + 3, this.y + 2, '#ffffff');
    g.px(this.x + 2, this.y + 3, '#ffffff');
    g.ctx.globalAlpha = 1;
  }
}

export class Disc extends Entity {
  override kind = 'disc';
  state: 'fly' | 'rest' | 'return' = 'fly';
  body: Body;
  dir: number;
  bounces = 0;
  flyTime = 0;
  spin = 0;
  constructor(x: number, y: number, dir: number) {
    super(x, y, 8, 3);
    this.dir = dir;
    this.body = makeBody(x, y, 8, 3);
    this.body.vx = 3 * dir;
  }
  recall(): void { if (this.state !== 'return') { this.state = 'return'; this.pressesButtons = false; } }
  override update(c: Ctx): void {
    this.spin++;
    const b = this.body;
    if (this.state === 'return') {
      const p = c.player;
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 3.8;
      b.x += Math.round((dx / d) * sp); b.y += Math.round((dy / d) * sp);
      this.x = b.x; this.y = b.y;
      if (d < 7 || this.overlaps(p)) {
        this.dead = true; c.disc = null; c.sfx('discCatch');
        p.discOut = false;
      }
      return;
    }
    if (this.state === 'fly') {
      this.flyTime++;
      // 击碎前方裂墙
      const aheadX = this.dir > 0 ? b.x + b.w : b.x - 1;
      const tx = Math.floor(aheadX / TILE);
      for (let ty = Math.floor(b.y / TILE); ty <= Math.floor((b.y + b.h - 1) / TILE); ty++) {
        if (c.tileAt(tx, ty) === T.BREAK) c.breakTile(tx, ty);
      }
      b.vx = 3 * this.dir; b.vy = 0;
      moveBody(b, { solid: c.solidFor('disc') });
      if (b.hitWall) {
        this.dir = -this.dir; this.bounces++;
        c.sfx('discBounce');
        c.particles.burst(this.dir > 0 ? b.x : b.x + b.w, this.cy, { n: 3, speed: 1, colors: ['#ffa040'], life: 10 });
        if (this.bounces >= 4) this.state = 'rest';
      }
      if (this.flyTime > 210) this.state = 'rest';
      this.pressesButtons = false;
    } else {
      b.vy = Math.min(b.vy + 0.3, 4); b.vx *= b.onGround ? 0.86 : 0.99; if (Math.abs(b.vx) < 0.05) b.vx = 0;
      moveBody(b, { solid: c.solidFor('disc'), platform: c.platformTest });
      this.pressesButtons = b.onGround;
    }
    this.x = b.x; this.y = b.y;
    if (this.x < -12 || this.x > VIEW_W + 4 || this.y < -12 || this.y > VIEW_H + 4) this.recall();
  }
  override draw(g: Gfx): void {
    const s = spr().disc;
    const squash = this.state === 'fly' && (this.spin >> 1) & 1;
    g.sprite(s, this.x, this.y + (squash ? 0.5 : 0), this.dir < 0);
  }
}

export class Firecracker extends Entity {
  override kind = 'firecracker';
  body: Body;
  fuse = 58;
  boom = 0;
  lastVx = 0;
  constructor(x: number, y: number, dir: number) {
    super(x, y, 3, 5);
    this.body = makeBody(x, y, 3, 5);
    this.body.vx = 2.2 * dir; this.body.vy = -2.4;
  }
  explode(c: Ctx): void {
    this.boom = 24;
    c.sfx('bang'); c.flash(0.7); c.shake(5);
    c.particles.burst(this.cx, this.cy, { n: 28, speed: 3, colors: ['#ffe36e', '#ffa040', '#ffffff', '#ff4f5e'], life: 28, grav: 0.08, drag: 0.96 });
    c.particles.burst(this.cx, this.cy, { n: 10, speed: 0.6, colors: ['#707080', '#c0c0c8'], life: 60, vy: -0.5, drag: 0.98 });
    for (const e of c.entities) if (e.onScare && !e.dead && Math.hypot(e.cx - this.cx, e.cy - this.cy) < 100) e.onScare(c, this.cx, this.cy);
  }
  override update(c: Ctx): void {
    if (this.boom > 0) {
      this.boom--;
      c.addLight({ x: this.cx, y: this.cy, r: 70 + this.boom * 3, color: '#ffe0a0', a: this.boom / 20 });
      if (this.boom === 0) this.dead = true;
      return;
    }
    this.fuse--;
    const b = this.body;
    if (this.fuse % 2 === 0) c.particles.emit({ x: b.x + 1, y: b.y - 1, vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 0.8, life: 10, color: Math.random() < 0.5 ? '#ffe36e' : '#ffffff' });
    c.addLight({ x: this.cx, y: this.y, r: 10, color: '#ffe36e', a: 0.4 });
    const prevVy = b.vy, prevVx = b.vx;
    b.vy = Math.min(b.vy + 0.2, 4);
    moveBody(b, { solid: c.solidFor('thrown'), platform: c.platformTest });
    if (b.hitWall) b.vx = -prevVx * 0.5;
    if (b.onGround) { b.vx *= 0.85; if (prevVy > 1.2) b.vy = -prevVy * 0.4; }
    this.x = b.x; this.y = b.y;
    if (this.fuse <= 0) this.explode(c);
  }
  override draw(g: Gfx): void {
    if (this.boom > 0) {
      if (this.boom > 18) g.circle(this.cx, this.cy, (24 - this.boom) * 3, '#fff4c0');
      return;
    }
    g.sprite(spr().cracker, this.x, this.y);
  }
}
