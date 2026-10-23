// WebAudio 合成：所有音效和氛围音乐都是程序生成的，没有任何音频文件

export type SfxName =
  | 'jump' | 'land' | 'step' | 'hurt' | 'death' | 'pickup' | 'egg' | 'key' | 'item' | 'flame'
  | 'save' | 'door' | 'lever' | 'button' | 'bubble' | 'pop' | 'disc' | 'discBounce' | 'discCatch'
  | 'fuse' | 'bang' | 'yoyo' | 'splash' | 'swim' | 'lantern' | 'ui' | 'denied' | 'break'
  | 'cat' | 'dog' | 'bird' | 'phone' | 'ending' | 'unlock';

export type RegionId = 'hub' | 'west' | 'east' | 'north' | 'south' | 'none';

interface ToneOpts {
  freq: number; freqEnd?: number; type?: OscillatorType; dur: number; vol?: number;
  attack?: number; delay?: number; detune?: number; filter?: number;
}
interface NoiseOpts { dur: number; vol?: number; filter?: number; filterEnd?: number; q?: number; delay?: number; type?: BiquadFilterType; }

const SCALES: Record<RegionId, { root: number; scale: number[] }> = {
  hub:   { root: 55.0,  scale: [0, 3, 5, 7, 10, 12, 15] },      // A 小调五声
  west:  { root: 49.0,  scale: [0, 2, 5, 7, 9, 12, 14] },       // G 大五声（水、泡泡）
  east:  { root: 58.27, scale: [0, 3, 5, 6, 7, 10, 12] },       // 布鲁斯味（狗舍）
  north: { root: 65.41, scale: [0, 2, 4, 7, 9, 12, 16] },       // C 大五声（高处、鸟）
  south: { root: 41.2,  scale: [0, 1, 5, 6, 8, 12, 13] },       // 阴森半音（黑暗）
  none:  { root: 55.0,  scale: [0, 3, 5, 7, 10, 12] },
};

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private echo!: DelayNode;
  private noiseBuf: AudioBuffer | null = null;
  private drone: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private region: RegionId = 'none';
  private nextPluck = 0;
  private lastNote = 3;
  muted = false;
  private stepCooldown = 0;

  get ready(): boolean { return !!this.ctx; }

  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
    // 回声（音乐与部分音效共用）
    this.echo = c.createDelay(1.5); this.echo.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const echoFilter = c.createBiquadFilter(); echoFilter.type = 'lowpass'; echoFilter.frequency.value = 1800;
    this.echo.connect(fb); fb.connect(echoFilter); echoFilter.connect(this.echo);
    const echoOut = c.createGain(); echoOut.gain.value = 0.5;
    this.echo.connect(echoOut); echoOut.connect(this.master);
    // 噪声缓冲
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startDrone();
    void c.resume();
  }

  setMuted(m: boolean): void { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }

  private tone(o: ToneOpts): void {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const vol = o.vol ?? 0.2;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(this.sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.filter ?? 1000, t0);
    if (o.filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filterEnd), t0 + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }

  play(name: SfxName): void {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this.tone({ freq: 300, freqEnd: 620, type: 'square', dur: 0.12, vol: 0.12 }); break;
      case 'land': this.noise({ dur: 0.08, vol: 0.12, filter: 400, type: 'lowpass' }); break;
      case 'step':
        if (this.stepCooldown > 0) return; this.stepCooldown = 0.18;
        this.noise({ dur: 0.04, vol: 0.05, filter: 900, type: 'lowpass' }); break;
      case 'hurt': this.tone({ freq: 420, freqEnd: 90, type: 'sawtooth', dur: 0.25, vol: 0.2 }); this.noise({ dur: 0.15, vol: 0.1, filter: 600 }); break;
      case 'death': this.tone({ freq: 300, freqEnd: 40, type: 'sawtooth', dur: 0.9, vol: 0.25 }); this.noise({ dur: 0.6, vol: 0.15, filter: 300, type: 'lowpass' }); break;
      case 'pickup': this.tone({ freq: 660, type: 'square', dur: 0.08, vol: 0.1 }); this.tone({ freq: 990, type: 'square', dur: 0.12, vol: 0.1, delay: 0.07 }); break;
      case 'egg':
        [880, 1108, 1318, 1760].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.12, delay: i * 0.09 }));
        break;
      case 'key': this.tone({ freq: 1200, type: 'triangle', dur: 0.1, vol: 0.12 }); this.tone({ freq: 1600, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.1 }); break;
      case 'item':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.25, vol: 0.09, delay: i * 0.08 }));
        break;
      case 'flame':
        [220, 330, 440, 554, 659].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 1.2, vol: 0.1, delay: i * 0.12, attack: 0.1 }));
        break;
      case 'unlock': this.tone({ freq: 200, freqEnd: 120, type: 'square', dur: 0.3, vol: 0.15 }); this.tone({ freq: 800, type: 'triangle', dur: 0.4, vol: 0.1, delay: 0.25 }); break;
      case 'save': this.tone({ freq: 784, type: 'triangle', dur: 0.15, vol: 0.12 }); this.tone({ freq: 1046, type: 'triangle', dur: 0.3, vol: 0.12, delay: 0.15 }); break;
      case 'phone': for (let i = 0; i < 3; i++) this.tone({ freq: 1400, type: 'square', dur: 0.05, vol: 0.06, delay: i * 0.08 }); break;
      case 'door': this.noise({ dur: 0.5, vol: 0.2, filter: 150, filterEnd: 60, type: 'lowpass' }); this.tone({ freq: 90, freqEnd: 60, type: 'sawtooth', dur: 0.4, vol: 0.12 }); break;
      case 'lever': this.tone({ freq: 500, freqEnd: 250, type: 'square', dur: 0.08, vol: 0.1 }); this.noise({ dur: 0.08, vol: 0.1, filter: 2000 }); break;
      case 'button': this.tone({ freq: 240, freqEnd: 180, type: 'square', dur: 0.1, vol: 0.12 }); break;
      case 'bubble': this.tone({ freq: 500, freqEnd: 900, type: 'sine', dur: 0.2, vol: 0.12 }); break;
      case 'pop': this.noise({ dur: 0.06, vol: 0.18, filter: 2500, q: 2 }); this.tone({ freq: 900, freqEnd: 300, type: 'sine', dur: 0.06, vol: 0.1 }); break;
      case 'disc': this.noise({ dur: 0.25, vol: 0.12, filter: 1200, filterEnd: 3000, q: 3 }); break;
      case 'discBounce': this.tone({ freq: 1100, freqEnd: 700, type: 'square', dur: 0.05, vol: 0.1 }); break;
      case 'discCatch': this.tone({ freq: 700, freqEnd: 1000, type: 'square', dur: 0.07, vol: 0.08 }); break;
      case 'fuse': this.noise({ dur: 0.9, vol: 0.05, filter: 5000, q: 1 }); break;
      case 'bang': this.noise({ dur: 0.5, vol: 0.45, filter: 900, filterEnd: 80, type: 'lowpass' }); this.tone({ freq: 120, freqEnd: 30, type: 'sine', dur: 0.4, vol: 0.4 }); break;
      case 'yoyo': this.tone({ freq: 800, freqEnd: 1500, type: 'square', dur: 0.08, vol: 0.07 }); this.noise({ dur: 0.1, vol: 0.06, filter: 3000 }); break;
      case 'splash': this.noise({ dur: 0.3, vol: 0.18, filter: 800, filterEnd: 300, type: 'lowpass' }); break;
      case 'swim': this.noise({ dur: 0.12, vol: 0.05, filter: 500, type: 'lowpass' }); break;
      case 'lantern': this.tone({ freq: 440, freqEnd: 880, type: 'sine', dur: 0.15, vol: 0.1 }); break;
      case 'ui': this.tone({ freq: 900, type: 'square', dur: 0.04, vol: 0.06 }); break;
      case 'denied': this.tone({ freq: 200, freqEnd: 150, type: 'square', dur: 0.15, vol: 0.1 }); break;
      case 'break': this.noise({ dur: 0.3, vol: 0.3, filter: 600, filterEnd: 150, type: 'lowpass' }); this.tone({ freq: 160, freqEnd: 60, type: 'square', dur: 0.2, vol: 0.12 }); break;
      case 'cat': this.tone({ freq: 700, freqEnd: 500, type: 'sawtooth', dur: 0.3, vol: 0.06, filter: 1200 }); break;
      case 'dog': this.tone({ freq: 220, freqEnd: 180, type: 'sawtooth', dur: 0.12, vol: 0.12, filter: 900 }); this.tone({ freq: 260, freqEnd: 200, type: 'sawtooth', dur: 0.12, vol: 0.12, delay: 0.14, filter: 900 }); break;
      case 'bird': this.tone({ freq: 2000, freqEnd: 2600, type: 'sine', dur: 0.08, vol: 0.06 }); this.tone({ freq: 2400, freqEnd: 1800, type: 'sine', dur: 0.1, vol: 0.06, delay: 0.1 }); break;
      case 'ending':
        [220, 277, 330, 440, 554, 659, 880].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 2.5, vol: 0.1, delay: i * 0.2, attack: 0.3 }));
        break;
    }
  }

  // ---------- 氛围音乐 ----------
  private startDrone(): void {
    const c = this.ctx; if (!c) return;
    const gain = c.createGain(); gain.gain.value = 0.0;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 1.5;
    const oscs: OscillatorNode[] = [];
    for (const [type, det] of [['sawtooth', -7], ['sawtooth', 6], ['triangle', 0]] as const) {
      const o = c.createOscillator(); o.type = type; o.detune.value = det;
      o.connect(filter); o.start(); oscs.push(o);
    }
    // 慢速 LFO 调制滤波器
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoGain = c.createGain(); lfoGain.gain.value = 140;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    filter.connect(gain); gain.connect(this.musicBus);
    this.drone = { osc: oscs, gain, filter };
    this.applyRegion();
    gain.gain.linearRampToValueAtTime(0.08, c.currentTime + 4);
  }

  setRegion(r: RegionId): void {
    if (r === this.region) return;
    this.region = r;
    this.applyRegion();
  }

  private applyRegion(): void {
    const c = this.ctx; if (!c || !this.drone) return;
    const root = SCALES[this.region].root;
    const t = c.currentTime;
    this.drone.osc[0].frequency.exponentialRampToValueAtTime(root, t + 2);
    this.drone.osc[1].frequency.exponentialRampToValueAtTime(root * 1.5, t + 2);
    this.drone.osc[2].frequency.exponentialRampToValueAtTime(root * 2, t + 2);
  }

  /** 每帧调用：零星的拨弦音 */
  update(dt: number, intensity = 1): void {
    const c = this.ctx; if (!c) return;
    this.stepCooldown = Math.max(0, this.stepCooldown - dt);
    this.nextPluck -= dt;
    if (this.nextPluck > 0) return;
    this.nextPluck = 1.6 + Math.random() * 3.2 / Math.max(0.2, intensity);
    const { root, scale } = SCALES[this.region];
    // 随机游走选音
    this.lastNote = Math.max(0, Math.min(scale.length - 1, this.lastNote + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.3 ? 2 : 1)));
    const semis = scale[this.lastNote] + 24 + (Math.random() < 0.3 ? 12 : 0);
    const f = root * Math.pow(2, semis / 12);
    const t0 = c.currentTime;
    const osc = c.createOscillator(); osc.type = Math.random() < 0.5 ? 'triangle' : 'sine';
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
    osc.connect(g); g.connect(this.musicBus); g.connect(this.echo);
    osc.start(t0); osc.stop(t0 + 2);
  }
}
