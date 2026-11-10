// ============================================================================
// Web Audio Sound Synthesis (F26)
// ----------------------------------------------------------------------------
// Lightweight procedural sound effects generated with oscillators and a short
// white-noise buffer; no audio assets are shipped. Every entry point is a safe
// no-op when sound is disabled or when no AudioContext exists (Node, SSR,
// headless test runners, very old browsers).
// ============================================================================

import type { GameSettings } from '../storage/storage';

// ============================================================================
// Minimal structural Web Audio types (lets tests inject a mock context)
// ============================================================================

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect?(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBuffer?(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource?(): AudioBufferSourceNodeLike;
  resume?(): Promise<void>;
  close?(): Promise<void>;
}

export type AudioContextFactory = () => AudioContextLike | null;

// ============================================================================
// Sound recipes (pure data)
// ============================================================================

export type SoundEffectName =
  | 'draw' // Tarik: tile drawn from wall
  | 'discard' // Buang: tile clack on the table
  | 'jia' // Jia (Chow) call
  | 'pung' // Pung call
  | 'kong' // Kong call
  | 'flower' // Flower/season replacement chime
  | 'hu' // Hu victory fanfare
  | 'lewFit'; // Lew Fit foul buzzer

export type MeldCallType = 'jia' | 'pung' | 'kong';

export type WaveShape = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface ToneVoice {
  readonly kind: 'tone';
  readonly wave: WaveShape;
  /** Start frequency in Hz */
  readonly frequency: number;
  /** Optional end frequency for an exponential pitch sweep */
  readonly frequencyEnd?: number;
  /** Offset in seconds from the moment `play` is called */
  readonly start: number;
  /** Duration in seconds */
  readonly duration: number;
  /** Peak gain (0..1) before master volume */
  readonly gain: number;
}

export interface NoiseVoice {
  readonly kind: 'noise';
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
}

export type SoundVoice = ToneVoice | NoiseVoice;

const tone = (
  wave: WaveShape,
  frequency: number,
  start: number,
  duration: number,
  gain: number,
  frequencyEnd?: number,
): ToneVoice =>
  frequencyEnd === undefined
    ? { kind: 'tone', wave, frequency, start, duration, gain }
    : { kind: 'tone', wave, frequency, frequencyEnd, start, duration, gain };

const noise = (start: number, duration: number, gain: number): NoiseVoice => ({
  kind: 'noise',
  start,
  duration,
  gain,
});

// Note frequencies (Hz)
const N = {
  A2: 110,
  G3: 196,
  G4: 392,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
} as const;

export const SOUND_RECIPES: Readonly<Record<SoundEffectName, readonly SoundVoice[]>> =
  Object.freeze({
    draw: [tone('sine', 660, 0, 0.07, 0.22, 880), noise(0, 0.03, 0.06)],
    discard: [noise(0, 0.045, 0.45), tone('triangle', 1200, 0, 0.06, 0.28, 280)],
    jia: [tone('triangle', N.C5, 0, 0.11, 0.3), tone('triangle', N.E5, 0.08, 0.14, 0.3)],
    pung: [
      noise(0, 0.03, 0.25),
      tone('triangle', N.G4, 0, 0.2, 0.3),
      tone('triangle', N.D5, 0, 0.2, 0.22),
    ],
    kong: [
      noise(0, 0.04, 0.3),
      tone('sawtooth', N.G3, 0, 0.3, 0.16),
      tone('triangle', N.G4, 0, 0.28, 0.26),
      tone('triangle', N.G5, 0.06, 0.24, 0.2),
    ],
    flower: [
      tone('sine', N.C6, 0, 0.35, 0.2),
      tone('sine', N.E6, 0.07, 0.35, 0.18),
      tone('sine', N.G6, 0.14, 0.4, 0.16),
    ],
    hu: [
      tone('triangle', N.C5, 0, 0.18, 0.3),
      tone('triangle', N.E5, 0.12, 0.18, 0.3),
      tone('triangle', N.G5, 0.24, 0.18, 0.3),
      tone('triangle', N.C6, 0.36, 0.22, 0.32),
      tone('triangle', N.G5, 0.52, 0.8, 0.22),
      tone('triangle', N.C6, 0.52, 0.8, 0.24),
      tone('sine', N.E6, 0.52, 0.8, 0.16),
    ],
    lewFit: [
      tone('sawtooth', N.A2, 0, 0.32, 0.28),
      tone('square', 116, 0, 0.32, 0.16),
      tone('sawtooth', N.A2, 0.42, 0.32, 0.28),
      tone('square', 116, 0.42, 0.32, 0.16),
    ],
  });

export const SOUND_EFFECT_NAMES: readonly SoundEffectName[] = Object.freeze(
  Object.keys(SOUND_RECIPES) as SoundEffectName[],
);

export function isSoundEffectName(value: unknown): value is SoundEffectName {
  return typeof value === 'string' && (SOUND_EFFECT_NAMES as readonly string[]).includes(value);
}

/** Total length (seconds) of a recipe, i.e. the end of its last voice. */
export function getRecipeDuration(name: SoundEffectName): number {
  return SOUND_RECIPES[name].reduce((max, v) => Math.max(max, v.start + v.duration), 0);
}

// ============================================================================
// Environment detection
// ============================================================================

/** Locate the AudioContext constructor (standard or webkit-prefixed), if any. */
function findAudioContextCtor(): (new () => unknown) | null {
  try {
    const g = globalThis as {
      AudioContext?: new () => unknown;
      webkitAudioContext?: new () => unknown;
    };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

/** True when the runtime exposes a Web Audio AudioContext constructor. */
export function isWebAudioSupported(): boolean {
  return findAudioContextCtor() !== null;
}

/** Default factory: creates a browser AudioContext, or null when unavailable. */
export const defaultAudioContextFactory: AudioContextFactory = () => {
  const Ctor = findAudioContextCtor();
  if (!Ctor) return null;
  try {
    return new Ctor() as AudioContextLike;
  } catch {
    return null;
  }
};

// ============================================================================
// Sound engine
// ============================================================================

export interface SoundEngineOptions {
  enabled?: boolean;
  /** Master volume 0..1 (default 0.6) */
  volume?: number;
  contextFactory?: AudioContextFactory;
}

const SILENT = 0.0001; // exponential ramps cannot target 0
const NOISE_BUFFER_SECONDS = 0.25;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export class SoundEngine {
  private enabled: boolean;
  private volume: number;
  private readonly contextFactory: AudioContextFactory;
  private context: AudioContextLike | null = null;
  /** True once creation failed; prevents retrying on every play in headless envs */
  private contextUnavailable = false;
  private noiseBuffer: AudioBufferLike | null = null;

  constructor(options: SoundEngineOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.volume = clamp01(options.volume ?? 0.6);
    this.contextFactory = options.contextFactory ?? defaultAudioContextFactory;
  }

  // --- configuration -----------------------------------------------------------

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume);
  }

  /** Sync with persisted user settings (respects `soundEnabled`). */
  applySettings(settings: Pick<GameSettings, 'soundEnabled'>): void {
    this.setEnabled(settings.soundEnabled);
  }

  /** True if an AudioContext exists or can be created. Never throws. */
  isSupported(): boolean {
    return this.getContext() !== null;
  }

  // --- lifecycle ---------------------------------------------------------------

  private getContext(): AudioContextLike | null {
    if (this.context && this.context.state === 'closed') {
      this.context = null;
      this.noiseBuffer = null;
    }
    if (this.context) return this.context;
    if (this.contextUnavailable) return null;
    try {
      this.context = this.contextFactory();
    } catch {
      this.context = null;
    }
    if (!this.context) this.contextUnavailable = true;
    return this.context;
  }

  /**
   * Resume a suspended context (browsers require a user gesture before audio).
   * Call from a click/touch handler. Resolves true when audio is running.
   */
  async unlock(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  /** Close the underlying context and release resources. Safe to call repeatedly. */
  async dispose(): Promise<void> {
    const ctx = this.context;
    this.context = null;
    this.noiseBuffer = null;
    this.contextUnavailable = false;
    if (ctx?.close && ctx.state !== 'closed') {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
    }
  }

  // --- playback ----------------------------------------------------------------

  /**
   * Play a named effect. Returns true if the sound was scheduled, false when
   * muted, unsupported, unknown, or scheduling failed. Never throws.
   */
  play(name: SoundEffectName): boolean {
    if (!this.enabled || this.volume <= 0 || !isSoundEffectName(name)) return false;
    const ctx = this.getContext();
    if (!ctx) return false;

    try {
      if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume().catch(() => undefined);
      }
      const t0 = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(this.volume, t0);
      master.connect(ctx.destination);

      for (const voice of SOUND_RECIPES[name]) {
        if (voice.kind === 'tone') this.scheduleTone(ctx, master, voice, t0);
        else this.scheduleNoise(ctx, master, voice, t0);
      }
      return true;
    } catch {
      return false;
    }
  }

  playTileDraw(): boolean {
    return this.play('draw');
  }

  playTileDiscard(): boolean {
    return this.play('discard');
  }

  playMeldCall(type: MeldCallType): boolean {
    return this.play(type);
  }

  playFlowerReplacement(): boolean {
    return this.play('flower');
  }

  playHuFanfare(): boolean {
    return this.play('hu');
  }

  playLewFitBuzzer(): boolean {
    return this.play('lewFit');
  }

  private envelope(gain: GainNodeLike, peak: number, start: number, duration: number): void {
    const attack = Math.min(0.01, duration * 0.2);
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(Math.max(SILENT, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, start + duration);
  }

  private scheduleTone(
    ctx: AudioContextLike,
    out: AudioNodeLike,
    voice: ToneVoice,
    t0: number,
  ): void {
    const start = t0 + voice.start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.frequency, start);
    if (voice.frequencyEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(voice.frequencyEnd, start + voice.duration);
    }
    this.envelope(gain, voice.gain, start, voice.duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + voice.duration + 0.02);
  }

  private scheduleNoise(
    ctx: AudioContextLike,
    out: AudioNodeLike,
    voice: NoiseVoice,
    t0: number,
  ): void {
    if (!ctx.createBuffer || !ctx.createBufferSource) return; // degrade: skip noise layer
    if (!this.noiseBuffer) {
      const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const start = t0 + voice.start;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = this.noiseBuffer;
    this.envelope(gain, voice.gain, start, voice.duration);
    src.connect(gain);
    gain.connect(out);
    src.start(start);
    src.stop(start + voice.duration + 0.02);
  }
}

// ============================================================================
// Shared default engine & convenience wrappers
// ============================================================================

/** Application-wide sound engine (lazily creates its AudioContext on first play). */
export const soundEffects = new SoundEngine();

/**
 * Play an effect on the shared engine. When `settings` is supplied and
 * `soundEnabled` is false, nothing is played.
 */
export function playSound(
  name: SoundEffectName,
  settings?: Pick<GameSettings, 'soundEnabled'>,
): boolean {
  if (settings && !settings.soundEnabled) return false;
  return soundEffects.play(name);
}

export const playTileDraw = (settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound('draw', settings);
export const playTileDiscard = (settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound('discard', settings);
export const playMeldCall = (type: MeldCallType, settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound(type, settings);
export const playFlowerReplacement = (settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound('flower', settings);
export const playHuFanfare = (settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound('hu', settings);
export const playLewFitBuzzer = (settings?: Pick<GameSettings, 'soundEnabled'>) =>
  playSound('lewFit', settings);
