// 输入：键盘 + 手柄（Gamepad API），统一映射为动作

export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'use' | 'cycle' | 'cycleBack'
  | 'map' | 'pause' | 'confirm'
  | 'item1' | 'item2' | 'item3' | 'item4' | 'item5' | 'item6';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
  KeyX: 'use', KeyJ: 'use',
  KeyC: 'cycle', KeyL: 'cycle', ShiftLeft: 'cycle', ShiftRight: 'cycle',
  KeyQ: 'cycleBack',
  KeyM: 'map', Tab: 'map',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  Digit1: 'item1', Digit2: 'item2', Digit3: 'item3', Digit4: 'item4', Digit5: 'item5', Digit6: 'item6',
};

export class Input {
  private kbHeld = new Set<Action>();
  private padHeld = new Set<Action>();
  private pressedNow = new Set<Action>();
  private releasedNow = new Set<Action>();
  private padPrev = new Set<Action>();
  /** 本帧是否有任意按键按下（标题画面用） */
  anyPressed = false;
  /** 玩家首次交互时的回调（用于启动音频） */
  onFirstInteraction: (() => void) | null = null;
  private interacted = false;

  constructor(target: Window | null) {
    if (!target) return;
    target.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.firstInteraction();
      if (e.repeat) return;
      this.anyPressed = true;
      if (!a) return;
      if (!this.kbHeld.has(a)) this.pressedNow.add(a);
      this.kbHeld.add(a);
    });
    target.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.kbHeld.delete(a);
      this.releasedNow.add(a);
    });
    target.addEventListener('blur', () => { this.kbHeld.clear(); });
    target.addEventListener('pointerdown', () => this.firstInteraction());
  }

  private firstInteraction(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteraction?.();
  }

  /** 每帧开始：轮询手柄 */
  beginFrame(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<Action>();
    for (const pad of pads) {
      if (!pad) continue;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (ax < -0.5 || b(14)) now.add('left');
      if (ax > 0.5 || b(15)) now.add('right');
      if (ay < -0.5 || b(12)) now.add('up');
      if (ay > 0.5 || b(13)) now.add('down');
      if (b(0)) now.add('jump');
      if (b(2) || b(1)) now.add('use');
      if (b(5)) now.add('cycle');
      if (b(4)) now.add('cycleBack');
      if (b(9)) now.add('pause');
      if (b(8) || b(3)) now.add('map');
      if (b(0) || b(9)) now.add('confirm');
    }
    for (const a of now) if (!this.padPrev.has(a)) { this.pressedNow.add(a); this.anyPressed = true; this.firstInteraction(); }
    for (const a of this.padPrev) if (!now.has(a)) this.releasedNow.add(a);
    this.padHeld = now;
    this.padPrev = now;
  }

  /** 每帧结束：清掉边沿状态 */
  endFrame(): void {
    this.pressedNow.clear();
    this.releasedNow.clear();
    this.anyPressed = false;
  }

  down(a: Action): boolean { return this.kbHeld.has(a) || this.padHeld.has(a); }
  pressed(a: Action): boolean { return this.pressedNow.has(a); }
  released(a: Action): boolean { return this.releasedNow.has(a); }
  axisX(): number { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); }
  axisY(): number { return (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0); }

  /** 测试/脚本/触屏注入 */
  inject(a: Action, isDown: boolean): void {
    if (isDown) { if (!this.kbHeld.has(a)) this.pressedNow.add(a); this.kbHeld.add(a); this.anyPressed = true; }
    else { this.kbHeld.delete(a); this.releasedNow.add(a); }
  }
}
