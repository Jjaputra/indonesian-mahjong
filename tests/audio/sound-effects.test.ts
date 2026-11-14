import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SOUND_EFFECT_NAMES,
  SOUND_RECIPES,
  SoundEngine,
  defaultAudioContextFactory,
  getRecipeDuration,
  isSoundEffectName,
  isWebAudioSupported,
  playSound,
  playTileDraw,
  soundEffects,
  type AudioContextLike,
  type SoundEffectName,
} from '../../src/audio';
import { CASUAL_SETTINGS, TOURNAMENT_SETTINGS } from '../../src/storage';

// ---------------------------------------------------------------------------
// Mock Web Audio context recording every node it creates
// ---------------------------------------------------------------------------

function mockParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function createMockContext(initialState = 'running') {
  const oscillators: Array<{
    type: string;
    frequency: ReturnType<typeof mockParam>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const gains: Array<{ gain: ReturnType<typeof mockParam>; connect: ReturnType<typeof vi.fn> }> =
    [];
  const sources: Array<{
    buffer: unknown;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const buffers: Float32Array[] = [];
  const destination = { connect: vi.fn() };

  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    state: initialState,
    destination,
    createGain: vi.fn(() => {
      const g = { gain: mockParam(), connect: vi.fn() };
      gains.push(g);
      return g;
    }),
    createOscillator: vi.fn(() => {
      const o = {
        type: 'sine',
        frequency: mockParam(),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      };
      oscillators.push(o);
      return o;
    }),
    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      buffers.push(data);
      return { getChannelData: () => data };
    }),
    createBufferSource: vi.fn(() => {
      const s = { buffer: null as unknown, start: vi.fn(), stop: vi.fn(), connect: vi.fn() };
      sources.push(s);
      return s;
    }),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
  };
  return { ctx, oscillators, gains, sources, buffers, destination };
}

const engineWith = (mock: ReturnType<typeof createMockContext>, opts = {}) =>
  new SoundEngine({ contextFactory: () => mock.ctx as unknown as AudioContextLike, ...opts });

const toneCount = (name: SoundEffectName) =>
  SOUND_RECIPES[name].filter((v) => v.kind === 'tone').length;
const noiseCount = (name: SoundEffectName) =>
  SOUND_RECIPES[name].filter((v) => v.kind === 'noise').length;

describe('Audio: sound recipes', () => {
  it('defines every required effect', () => {
    for (const name of ['draw', 'discard', 'jia', 'pung', 'kong', 'flower', 'hu', 'lewFit']) {
      expect(isSoundEffectName(name)).toBe(true);
      expect(SOUND_RECIPES[name as SoundEffectName].length).toBeGreaterThan(0);
    }
    expect(SOUND_EFFECT_NAMES).toHaveLength(8);
    expect(isSoundEffectName('explosion')).toBe(false);
    expect(isSoundEffectName(3)).toBe(false);
  });

  it('every voice has sane timing, gain and audible frequencies', () => {
    for (const name of SOUND_EFFECT_NAMES) {
      for (const v of SOUND_RECIPES[name]) {
        expect(v.start).toBeGreaterThanOrEqual(0);
        expect(v.duration).toBeGreaterThan(0);
        expect(v.gain).toBeGreaterThan(0);
        expect(v.gain).toBeLessThanOrEqual(1);
        if (v.kind === 'tone') {
          expect(v.frequency).toBeGreaterThanOrEqual(20);
          expect(v.frequency).toBeLessThanOrEqual(20000);
          if (v.frequencyEnd !== undefined) expect(v.frequencyEnd).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps tile sounds short and makes the Hu fanfare the longest', () => {
    expect(getRecipeDuration('draw')).toBeLessThan(0.15);
    expect(getRecipeDuration('discard')).toBeLessThan(0.15);
    for (const name of SOUND_EFFECT_NAMES) {
      expect(getRecipeDuration(name)).toBeLessThanOrEqual(getRecipeDuration('hu'));
    }
  });

  it('Lew Fit buzzer uses low harsh waveforms; flower chime uses pure high sines', () => {
    for (const v of SOUND_RECIPES.lewFit) {
      if (v.kind === 'tone') {
        expect(['sawtooth', 'square']).toContain(v.wave);
        expect(v.frequency).toBeLessThan(200);
      }
    }
    for (const v of SOUND_RECIPES.flower) {
      if (v.kind === 'tone') {
        expect(v.wave).toBe('sine');
        expect(v.frequency).toBeGreaterThan(1000);
      }
    }
  });
});

describe('Audio: headless / Node safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no Web Audio support in Node and factory returns null', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(isWebAudioSupported()).toBe(false);
    expect(defaultAudioContextFactory()).toBeNull();
  });

  it('default engine is a safe no-op without AudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const engine = new SoundEngine();
    expect(engine.isSupported()).toBe(false);
    for (const name of SOUND_EFFECT_NAMES) expect(engine.play(name)).toBe(false);
    expect(engine.playHuFanfare()).toBe(false);
    await expect(engine.unlock()).resolves.toBe(false);
    await expect(engine.dispose()).resolves.toBeUndefined();
  });

  it('module-level helpers never throw in Node', () => {
    expect(() => playSound('hu')).not.toThrow();
    expect(() => playTileDraw()).not.toThrow();
    expect(typeof soundEffects.play('discard')).toBe('boolean');
  });

  it('survives a factory or constructor that throws', () => {
    const engine = new SoundEngine({
      contextFactory: () => {
        throw new Error('NotAllowedError');
      },
    });
    expect(engine.play('draw')).toBe(false);
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('boom');
        }
      },
    );
    expect(defaultAudioContextFactory()).toBeNull();
  });

  it('uses webkitAudioContext when only the prefixed constructor exists', () => {
    const mock = createMockContext();
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal(
      'webkitAudioContext',
      function WebkitCtx() {
        return mock.ctx;
      } as unknown as new () => unknown,
    );
    expect(isWebAudioSupported()).toBe(true);
    expect(new SoundEngine().play('jia')).toBe(true);
    expect(mock.oscillators.length).toBe(toneCount('jia'));
  });

  it('does not retry context creation on every play after failure', () => {
    const factory = vi.fn(() => null);
    const engine = new SoundEngine({ contextFactory: factory });
    engine.play('draw');
    engine.play('discard');
    engine.play('hu');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('Audio: synthesis with a mock AudioContext', () => {
  it('lazily creates a single context on first play only', () => {
    const mock = createMockContext();
    const factory = vi.fn(() => mock.ctx as unknown as AudioContextLike);
    const engine = new SoundEngine({ contextFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    engine.play('draw');
    engine.play('discard');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it.each(SOUND_EFFECT_NAMES.map((n) => [n]))(
    'schedules oscillators and noise for "%s"',
    (name) => {
      const mock = createMockContext();
      const engine = engineWith(mock);
      expect(engine.play(name)).toBe(true);
      expect(mock.oscillators).toHaveLength(toneCount(name));
      expect(mock.sources).toHaveLength(noiseCount(name));
      for (const osc of mock.oscillators) {
        expect(osc.start).toHaveBeenCalledTimes(1);
        expect(osc.stop).toHaveBeenCalledTimes(1);
        const startAt = osc.start.mock.calls[0]![0] as number;
        const stopAt = osc.stop.mock.calls[0]![0] as number;
        expect(startAt).toBeGreaterThanOrEqual(10); // relative to ctx.currentTime
        expect(stopAt).toBeGreaterThan(startAt);
      }
    },
  );

  it('routes through a master gain set to the engine volume into destination', () => {
    const mock = createMockContext();
    const engine = engineWith(mock, { volume: 0.4 });
    engine.play('pung');
    const master = mock.gains[0]!;
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0.4 ** 2, 10);
    expect(master.connect).toHaveBeenCalledWith(mock.destination);
  });

  it('detaches each voice gain from the shared bus when its source ends', () => {
    const mock = createMockContext();
    engineWith(mock).play('discard');
    const voices = mock.gains.slice(1) as Array<{ disconnect?: () => void }>;
    for (const v of voices) v.disconnect = vi.fn();
    for (const node of [...mock.oscillators, ...mock.sources] as Array<{ onended?: () => void }>) node.onended?.();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.every((v) => (v.disconnect as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true);
  });

  it('applies recipe waveforms, frequencies and pitch sweeps', () => {
    const mock = createMockContext();
    engineWith(mock).playTileDiscard();
    const recipeTones = SOUND_RECIPES.discard.filter((v) => v.kind === 'tone');
    mock.oscillators.forEach((osc, i) => {
      const v = recipeTones[i]!;
      expect(osc.type).toBe(v.wave);
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(v.frequency, 10 + v.start);
      if (v.kind === 'tone' && v.frequencyEnd !== undefined) {
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
          v.frequencyEnd,
          10 + v.start + v.duration,
        );
      }
    });
  });

  it('creates the white-noise buffer once and fills it with values in [-1, 1]', () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    engine.play('discard');
    engine.play('pung');
    engine.play('kong');
    expect(mock.ctx.createBuffer).toHaveBeenCalledTimes(1);
    const data = mock.buffers[0]!;
    expect(data.length).toBeGreaterThan(0);
    expect(Array.from(data).every((x) => x >= -1 && x <= 1)).toBe(true);
    expect(mock.sources.every((s) => s.buffer !== null)).toBe(true);
  });

  it('skips the noise layer when buffer APIs are missing but still plays tones', () => {
    const mock = createMockContext();
    const partial = { ...mock.ctx, createBuffer: undefined, createBufferSource: undefined };
    const engine = new SoundEngine({
      contextFactory: () => partial as unknown as AudioContextLike,
    });
    expect(engine.play('discard')).toBe(true);
    expect(mock.oscillators).toHaveLength(toneCount('discard'));
    expect(mock.sources).toHaveLength(0);
  });

  it('meld call helper maps Jia/Pung/Kong to distinct recipes', () => {
    for (const type of ['jia', 'pung', 'kong'] as const) {
      const mock = createMockContext();
      expect(engineWith(mock).playMeldCall(type)).toBe(true);
      expect(mock.oscillators).toHaveLength(toneCount(type));
    }
    const m1 = createMockContext();
    const e1 = engineWith(m1);
    expect(e1.playTileDraw()).toBe(true);
    expect(e1.playFlowerReplacement()).toBe(true);
    expect(e1.playLewFitBuzzer()).toBe(true);
    expect(m1.oscillators).toHaveLength(
      toneCount('draw') + toneCount('flower') + toneCount('lewFit'),
    );
  });

  it('returns false for unknown effect names without touching the context', () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    expect(engine.play('boom' as SoundEffectName)).toBe(false);
    expect(mock.ctx.createGain).not.toHaveBeenCalled();
  });

  it('returns false (not throw) when node creation fails mid-schedule', () => {
    const mock = createMockContext();
    mock.ctx.createOscillator = vi.fn(() => {
      throw new Error('InvalidStateError');
    });
    expect(engineWith(mock).play('hu')).toBe(false);
  });
});

describe('Audio: enable / volume / settings', () => {
  it('respects soundEnabled from settings', () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    engine.applySettings({ ...TOURNAMENT_SETTINGS, soundEnabled: false });
    expect(engine.isEnabled()).toBe(false);
    expect(engine.play('hu')).toBe(false);
    expect(mock.ctx.createGain).not.toHaveBeenCalled();
    engine.applySettings(CASUAL_SETTINGS);
    expect(engine.isEnabled()).toBe(true);
    expect(engine.play('hu')).toBe(true);
  });

  it('does not create an AudioContext while muted', () => {
    const mock = createMockContext();
    const factory = vi.fn(() => mock.ctx as unknown as AudioContextLike);
    const engine = new SoundEngine({ contextFactory: factory, enabled: false });
    engine.play('draw');
    expect(factory).not.toHaveBeenCalled();
  });

  it('applies master and effects curves to new and already playing effects', () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    engine.play('hu');
    expect(mock.gains[0]!.gain.setValueAtTime.mock.lastCall![0]).toBeCloseTo(0.16);
    engine.applySettings({ soundEnabled: true, masterVolume: 0.5, effectsVolume: 0.4 });
    expect(mock.gains[0]!.gain.setValueAtTime.mock.lastCall![0]).toBeCloseTo(0.04);
    engine.applySettings({ soundEnabled: false, masterVolume: 0.5, effectsVolume: 0.4 });
    expect(mock.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    engine.applySettings({ soundEnabled: true, masterVolume: 0, effectsVolume: 1 });
    expect(engine.play('discard')).toBe(false);
  });

  it('clamps volume to [0, 1] and treats 0 as muted', () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    engine.setVolume(5);
    expect(engine.getVolume()).toBe(1);
    engine.setVolume(-1);
    expect(engine.getVolume()).toBe(0);
    engine.setVolume(Number.NaN);
    expect(engine.getVolume()).toBe(0);
    expect(engine.play('draw')).toBe(false);
    engine.setVolume(0.5);
    expect(engine.play('draw')).toBe(true);
  });

  it('playSound with soundEnabled=false short-circuits the shared engine', () => {
    const spy = vi.spyOn(soundEffects, 'play');
    expect(playSound('hu', { soundEnabled: false })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    playSound('hu', { soundEnabled: true });
    expect(spy).toHaveBeenCalledWith('hu');
    spy.mockRestore();
  });
});

describe('Audio: context lifecycle', () => {
  it.each(['suspended', 'interrupted'])('resumes a %s context on play and via unlock()', async (state) => {
    const mock = createMockContext(state);
    const engine = engineWith(mock);
    expect(engine.play('draw')).toBe(true);
    expect(mock.ctx.resume).toHaveBeenCalled();
    mock.ctx.state = state;
    await expect(engine.unlock()).resolves.toBe(true);
    expect(mock.ctx.state).toBe('running');
  });

  it('recreates the context after it was closed externally', () => {
    const first = createMockContext();
    const second = createMockContext();
    const factory = vi
      .fn()
      .mockReturnValueOnce(first.ctx as unknown as AudioContextLike)
      .mockReturnValueOnce(second.ctx as unknown as AudioContextLike);
    const engine = new SoundEngine({ contextFactory: factory });
    engine.play('draw');
    first.ctx.state = 'closed';
    expect(engine.play('draw')).toBe(true);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second.oscillators.length).toBeGreaterThan(0);
    expect(second.gains[0]!.connect).toHaveBeenCalledWith(second.destination);
  });

  it('dispose() closes the context and is idempotent', async () => {
    const mock = createMockContext();
    const engine = engineWith(mock);
    engine.play('draw');
    await engine.dispose();
    await engine.dispose();
    expect(mock.ctx.close).toHaveBeenCalledTimes(1);
  });
});
