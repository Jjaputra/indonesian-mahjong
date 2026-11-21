import type { AuditEntry } from '../../../net/admin-api';
import { Async, Empty, type Load } from './shared';
import { formatDateTime, relativeTime } from './format';
import { settingLabel, settingValueText } from './settings-meta';

/** One audit line as text; names and values are always rendered as text, never HTML. */
export function describeEntry(entry: AuditEntry): string {
  if (entry.kind === 'premium') return `${entry.premium ? 'Memberi' : 'Mencabut'} Premium ${entry.premium ? 'untuk' : 'dari'} ${entry.userName ?? entry.userId ?? 'pemain'}`;
  return `Mengubah “${settingLabel(entry.key ?? '')}” menjadi ${settingValueText(entry.key ?? '', entry.value)}`;
}

export function AuditView({ entries, now = Date.now() }: { entries: AuditEntry[]; now?: number }) {
  if (!entries.length) return <Empty>Belum ada yang diubah.</Empty>;
  return <ol className="admin-audit">
    {entries.map((entry, i) => <li key={`${entry.at}-${i}`}>
      <span className={`admin-audit-kind is-${entry.kind}`}>{entry.kind === 'premium' ? 'Premium' : 'Pengaturan'}</span>
      <p>{describeEntry(entry)}</p>
      <small>{entry.by?.name ?? '—'} · <time title={formatDateTime(entry.at)}>{relativeTime(entry.at, now)}</time></small>
    </li>)}
  </ol>;
}

export function AuditTab({ load }: { load: Load<AuditEntry[]> }) {
  return <section className="admin-panel"><h2>Riwayat perubahan</h2>
    <Async load={load}>{entries => <AuditView entries={entries} />}</Async>
  </section>;
}
