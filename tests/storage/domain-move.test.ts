import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMove, importMove, MAX_MOVE_SIZE, MAX_MOVE_VALUE_SIZE, runDomainMove, shouldRedirect } from '../../src/storage/domain-move';

class Store implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

function raw(data: unknown): string {
  return 'r.' + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function browser(href: string, storage = new Store()) {
  const notices: { className: string; style: { cssText: string }; setAttribute: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; textContent?: string; onclick?: () => void }[] = [];
  const fake = {
    location: { href, replace: vi.fn() },
    localStorage: storage,
    history: { state: { preserved: true }, replaceState: vi.fn() },
    document: {
      body: { append: vi.fn() },
      createElement: vi.fn(() => {
        const node = { className: '', style: { cssText: '' }, setAttribute: vi.fn(), append: vi.fn(), remove: vi.fn() };
        notices.push(node);
        return node;
      }),
    },
    setTimeout: vi.fn(),
  };
  return { fake, window: fake as unknown as Window, notices };
}

afterEach(() => vi.unstubAllGlobals());

describe('old address detection', () => {
  it.each([
    'https://jjaputra.github.io/indonesian-mahjong/',
    'https://indomahjong.pages.dev/',
    'https://www.maciokyu.com/',
  ])('redirects %s and keeps invite queries without rendering', async href => {
    const { fake, window } = browser(href + '?room=ABCDEF&demo=table');
    expect(shouldRedirect(new URL(window.location.href))).toBe(true);
    expect(await runDomainMove(window)).toBe(true);
    expect(fake.location.replace).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/maciokyu\.com\/\?room=ABCDEF&demo=table#move=/));
  });

  it.each([
    'https://branch.indomahjong.pages.dev/',
    'http://localhost:5199/',
    'https://jjaputra.github.io/other/',
    'https://jjaputra.github.io/indonesian-mahjong-extra/',
    'https://maciokyu.com/',
    'https://indomahjong.pages.dev.evil.example/',
    'https://www.maciokyu.com/?stay=1',
    'https://indomahjong.pages.dev/?stay=1',
    'https://jjaputra.github.io/indonesian-mahjong/?room=ABCDEF&stay=1',
  ])('stays on %s', async href => {
    const { fake, window } = browser(href);
    expect(await runDomainMove(window)).toBe(false);
    expect(fake.location.replace).not.toHaveBeenCalled();
  });

  it('still redirects if localStorage access throws', async () => {
    const { fake, window } = browser('https://indomahjong.pages.dev/?room=ABCDEF');
    Object.defineProperty(fake, 'localStorage', { get() { throw new Error('blocked'); } });
    expect(await runDomainMove(window)).toBe(true);
    expect(fake.location.replace).toHaveBeenCalledWith('https://maciokyu.com/?room=ABCDEF');
  });

  it('still redirects if compression throws', async () => {
    const { fake, window } = browser('https://indomahjong.pages.dev/');
    vi.stubGlobal('CompressionStream', class { constructor() { throw new Error('failed'); } });
    expect(await runDomainMove(window)).toBe(true);
    expect(fake.location.replace).toHaveBeenCalledWith('https://maciokyu.com/');
  });

  it('retries without data when the browser rejects the transfer URL', async () => {
    const { fake, window } = browser('https://indomahjong.pages.dev/?room=ABCDEF');
    fake.location.replace.mockImplementationOnce(() => { throw new Error('URL too long'); });
    expect(await runDomainMove(window)).toBe(true);
    expect(fake.location.replace).toHaveBeenCalledTimes(2);
    expect(fake.location.replace.mock.calls[0]![0]).toContain('#move=');
    expect(fake.location.replace).toHaveBeenLastCalledWith('https://maciokyu.com/?room=ABCDEF');
  });

  it('allows the app to render on the old host when both navigations fail', async () => {
    const { fake, window } = browser('https://indomahjong.pages.dev/?room=ABCDEF');
    fake.location.replace.mockImplementation(() => { throw new Error('Navigation blocked'); });
    expect(await runDomainMove(window)).toBe(false);
    expect(fake.location.replace).toHaveBeenCalledTimes(2);
  });
});

describe('migration data', () => {
  it('round trips gzip data including Unicode and preserves the old origin', async () => {
    const source = new Store();
    source.setItem('itm.settings.v1', '{"soundEnabled":false}');
    source.setItem('itm.name', 'Jason 🀄 印尼');
    source.setItem('unrelated', 'secret');
    const old = browser('https://indomahjong.pages.dev/?room=ABCDEF', source);
    await runDomainMove(old.window);
    const redirect = old.fake.location.replace.mock.calls[0]![0] as string;
    expect(new URL(redirect).hash).toMatch(/^#move=g\./);
    const destination = new Store();
    const arrival = browser(redirect, destination);
    expect(await runDomainMove(arrival.window)).toBe(false);
    expect(destination.getItem('itm.name')).toBe('Jason 🀄 印尼');
    expect(destination.getItem('itm.settings.v1')).toBe(source.getItem('itm.settings.v1'));
    expect(destination.getItem('unrelated')).toBeNull();
    expect(source.length).toBe(3);
    expect(arrival.fake.history.replaceState).toHaveBeenCalledWith({ preserved: true }, '', '/?room=ABCDEF');
    expect(arrival.notices[1]?.textContent).toBe('Data kamu dari alamat lama udah dipindah ke maciokyu.com. Kalau sebelumnya udah pasang aplikasi, pasang ulang dari alamat ini.');
    await runDomainMove(arrival.window);
    expect(arrival.fake.document.body.append).toHaveBeenCalledTimes(1);
  });

  it('rejects unrelated keys, non-string values and oversized UTF-8 values', async () => {
    const storage = new Store();
    // Use the compressed encoder for the oversized adversarial value.
    const data = { unrelated: 'bad', 'itm.number': 42, 'itm.name': 'good', 'itm.large': '印'.repeat(MAX_MOVE_VALUE_SIZE / 3 + 1) };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const payload = 'g.' + btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await importMove(payload, storage)).toBe(true);
    expect(storage.length).toBe(1);
    expect(storage.getItem('itm.name')).toBe('good');
  });

  it('preserves existing settings, names, seats and daily counts', async () => {
    const storage = new Store();
    const data = Object.fromEntries(['itm.settings.v1', 'itm.name', 'itm.seat', 'itm.daily'].map(key => [key, 'old']));
    for (const key of Object.keys(data)) storage.setItem(key, 'new');
    expect(await importMove(raw(data), storage)).toBe(false);
    for (const key of Object.keys(data)) expect(storage.getItem(key)).toBe('new');
  });

  it('merges history by id, preferring destination records and sorting newest first', async () => {
    const storage = new Store();
    storage.setItem('itm.history.v1', JSON.stringify([{ id: 'shared', timestamp: 2, name: 'new' }, { id: 'local', timestamp: 4 }]));
    const incoming = [{ id: 'shared', timestamp: 5, name: 'old' }, { id: 'old', timestamp: 1 }, { id: 'old', timestamp: 1 }, null, { nope: true }];
    expect(await importMove(raw({ 'itm.history.v1': JSON.stringify(incoming) }), storage)).toBe(true);
    expect(JSON.parse(storage.getItem('itm.history.v1')!)).toEqual([{ id: 'local', timestamp: 4 }, { id: 'shared', timestamp: 2, name: 'new' }, { id: 'old', timestamp: 1 }]);
  });

  it('trims oldest history for the payload cap and per-key limit', async () => {
    const storage = new Store();
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: String(i), timestamp: i, detail: String(i).repeat(50000) }));
    storage.setItem('itm.history.v1', JSON.stringify(entries));
    const full = await encodeMove(storage);
    const trimmed = await encodeMove(storage, full!.length - 30);
    expect(trimmed!.length).toBeLessThanOrEqual(full!.length - 30);
    const destination = new Store();
    await importMove(trimmed!, destination);
    const restored = JSON.parse(destination.getItem('itm.history.v1')!) as { id: string }[];
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.length).toBeLessThan(4);
    expect(restored[0]!.id).toBe('5');
    expect(storage.getItem('itm.history.v1')).toBe(JSON.stringify(entries));
  });

  it('caps the actual encoded transfer at 60 KiB, dropping oldest history first', async () => {
    expect(MAX_MOVE_SIZE).toBe(60 * 1024);
    const source = new Store();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const entries = Array.from({ length: 8 }, (_, i) => ({ id: String(i), timestamp: i,
      detail: Array.from(crypto.getRandomValues(new Uint8Array(14000)), byte => alphabet[byte & 63]).join('') }));
    source.setItem('itm.name', 'Jason');
    source.setItem('itm.history.v1', JSON.stringify(entries));
    const payload = await encodeMove(source);
    expect(payload).not.toBeNull();
    expect(payload!.length).toBeLessThanOrEqual(MAX_MOVE_SIZE);
    const destination = new Store();
    await importMove(payload!, destination);
    const history = JSON.parse(destination.getItem('itm.history.v1')!) as { id: string }[];
    expect(history.length).toBeGreaterThan(0);
    expect(history.length).toBeLessThan(entries.length);
    expect(history[0]!.id).toBe('7');
    expect(history.some(entry => entry.id === '0')).toBe(false);
    expect(destination.getItem('itm.name')).toBe('Jason');
  });

  it('round trips and dedupes id-less history by timestamp and JSON fingerprint', async () => {
    const source = new Store();
    const legacy = { timestamp: 100, winner: 'dong', detail: { tay: 5, name: 'Hu' } };
    const reordered = { detail: { name: 'Hu', tay: 5 }, winner: 'dong', timestamp: 100 };
    const sameTime = { ...legacy, winner: 'nan' };
    source.setItem('itm.history.v1', JSON.stringify([legacy, reordered, sameTime, { ...legacy, timestamp: 101 }]));
    const payload = await encodeMove(source);
    const destination = new Store();
    await importMove(payload!, destination);
    expect(JSON.parse(destination.getItem('itm.history.v1')!)).toEqual([{ ...legacy, timestamp: 101 }, legacy, sameTime]);
    destination.setItem('itm.history.v1', JSON.stringify([reordered, { id: 'local', timestamp: 102 }]));
    await importMove(payload!, destination);
    await importMove(payload!, destination);
    expect(JSON.parse(destination.getItem('itm.history.v1')!)).toEqual([
      { id: 'local', timestamp: 102 }, { ...legacy, timestamp: 101 }, reordered, sameTime,
    ]);
    expect(source.getItem('itm.history.v1')).toBe(JSON.stringify([legacy, reordered, sameTime, { ...legacy, timestamp: 101 }]));
  });

  it('moves without history when compression is unavailable', async () => {
    const source = new Store();
    source.setItem('itm.name', 'Jason');
    source.setItem('itm.history.v1', '[{"id":"old"}]');
    vi.stubGlobal('CompressionStream', undefined);
    const payload = await encodeMove(source);
    expect(payload).toMatch(/^r\./);
    const destination = new Store();
    await importMove(payload!, destination);
    expect(destination.getItem('itm.name')).toBe('Jason');
    expect(destination.getItem('itm.history.v1')).toBeNull();
  });

  it('drops history when nothing fits and returns null when preferences alone exceed the cap', async () => {
    const source = new Store();
    source.setItem('itm.name', 'Jason');
    const baseline = await encodeMove(source);
    source.setItem('itm.history.v1', '[{"id":"old","timestamp":1}]');
    expect(await encodeMove(source, baseline!.length)).toBe(baseline);
    expect(await encodeMove(source, 1)).toBeNull();
  });

  it.each(['corrupt', 'g.AAAA', 'r.====', raw(null), raw([]), raw('bad'), 'r.' + 'a'.repeat(MAX_MOVE_SIZE)])('ignores corrupt payload %s', async payload => {
    const { window, fake } = browser('https://maciokyu.com/?room=ABCDEF#move=' + payload);
    expect(await runDomainMove(window)).toBe(false);
    expect(fake.localStorage.length).toBe(0);
    expect(fake.history.replaceState).toHaveBeenCalledWith({ preserved: true }, '', '/?room=ABCDEF');
    expect(fake.document.body.append).not.toHaveBeenCalled();
  });

  it('ignores a gzip bomb above the decompressed limit', async () => {
    const source = new Store();
    // Compress an adversarial JSON independently; the normal exporter excludes oversized values.
    const bytes = new TextEncoder().encode(JSON.stringify({ 'itm.bomb': 'x'.repeat(9 * 1024 * 1024) }));
    const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const payload = 'g.' + btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await importMove(payload, source)).toBe(false);
    expect(source.length).toBe(0);
  });
});
