import { useState, type FormEvent } from 'react';
import { setUsername } from '../../net/auth';
import { reservedUsername, validUsername } from '../../net/protocol';
import { loadPlayerName } from '../../net/room-store';

export function UsernamePicker() {
  const [name, setName] = useState(() => [...loadPlayerName().trim()].slice(0, 12).join(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !validUsername(name)) return;
    setBusy(true); setError(null);
    try { await setUsername(name); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="main-menu"><section className="menu-card mp-card mp-username-picker" aria-label="Pilih nama">
    <h2>Pilih nama</h2>
    <p>Nama ini permanen dan nggak bisa diganti sendiri.</p>
    <form onSubmit={submit}>
      <label className="mp-field"><span className="menu-option-label">Nama</span><input value={name} autoComplete="nickname" onChange={e => setName(e.target.value)} aria-describedby="username-rules" /></label>
      <p id="username-rules" className="small">3–12 karakter: huruf, angka; spasi tunggal, titik, _ atau - di antaranya.</p>
      {(error || reservedUsername(name)) && <p className="mp-error" role="alert">{error ?? 'Nama itu nggak boleh dipakai, coba yang lain.'}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !validUsername(name)}>{busy ? 'Menyimpan…' : 'Simpan nama'}</button>
    </form>
  </section></main>;
}
