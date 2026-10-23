// 地砖类型与碰撞规则（纯逻辑，不依赖 DOM，可在 Node 中使用）

export const T = {
  EMPTY: 0, WALL: 1, PLATFORM: 2,
  SPIKE_U: 3, SPIKE_D: 4, SPIKE_L: 5, SPIKE_R: 6,
  WATER: 7, BARS: 8, BREAK: 9, DOOR: 10, LOCKED: 11,
  GRASS: 12, MUSHROOM: 13, PEBBLE: 14, CANDLE: 15, FAKE: 16, EGGDOOR: 17,
} as const;
export type TileId = (typeof T)[keyof typeof T];

/** 谁在碰撞：不同对象能穿过的东西不同 */
export type Who = 'player' | 'disc' | 'animal' | 'ghost' | 'thrown' | 'bubble';

export function blocks(t: number, who: Who): boolean {
  switch (t) {
    case T.WALL: case T.DOOR: case T.LOCKED: case T.EGGDOOR: case T.BREAK:
      return who !== 'ghost';
    case T.BARS:
      // 栏杆挡住玩家和动物，飞盘/鞭炮/泡泡可以穿过
      return who === 'player' || who === 'animal';
    default:
      return false;
  }
}
export const isHazard = (t: number): boolean => t >= T.SPIKE_U && t <= T.SPIKE_R;
export const isWater = (t: number): boolean => t === T.WATER;
export const isPlatform = (t: number): boolean => t === T.PLATFORM;
/** 自动拼接时视为“墙体”的地砖 */
export const isWallLike = (t: number): boolean => t === T.WALL || t === T.FAKE;
