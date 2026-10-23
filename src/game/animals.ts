// 动物 AI：没有战斗，只有躲避、吓跑和利用

import { Entity } from './entity';
import type { Ctx } from './types';
import { type Gfx, type Sprite, rasterize, silhouette } from '../engine/gfx';
import { makeBody, moveBody, type Body, type TileTest } from './physics';
import { isPlatform, isWater, blocks, T } from './tiletypes';
import { PAL } from './palette';
import * as A from './sprites';
import { ROOM_W, ROOM_H, VIEW_W, VIEW_H, TILE } from './constants';
import { clamp, sign } from '../engine/util';

interface AnimalSprites {
  ghostcat: Sprite[]; dog: Sprite[]; bird: Sprite[]; snail: Sprite[]; fish: Sprite[];
  seahorse: Sprite[]; chameleon: Sprite[]; ostrich: Sprite[];
}
let _spr: AnimalSprites | null = null;
function spr(): AnimalSprites {
  if (!_spr) {
    const r = (a: A.Art[]) => a.map((x) => rasterize(x, PAL));
    _spr = { ghostcat: r(A.GHOSTCAT), dog: r(A.DOG), bird: r(A.BIRD), snail: r(A.SNAIL), fish: r(A.FISH), seahorse: r(A.SEAHORSE), chameleon: r(A.CHAMELEON), ostrich: r(A.OSTRICH) };
  }
  return _spr;
}

function drawStars(g: Gfx, x: number, y: number, t: number): void {
  for (let i = 0; i < 3; i++) {
    const a = t / 8 + (i * Math.PI * 2) / 3;
    g.px(x + Math.cos(a) * 5, y + Math.sin(a) * 2, '#ffe36e');
  }
}

/** 地面动物基类 */
abstract class GroundAnimal extends Entity {
  body: Body;
  dir = 1;
  stun = 0;
  scared = 0;
  scareX = 0;
  anim = 0;
  damage = 1;
  spawnX: number; spawnY: number;
  constructor(x: number, y: number, w: number, h: number) {
    super(x, y, w, h);
    this.body = makeBody(x, y, w, h);
    this.spawnX = x; this.spawnY = y;
    this.pressesButtons = true;
  }
  protected solid(c: Ctx): TileTest {
    const s = c.solidFor('animal');
    return (tx, ty) => (tx < 0 || tx >= ROOM_W || ty >= ROOM_H ? true : s(tx, ty));
  }
  protected sync(): void { this.x = this.body.x; this.y = this.body.y; }
  protected tick(): void { if (this.stun > 0) this.stun--; if (this.scared > 0) this.scared--; this.anim++; }
  protected touch(c: Ctx): void { if (this.stun === 0 && this.overlaps(c.player)) c.hurtPlayer(this.damage, this.cx); }
  override onYoyo(c: Ctx): void {
    if (this.stun > 0) return;
    this.stun = 150; c.sfx('ui');
    c.particles.burst(this.cx, this.y, { n: 5, speed: 1, colors: ['#ffe36e'], life: 20, vy: -0.5 });
  }
  override onScare(_c: Ctx, x: number): void { this.scared = 220; this.scareX = x; }
  protected groundAhead(c: Ctx, dir: number): boolean {
    const b = this.body;
    const px = dir > 0 ? b.x + b.w : b.x - 1;
    const tx = Math.floor(px / TILE), ty = Math.floor((b.y + b.h) / TILE);
    if (tx < 0 || tx >= ROOM_W) return false;
    return c.solidFor('animal')(tx, ty) || isPlatform(c.tileAt(tx, ty));
  }
  protected gravity(): void { this.body.vy = Math.min(this.body.vy + 0.22, 4); }
  /** 行走：撞墙是否掉头、是否避开悬崖 */
  protected walk(c: Ctx, speed: number, turnAtWall: boolean, avoidEdges: boolean): void {
    const b = this.body;
    if (avoidEdges && b.onGround && !this.groundAhead(c, this.dir)) { this.dir = -this.dir; }
    b.vx = speed * this.dir;
    moveBody(b, { solid: this.solid(c), platform: c.platformTest });
    if (b.hitWall && turnAtWall) this.dir = -this.dir;
  }
  protected stand(c: Ctx): void {
    this.body.vx = 0;
    moveBody(this.body, { solid: this.solid(c), platform: c.platformTest });
  }
}

export class Dog extends GroundAnimal {
  override kind = 'dog';
  state: 'sleep' | 'chase' | 'disc' | 'flee' = 'sleep';
  barkT = 0;
  constructor(x: number, y: number) { super(x, y - 2, 14, 10); }
  override update(c: Ctx): void {
    this.tick(); this.gravity();
    const p = c.player;
    const dx = p.cx - this.cx;
    if (this.stun > 0) { this.stand(c); this.sync(); return; }
    if (this.scared > 0) this.state = 'flee';
    else if (c.disc && !c.disc.dead) this.state = 'disc';
    else if (this.state === 'sleep') {
      if (Math.abs(dx) < 70 && Math.abs(p.cy - this.cy) < 22) { this.state = 'chase'; c.sfx('dog'); }
    } else this.state = 'chase';
    switch (this.state) {
      case 'sleep':
        this.stand(c);
        if (this.anim % 50 === 0) c.particles.emit({ x: this.x + 12, y: this.y - 2, vy: -0.3, vx: 0.2, life: 40, color: '#c0c0c8' });
        break;
      case 'chase':
        this.dir = sign(dx) || this.dir;
        this.walk(c, 1.45, false, false);
        if (++this.barkT % 100 === 0) c.sfx('dog');
        break;
      case 'disc': {
        const d = c.disc as Entity;
        const ddx = d.cx - this.cx;
        if (Math.abs(ddx) > 8) { this.dir = sign(ddx) || this.dir; this.walk(c, 1.7, false, false); }
        else { this.stand(c); if (this.anim % 20 === 0) c.particles.emit({ x: this.cx, y: this.y - 2, vy: -0.5, life: 15, color: '#ffa040' }); }
        break;
      }
      case 'flee':
        this.dir = sign(this.cx - this.scareX) || this.dir;
        this.walk(c, 1.9, true, false);
        break;
    }
    this.sync();
    this.touch(c);
  }
  override draw(g: Gfx): void {
    const s = spr().dog;
    const moving = Math.abs(this.body.vx) > 0.1;
    const frame = this.state === 'sleep' ? s[2] : moving ? s[(this.anim >> 3) & 1] : s[0];
    g.sprite(frame, this.x - 1, this.y, this.dir < 0);
    if (this.stun > 0) drawStars(g, this.cx, this.y - 3, this.anim);
  }
}

export class Snail extends GroundAnimal {
  override kind = 'snail';
  constructor(x: number, y: number) { super(x, y + 2, 8, 6); }
  override update(c: Ctx): void {
    this.tick(); this.gravity();
    if (this.stun > 0) this.stand(c);
    else this.walk(c, this.scared > 0 ? 0.6 : 0.3, true, true);
    this.sync(); this.touch(c);
  }
  override draw(g: Gfx): void {
    const s = spr().snail;
    g.sprite(s[(this.anim >> 4) & 1], this.x, this.y, this.dir < 0);
    if (this.stun > 0) drawStars(g, this.cx, this.y - 3, this.anim);
  }
}

export class Ostrich extends GroundAnimal {
  override kind = 'ostrich';
  state: 'patrol' | 'charge' | 'tired' = 'patrol';
  timer = 0;
  constructor(x: number, y: number) { super(x, y - 7, 10, 15); }
  override update(c: Ctx): void {
    this.tick(); this.gravity();
    const p = c.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (this.stun > 0) { this.stand(c); this.sync(); return; }
    if (this.scared > 0) {
      this.dir = sign(this.cx - this.scareX) || this.dir;
      this.walk(c, 2.2, true, false);
    } else switch (this.state) {
      case 'patrol':
        this.walk(c, 0.6, true, true);
        if (Math.abs(dx) < 120 && Math.abs(dy) < 18 && sign(dx) === this.dir) { this.state = 'charge'; this.timer = 75; c.sfx('bird'); }
        break;
      case 'charge':
        this.walk(c, 2.4, false, false);
        if (this.anim % 4 === 0) c.particles.emit({ x: this.cx - this.dir * 5, y: this.y + this.h - 1, vx: -this.dir * 0.5, vy: -0.3, life: 15, color: '#707080' });
        if (--this.timer <= 0 || this.body.hitWall) { this.state = 'tired'; this.timer = 70; }
        break;
      case 'tired':
        this.stand(c);
        if (--this.timer <= 0) this.state = 'patrol';
        break;
    }
    this.sync(); this.touch(c);
  }
  override draw(g: Gfx): void {
    const s = spr().ostrich;
    const moving = Math.abs(this.body.vx) > 0.1;
    g.sprite(moving ? s[(this.anim >> 2) & 1] : s[0], this.x - 1, this.y, this.dir < 0);
    if (this.stun > 0) drawStars(g, this.cx, this.y - 3, this.anim);
  }
}

export class GhostCat extends Entity {
  override kind = 'ghostcat';
  fx: number; fy: number;
  vx = 0; vy = 0;
  t = 0;
  scared = 0; scareX = 0;
  vanish = 0;
  spawnX: number; spawnY: number;
  constructor(x: number, y: number) { super(x, y, 12, 8); this.fx = x; this.fy = y; this.spawnX = x; this.spawnY = y; }
  override onScare(c: Ctx, x: number): void {
    if (this.vanish > 0) return;
    this.vanish = 420; this.scareX = x;
    c.sfx('cat');
    c.particles.burst(this.cx, this.cy, { n: 14, speed: 1.5, colors: ['#aef2ff', '#ffffff'], life: 30, drag: 0.95 });
  }
  override update(c: Ctx): void {
    this.t++;
    if (this.vanish > 0) {
      this.vanish--;
      if (this.vanish === 0) { this.fx = this.spawnX; this.fy = this.spawnY; }
      return;
    }
    const p = c.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    const lit = p.lanternOn && d < 80;
    let tvx = 0, tvy = 0;
    if (lit) { tvx = -(dx / d) * 1.0; tvy = -(dy / d) * 0.6; }
    else if (d < 130) { tvx = (dx / d) * 0.62; tvy = (dy / d) * 0.62; if (this.t % 200 === 0) c.sfx('cat'); }
    else { tvx = Math.cos(this.t / 70) * 0.3; tvy = Math.sin(this.t / 45) * 0.25; }
    this.vx += (tvx - this.vx) * 0.07; this.vy += (tvy - this.vy) * 0.07;
    this.fx = clamp(this.fx + this.vx, -4, VIEW_W - this.w + 4);
    this.fy = clamp(this.fy + this.vy, -4, VIEW_H - this.h + 4);
    this.x = Math.round(this.fx); this.y = Math.round(this.fy + Math.sin(this.t / 20) * 2);
    c.addLight({ x: this.cx, y: this.cy, r: 20, color: '#9fd0ff', a: 0.3 });
    if (!lit && this.overlaps(p)) c.hurtPlayer(1, this.cx);
  }
  override draw(g: Gfx): void {
    if (this.vanish > 0) return;
    const s = spr().ghostcat;
    g.sprite(s[(this.t >> 4) & 1], this.x, this.y, this.vx < 0, 0.7 + Math.sin(this.t / 9) * 0.15);
  }
}

export class Bird extends Entity {
  override kind = 'bird';
  fx: number; fy: number; baseY: number;
  dir = 1; t = 0; scared = 0; stun = 0;
  constructor(x: number, y: number) { super(x, y, 8, 6); this.fx = x; this.fy = y; this.baseY = y; this.t = Math.floor(Math.random() * 60); }
  override onScare(c: Ctx, x: number): void { this.scared = 260; this.dir = sign(this.cx - x) || this.dir; c.sfx('bird'); }
  override onYoyo(c: Ctx): void { this.stun = 100; c.sfx('ui'); }
  override update(c: Ctx): void {
    this.t++;
    if (this.stun > 0) { this.stun--; this.fy = Math.min(this.fy + 1, VIEW_H - 8); }
    else if (this.scared > 0) { this.scared--; this.fy -= 1.2; this.fx += this.dir * 1.8; if (this.fy < -30) this.fy = -30; }
    else {
      const sp = 1.1;
      this.fx += this.dir * sp;
      this.fy = this.baseY + Math.sin(this.t / 12) * 6;
      const tx = Math.floor((this.dir > 0 ? this.fx + this.w + 1 : this.fx - 1) / TILE);
      const ty = Math.floor((this.fy + 3) / TILE);
      if (this.fx < 0 || this.fx + this.w > VIEW_W || blocks(c.tileAt(tx, ty), 'animal')) this.dir = -this.dir;
      if (this.t % 240 === 0) c.sfx('bird');
    }
    this.x = Math.round(this.fx); this.y = Math.round(this.fy);
    if (this.stun === 0 && this.scared === 0 && this.overlaps(c.player)) c.hurtPlayer(1, this.cx);
  }
  override draw(g: Gfx): void {
    const s = spr().bird;
    g.sprite(s[(this.t >> 2) & 1], this.x, this.y, this.dir < 0);
    if (this.stun > 0) drawStars(g, this.cx, this.y - 3, this.t);
  }
}

export class Fish extends Entity {
  override kind = 'fish';
  fx: number; baseY: number; dir = 1; t = 0;
  constructor(x: number, y: number) { super(x, y + 1, 8, 5); this.fx = x; this.baseY = y + 1; this.t = Math.floor(Math.random() * 60); }
  override update(c: Ctx): void {
    this.t++;
    this.fx += this.dir * 0.8;
    const tx = Math.floor((this.dir > 0 ? this.fx + this.w + 1 : this.fx - 1) / TILE);
    const ty = Math.floor(this.cy / TILE);
    if (this.fx < 0 || this.fx + this.w > VIEW_W || !isWater(c.tileAt(tx, ty))) this.dir = -this.dir;
    this.x = Math.round(this.fx); this.y = Math.round(this.baseY + Math.sin(this.t / 10) * 2);
    if (this.overlaps(c.player)) c.hurtPlayer(1, this.cx);
  }
  override draw(g: Gfx): void { g.sprite(spr().fish[(this.t >> 3) & 1], this.x, this.y, this.dir < 0); }
}

export class Seahorse extends Entity {
  override kind = 'seahorse';
  fx: number; fy: number; spawnY: number; dir = 1; t = 0; scared = 0; scareX = 0;
  state: 'patrol' | 'charge' | 'flee' = 'patrol';
  constructor(x: number, y: number) { super(x, y, 10, 16); this.fx = x; this.fy = y; this.spawnY = y; }
  override onScare(c: Ctx, x: number): void { this.scared = 260; this.scareX = x; c.sfx('splash'); }
  private tryMove(c: Ctx, dx: number, dy: number): boolean {
    const nx = this.fx + dx, ny = this.fy + dy;
    const cx = Math.floor((nx + this.w / 2) / TILE), cy = Math.floor((ny + this.h / 2) / TILE);
    const top = Math.floor((ny + 2) / TILE), bot = Math.floor((ny + this.h - 2) / TILE);
    if (nx < 0 || nx + this.w > VIEW_W) return false;
    if (!isWater(c.tileAt(cx, cy)) || !isWater(c.tileAt(cx, top)) || !isWater(c.tileAt(cx, bot))) return false;
    this.fx = nx; this.fy = ny; return true;
  }
  override update(c: Ctx): void {
    this.t++;
    const p = c.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    if (this.scared > 0) {
      this.scared--; this.state = 'flee';
      const fdx = sign(this.cx - this.scareX) || 1;
      if (!this.tryMove(c, fdx * 1.4, 0)) this.tryMove(c, 0, Math.sin(this.t / 10));
      this.dir = fdx;
    } else if (p.inWater && d < 95) {
      this.state = 'charge';
      const sp = 1.35;
      this.tryMove(c, (dx / d) * sp, 0); this.tryMove(c, 0, (dy / d) * sp);
      this.dir = sign(dx) || this.dir;
      if (this.t % 90 === 0) c.sfx('swim');
    } else {
      this.state = 'patrol';
      if (!this.tryMove(c, this.dir * 0.5, 0)) this.dir = -this.dir;
      const wantY = this.spawnY + Math.sin(this.t / 40) * 8;
      this.tryMove(c, 0, clamp(wantY - this.fy, -0.5, 0.5));
    }
    this.x = Math.round(this.fx); this.y = Math.round(this.fy);
    if (this.t % 30 === 0) c.particles.emit({ x: this.x + (this.dir > 0 ? 8 : 2), y: this.y + 3, vy: -0.4, life: 40, color: '#aef2ff' });
    if (this.overlaps(p)) c.hurtPlayer(1, this.cx);
  }
  override draw(g: Gfx): void {
    const s = spr().seahorse;
    g.sprite(s[(this.t >> 3) & 1], this.x, this.y, this.dir > 0);
  }
}

export class Chameleon extends Entity {
  override kind = 'chameleon';
  tongue = 0; cooldown = 60; stun = 0; dir = 1; t = 0; hitThisTongue = false;
  alpha = 1;
  constructor(x: number, y: number) { super(x, y - 2, 16, 10); }
  override onYoyo(c: Ctx): void { this.stun = 360; this.tongue = 0; c.sfx('ui'); c.particles.burst(this.cx, this.y, { n: 6, speed: 1, colors: ['#ffe36e'], life: 20 }); }
  tongueRect(): { x: number; y: number; w: number; h: number } | null {
    if (this.tongue <= 0) return null;
    const len = this.tongue <= 10 ? this.tongue * 6 : this.tongue <= 18 ? 60 : (28 - this.tongue) * 6;
    const x0 = this.dir > 0 ? this.x + this.w : this.x - len;
    return { x: x0, y: this.cy - 1, w: len, h: 3 };
  }
  override update(c: Ctx): void {
    this.t++;
    if (this.stun > 0) this.stun--;
    if (this.cooldown > 0) this.cooldown--;
    const p = c.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    this.alpha = c.dark ? clamp(c.lightLevelAt(this.cx, this.cy) * 1.8 - 0.15, 0.06, 1) : 1;
    if (this.stun === 0 && this.tongue === 0 && this.cooldown === 0 && Math.abs(dx) < 64 && Math.abs(dy) < 14) {
      this.tongue = 1; this.dir = sign(dx) || this.dir; this.cooldown = 110; this.hitThisTongue = false;
      c.sfx('yoyo');
    }
    if (this.tongue > 0) {
      this.tongue++;
      if (this.tongue >= 28) this.tongue = 0;
      const r = this.tongueRect();
      if (r && !this.hitThisTongue && p.overlaps(r)) { this.hitThisTongue = true; c.hurtPlayer(1, this.cx); }
    }
    if (this.stun === 0 && this.overlaps(p)) c.hurtPlayer(1, this.cx);
  }
  override draw(g: Gfx): void {
    const s = spr().chameleon[0];
    g.sprite(s, this.x, this.y, this.dir < 0, this.alpha);
    const r = this.tongueRect();
    if (r && this.alpha > 0.2) { g.ctx.globalAlpha = this.alpha; g.rect(r.x, r.y + 1, r.w, 1, '#ff86d6'); g.rect(this.dir > 0 ? r.x + r.w - 2 : r.x, r.y, 2, 3, '#ff86d6'); g.ctx.globalAlpha = 1; }
    if (this.stun > 0) drawStars(g, this.cx, this.y - 3, this.t);
  }
}

export { silhouette, T };
