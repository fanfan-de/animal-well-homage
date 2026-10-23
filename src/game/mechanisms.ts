// 机关与拾取物：按钮、拉杆、电话（存档点）、物品/蛋/钥匙/火焰、火焰基座

import { Entity } from './entity';
import type { Ctx } from './types';
import { type Gfx, type Sprite, rasterize } from '../engine/gfx';
import { hash2 } from '../engine/util';
import { PAL } from './palette';
import * as A from './sprites';
import { ITEM_INFO, FLAME_INFO, MAX_FIRECRACKERS, TOTAL_FLAMES, type ItemId, type FlameId } from './constants';

interface MechSprites { phone: Sprite; pedestal: Sprite; icons: Record<string, Sprite>; eggs: Sprite[]; flames: Sprite[]; }
let _spr: MechSprites | null = null;
export function mechSprites(): MechSprites {
  if (!_spr) {
    _spr = {
      phone: rasterize(A.PHONE, PAL),
      pedestal: rasterize(A.PEDESTAL, PAL),
      icons: Object.fromEntries(Object.entries(A.ICON).map(([k, v]) => [k, rasterize(v, PAL)])),
      eggs: A.EGG.map((e) => rasterize(e, PAL)),
      flames: A.FLAME.map((f) => rasterize(f, PAL)),
    };
  }
  return _spr;
}

/** 地板按钮：latch（按一次永久）或 hold（压住才有效） */
export class Button extends Entity {
  override kind = 'button';
  pressed = false;
  constructor(x: number, y: number, public id: number, public hold: boolean) { super(x, y + 2, 8, 6); }
  override init(c: Ctx): void { if (!this.hold && c.isDoorOpen(this.id)) this.pressed = true; }
  override update(c: Ctx): void {
    let down = c.player.overlaps(this);
    if (!down) for (const e of c.entities) if (e !== this && e.pressesButtons && !e.dead && e.overlaps(this)) { down = true; break; }
    if (this.hold) {
      if (down !== this.pressed) {
        this.pressed = down;
        c.setDoor(this.id, down);
        c.sfx(down ? 'button' : 'door');
      }
    } else if (down && !this.pressed) {
      this.pressed = true;
      c.setDoor(this.id, true);
      c.sfx('button'); c.sfx('door');
      c.particles.burst(this.cx, this.y + 4, { n: 6, speed: 1, colors: ['#ffe36e', '#ffffff'], life: 20, vy: -0.5 });
    }
  }
  override draw(g: Gfx): void {
    const col = this.hold ? '#4f8cff' : '#ff4f5e';
    g.rect(this.x, this.y + 4, 8, 2, '#707080');
    g.rect(this.x + 1, this.y + 4, 6, 1, '#c0c0c8');
    if (this.pressed) g.rect(this.x + 1, this.y + 3, 6, 1, col);
    else { g.rect(this.x + 1, this.y + 1, 6, 3, col); g.rect(this.x + 2, this.y + 1, 4, 1, '#ffffff'); }
  }
}

/** 拉杆：溜溜球或飞盘拨动 */
export class Lever extends Entity {
  override kind = 'lever';
  on = false;
  cooldown = 0;
  constructor(x: number, y: number, public id: number) { super(x, y, 8, 8); }
  override init(c: Ctx): void { this.on = c.isDoorOpen(this.id); }
  toggle(c: Ctx): void {
    if (this.cooldown > 0) return;
    this.cooldown = 24;
    this.on = !this.on;
    c.setDoor(this.id, this.on);
    c.sfx('lever'); c.sfx('door');
    c.particles.burst(this.cx, this.y + 2, { n: 5, speed: 1, colors: ['#ffffff', '#ffe36e'], life: 16 });
  }
  override onYoyo(c: Ctx): void { this.toggle(c); }
  override update(): void { if (this.cooldown > 0) this.cooldown--; }
  override draw(g: Gfx): void {
    g.rect(this.x + 1, this.y + 6, 6, 2, '#707080');
    g.rect(this.x + 3, this.y + 5, 2, 1, '#c0c0c8');
    const d = this.on ? 1 : -1;
    for (let i = 0; i < 4; i++) g.px(this.x + 3.5 + d * (i + 0.5) * 0.9, this.y + 5 - i, '#c0c0c8');
    g.rect(this.x + 3.5 + d * 3.5 - 1, this.y + 0.5, 2, 2, this.on ? '#74e08a' : '#ff4f5e');
  }
}

/** 电话：存档点 */
export class Phone extends Entity {
  override kind = 'phone';
  constructor(x: number, y: number) { super(x - 1, y - 4, 10, 12); }
  override update(c: Ctx): void {
    const lit = Math.floor(c.frame / 30) % 2 === 0;
    c.addLight({ x: this.cx, y: this.y + 2, r: lit ? 16 : 10, color: '#74e08a', a: lit ? 0.5 : 0.25 });
    if (!c.player.overlaps(this)) return;
    c.prompt('↑ 存档', this.cx, this.y - 8);
    if (c.input.pressed('up')) {
      c.save();
      c.sfx('save');
      c.banner('已存档', '生命值已恢复');
      c.particles.burst(this.cx, this.y, { n: 10, speed: 1.2, colors: ['#74e08a', '#ffffff'], life: 30, vy: -0.8 });
    }
  }
  override draw(g: Gfx, c: Ctx): void {
    g.sprite(mechSprites().phone, this.x, this.y);
    const lit = Math.floor(c.frame / 30) % 2 === 0;
    g.rect(this.x + 3, this.y + 2, 4, 1, lit ? '#b6ffc0' : '#2f8a4e');
  }
}

export type PickupType = 'item' | 'egg' | 'key' | 'flame' | 'crate';

export class Pickup extends Entity {
  override kind = 'pickup';
  t = 0;
  cooldown = 0;
  variant: number;
  constructor(x: number, y: number, public type: PickupType, public arg: string, public key: string) {
    super(x, y, 8, 8);
    this.variant = Math.floor(hash2(key.length, key.charCodeAt(0) + key.charCodeAt(key.length - 1), 5) * 4);
    if (type === 'egg') { this.x = x + 1; this.w = 6; }
    if (type === 'flame') { this.y = y - 3; this.h = 11; }
    if (type === 'key') { this.h = 5; this.y = y + 2; }
    this.t = Math.floor(hash2(x, y, 9) * 100);
  }
  override update(c: Ctx): void {
    this.t++;
    const bob = Math.sin(this.t / 20) * 1.5;
    switch (this.type) {
      case 'egg': c.addLight({ x: this.cx, y: this.cy + bob, r: 14, color: ['#ff86d6', '#8df5ff', '#ffe36e', '#74e08a'][this.variant], a: 0.5 }); break;
      case 'flame': { const f = FLAME_INFO[this.arg as FlameId]; c.addLight({ x: this.cx, y: this.cy + bob, r: 34 + Math.sin(this.t / 5) * 2, color: f.glow, a: 0.9 }); break; }
      case 'item': c.addLight({ x: this.cx, y: this.cy + bob, r: 18, color: '#ffffff', a: 0.45 }); break;
      case 'key': c.addLight({ x: this.cx, y: this.cy, r: 12, color: '#ffe36e', a: 0.4 }); break;
      case 'crate': break;
    }
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (!c.player.overlaps(this)) return;
    const p = c.particles;
    switch (this.type) {
      case 'item': {
        const id = this.arg as ItemId;
        c.giveItem(id); c.collect(this.key); this.dead = true;
        c.sfx('item'); c.flash(0.35);
        c.banner(`获得 ${ITEM_INFO[id].name}`, ITEM_INFO[id].hint);
        p.burst(this.cx, this.cy, { n: 18, speed: 2, colors: ['#ffffff', '#ffe36e', '#8df5ff'], life: 35, drag: 0.95 });
        break;
      }
      case 'egg':
        c.eggs++; c.collect(this.key); this.dead = true;
        c.sfx('egg');
        c.banner('找到一颗蛋', `已收集 ${c.eggs} 颗`);
        p.burst(this.cx, this.cy, { n: 14, speed: 1.5, colors: ['#ff86d6', '#8df5ff', '#ffe36e', '#ffffff'], life: 40, grav: 0.03, drag: 0.97 });
        break;
      case 'key':
        c.keys++; c.collect(this.key); this.dead = true;
        c.sfx('key');
        c.banner('拿到钥匙', '可以打开上锁的门');
        p.burst(this.cx, this.cy, { n: 8, speed: 1.2, colors: ['#ffe36e', '#ffffff'], life: 25 });
        break;
      case 'flame': {
        const id = this.arg as FlameId;
        c.flames.push(id); c.collect(this.key); this.dead = true;
        c.sfx('flame'); c.flash(0.5);
        const total = c.flames.length + c.placedFlames.length;
        c.banner(`获得 ${FLAME_INFO[id].name}`, `把火焰带回中央之井的基座（${total}/${TOTAL_FLAMES}）`);
        p.burst(this.cx, this.cy, { n: 30, speed: 2.5, colors: [FLAME_INFO[id].color, '#ffffff', FLAME_INFO[id].glow], life: 50, drag: 0.96 });
        break;
      }
      case 'crate':
        if (c.firecrackers >= MAX_FIRECRACKERS) { c.prompt('鞭炮已满', this.cx, this.y - 8); return; }
        c.firecrackers = Math.min(MAX_FIRECRACKERS, c.firecrackers + 3);
        if (!c.hasItem('firecracker')) { c.giveItem('firecracker'); c.banner(`获得 ${ITEM_INFO.firecracker.name}`, ITEM_INFO.firecracker.hint); c.sfx('item'); this.cooldown = 900; return; }
        this.cooldown = 900;
        c.sfx('pickup');
        c.banner('鞭炮 +3', `现在有 ${c.firecrackers} 个`);
        p.burst(this.cx, this.cy, { n: 6, speed: 1, colors: ['#ff4f5e', '#ffe36e'], life: 20, vy: -0.5 });
        break;
    }
  }
  override draw(g: Gfx): void {
    const s = mechSprites();
    const bob = Math.round(Math.sin(this.t / 20) * 1.5);
    switch (this.type) {
      case 'item': g.sprite(s.icons[this.arg], this.x, this.y + bob); break;
      case 'egg': g.sprite(s.eggs[this.variant], this.x, this.y + bob); break;
      case 'key': g.sprite(s.icons.key, this.x, this.y - 2 + bob); break;
      case 'flame': {
        const f = FLAME_INFO[this.arg as FlameId];
        const spr = s.flames[(this.t >> 3) & 1];
        g.sprite(spr, this.x, this.y + bob);
        // 用火焰颜色覆盖一层
        g.ctx.globalCompositeOperation = 'source-atop';
        g.ctx.globalAlpha = 0.55; g.ctx.fillStyle = f.color;
        g.ctx.fillRect(this.x, this.y + bob, 8, 9);
        g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'crate': g.sprite(s.icons.crate, this.x, this.y, false, this.cooldown > 0 ? 0.45 : 1); break;
    }
  }
}

/** 火焰基座（终局） */
export class Pedestal extends Entity {
  override kind = 'pedestal';
  t = 0;
  constructor(x: number, y: number) { super(x, y - 2, 32, 10); }
  slotX(i: number): number { return this.x + 4 + i * 8; }
  override update(c: Ctx): void {
    this.t++;
    c.placedFlames.forEach((id, i) => {
      const f = FLAME_INFO[id];
      c.addLight({ x: this.slotX(i), y: this.y - 2, r: 44 + Math.sin(this.t / 6 + i) * 3, color: f.glow, a: 0.9 });
      if (this.t % 6 === 0) c.particles.emit({ x: this.slotX(i) + (Math.random() - 0.5) * 4, y: this.y - 4, vy: -0.4, life: 25, color: f.color, size: 1 });
    });
    const zone = { x: this.x - 4, y: this.y - 12, w: this.w + 8, h: this.h + 12 };
    if (!c.player.overlaps(zone)) return;
    if (c.flames.length > 0) {
      c.prompt('↑ 放置火焰', this.cx, this.y - 16);
      if (c.input.pressed('up')) {
        while (c.flames.length) c.placedFlames.push(c.flames.shift() as FlameId);
        c.sfx('flame'); c.flash(0.6); c.shake(3);
        c.particles.burst(this.cx, this.y, { n: 40, speed: 3, colors: ['#ffffff', '#ffe36e', '#8df5ff', '#ff86d6'], life: 60, drag: 0.96 });
        if (c.placedFlames.length >= TOTAL_FLAMES) c.startEnding();
        else c.banner(`火焰已放置 ${c.placedFlames.length}/${TOTAL_FLAMES}`, '井底仍在等待其余的火焰');
      }
    } else if (c.placedFlames.length < TOTAL_FLAMES) {
      c.prompt(`需要四团火焰（${c.placedFlames.length}/${TOTAL_FLAMES}）`, this.cx, this.y - 16);
    }
  }
  override draw(g: Gfx, c: Ctx): void {
    const s = mechSprites();
    g.sprite(s.pedestal, this.x, this.y);
    c.placedFlames.forEach((id, i) => {
      const f = FLAME_INFO[id];
      const spr = s.flames[((this.t >> 3) + i) & 1];
      const fx = this.slotX(i) - 4, fy = this.y - 7;
      g.sprite(spr, fx, fy);
      g.ctx.globalCompositeOperation = 'source-atop';
      g.ctx.globalAlpha = 0.55; g.ctx.fillStyle = f.color; g.ctx.fillRect(fx, fy, 8, 9);
      g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
    });
  }
}
