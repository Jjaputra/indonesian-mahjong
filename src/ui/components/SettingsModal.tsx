import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  getPreset,
  type AIDifficulty,
  type GameSettings,
  type SettingsPresetName,
} from '../../storage';
import { DIFFICULTY_LABEL } from '../labels';
import { TABLE_VIEW_LABEL, type TableView } from '../table-view';
import { Modal } from './Modal';

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (settings: GameSettings) => void;
  onClose: () => void;
  /** Table view applies at once (a device preference, not part of the saved settings). */
  tableView?: TableView;
  onTableViewChange?: (view: TableView) => void;
  /** Developer mode applies at once too (device preference, see src/dev). */
  devMode?: boolean;
  onDevModeChange?: (on: boolean) => void;
}

/** Applies a preset's rules while keeping presentation preferences (same as storage.applyPreset). */
export function withPreset(current: GameSettings, name: SettingsPresetName): GameSettings {
  return {
    ...getPreset(name),
    aiDifficulty: current.aiDifficulty,
    animationSpeed: current.animationSpeed,
    soundEnabled: current.soundEnabled,
    roundWind: current.roundWind,
    startingSeatWind: current.startingSeatWind,
  };
}

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small className="muted"> — {hint}</small>}
      </span>
    </label>
  );
}

export function SettingsModal({ settings, onSave, onClose, tableView = '3d', onTableViewChange, devMode = false, onDevModeChange }: SettingsModalProps) {
  const [draft, setDraft] = useState<GameSettings>({ ...settings });
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal
      title="Pengaturan"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => setDraft({ ...settings })}>
            <RotateCcw size={14} /> Batalkan perubahan
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
            <Save size={14} /> Simpan
          </button>
        </>
      }
    >
      <div className="settings">
        <section>
          <h3>Preferensi bermain</h3>
          <p className="field-note">Pilihan Kim diatur di menu utama sebelum pertandingan dimulai.</p>
          <div className="field">
            <span>Tingkat kesulitan AI</span>
            <div className="segmented" role="group" aria-label="Tingkat kesulitan AI">
              {(['easy', 'normal', 'hard'] as AIDifficulty[]).map((d) => (
                <button key={d} type="button" className={draft.aiDifficulty === d ? 'is-on' : ''} aria-pressed={draft.aiDifficulty === d} onClick={() => set('aiDifficulty', d)}>
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Tampilan meja</span>
            <div className="segmented" role="group" aria-label="Tampilan meja">
              {(['3d', 'flat'] as TableView[]).map((v) => (
                <button key={v} type="button" className={tableView === v ? 'is-on' : ''} aria-pressed={tableView === v} onClick={() => onTableViewChange?.(v)}>
                  {TABLE_VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <Toggle label={`Animasi tile: ${draft.animationSpeed === 'off' ? 'mati' : 'aktif'}`}
            checked={draft.animationSpeed !== 'off'} onChange={enabled => set('animationSpeed', enabled ? 'slow' : 'off')} />
          <Toggle label="Suara" checked={draft.soundEnabled} onChange={(v) => set('soundEnabled', v)} />
        </section>
        {onDevModeChange && <section className="dev-settings">
          <h3>Developer</h3>
          <Toggle label="Mode developer" checked={devMode} onChange={onDevModeChange} />
          <p className="field-note dev-warning" role="note">Untuk cek skor. Game di mode ini tidak dicatat ke riwayat.</p>
        </section>}
      </div>
    </Modal>
  );
}
