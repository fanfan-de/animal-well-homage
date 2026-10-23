// 游戏主类：状态机、房间加载与转场、渲染合成、HUD、存档

import { Gfx, makeCanvas, ctx2d, rasterize, type Sprite } from '../engine/gfx';
import { Input } from '../engine/input';
import { Audio } from '../engine/audio';
import { Particles } from '../engine/particles';
import { Rng, clamp, rgba, hash2, sign } from '../engine/util';
import {
  VIEW_W, VIEW_H, ROOM_W, ROOM_H, TILE, WORLD_COLS, WORLD_ROWS, MAX_HEARTS, REGION, ITEM_INFO, ITEM_ORDER, FLAME_INFO,
  TOTAL_FLAMES, type ItemId, type FlameId,
} from './constants';
import { T, blocks, isPlatform, isWater, isWallLike, type Who } from './tiletypes';
import { buildTileset, buildBackground, wallMask, type Tileset } from './tiles';
import { parseRoom, type RoomDef, type Spawn, type ParsedRoom } from './roomdef';
import { roomAt, allRooms, START_ROOM } from './world';
import { Entity } from './entity';
import { Player } from './player';
import { Button, Lever, Phone, Pickup, Pedestal, mechSprites, type PickupType } from './mechanisms';
import { Dog, Snail, Ostrich, GhostCat, Bird, Fish, Seahorse, Chameleon } from './animals';
import { Bubble } from './projectiles';
import { Lighting } from './lighting';
import { Overlay } from './hud';
import { loadSave, writeSave, type SaveData } from './save';
import type { Ctx, Light } from './types';
import { rectHits, unstick, type TileTest } from './physics';
import { PAL } from './palette';
import * as A from './sprites';

type State = 'title' | 'play' | 'map' | 'pause' | 'ending' | 'dead';
interface Banner { text: string; sub?: string; t: number; }
interface Transition { dx: number; dy: number; t: number; snap: HTMLCanvasElement; }
interface LightTile { x: number; y: number; kind: number; seed: number; }
type Enter = 'spawn' | 'phone' | 'left' | 'right' | 'top' | 'bottom';

const TRANSITION_FRAMES = 14;
export const TOTAL_EGGS = 12;

export class Game implements Ctx {
  gfx: Gfx;
  overlay: Overlay;
  lighting = new Lighting();
  snapCanvas = makeCanvas(VIEW_W, VIEW_H);
  input: Input;
  audio = new Audio();
  particles = new Particles();
  rng = new Rng(20240509);
  frame = 0;
  state: State = 'title';
  noLight = false;

  // 房间
  roomCol = 0; roomRow = 0;
  def!: RoomDef;
  tiles: Uint8Array = new Uint8Array(ROOM_W * ROOM_H);
  doorIds: Uint8Array = new Uint8Array(ROOM_W * ROOM_H);
  spawns: Spawn[] = [];
  tileset!: Tileset;
  bg!: HTMLCanvasElement;
  lightTiles: LightTile[] = [];
  entities: Entity[] = [];
  player: Player;
  disc: Entity | null = null;
  lights: Light[] = [];
  lastLights: Light[] = [];
  private parsedCache = new Map<string, ParsedRoom>();

  // 进度
  eggs = 0; keys = 0; firecrackers = 0;
  flames: FlameId[] = []; placedFlames: FlameId[] = [];
  collected = new Set<string>();
  doorState = new Map<string, boolean>();
  broken = new Set<string>();
  visited = new Set<string>();
  deaths = 0; playTime = 0;
  lastPhone = { col: START_ROOM.col, row: START_ROOM.row, x: 0, y: 0 };

  // 表现
  banners: Banner[] = [];
  promptText: { text: string; x: number; y: number } | null = null;
  roomNameT = 0;
  flashA = 0; shakeT = 0; shakeAmt = 0;
  transition: Transition | null = null;
  deathT = 0; endingT = 0;
  titleSel = 0; hasSave = false; titleT = 0;
  private solidCache = new Map<Who, TileTest>();
  platformTest: TileTest = (tx, ty) => isPlatform(this.tileAt(tx, ty));
  private hudSpr: { heart: Sprite; heartEmpty: Sprite; egg: Sprite; flame: Sprite } | null = null;

  constructor(gameCanvas: HTMLCanvasElement, uiCanvas: HTMLCanvasElement, win: Window | null) {
    gameCanvas.width = VIEW_W; gameCanvas.height = VIEW_H;
    this.gfx = new Gfx(gameCanvas);
    this.overlay = new Overlay(uiCanvas);
    this.input = new Input(win);
    this.input.onFirstInteraction = () => this.audio.init();
    this.player = new Player(0, 0);
    this.hasSave = !!loadSave();
  }

  // ---------- Ctx ----------
  get roomId(): string { return `${this.roomCol},${this.roomRow}`; }
  get ambient(): number { return this.def?.ambient ?? REGION[this.def?.region ?? 'hub'].ambient; }
  get dark(): boolean { return this.ambient < 0.2; }
  get frozen(): boolean { return this.transition !== null || this.state !== 'play'; }

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return T.EMPTY;
    return this.tiles[ty * ROOM_W + tx];
  }
  setTile(tx: number, ty: number, t: number): void {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return;
    this.tiles[ty * ROOM_W + tx] = t;
  }
  solidFor(who: Who): TileTest {
    let f = this.solidCache.get(who);
    if (!f) { f = (tx, ty) => blocks(this.tileAt(tx, ty), who); this.solidCache.set(who, f); }
    return f;
  }
  rectSolid(x: number, y: number, w: number, h: number, who: Who): boolean { return rectHits(x, y, w, h, this.solidFor(who)); }
  addLight(l: Light): void { this.lights.push(l); }
  spawn(e: Entity): void { this.entities.push(e); e.init?.(this); }
  sfx(n: Parameters<Audio['play']>[0]): void { this.audio.play(n); }
  doorKey(id: number): string { return `${this.roomId}:${id}`; }
  isDoorOpen(id: number): boolean { return this.doorState.get(this.doorKey(id)) === true; }
  setDoor(id: number, open: boolean): void {
    this.doorState.set(this.doorKey(id), open);
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.doorIds[i] !== id) continue;
      this.tiles[i] = open ? T.EMPTY : T.DOOR;
      const tx = i % ROOM_W, ty = Math.floor(i / ROOM_W);
      this.particles.burst(tx * TILE + 4, ty * TILE + 4, { n: 3, speed: 0.6, colors: ['#c0c0c8'], life: 15 });
    }
    if (!open) unstick(this.player.body, this.solidFor('player'));
  }
  /** 打碎/打开一块砖；锁门、蛋门、裂墙会连同相邻的同类砖一起打开 */
  breakTile(tx: number, ty: number): void {
    const t = this.tileAt(tx, ty);
    const group: [number, number][] = [[tx, ty]];
    const seen = new Set<string>([`${tx},${ty}`]);
    if (t === T.LOCKED || t === T.EGGDOOR || t === T.BREAK) {
      for (let i = 0; i < group.length; i++) {
        const [gx, gy] = group[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + dx, ny = gy + dy, k = `${nx},${ny}`;
          if (!seen.has(k) && this.tileAt(nx, ny) === t) { seen.add(k); group.push([nx, ny]); }
        }
      }
    }
    for (const [gx, gy] of group) {
      this.setTile(gx, gy, T.EMPTY);
      this.broken.add(`${this.roomId}:${gx},${gy}`);
      this.particles.burst(gx * TILE + 4, gy * TILE + 4, { n: 8, speed: 1.5, colors: [REGION[this.def.region].wallLight, '#c0c0c8'], life: 30, grav: 0.1 });
    }
    if (t === T.BREAK) this.sfx('break');
  }
  hurtPlayer(dmg: number, fromX: number): void {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'play' || this.transition) return;
    p.hearts -= dmg;
    p.invuln = 90; p.knock = 14;
    p.body.vx = (sign(p.cx - fromX) || 1) * 2.2;
    p.body.vy = -2.2;
    this.sfx('hurt'); this.shake(3); this.flashA = Math.max(this.flashA, 0.15);
    this.particles.burst(p.cx, p.cy, { n: 8, speed: 1.5, colors: ['#ff4f5e', '#ffffff'], life: 20 });
    if (p.hearts <= 0) this.die();
  }
  banner(text: string, sub?: string): void {
    if (this.banners.length && this.banners[this.banners.length - 1].text === text) return;
    if (this.banners.length > 3) this.banners.shift();
    this.banners.push({ text, sub, t: 0 });
  }
  prompt(text: string, x: number, y: number): void { this.promptText = { text, x, y }; }
  flash(a: number): void { this.flashA = Math.max(this.flashA, a); }
  shake(amount: number): void { this.shakeT = 12; this.shakeAmt = amount; }
  hasItem(id: ItemId): boolean { return this.player.items.has(id); }
  giveItem(id: ItemId): void { this.player.items.add(id); this.player.item = id; if (id === 'firecracker') this.firecrackers = Math.max(this.firecrackers, 3); }
  collect(key: string): boolean { if (this.collected.has(key)) return false; this.collected.add(key); return true; }
  isCollected(key: string): boolean { return this.collected.has(key); }
  pickupKey(s: Spawn): string { return `${this.roomId}:${s.tx},${s.ty}`; }
  lightLevelAt(x: number, y: number): number { return Lighting.levelAt(this.lastLights, this.ambient, x, y); }
  startEnding(): void { this.state = 'ending'; this.endingT = 0; this.sfx('ending'); this.save(); }

  // ---------- 流程 ----------
  newGame(): void {
    this.eggs = 0; this.keys = 0; this.firecrackers = 0;
    this.flames = []; this.placedFlames = [];
    this.collected.clear(); this.doorState.clear(); this.broken.clear(); this.visited.clear();
    this.deaths = 0; this.playTime = 0;
    this.player = new Player(0, 0);
    this.banners = [];
    this.loadRoom(START_ROOM.col, START_ROOM.row, 'spawn');
    this.lastPhone = { col: START_ROOM.col, row: START_ROOM.row, x: this.player.x, y: this.player.y };
    this.state = 'play';
    this.banner('动物井', '方向键移动 · Z 跳跃 · X 使用道具');
  }

  continueGame(d: SaveData): void {
    this.newGame();
    this.eggs = d.eggs; this.keys = d.keys; this.firecrackers = d.firecrackers;
    this.flames = [...d.flames]; this.placedFlames = [...d.placed];
    this.collected = new Set(d.collected); this.doorState = new Map(d.doors); this.broken = new Set(d.broken); this.visited = new Set(d.visited);
    this.deaths = d.deaths; this.playTime = d.time;
    for (const it of d.items) this.player.items.add(it);
    this.player.item = d.selected;
    this.player.hearts = MAX_HEARTS;
    this.lastPhone = { col: d.room[0], row: d.room[1], x: d.pos[0], y: d.pos[1] };
    this.loadRoom(d.room[0], d.room[1], 'phone');
    this.banners = [];
    this.banner('继续旅程', REGION[this.def.region].name);
  }

  save(): void {
    this.lastPhone = { col: this.roomCol, row: this.roomRow, x: this.player.x, y: this.player.y };
    this.player.hearts = MAX_HEARTS;
    const d: SaveData = {
      version: 1,
      room: [this.roomCol, this.roomRow], pos: [this.player.x, this.player.y],
      items: [...this.player.items], selected: this.player.item,
      eggs: this.eggs, keys: this.keys, firecrackers: this.firecrackers,
      flames: [...this.flames], placed: [...this.placedFlames],
      collected: [...this.collected], doors: [...this.doorState.entries()], broken: [...this.broken], visited: [...this.visited],
      deaths: this.deaths, time: this.playTime, hearts: this.player.hearts,
    };
    this.hasSave = writeSave(d);
  }

  die(): void {
    this.state = 'dead'; this.deathT = 0; this.deaths++;
    this.sfx('death'); this.shake(6);
    this.particles.burst(this.player.cx, this.player.cy, { n: 24, speed: 2.5, colors: ['#f4f1ff', '#b8b4d8', '#ff4f5e'], life: 50, grav: 0.05, drag: 0.97 });
  }

  /** 调试：直接进入某房间并给道具 */
  debugStart(col: number, row: number, opts: { x?: number; y?: number; items?: string; hearts?: number; eggs?: number; keys?: number; flames?: string }): void {
    this.newGame();
    if (opts.items === 'all') for (const it of ITEM_ORDER) this.giveItem(it);
    else if (opts.items) for (const it of opts.items.split(',')) if (ITEM_ORDER.includes(it as ItemId)) this.giveItem(it as ItemId);
    if (this.player.items.has('firecracker')) this.firecrackers = 6;
    if (opts.eggs !== undefined) this.eggs = opts.eggs;
    if (opts.keys !== undefined) this.keys = opts.keys;
    if (opts.flames === 'all') this.flames = ['seahorse', 'dog', 'ostrich', 'chameleon'];
    this.player.item = ITEM_ORDER.find((i) => this.player.items.has(i)) ?? null;
    if (roomAt(col, row)) {
      this.loadRoom(col, row, 'spawn');
      if (opts.x !== undefined && opts.y !== undefined) { this.player.setPos(opts.x, opts.y); unstick(this.player.body, this.solidFor('player')); }
    }
    this.banners = [];
    this.transition = null;
  }

  /** 调试/测试：当前状态摘要 */
  debugState(): Record<string, unknown> {
    const p = this.player;
    const pick = (e: Entity): Record<string, unknown> => {
      const o: Record<string, unknown> = { kind: e.kind, x: e.x, y: e.y };
      for (const k of ['state', 'vanish', 'stun', 'scared', 'pressed', 'on', 'life', 'ridden', 'alpha', 'tongue']) {
        const v = (e as unknown as Record<string, unknown>)[k];
        if (v !== undefined && typeof v !== 'object') o[k] = v;
      }
      return o;
    };
    return {
      state: this.state, room: this.roomId, x: p.x, y: p.y, vx: +p.body.vx.toFixed(2), vy: +p.body.vy.toFixed(2),
      onGround: p.body.onGround, onBubble: p.onBubble, inWater: p.inWater, hearts: p.hearts, deaths: this.deaths,
      items: [...p.items], item: p.item, lanternOn: p.lanternOn, eggs: this.eggs, keys: this.keys, firecrackers: this.firecrackers,
      flames: [...this.flames], placed: [...this.placedFlames],
      doors: [...this.doorState.entries()].filter(([, v]) => v).map(([k]) => k), broken: [...this.broken],
      lastPhone: this.lastPhone, banners: this.banners.map((b) => b.text), visited: [...this.visited],
      entities: this.entities.map(pick),
    };
  }

  private parsed(def: RoomDef): ParsedRoom {
    let p = this.parsedCache.get(def.id);
    if (!p) { p = parseRoom(def); this.parsedCache.set(def.id, p); }
    return p;
  }

  loadRoom(col: number, row: number, enter: Enter): void {
    const def = roomAt(col, row);
    if (!def) throw new Error(`no room at ${col},${row}`);
    this.def = def; this.roomCol = col; this.roomRow = row;
    const parsed = this.parsed(def);
    this.tiles = new Uint8Array(parsed.tiles);
    this.doorIds = parsed.doorIds;
    this.spawns = parsed.spawns;
    this.tileset = buildTileset(def.region);
    this.bg = buildBackground(def.region, col * 7 + row);
    this.solidCache.clear();
    this.entities = [];
    this.disc = null;
    this.player.discOut = false; this.player.yoyo = null; this.player.onBubble = false;
    this.lights = []; this.lastLights = [];
    this.particles.clear();
    this.promptText = null;

    // 永久状态：碎掉的砖、开着的门
    for (let i = 0; i < this.tiles.length; i++) {
      const tx = i % ROOM_W, ty = Math.floor(i / ROOM_W);
      if (this.broken.has(`${this.roomId}:${tx},${ty}`)) this.tiles[i] = T.EMPTY;
      if (this.doorIds[i] && this.doorState.get(this.doorKey(this.doorIds[i]))) this.tiles[i] = T.EMPTY;
    }
    // 光源地砖
    this.lightTiles = [];
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t === T.CANDLE || t === T.MUSHROOM) this.lightTiles.push({ x: (i % ROOM_W) * TILE + 4, y: Math.floor(i / ROOM_W) * TILE + (t === T.CANDLE ? 2 : 4), kind: t, seed: i });
    }
    // 实体
    let spawnPos: { x: number; y: number } | null = null;
    for (const s of parsed.spawns) {
      const e = this.makeEntity(s);
      if (e) this.entities.push(e);
      if (s.kind === 'spawn') spawnPos = { x: s.x + 1, y: s.y - 2 };
    }
    // hold 按钮的门：进房间时一律关上
    for (const e of this.entities) if (e instanceof Button && e.hold) { this.doorState.set(this.doorKey(e.id), false); for (let i = 0; i < this.tiles.length; i++) if (this.doorIds[i] === e.id) this.tiles[i] = T.DOOR; }
    for (const e of this.entities) e.init?.(this);

    // 玩家位置
    const p = this.player, b = p.body;
    switch (enter) {
      case 'spawn': if (spawnPos) p.setPos(spawnPos.x, spawnPos.y); else p.setPos(VIEW_W / 2, VIEW_H / 2); p.stop(); break;
      case 'phone': p.setPos(this.lastPhone.x, this.lastPhone.y); p.stop(); break;
      case 'left': p.setPos(1, b.y); break;
      case 'right': p.setPos(VIEW_W - b.w - 1, b.y); break;
      case 'top': p.setPos(b.x, 0); break;
      case 'bottom': p.setPos(b.x, VIEW_H - b.h - 1); break;
    }
    unstick(b, this.solidFor('player'));
    p.x = b.x; p.y = b.y;
    this.visited.add(this.roomId);
    this.roomNameT = 160;
    this.audio.setRegion(def.region);
  }

  private makeEntity(s: Spawn): Entity | null {
    const key = this.pickupKey(s);
    switch (s.kind) {
      case 'button': return new Button(s.x, s.y, parseInt(s.arg || '1', 10), false);
      case 'hold': return new Button(s.x, s.y, parseInt(s.arg || '1', 10), true);
      case 'lever': return new Lever(s.x, s.y, parseInt(s.arg || '1', 10));
      case 'phone': return new Phone(s.x, s.y);
      case 'pedestal': return new Pedestal(s.x, s.y);
      case 'item': case 'egg': case 'key': case 'flame':
        if (this.collected.has(key)) return null;
        return new Pickup(s.x, s.y, s.kind as PickupType, s.arg, key);
      case 'crate': return new Pickup(s.x, s.y, 'crate', '', key);
      case 'ghostcat': return new GhostCat(s.x, s.y);
      case 'dog': return new Dog(s.x, s.y);
      case 'bird': return new Bird(s.x, s.y);
      case 'snail': return new Snail(s.x, s.y);
      case 'fish': return new Fish(s.x, s.y);
      case 'seahorse': return new Seahorse(s.x, s.y);
      case 'chameleon': return new Chameleon(s.x, s.y);
      case 'ostrich': return new Ostrich(s.x, s.y);
      default: return null;
    }
  }

  // ---------- 更新 ----------
  update(): void {
    this.input.beginFrame();
    this.frame++;
    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'play': this.updatePlay(); break;
      case 'map':
        if (this.input.pressed('map') || this.input.pressed('pause') || this.input.pressed('confirm') || this.input.pressed('jump')) { this.state = 'play'; this.sfx('ui'); }
        break;
      case 'pause':
        if (this.input.pressed('pause') || this.input.pressed('confirm') || this.input.pressed('jump')) { this.state = 'play'; this.sfx('ui'); }
        else if (this.input.pressed('map')) { this.state = 'map'; this.sfx('ui'); }
        break;
      case 'dead':
        this.deathT++;
        this.particles.update();
        if (this.deathT > 80) {
          this.player.hearts = MAX_HEARTS;
          this.player.invuln = 60;
          this.loadRoom(this.lastPhone.col, this.lastPhone.row, 'phone');
          this.state = 'play';
          this.flash(0.5);
        }
        break;
      case 'ending':
        this.endingT++;
        this.particles.update();
        if (this.endingT % 4 === 0) this.particles.emit({ x: Math.random() * VIEW_W, y: VIEW_H + 2, vy: -0.6 - Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.3, life: 200, color: ['#ffe36e', '#8df5ff', '#ff86d6', '#74e08a'][Math.floor(Math.random() * 4)], blink: true });
        if (this.endingT > 420 && this.input.anyPressed) { this.state = 'title'; this.titleT = 0; }
        break;
    }
    this.audio.update(1 / 60, this.state === 'play' ? 1 : 0.5);
    this.input.endFrame();
  }

  private updateTitle(): void {
    this.titleT++;
    if (this.titleT % 10 === 0) this.particles.emit({ x: Math.random() * VIEW_W, y: 60 + Math.random() * 110, vx: (Math.random() - 0.5) * 0.2, vy: -0.15 - Math.random() * 0.2, life: 160, color: Math.random() < 0.5 ? '#8df5ff' : '#ffe36e', blink: true });
    this.particles.update();
    const inp = this.input;
    if (this.hasSave && (inp.pressed('up') || inp.pressed('down'))) { this.titleSel = 1 - this.titleSel; this.sfx('ui'); }
    if (inp.pressed('confirm') || inp.pressed('jump') || inp.pressed('use')) {
      this.sfx('item');
      const d = this.hasSave ? loadSave() : null;
      if (d && this.titleSel === 0) this.continueGame(d); else this.newGame();
      this.particles.clear();
    }
  }

  private updatePlay(): void {
    const inp = this.input;
    if (this.transition) {
      this.transition.t++;
      if (this.transition.t >= TRANSITION_FRAMES) this.transition = null;
      return;
    }
    if (inp.pressed('pause')) { this.state = 'pause'; this.sfx('ui'); return; }
    if (inp.pressed('map')) { this.state = 'map'; this.sfx('ui'); return; }
    this.playTime++;
    this.lights = [];
    this.promptText = null;
    // 固定光源
    for (const lt of this.lightTiles) {
      if (lt.kind === T.CANDLE) this.addLight({ x: lt.x, y: lt.y, r: 30 + Math.sin(this.frame / 5 + lt.seed) * 3, color: '#ffb060', a: 0.75 });
      else this.addLight({ x: lt.x, y: lt.y, r: 15 + Math.sin(this.frame / 9 + lt.seed) * 2, color: '#8df5ff', a: 0.45 });
    }
    for (const e of this.entities) if (!e.dead) e.update(this);
    this.player.update(this);
    if (this.state !== 'play') return;
    this.entities = this.entities.filter((e) => !e.dead);
    if (this.disc && this.disc.dead) this.disc = null;
    this.checkExits();
    this.particles.update();
    // 环境粒子
    if (this.frame % 40 === 0 && this.ambient > 0.2) {
      this.particles.emit({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, vx: (Math.random() - 0.5) * 0.15, vy: -0.05 - Math.random() * 0.1, life: 180, color: this.def.region === 'west' ? '#8df5ff' : '#b8b4d8', blink: true });
    }
    if (this.banners.length) { this.banners[0].t++; if (this.banners[0].t > 230) this.banners.shift(); }
    if (this.roomNameT > 0) this.roomNameT--;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.04);
    if (this.shakeT > 0) this.shakeT--;
    this.lastLights = this.lights;
  }

  private checkExits(): void {
    const b = this.player.body;
    const cx = b.x + b.w / 2;
    if (cx < 0) this.goRoom(-1, 0, 'right');
    else if (cx > VIEW_W) this.goRoom(1, 0, 'left');
    else if (b.y + b.h <= 0 && b.vy < 0) this.goRoom(0, -1, 'bottom');
    else if (b.y >= VIEW_H - 2) this.goRoom(0, 1, 'top');
  }

  private goRoom(dc: number, dr: number, enter: Enter): void {
    const nc = this.roomCol + dc, nr = this.roomRow + dr;
    const b = this.player.body;
    if (!roomAt(nc, nr)) {
      if (dc < 0) b.x = 0; if (dc > 0) b.x = VIEW_W - b.w;
      if (dr < 0) { b.y = Math.max(b.y, 0); b.vy = Math.max(0, b.vy); }
      if (dr > 0) { b.y = VIEW_H - b.h; b.vy = 0; b.onGround = true; }
      this.player.x = b.x; this.player.y = b.y;
      return;
    }
    // 快照当前画面
    const sctx = ctx2d(this.snapCanvas);
    sctx.drawImage(this.gfx.canvas, 0, 0);
    this.loadRoom(nc, nr, enter);
    this.transition = { dx: dc, dy: dr, t: 0, snap: this.snapCanvas };
  }

  // ---------- 绘制 ----------
  draw(): void {
    const g = this.gfx;
    this.overlay.clear();
    switch (this.state) {
      case 'title': this.drawTitle(); break;
      case 'play': case 'pause': case 'dead':
        this.drawScene(); this.drawHud();
        if (this.state === 'pause') this.drawPause();
        if (this.state === 'dead') { g.rect(0, 0, VIEW_W, VIEW_H, rgba('#000000', Math.min(0.8, this.deathT / 60))); }
        break;
      case 'map': this.drawScene(); this.drawMap(); break;
      case 'ending': this.drawEnding(); break;
    }
  }

  private drawScene(): void {
    const g = this.gfx, ctx = g.ctx;
    const st = REGION[this.def.region];
    ctx.save();
    if (this.shakeT > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.shakeAmt), Math.round((Math.random() - 0.5) * this.shakeAmt));
    g.clear(st.bgDark);
    const px = (this.player.cx / VIEW_W - 0.5) * -8, py = (this.player.cy / VIEW_H - 0.5) * -6;
    g.image(this.bg, px - 8, py - 8);
    this.drawTiles();
    const sorted = [...this.entities].sort((a, b) => a.layer - b.layer);
    for (const e of sorted) if (!e.dead) e.draw(g, this);
    if (this.state !== 'dead') this.player.draw(g, this);
    this.drawWater();
    this.particles.draw(g);
    if (!this.noLight) {
      const lc = this.lighting.render(this.lights, this.ambient, st.ambientTint);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(lc, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.drawImage(lc, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flashA > 0) g.rect(0, 0, VIEW_W, VIEW_H, rgba('#ffffff', this.flashA));
    ctx.restore();
    if (this.transition) {
      const tr = this.transition;
      const p = Math.min(1, tr.t / TRANSITION_FRAMES);
      const e = 1 - Math.pow(1 - p, 3);
      const tmp = makeCanvas(VIEW_W, VIEW_H);
      ctx2d(tmp).drawImage(g.canvas, 0, 0);
      g.clear('#000000');
      g.image(tr.snap, -tr.dx * VIEW_W * e, -tr.dy * VIEW_H * e);
      g.image(tmp, tr.dx * VIEW_W * (1 - e), tr.dy * VIEW_H * (1 - e));
    }
  }

  private drawTiles(): void {
    const g = this.gfx, ts = this.tileset;
    const isWall = (tx: number, ty: number) => {
      if (tx < 0 || tx >= ROOM_W || ty < 0 || ty >= ROOM_H) return true;
      return isWallLike(this.tiles[ty * ROOM_W + tx]);
    };
    for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
      const i = ty * ROOM_W + tx;
      const t = this.tiles[i];
      const x = tx * TILE, y = ty * TILE;
      switch (t) {
        case T.EMPTY:
          if (this.doorIds[i]) g.sprite(ts.doorOpen, x, y);
          break;
        case T.WALL: case T.FAKE: {
          const m = wallMask(isWall, tx, ty);
          g.sprite(ts.wall[m * 2 + (hash2(tx, ty, 3) < 0.5 ? 0 : 1)], x, y);
          break;
        }
        case T.PLATFORM: g.sprite(ts.platform, x, y); break;
        case T.SPIKE_U: g.sprite(ts.spikes[0], x, y); break;
        case T.SPIKE_D: g.sprite(ts.spikes[1], x, y); break;
        case T.SPIKE_L: g.sprite(ts.spikes[2], x, y); break;
        case T.SPIKE_R: g.sprite(ts.spikes[3], x, y); break;
        case T.BARS: g.sprite(ts.bars, x, y); break;
        case T.BREAK: g.sprite(ts.breakable, x, y); break;
        case T.DOOR: g.sprite(ts.door, x, y); break;
        case T.LOCKED: g.sprite(ts.locked, x, y); break;
        case T.EGGDOOR: g.sprite(ts.eggdoor, x, y); break;
        case T.GRASS: g.sprite(ts.grass[hash2(tx, ty, 4) < 0.5 ? 0 : 1], x, y); break;
        case T.PEBBLE: g.sprite(ts.pebble[hash2(tx, ty, 4) < 0.5 ? 0 : 1], x, y); break;
        case T.MUSHROOM: g.sprite(ts.mushroom, x, y); break;
        case T.CANDLE: {
          g.sprite(ts.candle, x, y);
          const f = (this.frame >> 2) + tx;
          g.rect(x + 3, y + (f & 1), 2, 2, '#ffe36e');
          g.px(x + 3 + (f & 1), y - 1 + (f & 1), '#ffa040');
          break;
        }
        case T.WATER: break;
      }
    }
  }

  private drawWater(): void {
    const g = this.gfx;
    g.ctx.fillStyle = 'rgba(40,110,255,0.33)';
    for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
      if (this.tiles[ty * ROOM_W + tx] !== T.WATER) continue;
      g.ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
    for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
      if (this.tiles[ty * ROOM_W + tx] !== T.WATER || isWater(this.tileAt(tx, ty - 1))) continue;
      for (let x = 0; x < TILE; x++) {
        const wx = tx * TILE + x;
        const wy = ty * TILE + Math.round(Math.sin(wx / 5 + this.frame / 9) * 1);
        g.px(wx, wy, 'rgba(180,230,255,0.7)');
      }
    }
  }

  private hud() {
    if (!this.hudSpr) this.hudSpr = { heart: rasterize(A.ICON.heart, PAL), heartEmpty: rasterize(A.ICON.heartEmpty, PAL), egg: rasterize(A.EGG[0], PAL), flame: rasterize(A.FLAME[0], PAL) };
    return this.hudSpr;
  }

  private drawHud(): void {
    const g = this.gfx, ov = this.overlay, s = this.hud();
    const p = this.player;
    for (let i = 0; i < MAX_HEARTS; i++) g.sprite(i < p.hearts ? s.heart : s.heartEmpty, 4 + i * 9, 4);
    if (this.eggs > 0) { g.sprite(s.egg, 4, 13); ov.text(`× ${this.eggs}`, 12, 12.5, { size: 6 }); }
    if (this.keys > 0) { g.sprite(mechSprites().icons.key, VIEW_W - 28, 4); ov.text(`× ${this.keys}`, VIEW_W - 19, 3.5, { size: 6 }); }
    this.flames.forEach((f, i) => {
      g.sprite(s.flame, VIEW_W - 12 - i * 9, 12);
      g.ctx.globalCompositeOperation = 'source-atop';
      g.ctx.globalAlpha = 0.6; g.ctx.fillStyle = FLAME_INFO[f].color; g.ctx.fillRect(VIEW_W - 12 - i * 9, 12, 8, 9);
      g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
    });
    // 道具框
    if (p.item) {
      g.rect(3, VIEW_H - 16, 14, 13, 'rgba(0,0,0,0.55)');
      g.rect(3, VIEW_H - 16, 14, 1, 'rgba(255,255,255,0.25)');
      g.sprite(mechSprites().icons[p.item], 6, VIEW_H - 13);
      const info = ITEM_INFO[p.item];
      ov.text(info.name + (p.item === 'firecracker' ? ` × ${this.firecrackers}` : p.item === 'lantern' ? (p.lanternOn ? ' · 亮' : ' · 灭') : ''), 20, VIEW_H - 14.5, { size: 6.5 });
      const owned = ITEM_ORDER.filter((i) => p.items.has(i));
      if (owned.length > 1) ov.text(`C 切换 (${owned.indexOf(p.item) + 1}/${owned.length})`, 20, VIEW_H - 7.5, { size: 4.5, alpha: 0.7 });
    }
    // 横幅
    if (this.banners.length) {
      const b = this.banners[0];
      const a = b.t < 15 ? b.t / 15 : b.t > 200 ? (230 - b.t) / 30 : 1;
      ov.rect(0, 22, VIEW_W, b.sub ? 22 : 14, '#000000', 0.45 * a);
      ov.text(b.text, VIEW_W / 2, 24, { size: 9, align: 'center', bold: true, alpha: a, glow: '#8df5ff' });
      if (b.sub) ov.text(b.sub, VIEW_W / 2, 35, { size: 5.5, align: 'center', alpha: a, color: '#c8d0ff' });
    }
    // 房间名
    if (this.roomNameT > 0 && !this.transition) {
      const a = Math.min(1, this.roomNameT / 30);
      ov.text(`${REGION[this.def.region].name} · ${this.def.name}`, VIEW_W - 4, VIEW_H - 10, { size: 5.5, align: 'right', alpha: a * 0.9, color: '#c8d0ff' });
    }
    // 提示
    if (this.promptText && !this.transition) {
      const pt = this.promptText;
      const w = ov.measure(pt.text, 5.5) + 6;
      const x = clamp(pt.x, w / 2 + 2, VIEW_W - w / 2 - 2);
      ov.rect(x - w / 2, pt.y - 1, w, 8, '#000000', 0.6);
      ov.text(pt.text, x, pt.y, { size: 5.5, align: 'center' });
    }
  }

  private drawTitle(): void {
    const g = this.gfx, ov = this.overlay;
    g.clear('#07070c');
    // 井
    const wx = 132, ww = 56;
    g.rect(wx, 52, ww, VIEW_H - 52, '#101223');
    for (let y = 52; y < VIEW_H; y += 8) { g.rect(wx, y, ww, 1, '#1a1d36'); g.rect(wx + ((y / 8) % 2) * 8, y, 1, 8, '#1a1d36'); }
    g.rect(wx - 6, 46, ww + 12, 6, '#2a2f55'); g.rect(wx - 6, 46, ww + 12, 1, '#555d8a');
    g.rect(wx - 2, 52, 2, VIEW_H - 52, '#2a2f55'); g.rect(wx + ww, 52, 2, VIEW_H - 52, '#2a2f55');
    // 井底的小家伙和火光
    const lights: Light[] = [
      { x: VIEW_W / 2, y: VIEW_H - 12, r: 60 + Math.sin(this.titleT / 7) * 4, color: '#ffa040', a: 0.9 },
      { x: VIEW_W / 2, y: 30, r: 90, color: '#8df5ff', a: 0.25 },
    ];
    this.particles.draw(g);
    const ps = rasterize(A.PLAYER.idle, PAL);
    g.sprite(ps, VIEW_W / 2 - 4, VIEW_H - 22);
    g.rect(VIEW_W / 2 - 1, VIEW_H - 14 + ((this.titleT >> 3) & 1), 3, 3, '#ffe36e');
    const lc = this.lighting.render(lights, 0.55, '#8690c8');
    g.ctx.globalCompositeOperation = 'multiply'; g.ctx.drawImage(lc, 0, 0);
    g.ctx.globalCompositeOperation = 'lighter'; g.ctx.globalAlpha = 0.2; g.ctx.drawImage(lc, 0, 0);
    g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
    ov.text('动物井', VIEW_W / 2, 10, { size: 30, align: 'center', bold: true, glow: '#3aa6b8', color: '#f4f1ff' });
    ov.text('ANIMAL WELL · 致敬复刻', VIEW_W / 2, 46, { size: 6, align: 'center', color: '#8df5ff', alpha: 0.9 });
    const blink = (this.titleT >> 4) & 1;
    if (this.hasSave) {
      ov.text((this.titleSel === 0 ? '▶ ' : '   ') + '继续游戏', VIEW_W / 2, 92, { size: 8, align: 'center', color: this.titleSel === 0 ? '#ffe36e' : '#c8d0ff' });
      ov.text((this.titleSel === 1 ? '▶ ' : '   ') + '新的旅程', VIEW_W / 2, 104, { size: 8, align: 'center', color: this.titleSel === 1 ? '#ffe36e' : '#c8d0ff' });
    } else if (blink) {
      ov.text('按 Z / 空格 / 回车 开始', VIEW_W / 2, 96, { size: 8, align: 'center', color: '#ffe36e' });
    }
    ov.text('方向键/WASD 移动 · Z/空格 跳跃 · X 使用道具 · C 切换道具 · M 地图 · ESC 暂停', VIEW_W / 2, VIEW_H - 12, { size: 4.6, align: 'center', color: '#8a90b8' });
    ov.text('用 TypeScript + Canvas 从零复刻 · 没有任何图片或音频文件', VIEW_W / 2, VIEW_H - 6, { size: 4, align: 'center', color: '#5a6088' });
  }

  private drawPause(): void {
    const g = this.gfx, ov = this.overlay;
    g.rect(0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.6)');
    ov.text('暂停', VIEW_W / 2, 30, { size: 16, align: 'center', bold: true, glow: '#3aa6b8' });
    const lines = [
      '方向键 / WASD：移动      Z / 空格 / K：跳跃',
      'X / J：使用道具      C / L：切换道具      1-5：直接选择',
      '↓ + 跳：从平台落下      ↑：存档 / 放置火焰',
      'M / Tab：地图      ESC / P：暂停',
      '',
      `蛋 ${this.eggs}/${TOTAL_EGGS}   火焰 ${this.placedFlames.length + this.flames.length}/${TOTAL_FLAMES}   用时 ${this.timeStr()}`,
    ];
    lines.forEach((l, i) => ov.text(l, VIEW_W / 2, 58 + i * 11, { size: 5.5, align: 'center', color: '#c8d0ff' }));
    ov.text('ESC 继续 · M 查看地图', VIEW_W / 2, VIEW_H - 16, { size: 6, align: 'center', color: '#ffe36e' });
  }

  timeStr(): string {
    const s = Math.floor(this.playTime / 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private drawMap(): void {
    const g = this.gfx, ov = this.overlay;
    g.rect(0, 0, VIEW_W, VIEW_H, 'rgba(4,4,10,0.88)');
    const cw = ROOM_W, ch = ROOM_H;
    const ox = Math.floor((VIEW_W - WORLD_COLS * cw) / 2), oy = Math.floor((VIEW_H - WORLD_ROWS * ch) / 2) + 2;
    for (const { col, row, def } of allRooms()) {
      const x0 = ox + col * cw, y0 = oy + row * ch;
      const seen = this.visited.has(`${col},${row}`);
      const st = REGION[def.region];
      if (!seen) {
        const adj = this.visited.has(`${col - 1},${row}`) || this.visited.has(`${col + 1},${row}`) || this.visited.has(`${col},${row - 1}`) || this.visited.has(`${col},${row + 1}`);
        if (adj) g.rect(x0, y0, cw, ch, 'rgba(255,255,255,0.03)');
        continue;
      }
      const parsed = this.parsed(def);
      const tiles = (col === this.roomCol && row === this.roomRow) ? this.tiles : parsed.tiles;
      g.rect(x0, y0, cw, ch, st.bgDark);
      for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
        const t = tiles[ty * ROOM_W + tx];
        let c: string | null = null;
        if (t === T.WALL || t === T.FAKE || t === T.BREAK) c = st.wallLight;
        else if (t === T.WATER) c = '#2a5bd0';
        else if (t >= T.SPIKE_U && t <= T.SPIKE_R) c = '#a41e3a';
        else if (t === T.DOOR || t === T.LOCKED || t === T.EGGDOOR || t === T.BARS) c = '#c0c0c8';
        else if (t === T.PLATFORM) c = st.wallRim;
        if (c) g.px(x0 + tx, y0 + ty, c);
      }
      for (const s of parsed.spawns) {
        if (s.kind === 'phone') g.rect(x0 + s.tx - 1, y0 + s.ty - 1, 3, 3, '#74e08a');
        if (s.kind === 'pedestal') g.rect(x0 + s.tx, y0 + s.ty - 1, 4, 2, '#ffe36e');
        if ((s.kind === 'flame' || s.kind === 'item') && !this.collected.has(`${col},${row}:${s.tx},${s.ty}`)) g.rect(x0 + s.tx - 1, y0 + s.ty - 1, 3, 3, s.kind === 'flame' ? '#ffa040' : '#ffffff');
      }
    }
    // 网格线与当前房间
    for (const { col, row } of allRooms()) if (this.visited.has(`${col},${row}`)) {
      g.ctx.strokeStyle = 'rgba(255,255,255,0.12)'; g.ctx.lineWidth = 1;
      g.ctx.strokeRect(ox + col * cw + 0.5, oy + row * ch + 0.5, cw - 1, ch - 1);
    }
    const cx = ox + this.roomCol * cw, cy = oy + this.roomRow * ch;
    g.ctx.strokeStyle = '#ffe36e'; g.ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
    if ((this.frame >> 3) & 1) g.rect(cx + Math.floor(this.player.cx / TILE) - 1, cy + Math.floor(this.player.cy / TILE) - 1, 3, 3, '#ffffff');
    ov.text('地图', 6, 3, { size: 8, bold: true });
    ov.text(`${REGION[this.def.region].name} · ${this.def.name}`, VIEW_W - 6, 4, { size: 6, align: 'right', color: '#c8d0ff' });
    ov.text(`蛋 ${this.eggs}/${TOTAL_EGGS}   火焰 ${this.placedFlames.length}/${TOTAL_FLAMES}（手持 ${this.flames.length}）   已探索 ${this.visited.size}/${allRooms().length} 个房间   ·   M 关闭`, VIEW_W / 2, VIEW_H - 9, { size: 5, align: 'center', color: '#8a90b8' });
  }

  private drawEnding(): void {
    const g = this.gfx, ov = this.overlay;
    const t = this.endingT;
    if (t < 150) {
      this.drawScene();
      g.rect(0, 0, VIEW_W, VIEW_H, rgba('#ffffff', Math.min(1, t / 150)));
      return;
    }
    const k = Math.min(1, (t - 150) / 90);
    g.clear(`rgb(${Math.round(255 - 248 * k)},${Math.round(255 - 248 * k)},${Math.round(255 - 243 * k)})`);
    const lights: Light[] = this.placedFlames.map((f, i) => ({ x: VIEW_W / 2 - 36 + i * 24, y: VIEW_H / 2 + 36, r: 50 + Math.sin(t / 6 + i) * 4, color: FLAME_INFO[f].glow, a: 0.9 }));
    this.particles.draw(g);
    const s = this.hud();
    this.placedFlames.forEach((f, i) => {
      const x = VIEW_W / 2 - 40 + i * 24, y = VIEW_H / 2 + 30;
      g.sprite(s.flame, x, y);
      g.ctx.globalCompositeOperation = 'source-atop'; g.ctx.globalAlpha = 0.6; g.ctx.fillStyle = FLAME_INFO[f].color; g.ctx.fillRect(x, y, 8, 9);
      g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
    });
    if (k >= 1) {
      const lc = this.lighting.render(lights, 0.9, '#c8d0ff');
      g.ctx.globalCompositeOperation = 'lighter'; g.ctx.globalAlpha = 0.3; g.ctx.drawImage(lc, 0, 0);
      g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
    }
    const a = clamp((t - 200) / 60, 0, 1);
    ov.text('井底被点亮了', VIEW_W / 2, 26, { size: 18, align: 'center', bold: true, alpha: a, glow: '#ffa040' });
    ov.text('四团火焰回到了它们的位置，深处的动物们终于安静下来。', VIEW_W / 2, 52, { size: 6, align: 'center', alpha: a, color: '#c8d0ff' });
    ov.text(`用时 ${this.timeStr()}   ·   蛋 ${this.eggs}/${TOTAL_EGGS}   ·   死亡 ${this.deaths} 次   ·   探索 ${this.visited.size}/${allRooms().length} 房间`, VIEW_W / 2, 68, { size: 5.5, align: 'center', alpha: a, color: '#ffe36e' });
    ov.text('致敬 Billy Basso 的《ANIMAL WELL》', VIEW_W / 2, VIEW_H - 26, { size: 5.5, align: 'center', alpha: a, color: '#8a90b8' });
    if (t > 420 && ((t >> 4) & 1)) ov.text('按任意键返回标题', VIEW_W / 2, VIEW_H - 14, { size: 6, align: 'center', color: '#ffe36e' });
  }
}
