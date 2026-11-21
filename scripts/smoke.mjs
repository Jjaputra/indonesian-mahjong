// Post-deploy check: create a room, start with bots, roll seats and confirm the first view hides other hands.
// Usage: SMOKE_SERVER=https://api.maciokyu.com SMOKE_ORIGIN=https://maciokyu.com node scripts/smoke.mjs
// When the server requires login, anonymous room creation must be refused; the full game check
// then runs only if SMOKE_SESSION holds a session token for a test account.
const base = process.env.SMOKE_SERVER ?? 'https://api.maciokyu.com';
const origin = process.env.SMOKE_ORIGIN ?? 'https://maciokyu.com';
const session = process.env.SMOKE_SESSION;
// Armed first, so a request that never answers still fails the job.
setTimeout(() => { console.log('timeout'); process.exit(1); }, 30000);

const config = await fetch(base + '/auth/config', { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) })
  .then(r => (r.ok ? r.json() : {})).catch(() => ({}));
const auth = session ? { Authorization: `Bearer ${session}` } : {};
const res = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: origin, ...auth }, signal: AbortSignal.timeout(15000) });
if (config.loginRequired && !session) {
  // Without a test session only the gate and the room endpoint can be checked; say so loudly.
  const probe = await fetch(base + '/rooms/ZZZZZZ/ws', { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
  console.log(`PARTIAL smoke: login required, anonymous create ${res.status}, room probe ${probe.status}. Set SMOKE_SESSION for the full hand check.`);
  process.exit(res.status === 401 && probe.status < 500 ? 0 : 1);
}
if (!res.ok) { console.log('create failed', res.status); process.exit(1); }
const { code } = await res.json();
const ws = new WebSocket(`${base.replace('https', 'wss')}/rooms/${code}/ws`, { headers: { Origin: origin, ...auth } });
const seen = [];
ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name: 'Smoke' }));
ws.onmessage = e => {
  const m = JSON.parse(e.data); seen.push(m.type);
  if (m.type === 'welcome') ws.send(JSON.stringify({ type: 'start' }));
  if (m.type === 'room' && m.room.phase === 'seating' && !m.room.seatDice?.dice?.[m.seat]) ws.send(JSON.stringify({ type: 'rollSeats' }));
  if (m.type === 'view') {
    const v = m.view, hidden = Object.values(v.players).every(p => !('hand' in p));
    console.log('room', code, 'phase', v.phase, 'hand', v.hand?.length, 'others hidden', hidden);
    ws.onclose = null; ws.close(); process.exit(hidden && v.hand?.length ? 0 : 1);
  }
};
ws.onclose = () => { console.log('closed early', seen.join(',')); process.exit(1); };
