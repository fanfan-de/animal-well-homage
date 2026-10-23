// 玩家：移动、跳跃、游泳、道具

import { Entity } from './entity';
import type { Ctx } from './types';
import { type Gfx, type Sprite, rasterize, silhouette } from '../engine/gfx';
import { makeBody, moveBody, rectHits, type Body } from './physics';
import { isHazard, isPlatform, isWater, T } from './tiletypes';
import { PAL } from './palette';
import * as A from './sprites';
import { PHYS, PLAYER_W, PLAYER_H, MAX_HEARTS, ITEM_ORDER, TILE, EGG_DOOR_COUNT, ROOM_W, ROOM_H, type ItemId } from './constants';
import { approach, rectsOverlap, sign } from '../engine/util';
import { Bubble, Disc, Firecracker } from './projectiles';
import { mechSprites } from './mechanisms';

let _spr: Record<string, Sprite> | null = null;
function spr(): Record<string, Sprite> {
  if (!_spr) _spr = Object.fromEntries(Object.entries(A.PLAYER).map(([k, v]) => [k, rasterize(v, PAL)]));
  return _spr;
}

export class Player extends Entity {
  override kind = 'player';
  body: Body;
  dir = 1;
  hearts = MAX_HEARTS;
  invuln = 0;
  anim = 0;
  items = new Set<ItemId>();
  item: ItemId | null = null;
  lanternOn = false;
  discOut = false;
  inWater = false;
  coyote = 0;
  jumpBuffer = 0;
  dropTimer = 0;
  useCooldown = 0;
  knock = 0;
  onBubble = false;
  yoyo: { t: number; dir: number; hits: Set<Entity> } | null = null;
  prevVy = 0;

  constructor(x: number, y: number) {
    super(x, y, PLAYER_W, PLAYER_H);
    this.body = makeBody(x, y, PLAYER_W, PLAYER_H);
  }

  setPos(x: number, y: number): void {
    const b = this.body;
    b.x = Math.round(x); b.y = Math.round(y); b.rx = b.ry = 0;
    this.x = b.x; this.y = b.y;
  }
  stop(): void { this.body.vx = 0; this.body.vy = 0; }

  selectNext(step: number): void {
    const owned = ITEM_ORDER.filter((i) => this.items.has(i));
    if (!owned.length) return;
    const idx = this.item ? owned.indexOf(this.item) : -1;
    this.item = owned[((idx + step) % owned.length + owned.length) % owned.length];
  }

  private platformUnder(c: Ctx): boolean {
    const b = this.body;
    if ((b.y + b.h) % TILE !== 0) return false;
    const ty = (b.y + b.h) / TILE;
    for (let tx = Math.floor(b.x / TILE); tx <= Math.floor((b.x + b.w - 1) / TILE); tx++) {
      if (isPlatform(c.tileAt(tx, ty))) return true;
    }
    return false;
  }

  override update(c: Ctx): void {
    const inp = c.input;
    const b = this.body;
    if (this.invuln > 0) this.invuln--;
    if (this.coyote > 0) this.coyote--;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.knock > 0) this.knock--;
    this.anim++;

    // 水
    const nowWater = isWater(c.tileAt(Math.floor(this.cx / TILE), Math.floor((b.y + 6) / TILE)));
    if (nowWater !== this.inWater) {
      c.sfx('splash');
      c.particles.burst(this.cx, b.y + (nowWater ? 0 : b.h), { n: 8, speed: 1.3, colors: ['#8df5ff', '#ffffff'], life: 20, grav: 0.1, angle: -Math.PI / 2, spread: 1.6 });
      if (nowWater) b.vy *= 0.4;
    }
    this.inWater = nowWater;

    // 横向
    const ax = this.knock > 0 ? 0 : inp.axisX();
    if (ax !== 0) this.dir = ax;
    const maxV = this.inWater ? PHYS.waterWalk : PHYS.walk;
    const acc = b.onGround || this.onBubble ? PHYS.accel : PHYS.airAccel;
    if (ax !== 0) b.vx = approach(b.vx, ax * maxV, acc);
    else b.vx = approach(b.vx, 0, b.onGround ? PHYS.decel : PHYS.airAccel * 0.5);

    // 跳跃
    if (inp.pressed('jump')) this.jumpBuffer = PHYS.buffer;
    if (b.onGround || this.onBubble) this.coyote = PHYS.coyote;
    if (this.inWater) {
      if (inp.pressed('jump')) {
        const headWater = isWater(c.tileAt(Math.floor(this.cx / TILE), Math.floor((b.y - 1) / TILE)));
        b.vy = headWater ? -PHYS.swimV : -PHYS.surfaceJumpV;
        c.sfx('swim');
        this.jumpBuffer = 0;
      }
      b.vy = Math.min(b.vy + PHYS.waterGravity, inp.down('down') ? 1.4 : PHYS.waterMaxFall);
    } else {
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        if (inp.down('down') && !this.onBubble && this.platformUnder(c) && !rectHits(b.x, b.y + 1, b.w, b.h, c.solidFor('player'))) {
          this.dropTimer = 10;
        } else {
          b.vy = -PHYS.jumpV;
          c.sfx('jump');
          c.particles.burst(this.cx, b.y + b.h, { n: 4, speed: 0.8, colors: ['#b8b4d8'], life: 12, angle: -Math.PI / 2, spread: 2 });
        }
        this.jumpBuffer = 0; this.coyote = 0; this.onBubble = false;
      }
      if (inp.released('jump') && b.vy < -PHYS.jumpCut) b.vy = -PHYS.jumpCut;
      b.vy = Math.min(b.vy + PHYS.gravity, PHYS.maxFall);
    }

    // 泡泡支撑
    this.onBubble = false;
    let ride: Bubble | null = null;
    if (b.vy >= 0) {
      for (const e of c.entities) {
        if (!(e instanceof Bubble) || e.dead) continue;
        const feet = b.y + b.h;
        if (rectsOverlap(b.x, 0, b.w, 1, e.x - 1, 0, e.w + 2, 1) && feet >= e.y - 6 && feet <= e.y + 9) { ride = e; break; }
      }
    }
    const wasGround = b.onGround;
    this.prevVy = b.vy;
    if (ride) {
      b.vy = 0; b.ry = 0;
      b.y = ride.y - b.h;
      ride.ridden++; ride.riddenThisFrame = true;
      this.onBubble = true;
      moveBody(b, { solid: c.solidFor('player'), platform: c.platformTest, dropThrough: this.dropTimer > 0 });
      b.onGround = true;
    } else {
      moveBody(b, { solid: c.solidFor('player'), platform: c.platformTest, dropThrough: this.dropTimer > 0 });
    }
    if (!wasGround && b.onGround && !ride && this.prevVy > 1.5) {
      c.sfx('land');
      c.particles.burst(this.cx, b.y + b.h, { n: 4, speed: 0.7, colors: ['#b8b4d8'], life: 10, angle: -Math.PI / 2, spread: 2.5 });
    }
    if (b.onGround && Math.abs(b.vx) > 0.5 && this.anim % 12 === 0) c.sfx('step');

    // 尖刺
    if (this.invuln === 0 && rectHits(b.x + 1, b.y + 1, b.w - 2, b.h - 2, (tx, ty) => isHazard(c.tileAt(tx, ty)))) {
      c.hurtPlayer(1, this.cx + (b.vx > 0 ? -4 : 4));
    }

    // 上锁的门 / 蛋门：碰到就试着开
    this.tryDoors(c);

    // 道具
    if (inp.pressed('cycle')) { this.selectNext(1); c.sfx('ui'); }
    if (inp.pressed('cycleBack')) { this.selectNext(-1); c.sfx('ui'); }
    (['item1', 'item2', 'item3', 'item4', 'item5'] as const).forEach((a, i) => {
      if (inp.pressed(a) && this.items.has(ITEM_ORDER[i])) { this.item = ITEM_ORDER[i]; c.sfx('ui'); }
    });
    if (inp.pressed('use') && this.useCooldown === 0) this.useItem(c);
    this.updateYoyo(c);

    this.x = b.x; this.y = b.y;

    // 光
    c.addLight({ x: this.cx, y: this.cy, r: 22, color: '#c8d0ff', a: 0.3 });
    if (this.lanternOn && this.items.has('lantern')) {
      c.addLight({ x: this.cx + this.dir * 4, y: this.cy, r: 92 + Math.sin(this.anim / 7) * 2, color: '#ffd9a0', a: 0.95 });
    }
  }

  private tryDoors(c: Ctx): void {
    const b = this.body;
    const checks: [number, number][] = [];
    const ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      checks.push([Math.floor((b.x - 1) / TILE), ty]);
      checks.push([Math.floor((b.x + b.w) / TILE), ty]);
    }
    for (const [tx, ty] of checks) {
      if (tx < 0 || tx >= ROOM_W || ty < 0 || ty >= ROOM_H) continue;
      const t = c.tileAt(tx, ty);
      if (t === T.LOCKED) {
        if (c.keys > 0) { c.keys--; c.breakTile(tx, ty); c.sfx('unlock'); c.banner('门开了', `还剩 ${c.keys} 把钥匙`); }
        else c.prompt('需要钥匙', tx * TILE + 4, ty * TILE - 6);
      } else if (t === T.EGGDOOR) {
        if (c.eggs >= EGG_DOOR_COUNT) { c.breakTile(tx, ty); c.sfx('unlock'); c.flash(0.3); c.banner('蛋之门开启', '收集的蛋回应了你'); }
        else c.prompt(`需要 ${EGG_DOOR_COUNT} 颗蛋（${c.eggs}/${EGG_DOOR_COUNT}）`, tx * TILE + 4, ty * TILE - 6);
      }
    }
  }

  private useItem(c: Ctx): void {
    const b = this.body;
    switch (this.item) {
      case 'firecracker':
        if (c.firecrackers <= 0) { c.sfx('denied'); c.banner('没有鞭炮了', '在红色木箱里补充'); this.useCooldown = 20; return; }
        c.firecrackers--;
        c.spawn(new Firecracker(this.cx - 1 + this.dir * 3, b.y, this.dir));
        c.sfx('fuse'); this.useCooldown = 14;
        break;
      case 'bubble':
        for (const e of c.entities) if (e instanceof Bubble) e.pop(c);
        c.spawn(new Bubble(this.cx - 5, b.y - 6));
        c.sfx('bubble'); this.useCooldown = 14;
        break;
      case 'disc':
        if (c.disc && !c.disc.dead) { (c.disc as Disc).recall(); }
        else if (c.input.down('down')) {
          // 按住下 + X：把飞盘放在脚边，让它滑过去（可以滑到栏杆后面的按钮上）
          const d = new Disc(this.cx - 4 + this.dir * 2, b.y + b.h - 3, this.dir);
          d.state = 'rest'; d.body.vx = 0.8 * this.dir;
          c.disc = d; this.discOut = true; c.spawn(d); c.sfx('discCatch');
        } else {
          const d = new Disc(this.cx - 4 + this.dir * 5, b.y + 3, this.dir);
          c.disc = d; this.discOut = true; c.spawn(d); c.sfx('disc');
        }
        this.useCooldown = 12;
        break;
      case 'lantern':
        this.lanternOn = !this.lanternOn; c.sfx('lantern'); this.useCooldown = 10;
        break;
      case 'yoyo':
        if (!this.yoyo) { this.yoyo = { t: 0, dir: this.dir, hits: new Set() }; c.sfx('yoyo'); }
        this.useCooldown = 6;
        break;
      default:
        break;
    }
  }

  private updateYoyo(c: Ctx): void {
    const y = this.yoyo;
    if (!y) return;
    y.t++;
    const len = y.t <= 7 ? y.t * 3 : (14 - y.t) * 3;
    const b = this.body;
    const r = { x: y.dir > 0 ? b.x + b.w : b.x - len, y: this.cy - 3, w: len, h: 6 };
    for (const e of c.entities) {
      if (e.dead || !e.onYoyo || y.hits.has(e)) continue;
      if (e.overlaps(r)) { y.hits.add(e); e.onYoyo(c); }
    }
    if (y.t >= 14) this.yoyo = null;
  }

  override draw(g: Gfx, c: Ctx): void {
    const s = spr();
    const b = this.body;
    let frame: Sprite;
    if (this.invuln > 60) frame = s.hurt;
    else if (this.inWater) frame = s.swim;
    else if (!b.onGround && !this.onBubble) frame = b.vy < 0 ? s.jump : s.fall;
    else if (Math.abs(b.vx) > 0.2) frame = [s.walk0, s.walk1, s.walk2, s.walk1][(this.anim >> 3) & 3];
    else frame = s.idle;
    const blink = this.invuln > 0 && ((c.frame >> 2) & 1) === 1;
    const sx = b.x - 1, sy = b.y;
    if (blink) g.sprite(silhouette(frame, '#ffffff'), sx, sy, this.dir < 0, 0.8);
    else g.sprite(frame, sx, sy, this.dir < 0);
    // 灯笼
    if (this.lanternOn && this.items.has('lantern')) {
      const lx = this.dir > 0 ? b.x + b.w : b.x - 6;
      g.sprite(mechSprites().icons.lantern, lx - 1, b.y + 1);
    }
    // 溜溜球
    if (this.yoyo) {
      const len = this.yoyo.t <= 7 ? this.yoyo.t * 3 : (14 - this.yoyo.t) * 3;
      const x0 = this.yoyo.dir > 0 ? b.x + b.w : b.x - 1;
      g.rect(this.yoyo.dir > 0 ? x0 : x0 - len, this.cy - 1, len, 1, '#f4f1ff');
      const tip = this.yoyo.dir > 0 ? x0 + len : x0 - len;
      g.rect(tip - 1, this.cy - 2, 3, 3, '#ff4f5e');
    }
  }
}

export { sign };
