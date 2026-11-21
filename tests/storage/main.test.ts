import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn(), appLoaded: vi.fn() }));
vi.mock('react-dom/client', () => ({ default: { createRoot: mocks.createRoot } }));
vi.mock('../../src/App', () => {
  mocks.appLoaded();
  return { default: () => null };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

it('captures the install event before migration settles and renders after blocked navigation', async () => {
  const events = new EventTarget();
  const replace = vi.fn(() => { throw new Error('Navigation blocked'); });
  const root = {};
  const document = { getElementById: vi.fn(() => root) };
  let resolveStorage!: (storage: Storage) => void;
  // An async compression stage holds startup while the one-shot PWA event arrives.
  const migrationPending = new Promise<Storage>(resolve => { resolveStorage = resolve; });
  let resolveMigration!: (redirected: boolean) => void;
  const migration = new Promise<boolean>(resolve => { resolveMigration = resolve; });
  vi.doMock('../../src/storage/domain-move', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/storage/domain-move')>();
    return { ...actual, runDomainMove: async () => {
      const storage = await migrationPending;
      const result = await actual.runDomainMove({ location: { href: 'https://indomahjong.pages.dev/?room=ABCDEF', replace }, localStorage: storage } as unknown as Window);
      resolveMigration(result);
      return result;
    } };
  });
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', document);
  mocks.createRoot.mockReturnValue({ render: mocks.render });

  await import('../../src/main');
  const prompt = new Event('beforeinstallprompt', { cancelable: true });
  events.dispatchEvent(prompt);
  expect(prompt.defaultPrevented).toBe(true);
  expect(mocks.appLoaded).not.toHaveBeenCalled();
  expect(mocks.render).not.toHaveBeenCalled();

  resolveStorage({ length: 0 } as Storage);
  expect(await migration).toBe(false);
  await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenLastCalledWith('https://maciokyu.com/?room=ABCDEF');
  expect(mocks.createRoot).toHaveBeenCalledWith(root);
  expect(mocks.appLoaded).toHaveBeenCalledTimes(1);
});
