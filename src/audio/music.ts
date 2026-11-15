import { getStorage, type StorageLike, type GameSettings } from '../storage';
import { clampVolume, effectiveGain, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME } from './volume';
import { defaultAudioContextFactory, type AudioContextFactory, type AudioContextLike, type GainNodeLike, type OscillatorNodeLike, type AudioNodeLike, type AudioParamLike, type AudioBufferLike, type AudioBufferSourceNodeLike } from './sound-effects';

const BEAT = 60 / 74;
const FADE = 1.5;
const VOLUME_FADE = 0.065;
const MODES = [[0, 2, 4, 7, 9], [0, 2, 5, 7, 10], [0, 3, 5, 8, 10], [0, 2, 5, 7, 9], [0, 3, 5, 7, 10]];
const clamp = (n: number) => clampVolume(n, DEFAULT_MUSIC_VOLUME);
export const AUDIO_MUTE_STORAGE_KEY = 'itm.audio-mute.v1';
export type AudioChoices = Pick<GameSettings, 'soundEnabled' | 'musicEnabled'>;

/** Header quick mute remembers the independent switches for the next unmute. */
export class AudioQuickMute {
  private previous: AudioChoices | null = null;
  constructor(private storage: StorageLike = getStorage()) {
    try {
      const value = JSON.parse(storage.getItem(AUDIO_MUTE_STORAGE_KEY) ?? 'null');
      if (typeof value?.soundEnabled === 'boolean' && typeof value?.musicEnabled === 'boolean'
        && (value.soundEnabled || value.musicEnabled)) {
        this.previous = { soundEnabled: value.soundEnabled, musicEnabled: value.musicEnabled };
      }
    } catch { /* Use the in-memory snapshot if storage is unavailable. */ }
  }
  clear(): void {
    this.previous = null;
    try { this.storage.removeItem(AUDIO_MUTE_STORAGE_KEY); } catch { /* unavailable storage */ }
  }
  toggle(current: AudioChoices): AudioChoices {
    if (current.soundEnabled || current.musicEnabled) {
      this.previous = { soundEnabled: current.soundEnabled, musicEnabled: current.musicEnabled };
      try { this.storage.setItem(AUDIO_MUTE_STORAGE_KEY, JSON.stringify(this.previous)); } catch { /* unavailable storage */ }
      return { soundEnabled: false, musicEnabled: false };
    }
    const restored = this.previous ?? { soundEnabled: true, musicEnabled: true };
    this.clear();
    return { ...restored };
  }
}

type Source = OscillatorNodeLike | AudioBufferSourceNodeLike;
interface Filter extends AudioNodeLike { type: string; frequency: AudioParamLike; Q: AudioParamLike }
interface MusicContext extends AudioContextLike {
  createBiquadFilter?: () => Filter;
}
interface Voice {
  sources: Source[];
  nodes: AudioNodeLike[];
  start: number;
  end: number;
}

/** Procedural pentatonic tea-house music. No resources are created before start(). */
export class MusicEngine {
  private context: MusicContext | null = null;
  private master: GainNodeLike | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private voices = new Set<Voice>();
  private enabled: boolean;
  private volume: number;
  private masterVolume: number;
  private requested = false;
  private paused = false;
  private next = 0;
  private step = 0;
  private seed: number;
  private degree = 2;
  private mode = 0;
  private tonic = 0;
  private lastWind = 261.63;
  private excitation: Float32Array | null = null;
  private plucks = new Map<number, AudioBufferLike>();
  private ramp = { from: 0, to: 0, start: 0, duration: FADE };

  constructor(private options: { contextFactory?: AudioContextFactory; enabled?: boolean; volume?: number; masterVolume?: number; seed?: number } = {}) {
    this.enabled = options.enabled ?? true;
    this.volume = clamp(options.volume ?? 0.5);
    this.masterVolume = clampVolume(options.masterVolume ?? DEFAULT_MASTER_VOLUME);
    this.seed = options.seed ?? Date.now();
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  applySettings(settings: Pick<GameSettings, 'musicEnabled' | 'musicVolume' | 'masterVolume'>): void {
    const enabledChanged = this.enabled !== settings.musicEnabled;
    const volumeChanged = this.volume !== clamp(settings.musicVolume) || this.masterVolume !== clampVolume(settings.masterVolume);
    this.volume = clamp(settings.musicVolume);
    this.masterVolume = clampVolume(settings.masterVolume);
    this.enabled = settings.musicEnabled;
    if (enabledChanged) this.sync();
    else if (volumeChanged) this.sync(VOLUME_FADE);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume);
    this.sync(VOLUME_FADE);
  }

  /** Music trim preserves the original default level: 1^2 * 0.5^2 * 0.6 = 0.15. */
  private level(): number { return effectiveGain(this.masterVolume, this.volume, 0.6); }

  /** Call in a user gesture; later visibility resumes reuse this unlocked context. */
  async start(): Promise<boolean> {
    this.requested = true;
    try {
      if (this.context?.state === 'closed') {
        clearInterval(this.timer);
        this.timer = undefined;
        for (const voice of this.voices) this.release(voice);
        this.master?.disconnect?.();
        this.master = null;
        this.context = null;
        this.excitation = null;
        this.plucks.clear();
        this.ramp = { from: 0, to: 0, start: 0, duration: FADE };
      }
      this.context ??= (this.options.contextFactory ?? defaultAudioContextFactory)();
      if (!this.context) return false;
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') await this.context.resume?.();
      this.sync();
      return this.context.state === 'running';
    } catch { return false; }
  }

  stop(): void { this.requested = false; this.sync(); }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.requested && (this.context?.state === 'suspended' || this.context?.state === 'interrupted' || this.context?.state === 'closed')) {
      void this.start();
    } else this.sync();
  }

  private fade(target: number, duration = FADE): void {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    const fraction = Math.min(1, Math.max(0, (now - this.ramp.start) / this.ramp.duration));
    const current = this.ramp.from + (this.ramp.to - this.ramp.from) * fraction;
    const param = this.master.gain as GainNodeLike['gain'] & { cancelScheduledValues?: (t: number) => void };
    param.cancelScheduledValues?.(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(target, now + duration);
    this.ramp = { from: current, to: target, start: now, duration };
  }

  private sync(duration = FADE): void {
    const ctx = this.context;
    if (!ctx) return;
    const playing = this.requested && this.enabled && !this.paused && ctx.state === 'running' && this.level() > 0;
    if (playing) {
      if (!this.master) {
        this.master = ctx.createGain();
        this.master.gain.setValueAtTime(0, ctx.currentTime);
        this.master.connect(ctx.destination);
      }
      if (this.timer === undefined) {
        this.next = ctx.currentTime + 0.05;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), 250);
      }
      if (this.ramp.to !== this.level()) this.fade(this.level(), duration);
    } else {
      clearInterval(this.timer);
      this.timer = undefined;
      if (this.ramp.to !== 0) this.fade(0, duration);
      for (const voice of this.voices) {
        // Notes queued ahead never sound, so a quick re-enable cannot double the beat.
        if (voice.start > ctx.currentTime) voice.sources.forEach(source => source.stop(ctx.currentTime));
        // A slider dip to 0 keeps sustained pads, so a quick drag back up cannot cut them while audible.
        else if (duration === FADE && voice.end > ctx.currentTime + FADE) {
          voice.end = ctx.currentTime + FADE;
          voice.sources.forEach(source => source.stop(voice.end));
        }
      }
    }
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) source.onended = null;
    for (const node of voice.nodes) node.disconnect?.();
  }

  private play(sources: Source[], nodes: AudioNodeLike[], start: number, duration: number): void {
    const voice: Voice = { sources, nodes, start, end: start + duration + 0.02 };
    this.voices.add(voice);
    let remaining = sources.length;
    for (const source of sources) {
      source.onended = () => { if (--remaining === 0) this.release(voice); };
      source.start(start);
      source.stop(voice.end);
    }
  }

  private envelope(start: number, duration: number, peak: number, attack: number): GainNodeLike {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.master!);
    return gain;
  }

  private pluckBuffer(frequency: number): AudioBufferLike {
    const ctx = this.context!;
    const cached = this.plucks.get(frequency);
    if (cached) {
      this.plucks.delete(frequency);
      this.plucks.set(frequency, cached);
      return cached;
    }
    if (!this.excitation) {
      this.excitation = new Float32Array(2048);
      // Local noise leaves the composition's seeded random() stream unchanged.
      let seed = 0x51f15e;
      for (let i = 0; i < this.excitation.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        this.excitation[i] = seed / 4294967296 - 0.5;
      }
    }
    const buffer = ctx.createBuffer!(1, Math.ceil(ctx.sampleRate * 2.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // The two-tap damping filter adds half a sample of phase delay.
    // Fractional reads compensate it, independently of Web Audio render quanta.
    const delay = ctx.sampleRate / frequency - 0.5;
    const initial = Math.ceil(delay) + 1;
    let mean = 0;
    for (let i = 0; i < initial; i++) {
      data[i] = this.excitation[i % this.excitation.length]! * 0.5 + 0.5 * Math.sin(2 * Math.PI * frequency * i / ctx.sampleRate);
      mean += data[i]! / initial;
    }
    for (let i = 0; i < initial; i++) data[i] = data[i]! - mean;
    const damping = Math.exp(-3 / (frequency * 2.5));
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      if (i >= initial) {
        const read = i - delay;
        const index = Math.floor(read);
        const fraction = read - index;
        const a = data[index]! * (1 - fraction) + data[index + 1]! * fraction;
        const b = data[index - 1]! * (1 - fraction) + data[index]! * fraction;
        data[i] = damping * (a + b) * 0.5;
      }
      peak = Math.max(peak, Math.abs(data[i]!));
    }
    // Normalize before playback: no graph cycles, resonant gain, or unbounded samples.
    for (let i = 0; i < data.length; i++) {
      const tail = Math.min(1, (data.length - 1 - i) / (ctx.sampleRate * 0.02));
      data[i] = data[i]! * (0.25 / Math.max(peak, 0.0001)) * tail;
    }
    if (this.plucks.size >= 32) this.plucks.delete(this.plucks.keys().next().value!);
    this.plucks.set(frequency, buffer);
    return buffer;
  }

  private pluck(frequency: number, start: number, peak: number, bend = false, duration = 1.65): void {
    const ctx = this.context!;
    const gain = this.envelope(start, duration, peak, 0.004);
    const ratio = bend ? 2 ** (2 / 12) : 1;
    if (ctx.createBuffer && ctx.createBufferSource) {
      const source = ctx.createBufferSource() as AudioBufferSourceNodeLike & { playbackRate: AudioParamLike };
      source.buffer = this.pluckBuffer(frequency);
      source.playbackRate.setValueAtTime(1, start);
      if (bend) source.playbackRate.linearRampToValueAtTime(ratio, start + 0.38);
      source.connect(gain);
      this.play([source], [source, gain], start, duration);
    } else {
      // A quiet harmonic stack retains the fast attack on minimal audio contexts.
      const sources = [1, 2].map((harmonic, i) => {
        const osc = ctx.createOscillator();
        osc.type = i ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(frequency * harmonic, start);
        if (bend) osc.frequency.linearRampToValueAtTime(frequency * harmonic * ratio, start + 0.38);
        return osc;
      });
      const overtone = ctx.createGain();
      overtone.gain.setValueAtTime(0.18, start);
      let filter: Filter | undefined;
      if (ctx.createBiquadFilter) {
        filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(frequency * 4, start); filter.Q.setValueAtTime(0.3, start);
        filter.connect(gain);
      }
      sources[0]!.connect(filter ?? gain); sources[1]!.connect(overtone); overtone.connect(filter ?? gain);
      this.play(sources, [...sources, overtone, gain, ...(filter ? [filter] : [])], start, duration);
    }
  }

  private tone(frequency: number, start: number, duration: number, peak: number, kind: 'pad' | 'wind' | 'wood' | 'gong'): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const gain = this.envelope(start, duration, peak, kind === 'pad' ? 1.3 : kind === 'wind' ? 0.32 : 0.003);
    osc.type = kind === 'wind' ? 'triangle' : kind === 'wood' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'wind' ? this.lastWind : frequency, start);
    if (kind === 'wind') {
      osc.frequency.linearRampToValueAtTime(frequency, start + 0.22);
      // Sparse automation avoids a second oscillator for delayed, slow vibrato.
      for (let i = 0; i <= 32; i++) {
        const t = 0.5 + i * 0.06;
        if (t < duration) osc.frequency.linearRampToValueAtTime(frequency * (1 + 0.004 * Math.sin(i * 0.06 * Math.PI * 9)), start + t);
      }
      this.lastWind = frequency;
    }
    if (kind === 'gong') osc.frequency.exponentialRampToValueAtTime(frequency * 0.97, start + duration);
    const nodes: AudioNodeLike[] = [osc, gain];
    if (ctx.createBiquadFilter) {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(kind === 'wind' ? 1600 : kind === 'pad' ? 450 : 2600, start);
      filter.Q.setValueAtTime(kind === 'wood' ? 3 : 0.4, start);
      osc.connect(filter); filter.connect(gain); nodes.push(filter);
    } else osc.connect(gain);
    this.play([osc], nodes, start, duration);
  }

  private pitch(degree: number): number {
    return 261.63 * 2 ** ((this.tonic + MODES[this.mode]![degree % 5]! + 12 * Math.floor(degree / 5)) / 12);
  }

  private schedule(): void {
    const ctx = this.context!;
    if (this.level() === 0 || ctx.state !== 'running') return;
    for (const voice of this.voices) if (voice.end < ctx.currentTime) this.release(voice);
    // Skip missed beats after suspension or a long main-thread stall, never catch up in a burst.
    this.next = Math.max(this.next, ctx.currentTime + 0.02);
    while (this.next < ctx.currentTime + 1.5) {
      const phraseStep = this.step % 16;
      if (this.step % 48 === 0) {
        this.mode = Math.floor(this.random() * MODES.length);
        this.tonic = [0, 2, 5, 7][Math.floor(this.random() * 4)]!;
      }
      const swell = 0.8 + 0.2 * Math.sin(this.step / 29);
      if (this.step % 8 === 0) {
        const root = this.pitch(0) / 2;
        this.tone(root, this.next, BEAT * 9, 0.09 * swell, 'pad');
        this.tone(root * 1.5, this.next, BEAT * 9, 0.035 * swell, 'pad');
      }
      if (phraseStep === 0 && this.step % 32 === 0) {
        // The phrase opens with a short rising rake, leaving room for the main pluck.
        for (let i = 0; i < 3; i++) this.pluck(this.pitch(i), this.next + i * 0.035, 0.065, false, 0.6);
      }
      if (phraseStep < 12 && this.random() > 0.25) {
        this.degree = Math.max(0, Math.min(9, this.degree + Math.floor(this.random() * 5) - 2));
        if (phraseStep === 10) this.degree = 0;
        const frequency = this.pitch(this.degree);
        const peak = (0.26 + this.random() * 0.08) * swell;
        const tremolo = phraseStep === 6 && this.random() > 0.45;
        this.pluck(frequency, this.next + (phraseStep === 0 ? 0.16 : 0), peak, !tremolo && this.random() > 0.8);
        if (tremolo) for (let i = 1; i <= 3; i++) this.pluck(frequency, this.next + i * 0.16, peak * 0.48, false, 0.65);
      }
      if (phraseStep === 8 && this.step % 32 < 16) this.tone(this.pitch(2), this.next, 2.8, 0.045, 'wind');
      if (phraseStep % 8 === 0 && this.random() > 0.4) this.tone(950, this.next, 0.055, 0.035, 'wood');
      if (this.step % 64 === 60) {
        this.tone(196, this.next, 3.2, 0.018, 'gong');
        this.tone(196 * 2.71, this.next, 2, 0.006, 'gong');
      }
      this.next += BEAT;
      this.step++;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    for (const voice of this.voices) this.release(voice);
    this.master?.disconnect?.();
    this.master = null;
    this.ramp = { from: 0, to: 0, start: 0, duration: FADE };
    const ctx = this.context;
    this.context = null;
    this.excitation = null;
    this.plucks.clear();
    try { await ctx?.close?.(); } catch { /* unavailable context */ }
  }
}

export const backgroundMusic = new MusicEngine();
