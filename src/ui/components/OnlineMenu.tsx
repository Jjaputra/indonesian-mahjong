import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { DEFAULT_ROOM_CONFIG, NAME_MAX_LENGTH, ROOM_CODE_LENGTH, isRoomCode, type RoomConfig } from '../../net/protocol';
import { cleanName, loadPlayerName, normalizeRoomCode, savePlayerName } from '../../net/room-store';
import { RoomConfigFields } from './RoomConfigFields';
import { PublicChoice } from './PublicTables';
import { InviteHelp } from './InviteHelp';

export type OnlineStep = 'create' | 'join' | 'public';

export interface OnlineMenuProps {
  /** From a `?room=CODE` invite: opens the join form with the code filled in. */
  inviteCode: string | null;
  initialStep?: OnlineStep;
  initialPublic?: boolean;
  busy: boolean;
  error: string | null;
  /** The account row, shown inside the card under the Kembali bar. */
  account?: ReactNode;
  onCreate: (config: RoomConfig, name: string) => void;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mp-field">
      <span className="menu-option-label">Nama</span>
      <input type="text" value={value} maxLength={NAME_MAX_LENGTH} autoComplete="nickname" placeholder="Misal: A Liong" onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function OnlineMenu({ inviteCode, initialStep = 'create', initialPublic = false, busy, error, account, onCreate, onJoin, onBack }: OnlineMenuProps) {
  const screen = inviteCode ? 'join' : initialStep;
  const [name, setName] = useState(loadPlayerName);
  const [code, setCode] = useState(inviteCode ?? '');
  const [config, setConfig] = useState<RoomConfig>({ ...DEFAULT_ROOM_CONFIG, public: initialPublic });
  const [help, setHelp] = useState(false);
  const patch = (next: Partial<RoomConfig>) => setConfig(c => ({ ...c, ...next }));
  const nameOk = cleanName(name).length > 0;

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
      <section className="menu-card mp-card" aria-label={screen === 'create' ? 'Buat room' : 'Gabung room'}>
        <div className="mp-bar">
          <button type="button" className="mp-link" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Kembali</button>
          <button type="button" className="mp-link" onClick={() => setHelp(true)}><HelpCircle size={16} aria-hidden="true" /> Cara undang teman</button>
        </div>
        {account}
        {error && <p className="mp-error" role="alert">{error}</p>}


        {screen === 'create' && (
          <form onSubmit={submitCreate}>
            <h2>Buat room</h2>
            <NameField value={name} onChange={setName} />
            <PublicChoice config={config} onChange={patch} />
            <RoomConfigFields config={config} onChange={patch} />
            <div className="menu-choices">
              <button type="submit" className="btn btn-primary menu-choice" disabled={!nameOk || busy}>
                <strong>{busy ? 'Buat room…' : 'Buat room'}</strong><span>{nameOk ? 'Kode room dibuat otomatis' : 'Isi nama dulu'}</span>
              </button>
            </div>
          </form>
        )}

        {screen === 'join' && (
          <form onSubmit={submitJoin}>
            <h2>Gabung room</h2>
            <label className="mp-field">
              <span className="menu-option-label">Kode room</span>
              <input className="mp-code-input" type="text" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                maxLength={ROOM_CODE_LENGTH} placeholder="ABC234" aria-label="Kode room" onChange={e => setCode(normalizeRoomCode(e.target.value))} />
            </label>
            <NameField value={name} onChange={setName} />
            <div className="menu-choices">
              <button type="submit" className="btn btn-primary menu-choice" disabled={!nameOk || !isRoomCode(code) || busy}>
                <strong>{busy ? 'Menyambung…' : 'Gabung'}</strong>
                <span>{!isRoomCode(code) ? `Kode room ${ROOM_CODE_LENGTH} karakter` : nameOk ? 'Lalu pilih kursi di lobi' : 'Isi nama dulu'}</span>
              </button>
            </div>
          </form>
        )}
      </section>
      {help && <InviteHelp onClose={() => setHelp(false)} />}
    </main>
  );
}
