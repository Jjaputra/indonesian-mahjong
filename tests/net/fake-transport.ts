import type { SocketLike, Timers } from '../../src/net/connection';
import type { ClientMessage, RoomInfo, ServerMessage } from '../../src/net/protocol';
import { DEFAULT_ROOM_CONFIG } from '../../src/net/protocol';

export class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: ClientMessage[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(data: string): void { this.sent.push(JSON.parse(data) as ClientMessage); }
  close(): void { this.closed = true; }
  open(): void { this.onopen?.(); }
  receive(message: ServerMessage): void { this.onmessage?.({ data: JSON.stringify(message) }); }
  drop(): void { this.onclose?.(); }
  ofType<T extends ClientMessage['type']>(type: T) { return this.sent.filter((m): m is Extract<ClientMessage, { type: T }> => m.type === type); }
}

/** Collects every socket the client opens, so a test can drive the newest one. */
export function fakeNetwork() {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url: string) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    get last(): FakeSocket { return sockets[sockets.length - 1]!; },
  };
}

/** Manual timers: nothing fires until the test advances the clock. */
export function fakeTimers() {
  let now = 0, nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => { const id = nextId++; pending.set(id, { at: now + ms, fn }); return id; },
    clear: id => { pending.delete(id as number); },
  };
  return {
    timers,
    get now() { return now; },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

export const roomInfo = (patch: Partial<RoomInfo> = {}): RoomInfo => ({
  code: 'ABC234', config: DEFAULT_ROOM_CONFIG, spectators: 0, phase: 'lobby',
  seats: (['dong', 'nan', 'xi', 'bei'] as const).map((seat, i) => ({ seat, name: i === 0 ? 'Jason' : null, bot: false, connected: true, host: i === 0 })),
  ...patch,
});
