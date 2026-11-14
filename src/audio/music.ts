import { getStorage, type StorageLike, type GameSettings } from '../storage';
import { clampVolume, effectiveGain, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME } from './volume';
import { defaultAudioContextFactory, type AudioContextFactory, type AudioContextLike, type GainNodeLike, type OscillatorNodeLike } from './sound-effects';

const BEAT = 60 / 74;
const FADE = 1.5;
const SCALE = [0, 2, 4, 7, 9];
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

interface Voice {
  osc: OscillatorNodeLike & { onended?: (() => void) | null };
  gain: GainNodeLike;
  start: number;
  end: number;
}

/** Procedural pentatonic tea-house music. No resources are created before start(). */
export class MusicEngine {
  private context: AudioContextLike | null = null;
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
  private ramp = { from: 0, to: 0, start: 0 };

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
    this.volume = clamp(settings.musicVolume);
    this.masterVolume = clampVolume(settings.masterVolume);
    this.setEnabled(settings.musicEnabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume);
    this.fade(this.timer !== undefined ? this.level() : 0);
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
        this.ramp = { from: 0, to: 0, start: 0 };
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

  private fade(target: number): void {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    const fraction = Math.min(1, Math.max(0, (now - this.ramp.start) / FADE));
    const current = this.ramp.from + (this.ramp.to - this.ramp.from) * fraction;
    const param = this.master.gain as GainNodeLike['gain'] & { cancelScheduledValues?: (t: number) => void };
    param.cancelScheduledValues?.(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(target, now + FADE);
    this.ramp = { from: current, to: target, start: now };
  }

  private sync(): void {
    const ctx = this.context;
    if (!ctx) return;
    const playing = this.requested && this.enabled && !this.paused && ctx.state === 'running';
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
      this.fade(this.level());
    } else {
      clearInterval(this.timer);
      this.timer = undefined;
      this.fade(0);
      for (const voice of this.voices) {
        // Notes queued ahead never sound, so a quick re-enable cannot double the beat.
        if (voice.start > ctx.currentTime) voice.osc.stop(ctx.currentTime);
        else if (voice.end > ctx.currentTime + FADE) {
          voice.end = ctx.currentTime + FADE;
          voice.osc.stop(voice.end);
        }
      }
    }
  }

  private release(voice: Voice): void {
    voice.osc.disconnect?.();
    voice.gain.disconnect?.();
    this.voices.delete(voice);
  }

  private tone(frequency: number, start: number, duration: number, peak: number, pad = false): void {
    const ctx = this.context!;
    const osc: Voice['osc'] = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = pad ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + (pad ? 1.3 : 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master!);
    const voice: Voice = { osc, gain, start, end: start + duration + 0.02 };
    this.voices.add(voice);
    osc.onended = () => this.release(voice);
    osc.start(start);
    osc.stop(voice.end);
  }

  private schedule(): void {
    const ctx = this.context!;
    for (const voice of this.voices) if (voice.end < ctx.currentTime) this.release(voice);
    // Skip missed beats after suspension or a long main-thread stall, never catch up in a burst.
    this.next = Math.max(this.next, ctx.currentTime + 0.02);
    while (this.next < ctx.currentTime + 1.5) {
      const phraseStep = this.step % 16;
      const chord = [0, 9, 5, 7][Math.floor(this.step / 32) % 4]!;
      const swell = 0.8 + 0.2 * Math.sin(this.step / 29);
      if (this.step % 8 === 0) {
        const root = 130.81 * 2 ** (chord / 12);
        this.tone(root, this.next, BEAT * 9, 0.13 * swell, true);
        this.tone(root * 1.5, this.next, BEAT * 9, 0.06 * swell, true);
      }
      // Each phrase has a quiet tail; random walks and octave changes avoid a fixed loop.
      if (phraseStep < 11 && this.random() > 0.28) {
        this.degree = Math.max(0, Math.min(9, this.degree + Math.floor(this.random() * 5) - 2));
        const semitone = SCALE[this.degree % 5]! + 12 * Math.floor(this.degree / 5);
        const frequency = 261.63 * 2 ** (semitone / 12);
        const peak = (0.24 + this.random() * 0.12) * swell;
        this.tone(frequency, this.next, 1.7, peak);
        this.tone(frequency * 1.002, this.next, 1.2, peak * 0.25);
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
    const ctx = this.context;
    this.context = null;
    try { await ctx?.close?.(); } catch { /* unavailable context */ }
  }
}

export const backgroundMusic = new MusicEngine();
