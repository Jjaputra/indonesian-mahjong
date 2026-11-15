import { useState, type FormEvent } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { DEFAULT_ROOM_CONFIG, NAME_MAX_LENGTH, ROOM_CODE_LENGTH, isRoomCode, type RoomConfig } from '../../net/protocol';
import { cleanName, loadPlayerName, normalizeRoomCode, savePlayerName, type StoredRoom } from '../../net/room-store';
import { RoomConfigFields } from './RoomConfigFields';
import { InviteHelp } from './InviteHelp';

type Screen = 'home' | 'create' | 'join';

export interface OnlineMenuProps {
  /** From a `?room=CODE` invite: opens the join form with the code filled in. */
  inviteCode: string | null;
  lastRoom: StoredRoom | null;
  busy: boolean;
  error: string | null;
  onCreate: (config: RoomConfig, name: string) => void;
  onJoin: (code: string, name: string) => void;
  onResume: () => void;
  onBack: () => void;
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mp-field">
      <span className="menu-option-label">Nama Anda</span>
      <input type="text" value={value} maxLength={NAME_MAX_LENGTH} autoComplete="nickname" placeholder="Mis. Jason" onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function OnlineMenu({ inviteCode, lastRoom, busy, error, onCreate, onJoin, onResume, onBack }: OnlineMenuProps) {
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'join' : 'home');
  const [name, setName] = useState(loadPlayerName);
  const [code, setCode] = useState(inviteCode ?? '');
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG);
  const [help, setHelp] = useState(false);
  const patch = (next: Partial<RoomConfig>) => setConfig(c => ({ ...c, ...next }));
  const nameOk = cleanName(name).length > 0;
  const back = () => (screen === 'home' || inviteCode ? onBack() : setScreen('home'));

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || busy) return;
    savePlayerName(cleanName(name));
    onCreate(config, cleanName(name));
  };
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || !isRoomCode(code) || busy) return;
    savePlayerName(cleanName(name));
    onJoin(code, cleanName(name));
  };

  return (
    <main className="main-menu">
      <section className="menu-card mp-card" aria-label="Main bareng teman">
        <div className="mp-bar">
          <button type="button" className="mp-link" onClick={back}><ArrowLeft size={16} aria-hidden="true" /> Kembali</button>
          <button type="button" className="mp-link" onClick={() => setHelp(true)}><HelpCircle size={16} aria-hidden="true" /> Cara undang teman</button>
        </div>
        <p className="menu-eyebrow">Main bareng teman</p>
        {error && <p className="mp-error" role="alert">{error}</p>}

        {screen === 'home' && (
          <>
            <h2>Satu meja, empat sahabat.</h2>
            <p className="muted">Buat room pribadi lalu kirim tautannya ke grup, atau masuk dengan kode.</p>
            <div className="menu-choices">
              <button type="button" className="btn btn-primary menu-choice" onClick={() => setScreen('create')}>
                <strong>Buat Room</strong><span>Atur aturan dan undang teman</span>
              </button>
              <button type="button" className="btn btn-primary menu-choice" onClick={() => setScreen('join')}>
                <strong>Gabung</strong><span>Masukkan kode room</span>
              </button>
              {lastRoom && <button type="button" className="btn btn-gold menu-choice menu-online" onClick={onResume} disabled={busy}>
                <strong>Lanjutkan room {lastRoom.code}</strong><span>Kursi Anda masih disimpan</span>
              </button>}
            </div>
          </>
        )}

        {screen === 'create' && (
          <form onSubmit={submitCreate}>
            <h2>Buat Room</h2>
            <NameField value={name} onChange={setName} />
            <RoomConfigFields config={config} onChange={patch} />
            <div className="menu-choices">
              <button type="submit" className="btn btn-primary menu-choice" disabled={!nameOk || busy}>
                <strong>{busy ? 'Membuat room…' : 'Buat Room'}</strong><span>{nameOk ? 'Kode room dibuat otomatis' : 'Isi nama Anda dulu'}</span>
              </button>
            </div>
          </form>
        )}

        {screen === 'join' && (
          <form onSubmit={submitJoin}>
            <h2>Gabung</h2>
            <label className="mp-field">
              <span className="menu-option-label">Kode room</span>
              <input className="mp-code-input" type="text" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                maxLength={ROOM_CODE_LENGTH} placeholder="ABC234" aria-label="Kode room" onChange={e => setCode(normalizeRoomCode(e.target.value))} />
            </label>
            <NameField value={name} onChange={setName} />
            <div className="menu-choices">
              <button type="submit" className="btn btn-primary menu-choice" disabled={!nameOk || !isRoomCode(code) || busy}>
                <strong>{busy ? 'Menyambung…' : 'Gabung'}</strong>
                <span>{!isRoomCode(code) ? `Kode room ${ROOM_CODE_LENGTH} karakter` : nameOk ? 'Lalu pilih kursi di lobi' : 'Isi nama Anda dulu'}</span>
              </button>
            </div>
          </form>
        )}
      </section>
      {help && <InviteHelp onClose={() => setHelp(false)} />}
    </main>
  );
}
