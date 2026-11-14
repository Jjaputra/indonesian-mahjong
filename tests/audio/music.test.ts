import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../src/storage';
import { AudioQuickMute, MusicEngine } from '../../src/audio';

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
function mockContext() {
  const nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const active = new Set<unknown>();
  const gains: Array<{ gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
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
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    close: vi.fn(async () => { ctx.state = 'closed'; }),
  };
  return { ctx, nodes, gains, active };
}

afterEach(() => { vi.useRealTimers(); });

describe('procedural music', () => {
  it('starts once, looks ahead, fades volume, stops and toggles', async () => {
    vi.useFakeTimers();
    const { ctx, nodes, gains } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx, seed: 7 });
    expect(await music.start()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(nodes.length).toBeGreaterThan(0);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.15, 1.5);
    expect(nodes.every(n => n.start.mock.calls[0]![0] < 1.5)).toBe(true);
    await music.start();
    expect(vi.getTimerCount()).toBe(1);
    music.setVolume(1);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 1.5);
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

  it('cancels queued notes on disable so a quick re-enable does not double the beat', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx, seed: 7 });
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
    const music = new MusicEngine({ contextFactory: () => ctx });
    await music.start();
    music.applySettings({ musicEnabled: true, musicVolume: 0.4, masterVolume: 0.5 });
    expect(gains[0]!.gain.linearRampToValueAtTime.mock.lastCall![0]).toBeCloseTo(0.024);
    music.applySettings({ musicEnabled: true, musicVolume: 0.4, masterVolume: 0 });
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.5);
    await music.dispose();
  });

  it('recovers interrupted contexts on gestures and visibility resume', async () => {
    vi.useFakeTimers();
    const { ctx } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx });
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
    const music = new MusicEngine({ contextFactory: factory });
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
    const music = new MusicEngine({ contextFactory: () => ctx });
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
      const music = new MusicEngine({ contextFactory });
      expect(await music.start()).toBe(false);
      music.setEnabled(false);
      music.setVolume(0.4);
      music.stop();
      await music.dispose();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps live voices bounded over an hour and releases finished nodes', async () => {
    vi.useFakeTimers();
    const { ctx, nodes, gains, active } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx, seed: 7 });
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
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnects a voice immediately when its oscillator ends', async () => {
    vi.useFakeTimers();
    const { ctx, nodes } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx });
    await music.start();
    nodes[0]!.onended!();
    expect(nodes[0]!.disconnect).toHaveBeenCalledOnce();
    await music.dispose();
  });

  it('applies independent settings and clamps music volume', async () => {
    vi.useFakeTimers();
    const { ctx, gains } = mockContext();
    const music = new MusicEngine({ contextFactory: () => ctx, enabled: false });
    await music.start();
    expect(vi.getTimerCount()).toBe(0);
    music.applySettings({ musicEnabled: true, musicVolume: 9, masterVolume: 1 });
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 1.5);
    music.setVolume(-1);
    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.5);
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
