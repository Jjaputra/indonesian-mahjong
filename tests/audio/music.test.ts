import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../src/storage';
import { AudioQuickMute, MusicEngine } from '../../src/audio';
import type { AudioBufferLike } from '../../src/audio/sound-effects';

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
function mockContext(full = false) {
  const nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const active = new Set<unknown>();
  const gains: Array<{ gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const extras: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const buffers: Float32Array[] = [];
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: { connect: vi.fn() },
    createGain: () => {
      const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const node = { type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
      node.disconnect.mockImplementation(() => { active.delete(node); });
      active.add(node);
      nodes.push(node);
      return node;
    },
    ...(full ? {
      createDelay: () => {
        const node = { delayTime: param(), connect: vi.fn(), disconnect: vi.fn() };
        extras.push(node); return node;
      },
      createBiquadFilter: () => {
        const node = { type: 'lowpass', frequency: param(), Q: param(), connect: vi.fn(), disconnect: vi.fn() };
        extras.push(node); return node;
      },
      createBuffer: (_channels: number, length: number) => {
        const data = new Float32Array(length); buffers.push(data);
        return { getChannelData: () => data };
      },
      createBufferSource: () => {
        const node = { buffer: null as AudioBufferLike | null, playbackRate: param(), start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
        node.disconnect.mockImplementation(() => { active.delete(node); });
        active.add(node); nodes.push(node); return node;
      },
    } : {}),
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    close: vi.fn(async () => { ctx.state = 'closed'; }),
  };
  return { ctx, nodes, gains, active, extras, buffers };
}

afterEach(() => { vi.useRealTimers(); });

describe('procedural music', () => {
  it('starts once, looks ahead, fades volume, stops and toggles', async () => {
    vi.useFakeTimers();
    const { ctx, nodes, gains } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    expect(await music.start()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(nodes.length).toBeGreaterThan(0);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.15, 1.5);
    expect(nodes.every(n => n.start.mock.calls[0]![0] < 1.5)).toBe(true);
    await music.start();
    expect(vi.getTimerCount()).toBe(1);
    music.setVolume(1);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 0.065);
    music.setEnabled(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.5);
    music.setEnabled(true);
    expect(vi.getTimerCount()).toBe(1);
    music.stop();
    expect(vi.getTimerCount()).toBe(0);
    await music.dispose();
    expect(ctx.close).toHaveBeenCalledOnce();
  });

  it('retargets slider ramps from their interpolated gain without clicks', async () => {
    vi.useFakeTimers();
    const { ctx, gains } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    ctx.currentTime = 1.5;
    music.setVolume(1);
    expect(gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0.15, 1.5);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 1.565);
    ctx.currentTime = 1.5325;
    music.applySettings({ musicEnabled: true, musicVolume: 1, masterVolume: 0.5 });
    expect(gains[0]!.gain.setValueAtTime.mock.lastCall![0]).toBeCloseTo(0.375);
    expect(gains[0]!.gain.linearRampToValueAtTime.mock.lastCall![1]).toBeCloseTo(1.5975);
    await music.start(); // Repeated user gestures must not stretch the slider ramp.
    expect(gains[0]!.gain.linearRampToValueAtTime.mock.lastCall![1]).toBeCloseTo(1.5975);
    await music.dispose();
  });

  it.each(['music', 'master'] as const)('stops synthesis at zero %s gain and resumes without a backlog', async channel => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx, volume: channel === 'music' ? 0 : 0.5, masterVolume: channel === 'master' ? 0 : 1 });
    await music.start();
    expect(nodes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    music.applySettings({ musicEnabled: true, musicVolume: 0.5, masterVolume: 1 });
    expect(nodes.length).toBeGreaterThan(0);
    music.applySettings({ musicEnabled: true, musicVolume: channel === 'music' ? 0 : 0.5, masterVolume: channel === 'master' ? 0 : 1 });
    expect(vi.getTimerCount()).toBe(0);
    const count = nodes.length;
    ctx.currentTime = 120;
    vi.advanceTimersByTime(120000);
    expect(nodes).toHaveLength(count);
    music.applySettings({ musicEnabled: true, musicVolume: 0.5, masterVolume: 1 });
    expect(nodes.slice(count).every(n => n.start.mock.calls[0]![0] > 120)).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    await music.dispose();
  });

  it('keeps sounding pads on a slider dip to zero so a quick drag back up does not cut them', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    ctx.currentTime = 0.5;
    const sounding = nodes.filter(n => (n.start.mock.calls[0]![0] as number) <= ctx.currentTime);
    expect(sounding.length).toBeGreaterThan(0);
    const before = sounding.map(n => n.stop.mock.calls.length);
    music.setVolume(0);
    expect(sounding.map(n => n.stop.mock.calls.length)).toEqual(before);
    music.setEnabled(false);
    expect(sounding.some((n, i) => n.stop.mock.calls.length > before[i]!)).toBe(true);
    await music.dispose();
  });

  it('starts a fresh fade from zero after dispose and restart', async () => {
    vi.useFakeTimers();
    const first = mockContext();
    const second = mockContext();
    const factory = vi.fn().mockReturnValueOnce(first.ctx).mockReturnValueOnce(second.ctx);
    const music = new MusicEngine({ seed: 7, contextFactory: factory });
    await music.start();
    first.ctx.currentTime = 3;
    await music.dispose();
    second.ctx.currentTime = 10;
    await music.start();
    expect(second.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(second.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.15, 11.5);
    await music.dispose();
  });

  it('cancels queued notes on disable so a quick re-enable does not double the beat', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    ctx.currentTime = 0.1;
    const queued = nodes.filter(n => n.start.mock.calls[0]![0] > 0.1);
    expect(queued.length).toBeGreaterThan(0);
    music.setEnabled(false);
    expect(queued.every(n => n.stop.mock.calls.at(-1)![0] === 0.1)).toBe(true);
    await music.dispose();
  });

  it('applies master and music curves live and keeps zero silent', async () => {
    vi.useFakeTimers();
    const { ctx, gains } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    music.applySettings({ musicEnabled: true, musicVolume: 0.4, masterVolume: 0.5 });
    expect(gains[0]!.gain.linearRampToValueAtTime.mock.lastCall![0]).toBeCloseTo(0.024);
    music.applySettings({ musicEnabled: true, musicVolume: 0.4, masterVolume: 0 });
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.065);
    await music.dispose();
  });

  it('recovers interrupted contexts on gestures and visibility resume', async () => {
    vi.useFakeTimers();
    const { ctx } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    ctx.state = 'interrupted';
    await music.start();
    expect(ctx.resume).toHaveBeenCalledOnce();
    music.setPaused(true);
    ctx.state = 'interrupted';
    music.setPaused(false);
    await Promise.resolve();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await music.dispose();
  });

  it('recreates a closed context and its output on the next gesture', async () => {
    vi.useFakeTimers();
    const first = mockContext();
    const second = mockContext();
    const factory = vi.fn().mockReturnValueOnce(first.ctx).mockReturnValueOnce(second.ctx);
    const music = new MusicEngine({ seed: 7, contextFactory: factory });
    await music.start();
    first.ctx.state = 'closed';
    expect(await music.start()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second.nodes.length).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(1);
    expect(first.nodes.every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
    await music.dispose();
  });

  it('resumes suspended audio and pauses with visibility without restarting a stopped track', async () => {
    vi.useFakeTimers();
    const { ctx } = mockContext();
    ctx.state = 'suspended';
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    expect(ctx.resume).toHaveBeenCalledOnce();
    music.setPaused(true);
    expect(vi.getTimerCount()).toBe(0);
    music.setPaused(false);
    expect(vi.getTimerCount()).toBe(1);
    music.stop();
    music.setPaused(false);
    expect(vi.getTimerCount()).toBe(0);
    await music.dispose();
  });

  it('does not create timers without a context or when the factory throws', async () => {
    vi.useFakeTimers();
    for (const contextFactory of [() => null, () => { throw new Error('blocked'); }]) {
      const music = new MusicEngine({ seed: 7, contextFactory });
      expect(await music.start()).toBe(false);
      music.setEnabled(false);
      music.setVolume(0.4);
      music.stop();
      await music.dispose();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('keeps live voices bounded over an hour (resonant=%s)', async full => {
    vi.useFakeTimers();
    const { ctx, nodes, gains, active, extras, buffers } = mockContext(full);
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    let maxLive = 0;
    for (let tick = 1; tick <= 14400; tick++) {
      ctx.currentTime = tick / 4;
      vi.advanceTimersByTime(250);
      maxLive = Math.max(maxLive, active.size);
      expect(active.size).toBeLessThan(24);
    }
    expect(maxLive).toBeGreaterThan(0);
    expect(gains.filter(g => !g.disconnect.mock.calls.length).length).toBeLessThan(25);
    await music.dispose();
    expect(nodes.every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
    expect(extras.every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
    expect(buffers.length).toBeLessThanOrEqual(64);
    if (full) expect(buffers.length).toBeGreaterThan(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnects a voice immediately when its oscillator ends', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    nodes[0]!.onended!();
    expect(nodes[0]!.disconnect).toHaveBeenCalledOnce();
    await music.dispose();
  });

  it('produces the same composition and excitation for a fixed seed', async () => {
    vi.useFakeTimers();
    const render = async (seed: number) => {
      const { ctx, nodes, gains, buffers } = mockContext(true);
      const factory = vi.fn(() => ctx);
      const music = new MusicEngine({ seed, contextFactory: factory });
      expect(factory).not.toHaveBeenCalled();
      await music.start();
      for (let i = 1; i < 500; i++) { ctx.currentTime = i / 4; vi.advanceTimersByTime(250); }
      const result = {
        sources: nodes.map(n => ({ start: n.start.mock.calls, stop: n.stop.mock.calls,
          frequency: 'frequency' in n ? (n.frequency as ReturnType<typeof param>).setValueAtTime.mock.calls : [] })),
        envelopes: gains.map(g => g.gain.linearRampToValueAtTime.mock.calls),
        noise: Array.from(buffers[0]!),
      };
      await music.dispose(); return result;
    };
    expect(await render(42)).toEqual(await render(42));
    expect(await render(43)).not.toEqual(await render(42));
  });

  it('disconnects buffered plucks on source end and every node on dispose', async () => {
    vi.useFakeTimers();
    const { ctx, nodes, gains, extras } = mockContext(true);
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    const source = nodes.find(n => 'buffer' in n)!;
    expect(source).toBeDefined();
    source.onended!();
    expect(source.disconnect).toHaveBeenCalledOnce();
    const gain = source.connect.mock.calls[0]![0] as typeof gains[number];
    expect(gain.disconnect).toHaveBeenCalledOnce();
    await music.dispose();
    expect([...nodes, ...extras, ...gains].every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it.each(['createBuffer', 'createBufferSource'] as const)('uses harmonic plucks without %s', async missing => {
    vi.useFakeTimers();
    const { ctx, nodes, extras } = mockContext(true);
    delete ctx[missing];
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    expect(await music.start()).toBe(true);
    expect(nodes.some(n => 'buffer' in n)).toBe(false);
    expect(nodes.some(n => 'type' in n && n.type === 'triangle')).toBe(true);
    await music.dispose();
    expect([...nodes, ...extras].every(n => n.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it.each([22050, 44100, 48000])('bounds pluck samples and tunes their fundamental at %s Hz', async sampleRate => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext(true);
    ctx.sampleRate = sampleRate;
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    const synth = music as unknown as { pluck: (frequency: number, start: number, peak: number, bend?: boolean) => void; plucks: Map<number, AudioBufferLike> };
    for (const frequency of [261.63, 440, 1046.52]) {
      synth.pluck(frequency, 2, 0.3, true);
      const source = nodes.at(-1)! as unknown as { buffer: AudioBufferLike; playbackRate: ReturnType<typeof param> };
      const data = source.buffer.getChannelData(0);
      let peak = 0;
      for (const sample of data) peak = Math.max(peak, Math.abs(sample));
      expect(peak).toBeGreaterThan(0.24);
      expect(peak).toBeLessThanOrEqual(0.250001);
      // Normalized autocorrelation, after the noisy attack, with fractional peak interpolation.
      const offset = Math.floor(sampleRate * 0.15);
      const count = Math.floor(sampleRate * 0.15);
      const correlation = (lag: number) => {
        let xy = 0, xx = 0, yy = 0;
        for (let i = offset; i < offset + count; i++) {
          const a = data[i]!, b = data[i + lag]!;
          xy += a * b; xx += a * a; yy += b * b;
        }
        return xy / Math.sqrt(xx * yy);
      };
      let lag = 0, best = -1;
      for (let i = Math.floor(sampleRate / frequency * 0.8); i <= Math.ceil(sampleRate / frequency * 1.2); i++) {
        const score = correlation(i);
        if (score > best) { best = score; lag = i; }
      }
      const left = correlation(lag - 1), right = correlation(lag + 1);
      const fractionalLag = lag + 0.5 * (left - right) / (left - 2 * best + right);
      const measured = sampleRate / fractionalLag;
      expect(best).toBeGreaterThan(0.98);
      expect(Math.abs(1200 * Math.log2(measured / frequency))).toBeLessThan(5);
      expect(source.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(2 ** (2 / 12), 2.38);
      synth.pluck(frequency, 3, 0.3);
      expect((nodes.at(-1)! as unknown as { buffer: AudioBufferLike }).buffer).toBe(source.buffer);
    }
    for (let i = 0; i < 48; i++) synth.pluck(200 + i * 13, 4, 0.3);
    expect(synth.plucks.size).toBeLessThanOrEqual(32);
    await music.dispose();
    expect(synth.plucks.size).toBe(0);
  });

  it('sums 90 seconds of seed-7 buffered plucks safely without delay/filter factories', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext(true);
    ctx.sampleRate = 22050;
    delete ctx.createDelay; delete ctx.createBiquadFilter;
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    for (let tick = 1; tick < 360; tick++) { ctx.currentTime = tick / 4; vi.advanceTimersByTime(250); }
    const mix = new Float32Array(90 * ctx.sampleRate);
    for (const node of nodes) {
      if (!('buffer' in node)) continue;
      const source = node as unknown as { buffer: AudioBufferLike; playbackRate: ReturnType<typeof param> };
      const data = source.buffer.getChannelData(0);
      const gain = node.connect.mock.calls[0]![0] as { gain: ReturnType<typeof param> };
      const start = node.start.mock.calls[0]![0] as number;
      const end = node.stop.mock.calls[0]![0] as number;
      const peak = gain.gain.linearRampToValueAtTime.mock.calls[0]![0] as number;
      const duration = end - start - 0.02;
      const bend = source.playbackRate.linearRampToValueAtTime.mock.calls[0]?.[0] as number | undefined;
      let position = 0;
      for (let i = Math.ceil(start * ctx.sampleRate); i < Math.min(mix.length, end * ctx.sampleRate); i++) {
        const t = i / ctx.sampleRate - start;
        const envelope = t < 0.004 ? peak * t / 0.004 : peak * (0.0001 / peak) ** ((t - 0.004) / (duration - 0.004));
        const index = Math.floor(position), fraction = position - index;
        const sample = (data[index] ?? 0) * (1 - fraction) + (data[index + 1] ?? 0) * fraction;
        mix[i] = mix[i]! + sample * envelope * 0.15;
        position += 1 + ((bend ?? 1) - 1) * Math.min(1, t / 0.38);
      }
    }
    let peak = 0;
    for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeGreaterThan(0.001);
    expect(peak).toBeLessThan(0.03);
    console.log(`Seed 7, 90 s, 22050 Hz: buffered-pluck sum peak ${peak.toFixed(6)}`);
    await music.dispose();
  });

  it('connects fallback harmonics only through the filter when disconnect is absent', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext(true);
    delete ctx.createBuffer;
    const createOscillator = ctx.createOscillator;
    ctx.createOscillator = () => {
      const node = createOscillator();
      Reflect.deleteProperty(node, 'disconnect');
      return node;
    };
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx });
    await music.start();
    const synth = music as unknown as { pluck: (frequency: number, start: number, peak: number) => void };
    synth.pluck(440, 2, 0.3);
    const fundamental = nodes.at(-2)!;
    expect(fundamental.connect).toHaveBeenCalledOnce();
    expect(fundamental.connect.mock.calls[0]![0].type).toBe('lowpass');
    await music.dispose();
  });

  it('applies independent settings and clamps music volume', async () => {
    vi.useFakeTimers();
    const { ctx, gains } = mockContext();
    const music = new MusicEngine({ seed: 7, contextFactory: () => ctx, enabled: false });
    await music.start();
    expect(vi.getTimerCount()).toBe(0);
    music.applySettings({ musicEnabled: true, musicVolume: 9, masterVolume: 1 });
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 1.5);
    music.setVolume(-1);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.065);
    await music.dispose();
  });
});

describe('header mute-all choices', () => {
  it.each([[true, true], [true, false], [false, true]])('restores effects=%s music=%s', (soundEnabled, musicEnabled) => {
    const mute = new AudioQuickMute(new MemoryStorage());
    const choices = { soundEnabled, musicEnabled };
    expect(mute.toggle(choices)).toEqual({ soundEnabled: false, musicEnabled: false });
    expect(mute.toggle({ soundEnabled: false, musicEnabled: false })).toEqual(choices);
  });
  it('restores an independent mix after reload and leaves volume values alone', () => {
    const store = new MemoryStorage();
    const original = { soundEnabled: false, musicEnabled: true, masterVolume: 0.7, musicVolume: 0.4, effectsVolume: 0.2 };
    const muted = { ...original, ...new AudioQuickMute(store).toggle(original) };
    const restored = { ...muted, ...new AudioQuickMute(store).toggle(muted) };
    expect(restored).toEqual(original);
  });
  it('clears the snapshot when Settings explicitly changes the switches', () => {
    const store = new MemoryStorage();
    const mute = new AudioQuickMute(store);
    mute.toggle({ soundEnabled: false, musicEnabled: true });
    mute.clear();
    expect(new AudioQuickMute(store).toggle({ soundEnabled: false, musicEnabled: false })).toEqual({ soundEnabled: true, musicEnabled: true });
  });
  it('survives malformed or unavailable snapshot storage', () => {
    const store = new MemoryStorage();
    store.setItem('itm.audio-mute.v1', '{');
    expect(new AudioQuickMute(store).toggle({ soundEnabled: false, musicEnabled: false })).toEqual({ soundEnabled: true, musicEnabled: true });
    store.setItem('itm.audio-mute.v1', JSON.stringify({ soundEnabled: false, musicEnabled: true, masterVolume: 0 }));
    expect(new AudioQuickMute(store).toggle({ soundEnabled: false, musicEnabled: false })).toEqual({ soundEnabled: false, musicEnabled: true });
    const broken = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
    const mute = new AudioQuickMute(broken);
    mute.toggle({ soundEnabled: true, musicEnabled: false });
    expect(mute.toggle({ soundEnabled: false, musicEnabled: false })).toEqual({ soundEnabled: true, musicEnabled: false });
  });
  it('can unmute a save with both switches off', () => {
    expect(new AudioQuickMute(new MemoryStorage()).toggle({ soundEnabled: false, musicEnabled: false })).toEqual({ soundEnabled: true, musicEnabled: true });
  });
});
