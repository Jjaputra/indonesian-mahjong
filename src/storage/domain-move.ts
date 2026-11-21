const DESTINATION = 'https://maciokyu.com/';
const HISTORY_KEY = 'itm.history.v1';
export const MAX_MOVE_SIZE = 60 * 1024;
export const MAX_MOVE_VALUE_SIZE = 200 * 1024;
const MAX_DECODED_SIZE = 8 * 1024 * 1024;
const NOTICE_KEY = 'maciokyu.domain-move.notified';
const encoder = new TextEncoder();

type MoveData = Record<string, string>;
type HistoryEntry = Record<string, unknown>;

export function shouldRedirect(url: URL): boolean {
  if (url.searchParams.get('stay') === '1') return false;
  return url.hostname === 'indomahjong.pages.dev' || url.hostname === 'www.maciokyu.com'
    || (url.hostname === 'jjaputra.github.io' && url.pathname.startsWith('/indonesian-mahjong/'));
}

function historyEntries(raw: string): HistoryEntry[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const entries = parsed.filter((entry): entry is HistoryEntry => entry !== null && typeof entry === 'object'
    && !Array.isArray(entry) && ((typeof entry.id === 'string' && entry.id.length > 0)
      || (typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp))));
  return mergeHistory(entries);
}

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(fingerprint).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + fingerprint(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}

function mergeHistory(...groups: HistoryEntry[][]): HistoryEntry[] {
  const entries = new Map<string, HistoryEntry>();
  for (const group of groups) for (const entry of group) {
    const key = typeof entry.id === 'string' && entry.id.length > 0
      ? 'id:' + entry.id : 'legacy:' + timestamp(entry) + ':' + fingerprint(entry);
    if (!entries.has(key)) entries.set(key, entry);
  }
  return [...entries.values()];
}

function timestamp(entry: HistoryEntry): number {
  return typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) ? entry.timestamp : 0;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pack(data: MoveData, compress: boolean): Promise<string> {
  const bytes = encoder.encode(JSON.stringify(data));
  if (!compress) return 'r.' + base64url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'g.' + base64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** Only copies data; the old origin remains the backup. */
export async function encodeMove(storage: Storage, limit = MAX_MOVE_SIZE): Promise<string | null> {
  const data: MoveData = Object.create(null);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('itm.')) {
      const value = storage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  const compress = typeof CompressionStream !== 'undefined';
  let entries: HistoryEntry[] = [];
  if (compress && data[HISTORY_KEY]) {
    try { entries = historyEntries(data[HISTORY_KEY]).sort((a, b) => timestamp(b) - timestamp(a)); }
    catch { /* A corrupt history must not prevent the move. */ }
  }
  delete data[HISTORY_KEY];
  for (const [key, value] of Object.entries(data)) {
    if (encoder.encode(value).length >= MAX_MOVE_VALUE_SIZE) delete data[key];
  }
  while (entries.length > 0) {
    const history = JSON.stringify(entries);
    if (encoder.encode(history).length < MAX_MOVE_VALUE_SIZE) {
      data[HISTORY_KEY] = history;
      const payload = await pack(data, compress);
      if (payload.length <= limit) return payload;
    }
    entries.pop();
  }
  delete data[HISTORY_KEY];
  const payload = await pack(data, compress);
  return payload.length <= limit ? payload : null;
}

async function unpack(payload: string): Promise<unknown> {
  if (payload.length > MAX_MOVE_SIZE || !/^[gr]\.[A-Za-z0-9_-]+$/.test(payload)) return null;
  const binary = atob(payload.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (payload.startsWith('r.')) return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DECODED_SIZE) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const decoded = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { decoded.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
}

/** Import missing keys only. Destination history wins when IDs collide. */
export async function importMove(payload: string, storage: Storage): Promise<boolean> {
  try {
    const data: unknown = await unpack(payload);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return false;
    let imported = false;
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('itm.') || typeof value !== 'string' || encoder.encode(value).length >= MAX_MOVE_VALUE_SIZE) continue;
      try {
        const existing = storage.getItem(key);
        if (key === HISTORY_KEY) {
          const incoming = historyEntries(value);
          if (!incoming.length) continue;
          // Keep destination entries intact, including ones larger than the transfer limit.
          const current = existing === null ? [] : historyEntries(existing);
          storage.setItem(key, JSON.stringify(mergeHistory(current, incoming).sort((a, b) => timestamp(b) - timestamp(a))));
        } else if (existing === null) {
          storage.setItem(key, value);
        } else continue;
        imported = true;
      } catch { /* Ignore malformed history or a failed write; keep importing other keys. */ }
    }
    return imported;
  } catch { return false; }
}

function showNotice(browser: Window): void {
  try {
    if (browser.localStorage.getItem(NOTICE_KEY)) return;
    browser.localStorage.setItem(NOTICE_KEY, '1');
    const wrap = browser.document.createElement('div');
    wrap.className = 'mp-toast-wrap';
    const note = browser.document.createElement('p');
    note.className = 'mp-toast';
    note.setAttribute('role', 'status');
    note.style.cssText = 'max-width:520px;border-radius:12px;pointer-events:auto;cursor:pointer';
    note.textContent = 'Data kamu dari alamat lama udah dipindah ke maciokyu.com. Kalau sebelumnya udah pasang aplikasi, pasang ulang dari alamat ini.';
    note.onclick = () => wrap.remove();
    wrap.append(note);
    browser.document.body.append(wrap);
    browser.setTimeout(() => wrap.remove(), 20000);
  } catch { /* Storage or a notice must never block startup. */ }
}

/** Returns true when navigation has started and React must not render. */
export async function runDomainMove(browser: Window = window): Promise<boolean> {
  const url = new URL(browser.location.href);
  if (shouldRedirect(url)) {
    let payload: string | null = null;
    try { payload = await encodeMove(browser.localStorage); } catch { /* Redirect even if storage/compression fails. */ }
    try {
      browser.location.replace(DESTINATION + url.search + (payload ? '#move=' + payload : ''));
      return true;
    } catch {
      try {
        browser.location.replace(DESTINATION + url.search);
        return true;
      } catch { return false; } // Navigation is blocked; let the old app render.
    }
  }
  if (url.hostname === 'maciokyu.com' && url.hash.startsWith('#move=')) {
    let imported = false;
    try { imported = await importMove(url.hash.slice(6), browser.localStorage); } catch { /* Ignore unavailable storage. */ }
    finally {
      try { browser.history.replaceState(browser.history.state, '', url.pathname + url.search); }
      catch { /* A browser navigation restriction must not block the app. */ }
    }
    if (imported) showNotice(browser);
  }
  return false;
}
