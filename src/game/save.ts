// 存档（localStorage）

import type { ItemId, FlameId } from './constants';

export interface SaveData {
  version: 1;
  room: [number, number];
  pos: [number, number];
  items: ItemId[];
  selected: ItemId | null;
  eggs: number;
  keys: number;
  firecrackers: number;
  flames: FlameId[];
  placed: FlameId[];
  collected: string[];
  doors: [string, boolean][];
  broken: string[];
  visited: string[];
  deaths: number;
  time: number;
  hearts: number;
}

const KEY = 'animal-well-homage:save';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d.version !== 1) return null;
    return d;
  } catch { return null; }
}
export function writeSave(d: SaveData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
