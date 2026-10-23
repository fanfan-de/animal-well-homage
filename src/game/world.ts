// 世界网格：7 列 × 6 行，每格一个房间（或 null）

import { WORLD_COLS, WORLD_ROWS } from './constants';
import type { RoomDef } from './roomdef';
import { HUB } from './rooms/hub';
import { WEST } from './rooms/west';
import { EAST } from './rooms/east';
import { NORTH } from './rooms/north';
import { SOUTH } from './rooms/south';

export const START_ROOM = { col: 3, row: 3 };

const ALL: Record<string, RoomDef> = { ...HUB, ...WEST, ...EAST, ...NORTH, ...SOUTH };

export const WORLD: (RoomDef | null)[][] = [];
for (let r = 0; r < WORLD_ROWS; r++) {
  const row: (RoomDef | null)[] = [];
  for (let c = 0; c < WORLD_COLS; c++) row.push(ALL[`${c},${r}`] ?? null);
  WORLD.push(row);
}

export function roomAt(col: number, row: number): RoomDef | null {
  if (col < 0 || row < 0 || col >= WORLD_COLS || row >= WORLD_ROWS) return null;
  return WORLD[row][col];
}
export function allRooms(): { col: number; row: number; def: RoomDef }[] {
  const out: { col: number; row: number; def: RoomDef }[] = [];
  for (let r = 0; r < WORLD_ROWS; r++) for (let c = 0; c < WORLD_COLS; c++) {
    const def = WORLD[r][c];
    if (def) out.push({ col: c, row: r, def });
  }
  return out;
}
