// Post-deploy check: create a room, start with bots, roll seats and confirm the first view hides other hands.
// Usage: SMOKE_SERVER=https://api.maciokyu.com SMOKE_ORIGIN=https://maciokyu.com node scripts/smoke.mjs
const base = process.env.SMOKE_SERVER ?? 'https://api.maciokyu.com';
const origin = process.env.SMOKE_ORIGIN ?? 'https://maciokyu.com';
// Armed first, so a create request that never answers still fails the job.
setTimeout(() => { console.log('timeout'); process.exit(1); }, 30000);
const res = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
if (!res.ok) { console.log('create failed', res.status); process.exit(1); }
const { code } = await res.json();
const ws = new WebSocket(`${base.replace('https', 'wss')}/rooms/${code}/ws`, { headers: { Origin: origin } });
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
