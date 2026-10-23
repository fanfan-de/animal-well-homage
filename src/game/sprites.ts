// 所有精灵的 ASCII 像素画。'.' 为透明。字符含义见 palette.ts

export type Art = readonly string[];

export const PLAYER: Record<string, Art> = {
  idle: [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWKWWKWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '..w..w..',
  ],
  walk0: [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWKWWKWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '.w....w.',
  ],
  walk1: [
    '........',
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWKWWKWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '...ww...',
  ],
  walk2: [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWKWWKWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '..w...w.',
  ],
  jump: [
    '..WWWW..',
    '.WWWWWW.',
    'WWKWWKWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'wWWWWWWw',
    'wWWWWWWw',
    '.wWWWWw.',
    '..w..w..',
    '..w..w..',
  ],
  fall: [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWKWWKWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '.w.ww.w.',
    '........',
  ],
  swim: [
    '........',
    '..WWWW..',
    '.WWWWWW.',
    'WWKWWKWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '.w....w.',
    '........',
  ],
  hurt: [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WKWWWWKW',
    'WWKWWKWW',
    'WWWWWWWW',
    'wWWWWWWw',
    '.wWWWWw.',
    '..wwww..',
    '.w....w.',
  ],
};

export const GHOSTCAT: Art[] = [
  [
    '.L........L.',
    '.LL......LL.',
    '.LLLLLLLLLL.',
    'LLYLLLLLLYLL',
    'LLLLLLLLLLLL',
    '.LLLLLLLLLL.',
    '..LLLLLLLL..',
    '..L.LL.L.L..',
  ],
  [
    '.L........L.',
    '.LL......LL.',
    '.LLLLLLLLLL.',
    'LLYLLLLLLYLL',
    'LLLLLLLLLLLL',
    '.LLLLLLLLLL.',
    '..LLLLLLLL..',
    '..LL.L.LL...',
  ],
];

export const DOG: Art[] = [
  [
    '..........NNN...',
    '.........NNNNN..',
    '..NNNNNNNNNKNN..',
    '.NNNNNNNNNNNNNN.',
    '.NNNNNNNNNNNNn..',
    '.NNNNNNNNNNNN...',
    '.nNNNNNNNNNNn...',
    '..nn......nn....',
    '..nn......nn....',
    '..nn......nn....',
  ],
  [
    '..........NNN...',
    '.........NNNNN..',
    '..NNNNNNNNNKNN..',
    '.NNNNNNNNNNNNNN.',
    '.NNNNNNNNNNNNn..',
    '.NNNNNNNNNNNN...',
    '.nNNNNNNNNNNn...',
    '..nn......nn....',
    '.nn........nn...',
    'nn..........nn..',
  ],
  [ // 睡觉
    '................',
    '................',
    '................',
    '..........NNN...',
    '..NNNNNNNNNNNN..',
    '.NNNNNNNNNNNNNN.',
    '.NNNNNNNNNNNNNN.',
    '.nNNNNNNNNNNNn..',
    '..nnnnnnnnnnn...',
    '................',
  ],
];

export const BIRD: Art[] = [
  [
    '..KK....',
    '.KKKK...',
    'KKKKKKW.',
    '.KKKKKK.',
    '..K..K..',
    '........',
  ],
  [
    '........',
    '.KKKK...',
    'KKKKKKW.',
    '.KKKKKK.',
    '..KK....',
    '.KK.....',
  ],
];

export const SNAIL: Art[] = [
  [
    '..OOOO..',
    '.OoOOOO.',
    '.OOoOOOG',
    '.OOOOOGG',
    'GGGGGGGG',
    '.GGGGGG.',
  ],
  [
    '..OOOO..',
    '.OoOOOO.',
    '.OOoOOO.',
    '.OOOOOGG',
    'GGGGGGGG',
    'GGGGGGG.',
  ],
];

export const FISH: Art[] = [
  [
    '..CCCC..',
    '.CCKCCCC',
    'CCCCCCC.',
    '.CCCCCCC',
    '..CCCC..',
  ],
  [
    '..CCCC..',
    '.CCKCCC.',
    'CCCCCCCC',
    '.CCCCCC.',
    '..CCCC..',
  ],
];

export const SEAHORSE: Art[] = [
  [
    '...CCCC...',
    '..CCCCCC..',
    '..CKCCCCC.',
    '..CCCCCCCC',
    '...CCCC...',
    '...CCCC...',
    '..CCCCC...',
    '.CcCCCCC..',
    '.CCcCCCC..',
    '..CCcCCC..',
    '...CCcCC..',
    '...CCCcC..',
    '....CCCC..',
    '....CCC...',
    '...CCC....',
    '....CC....',
  ],
  [
    '...CCCC...',
    '..CCCCCC..',
    '..CKCCCCC.',
    '..CCCCCCCC',
    '...CCCC...',
    '...CCCC...',
    '..CCCCC...',
    '.CcCCCCC..',
    '.CCcCCCC..',
    '..CCcCCC..',
    '...CCcCC..',
    '...CCCcC..',
    '....CCCC..',
    '.....CCC..',
    '......CC..',
    '.....CC...',
  ],
];

export const CHAMELEON: Art[] = [
  [
    '......GGGGGG....',
    '.....GGGGGGGGG..',
    '....GGKGGGGGGGG.',
    '...GGGGGGGGGGGG.',
    '..GGGGGGGGGGGG..',
    '.GGGGGGGGGGGGg..',
    'Gg.GGGGGGGGGg...',
    '.Gg.gG....Gg....',
    '..GG.g....g.....',
    '................',
  ],
];

export const OSTRICH: Art[] = [
  [
    '........KKK.',
    '.......KKKKO',
    '.......KKK..',
    '........K...',
    '........K...',
    '........K...',
    '..KKKKKKK...',
    '.KKKKKKKKK..',
    '.KKKKKKKKK..',
    '..KKKKKKK...',
    '....K..K....',
    '....K..K....',
    '....K..K....',
    '....K..K....',
    '...KK..KK...',
  ],
  [
    '........KKK.',
    '.......KKKKO',
    '.......KKK..',
    '........K...',
    '........K...',
    '........K...',
    '..KKKKKKK...',
    '.KKKKKKKKK..',
    '.KKKKKKKKK..',
    '..KKKKKKK...',
    '....K..K....',
    '...K....K...',
    '..K......K..',
    '.K........K.',
    'KK........KK',
  ],
];

// ---------- 道具图标（8x8） ----------
export const ICON: Record<string, Art> = {
  firecracker: [
    '.....Y..',
    '....y...',
    '..RRR...',
    '..RWR...',
    '..RRR...',
    '..RWR...',
    '..RRR...',
    '..rrr...',
  ],
  bubble: [
    '....CC..',
    '...C..C.',
    '...C..C.',
    '....CC..',
    '...N....',
    '..N.....',
    '.N......',
    'N.......',
  ],
  disc: [
    '..OOOO..',
    '.OooooO.',
    'Oo.OO.oO',
    'Oo.OO.oO',
    'Oo.OO.oO',
    'Oo....oO',
    '.OooooO.',
    '..OOOO..',
  ],
  lantern: [
    '...ss...',
    '..ssss..',
    '.sYYYYs.',
    '.sYfYYs.',
    '.sYYYYs.',
    '.sYYfYs.',
    '..ssss..',
    '...ss...',
  ],
  yoyo: [
    '.......W',
    '......W.',
    '..RRRW..',
    '.RrRRR..',
    '.RRWRR..',
    '.RRRrR..',
    '..RRR...',
    '........',
  ],
  key: [
    '.YYY....',
    'Y...Y...',
    'Y...YYYY',
    'Y...Y.Y.',
    '.YYY..YY',
    '........',
    '........',
    '........',
  ],
  heart: [
    '.RR.RR.',
    'RRRRRRR',
    'RRRRRRR',
    '.RRRRR.',
    '..RRR..',
    '...R...',
  ],
  heartEmpty: [
    '.kk.kk.',
    'k..k..k',
    'k.....k',
    '.k...k.',
    '..k.k..',
    '...k...',
  ],
  crate: [
    'nNNNNNNn',
    'NnnnnnnN',
    'NnRRRRnN',
    'NnRYYRnN',
    'NnRYYRnN',
    'NnRRRRnN',
    'NnnnnnnN',
    'nNNNNNNn',
  ],
};

export const EGG: Art[] = [
  [
    '..WW..',
    '.WWWW.',
    '.WMWW.',
    'WWWWMW',
    'WMWWWW',
    'WWWWWW',
    '.WWMW.',
    '..WW..',
  ],
  [
    '..CC..',
    '.CCCC.',
    '.CLCC.',
    'CCCCLC',
    'CLCCCC',
    'CCCCCC',
    '.CCLC.',
    '..CC..',
  ],
  [
    '..YY..',
    '.YYYY.',
    '.YOYY.',
    'YYYYOY',
    'YOYYYY',
    'YYYYYY',
    '.YYOY.',
    '..YY..',
  ],
  [
    '..GG..',
    '.GGGG.',
    '.GWGG.',
    'GGGGWG',
    'GWGGGG',
    'GGGGGG',
    '.GGWG.',
    '..GG..',
  ],
];

export const FLAME: Art[] = [
  [
    '...F....',
    '...F....',
    '..FF.F..',
    '..FFFF..',
    '.FFffFF.',
    '.FfffFF.',
    '.FffffF.',
    '..FffF..',
    '...ff...',
    '.ssssss.',
    'ssssssss',
  ],
  [
    '....F...',
    '..F.F...',
    '..FFF...',
    '.FFFFF..',
    '.FFffFF.',
    '.FfffFF.',
    'FFffffF.',
    '.FffffF.',
    '..ffff..',
    '.ssssss.',
    'ssssssss',
  ],
];

export const PHONE: Art = [
  '..ssssss..',
  '.sGGGGGGs.',
  '.sGggggGs.',
  '.sGGGGGGs.',
  '.sssssss..',
  '.sKKKKKKs.',
  '.sssssss..',
  '..ss..ss..',
  '..ss..ss..',
  '..ss..ss..',
  '.ssssssss.',
  '.ssssssss.',
];

export const PEDESTAL: Art = [
  '..ssssssssssssssssssssssssssss..',
  '.sSSSSSSSSSSSSSSSSSSSSSSSSSSSSs.',
  'sSsssSSsssSSsssSSsssSSsssSSsssSs',
  'sSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSs',
  '.ssssssssssssssssssssssssssssss.',
  '..sSSs..sSSs....sSSs..sSSs......',
  '..sSSs..sSSs....sSSs..sSSs......',
  '..sSSs..sSSs....sSSs..sSSs......',
  '.ssssssssssssssssssssssssssssss.',
  '.ssssssssssssssssssssssssssssss.',
];

export const CANDLE: Art = [
  '........',
  '........',
  '...WW...',
  '...WW...',
  '...WW...',
  '...WW...',
  '..sWWs..',
  '..ssss..',
];

export const DISC_SPR: Art = [
  '.OOOOOO.',
  'OoooooOO',
  '.OOOOOO.',
];

export const FIRECRACKER_SPR: Art = [
  '.Y.',
  'RRR',
  'RWR',
  'RRR',
  'RRR',
];

export const DOOR_TILE: Art = [
  'ssSsSsSs',
  'sKsKsKsK',
  'sKsKsKsK',
  'sSSSSSSS',
  'sKsKsKsK',
  'sKsKsKsK',
  'sKsKsKsK',
  'ssssssss',
];

export const LOCKED_TILE: Art = [
  'nNNNNNNn',
  'NTTTTTTN',
  'NTTTTTTN',
  'NTTKKTTN',
  'NTTTKTTN',
  'NTTTTTTN',
  'NTTTTTTN',
  'nNNNNNNn',
];

export const EGGDOOR_TILE: Art = [
  'pPPPPPPp',
  'PppppppP',
  'PpWWWWpP',
  'PpWMWWpP',
  'PpWWWMpP',
  'PpWWWWpP',
  'PppppppP',
  'pPPPPPPp',
];

export const SPIKES_UP: Art = [
  '.S...S..',
  '.S...S..',
  'sSs.sSs.',
  'sSs.sSs.',
  'SSSsSSSs',
  'SSSSSSSS',
  'ssssssss',
  'ssssssss',
];

export const BARS_TILE: Art = [
  '.s..s..s',
  '.S..S..S',
  '.S..S..S',
  '.S..S..S',
  '.S..S..S',
  '.S..S..S',
  '.S..S..S',
  '.s..s..s',
];

export const PLATFORM_TILE: Art = [
  'WWWWWWWW',
  'SsSsSsSs',
  'ssssssss',
  '........',
  '........',
  '........',
  '........',
  '........',
];

export const GRASS: Art[] = [
  [
    '........',
    '........',
    '........',
    '........',
    '..G..G..',
    '.GG.GG.G',
    'gG.gG.gG',
    'gggggggg',
  ],
  [
    '........',
    '........',
    '........',
    '.....G..',
    '..G.GG..',
    '.gG.G..G',
    'gGggG.gG',
    'gggggggg',
  ],
];

export const PEBBLES: Art[] = [
  [
    '........',
    '........',
    '........',
    '........',
    '........',
    '..ss....',
    '.sSSs.s.',
    'ssssssss',
  ],
  [
    '........',
    '........',
    '........',
    '........',
    '.....Ss.',
    '..s.sSSs',
    '.sSs.ss.',
    'ssssssss',
  ],
];

export const MUSHROOM: Art = [
  '........',
  '........',
  '..CCCC..',
  '.CLCCLC.',
  '.CCCCCC.',
  '...ww...',
  '...ww...',
  '...ww...',
];

export const BREAK_TILE: Art = [
  'SSSSSSSS',
  'SSsSSSSS',
  'SSSsSSsS',
  'SSSSsSsS',
  'SsSSSsSS',
  'SSsSsSSS',
  'SSSsSSSS',
  'SSSSSSSS',
];

/** 字符串数组工具：翻转/旋转 ASCII 画 */
export function flipV(a: Art): Art { return [...a].reverse(); }
export function flipHArt(a: Art): Art { return a.map((r) => r.split('').reverse().join('')); }
export function rotateCW(a: Art): Art {
  const h = a.length, w = Math.max(...a.map((r) => r.length));
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let s = '';
    for (let y = h - 1; y >= 0; y--) s += a[y][x] ?? '.';
    out.push(s);
  }
  return out;
}
