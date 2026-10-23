// 启动：画布缩放、固定步长主循环、调试参数

import { Game } from './game/game';
import { VIEW_W, VIEW_H } from './game/constants';
import { roomAt } from './game/world';
import type { Action } from './engine/input';

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;
const frame = document.getElementById('frame') as HTMLDivElement;

const params = new URLSearchParams(location.search);
const game = new Game(gameCanvas, uiCanvas, window);
(window as unknown as { __game: Game }).__game = game;

function resize(): void {
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
  frame.style.width = `${VIEW_W * scale}px`;
  frame.style.height = `${VIEW_H * scale}px`;
  gameCanvas.style.width = `${VIEW_W * scale}px`;
  gameCanvas.style.height = `${VIEW_H * scale}px`;
  game.overlay.resize(scale, Math.min(3, window.devicePixelRatio || 1));
  // 画布改尺寸会被清空，立即重画一帧
  if (started) game.draw();
}
let started = false;
window.addEventListener('resize', resize);
resize();

// ---- 触屏按钮（手机/平板）----
const touch = document.getElementById('touch') as HTMLDivElement;
const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
if (coarse) touch.classList.add('on');
window.addEventListener('touchstart', () => touch.classList.add('on'), { once: true, passive: true });
for (const el of Array.from(touch.querySelectorAll<HTMLElement>('.tb'))) {
  const a = el.dataset.a as Action;
  const down = (e: Event): void => { e.preventDefault(); el.classList.add('down'); game.input.inject(a, true); };
  const up = (e: Event): void => { e.preventDefault(); el.classList.remove('down'); game.input.inject(a, false); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---- 调试参数 ----
// ?room=3,3&x=120&y=100&items=all&nolight=1&frames=120&script=r:30,rj:1,r:40
if (params.get('nolight')) game.noLight = true;
if (params.get('audio')) game.audio.init();
const roomParam = params.get('room');
if (roomParam) {
  const [c, r] = roomParam.split(',').map(Number);
  if (roomAt(c, r)) {
    game.debugStart(c, r, {
      x: params.has('x') ? Number(params.get('x')) : undefined,
      y: params.has('y') ? Number(params.get('y')) : undefined,
      items: params.get('items') ?? undefined,
      eggs: params.has('eggs') ? Number(params.get('eggs')) : undefined,
      keys: params.has('keys') ? Number(params.get('keys')) : undefined,
      flames: params.get('flames') ?? undefined,
    });
  }
} else if (params.get('title') === '0') {
  game.newGame();
}
if (params.get('state') === 'map') game.state = 'map';
if (params.get('state') === 'pause') game.state = 'pause';

// 脚本化输入：逗号分隔，每段 <keys>:<frames>，keys 为 l r u d j x c m e 的组合
interface ScriptStep { keys: Action[]; frames: number; }
const KEYS: Record<string, Action> = { l: 'left', r: 'right', u: 'up', d: 'down', j: 'jump', x: 'use', c: 'cycle', m: 'map', e: 'confirm' };
const script: ScriptStep[] = (params.get('script') ?? '').split(',').filter(Boolean).map((tok) => {
  const [k, f] = tok.split(':');
  return { keys: k.split('').map((ch) => KEYS[ch]).filter(Boolean), frames: Number(f) || 1 };
});
let scriptIdx = 0, scriptFrame = 0;
let held: Action[] = [];
function applyScript(): void {
  if (scriptIdx >= script.length) { for (const a of held) game.input.inject(a, false); held = []; return; }
  const step = script[scriptIdx];
  if (scriptFrame === 0) {
    for (const a of held) if (!step.keys.includes(a)) game.input.inject(a, false);
    for (const a of step.keys) if (!held.includes(a)) game.input.inject(a, true);
    held = [...step.keys];
  }
  scriptFrame++;
  if (scriptFrame >= step.frames) { scriptIdx++; scriptFrame = 0; }
}

started = true;
const fixedFrames = params.has('frames') ? Number(params.get('frames')) : -1;
if (fixedFrames >= 0) {
  // 确定性：同步跑 N 帧后画一次，用于截图
  for (let i = 0; i < fixedFrames; i++) { applyScript(); game.update(); }
  game.draw();
  (window as unknown as { __done: boolean }).__done = true;
  if (params.get('log')) console.log('STATE ' + JSON.stringify(game.debugState()));
} else {
  const DT = 1 / 60;
  let acc = 0, last = performance.now();
  const tick = (now: number): void => {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    let n = 0;
    while (acc >= DT && n < 4) { applyScript(); game.update(); acc -= DT; n++; }
    if (n === 4) acc = 0;
    game.draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
