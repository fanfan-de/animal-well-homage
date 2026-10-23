// 实体与游戏主类之间的契约（只含类型，避免循环依赖）

import type { Rng } from '../engine/util';
import type { Audio, SfxName } from '../engine/audio';
import type { Input } from '../engine/input';
import type { Particles } from '../engine/particles';
import type { TileTest } from './physics';
import type { Who } from './tiletypes';
import type { ItemId, FlameId } from './constants';
import type { Entity } from './entity';
import type { Player } from './player';
import type { Spawn } from './roomdef';

export interface Light { x: number; y: number; r: number; color: string; a: number; }

export interface Ctx {
  readonly frame: number;
  readonly rng: Rng;
  readonly audio: Audio;
  readonly input: Input;
  readonly particles: Particles;
  readonly player: Player;
  readonly entities: Entity[];
  readonly roomId: string;
  readonly roomCol: number;
  readonly roomRow: number;
  /** 房间是否属于黑暗区域（需要灯笼） */
  readonly dark: boolean;
  /** 转场/结局期间冻结逻辑 */
  readonly frozen: boolean;
  /** 当前在外面飞的飞盘（狗会追） */
  disc: Entity | null;

  tileAt(tx: number, ty: number): number;
  setTile(tx: number, ty: number, t: number): void;
  solidFor(who: Who): TileTest;
  readonly platformTest: TileTest;
  rectSolid(x: number, y: number, w: number, h: number, who: Who): boolean;
  addLight(l: Light): void;
  spawn(e: Entity): void;
  sfx(n: SfxName): void;
  setDoor(id: number, open: boolean): void;
  isDoorOpen(id: number): boolean;
  breakTile(tx: number, ty: number): void;
  hurtPlayer(dmg: number, fromX: number): void;
  banner(text: string, sub?: string): void;
  prompt(text: string, x: number, y: number): void;
  flash(a: number): void;
  shake(amount: number): void;

  hasItem(id: ItemId): boolean;
  giveItem(id: ItemId): void;
  eggs: number;
  keys: number;
  firecrackers: number;
  readonly flames: FlameId[];
  readonly placedFlames: FlameId[];
  /** 标记拾取物已收集；已收集过返回 false */
  collect(key: string): boolean;
  isCollected(key: string): boolean;
  pickupKey(s: Spawn): string;
  save(): void;
  startEnding(): void;
  /** 某点的大致光照 0..1（变色龙隐身用） */
  lightLevelAt(x: number, y: number): number;
}
