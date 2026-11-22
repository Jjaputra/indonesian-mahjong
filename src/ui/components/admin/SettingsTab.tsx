import { useEffect, useState, type ReactNode } from 'react';
import { adminSettings, saveAdminSettings, type AdminSettings, type AuditEntry } from '../../../net/admin-api';
import { fetchConfig } from '../../../net/config';
import { Async, Toast, useLoad, useToast, type Load } from './shared';
import { relativeTime } from './format';
import { settingLabel, settingValueText, type SettingKey } from './settings-meta';

export const settingsValid = (s: AdminSettings) =>
  Number.isInteger(s.dailyMatchLimit) && s.dailyMatchLimit >= 0 && s.dailyMatchLimit <= 50
  && Number.isInteger(s.discardRevealMs) && s.discardRevealMs >= 0 && s.discardRevealMs <= 3000
  && Array.from(s.announcement).length <= 200;
export const settingsDirty = (a: AdminSettings, b: AdminSettings) => (Object.keys(a) as SettingKey[]).some(key => a[key] !== b[key]);

/** The front-menu banner as players see it; the text is plain text, so markup in it stays visible as typed. */
export function AnnouncementPreview({ text }: { text: string }) {
  return <div className="admin-menu-preview" aria-label="Pratinjau banner menu depan">
    {text ? <p className="mp-pill">{text}</p> : <p className="admin-menu-preview-empty">Banner kosong, nggak tampil di menu.</p>}
  </div>;
}

function lastChange(entries: AuditEntry[] | null, key: SettingKey, now: number): string | null {
  const entry = entries?.find(e => e.kind === 'setting' && e.key === key);
  return entry ? `Terakhir diubah ${relativeTime(entry.at, now)} oleh ${entry.by?.name ?? '—'}` : null;
}

function Field({ k, saved, audit, now, children, explain }: { k: SettingKey; saved: AdminSettings; audit: AuditEntry[] | null; now: number; children: ReactNode; explain: string }) {
  const changed = lastChange(audit, k, now);
  return <div className="admin-field">
    {children}
    <p className="admin-explain">{explain}</p>
    <p className="admin-meta">Sekarang: <b>{settingValueText(k, saved[k])}</b>{changed && <> · {changed}</>}</p>
  </div>;
}

export function SettingsForm({ saved, audit, now = Date.now(), onSave }: { saved: AdminSettings; audit: AuditEntry[] | null; now?: number; onSave: (value: AdminSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(saved), [saving, setSaving] = useState(false);
  useEffect(() => setDraft(saved), [saved]);
  const dirty = settingsDirty(draft, saved), valid = settingsValid(draft);
  const set = <K extends SettingKey>(key: K, value: AdminSettings[K]) => setDraft(d => ({ ...d, [key]: value }));
  const field = { saved, audit, now };
  return <form className="admin-form" onSubmit={e => { e.preventDefault(); setSaving(true); void onSave(draft).finally(() => setSaving(false)); }}>
    <fieldset><legend>Match online</legend>
      <Field k="dailyMatchLimit" {...field} explain="Berapa match sehari yang bisa dibuka host tanpa Premium (0–50).">
        <label>{settingLabel('dailyMatchLimit')}<input type="number" min={0} max={50} value={Number.isNaN(draft.dailyMatchLimit) ? '' : draft.dailyMatchLimit} onChange={e => set('dailyMatchLimit', e.target.valueAsNumber)} /></label>
      </Field>
      <Field k="discardRevealMs" {...field} explain="Lama buangan kelihatan dulu sebelum pilihan klaim muncul (0–3000 ms).">
        <label>{settingLabel('discardRevealMs')} (ms)<input type="number" min={0} max={3000} value={Number.isNaN(draft.discardRevealMs) ? '' : draft.discardRevealMs} onChange={e => set('discardRevealMs', e.target.valueAsNumber)} /></label>
      </Field>
    </fieldset>
    <fieldset><legend>Masuk</legend>
      <Field k="loginRequired" {...field} explain="Main online harus masuk pakai akun dulu.">
        <label className="admin-check"><input type="checkbox" checked={draft.loginRequired} onChange={e => set('loginRequired', e.target.checked)} /> {settingLabel('loginRequired')}</label>
      </Field>
      <Field k="facebookEnabled" {...field} explain="Munculin tombol Masuk pakai Facebook.">
        <label className="admin-check"><input type="checkbox" checked={draft.facebookEnabled} onChange={e => set('facebookEnabled', e.target.checked)} /> {settingLabel('facebookEnabled')}</label>
      </Field>
    </fieldset>
    <fieldset><legend>Pengumuman</legend>
      <Field k="announcement" {...field} explain="Banner di menu depan, maksimal 200 karakter. Kosongin buat nyembunyiin.">
        <label>{settingLabel('announcement')}<input maxLength={200} value={draft.announcement} onChange={e => set('announcement', e.target.value)} /></label>
        <small className="muted">{Array.from(draft.announcement).length}/200</small>
      </Field>
      <AnnouncementPreview text={draft.announcement} />
    </fieldset>
    {!valid && <p className="admin-invalid" role="alert">Ada angka di luar batas. Jatah host 0–50, jeda buangan 0–3000.</p>}
    <div className="admin-actions"><button className="btn btn-primary" disabled={!dirty || !valid || saving}>{saving ? 'Nyimpen…' : 'Simpan'}</button>
      {dirty && <button type="button" className="btn" onClick={() => setDraft(saved)}>Batal</button>}</div>
  </form>;
}

/** Shown when the audit trail failed to load, so a missing "Terakhir diubah" isn't mistaken for "never changed". */
export function AuditLoadError({ onRetry }: { onRetry: () => void }) {
  return <p className="admin-audit-error" role="alert">Riwayat perubahan nggak kebuka, jadi "Terakhir diubah" belum tampil.
    <button type="button" className="btn" onClick={onRetry}>Coba lagi</button></p>;
}

export function SettingsTab({ server, audit, onSaved }: { server: string; audit: Load<AuditEntry[]>; onSaved: () => void }) {
  const load = useLoad(() => adminSettings(server), [server]);
  const [saved, setSaved] = useState<AdminSettings | null>(null), [toast, say] = useToast();
  useEffect(() => { if (load.data) setSaved(load.data); }, [load.data]);
  const save = async (value: AdminSettings) => {
    try { setSaved(await saveAdminSettings(server, value)); await fetchConfig(server).catch(() => {}); onSaved(); say('Pengaturan udah disimpan.'); }
    catch (e) { say((e as Error).message); }
  };
  return <section className="admin-panel"><h2>Pengaturan</h2>
    {audit.status === 'error' && <AuditLoadError onRetry={audit.reload} />}
    <Async load={{ ...load, data: saved }} rows={5}>{value => <SettingsForm saved={value} audit={audit.data} onSave={save} />}</Async>
    <Toast message={toast} />
  </section>;
}
