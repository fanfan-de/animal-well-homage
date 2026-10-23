// 全局常量与数据表

export const TILE = 8;
export const ROOM_W = 40;
export const ROOM_H = 22;
export const VIEW_W = ROOM_W * TILE; // 320
export const VIEW_H = ROOM_H * TILE; // 176
export const WORLD_COLS = 7;
export const WORLD_ROWS = 6;

export const PLAYER_W = 6;
export const PLAYER_H = 10;
export const MAX_HEARTS = 3;
export const EGG_DOOR_COUNT = 8;
export const MAX_FIRECRACKERS = 6;
export const TOTAL_FLAMES = 4;

/** 物理参数（像素/帧，60fps） */
export const PHYS = {
  walk: 1.4, accel: 0.22, decel: 0.3, airAccel: 0.14,
  gravity: 0.22, jumpV: 3.6, jumpCut: 1.4, maxFall: 4.2,
  coyote: 6, buffer: 7,
  waterGravity: 0.05, waterMaxFall: 0.9, waterWalk: 1.0, swimV: 1.6, surfaceJumpV: 3.3,
} as const;

export type ItemId = 'firecracker' | 'bubble' | 'disc' | 'lantern' | 'yoyo';
export const ITEM_ORDER: readonly ItemId[] = ['firecracker', 'bubble', 'disc', 'lantern', 'yoyo'];
export const ITEM_INFO: Record<ItemId, { name: string; en: string; hint: string }> = {
  firecracker: { name: '鞭炮', en: 'Firecrackers', hint: '按 X 投掷：巨响和强光会吓跑动物，驱散幽灵' },
  bubble: { name: '泡泡棒', en: 'Bubble Wand', hint: '按 X 吹出泡泡：泡泡缓缓上升，可以踩在上面' },
  disc: { name: '飞盘', en: 'Disc', hint: '按 X 投掷，再按 X 召回：能穿过栏杆、压住按钮、击碎裂墙，狗会追着它跑' },
  lantern: { name: '灯笼', en: 'Lantern', hint: '按 X 开关：照亮黑暗，让幽灵退散，也能照出藏起来的东西' },
  yoyo: { name: '溜溜球', en: 'Yo-yo', hint: '按 X 甩出：可以拨动拉杆、击晕小动物' },
};

export type FlameId = 'seahorse' | 'dog' | 'ostrich' | 'chameleon';
export const FLAME_INFO: Record<FlameId, { name: string; color: string; glow: string }> = {
  seahorse: { name: '海马之火', color: '#5fd3ff', glow: '#2a7bff' },
  dog: { name: '猎犬之火', color: '#ffa94a', glow: '#ff5a1a' },
  ostrich: { name: '鸵鸟之火', color: '#8dff6a', glow: '#2fbf3a' },
  chameleon: { name: '变色龙之火', color: '#d98cff', glow: '#8a2bff' },
};

export type RegionId = 'hub' | 'west' | 'east' | 'north' | 'south';
export interface RegionStyle {
  name: string;
  ambient: number;           // 环境光 0..1
  ambientTint: string;       // 环境光颜色
  wall: string; wallDark: string; wallLight: string; wallRim: string;
  bg: string; bgDark: string;
}
export const REGION: Record<RegionId, RegionStyle> = {
  hub:   { name: '中央之井', ambient: 0.50, ambientTint: '#8690c8', wall: '#3b4164', wallDark: '#262a45', wallLight: '#555d8a', wallRim: '#8690c8', bg: '#14162a', bgDark: '#0b0c18' },
  west:  { name: '泡泡洞窟', ambient: 0.46, ambientTint: '#7fc8c0', wall: '#2f5a58', wallDark: '#1d3a3a', wallLight: '#4a8a82', wallRim: '#9be8d8', bg: '#0f2426', bgDark: '#081416' },
  east:  { name: '犬舍', ambient: 0.50, ambientTint: '#d8a070', wall: '#6a4a33', wallDark: '#432d1e', wallLight: '#8c6646', wallRim: '#d9a070', bg: '#241711', bgDark: '#140d09' },
  north: { name: '鸟巢高塔', ambient: 0.58, ambientTint: '#b0c4e8', wall: '#4b5466', wallDark: '#2f3542', wallLight: '#6c7890', wallRim: '#c4d4ee', bg: '#1a1f2c', bgDark: '#0e1118' },
  south: { name: '幽暗深处', ambient: 0.07, ambientTint: '#7a5aa8', wall: '#2c2240', wallDark: '#1a1428', wallLight: '#43345e', wallRim: '#7a5aa8', bg: '#0c0912', bgDark: '#050308' },
};
