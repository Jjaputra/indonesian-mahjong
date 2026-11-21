import type { AdminStats, DailyStat } from '../../../net/admin-api';
import { Async, type Load } from './shared';
import { formatNumber } from './format';

function StatCard({ label, value, note }: { label: string; value: number; note?: string }) {
  return <div className="admin-card"><span className="admin-card-label">{label}</span><strong>{formatNumber(value)}</strong>{note && <small>{note}</small>}</div>;
}

const W = 600, H = 190, PAD = { l: 30, r: 6, t: 8, b: 22 };

/** 30 days of new users and matches as paired bars, drawn with inline SVG. */
export function TrendChart({ daily }: { daily: DailyStat[] }) {
  const max = Math.max(1, ...daily.flatMap(d => [d.newUsers, d.matches]));
  const top = Math.max(2, Math.ceil(max / 2) * 2);
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const slot = plotW / Math.max(1, daily.length), bar = Math.max(2, slot * 0.34);
  const y = (v: number) => PAD.t + plotH - (v / top) * plotH;
  const label = (i: number) => { const d = daily[i]?.day ?? ''; return d.slice(8) + '/' + d.slice(5, 7); };
  return <figure className="admin-chart">
    <figcaption><span className="admin-key is-users">Pemain baru</span><span className="admin-key is-matches">Match</span> · 30 hari terakhir (WIB)</figcaption>
    <div className="admin-chart-scroll"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik pemain baru dan match per hari, 30 hari terakhir" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map(f => <g key={f}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(top * f)} y2={y(top * f)} className="admin-grid" />
        <text x={PAD.l - 4} y={y(top * f) + 3} textAnchor="end" className="admin-axis">{Math.round(top * f)}</text>
      </g>)}
      {daily.map((d, i) => {
        const x = PAD.l + i * slot + slot / 2;
        return <g key={d.day}>
          <title>{`${d.day}: ${d.newUsers} pemain baru, ${d.matches} match, ${d.activeUsers} aktif`}</title>
          <rect x={x - bar - 0.5} y={y(d.newUsers)} width={bar} height={PAD.t + plotH - y(d.newUsers)} className="admin-bar is-users" />
          <rect x={x + 0.5} y={y(d.matches)} width={bar} height={PAD.t + plotH - y(d.matches)} className="admin-bar is-matches" />
        </g>;
      })}
      {daily.length > 0 && [0, Math.floor((daily.length - 1) / 2), daily.length - 1].map(i =>
        <text key={i} x={PAD.l + i * slot + slot / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle'} className="admin-axis">{label(i)}</text>)}
    </svg></div>
  </figure>;
}

export function StatsView({ stats }: { stats: AdminStats }) {
  const { users, matches } = stats;
  return <>
    <div className="admin-cards">
      <StatCard label="Total pemain" value={users.total} />
      <StatCard label="Baru hari ini" value={users.newToday} />
      <StatCard label="Baru 7 hari" value={users.new7d} />
      <StatCard label="Aktif 7 hari" value={users.active7d} />
      <StatCard label="Premium" value={users.premium} />
      <StatCard label="Setuju dikabari" value={users.newsOptIn} note="lewat email" />
      <StatCard label="Match hari ini" value={matches.today} />
      <StatCard label="Match 7 hari" value={matches.last7d} />
    </div>
    <section className="admin-panel"><h2>Tren harian</h2>
      {stats.daily.some(d => d.newUsers || d.matches) ? <TrendChart daily={stats.daily} /> : <p className="muted">Belum ada aktivitas 30 hari terakhir.</p>}
    </section>
  </>;
}

export function StatsTab({ load }: { load: Load<AdminStats> }) {
  return <Async load={load} rows={6}>{stats => <StatsView stats={stats} />}</Async>;
}
