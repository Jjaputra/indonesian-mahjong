import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  getPreset,
  type AIDifficulty,
  type GameSettings,
  type SettingsPresetName,
} from '../../storage';
import { DIFFICULTY_LABEL } from '../labels';
import { Modal } from './Modal';

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (settings: GameSettings) => void;
  onClose: () => void;
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

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
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
          <label className="field">Mode Kim
            <select value={draft.kimMode ?? (draft.kimEnabled ? 'dedicated' : 'off')} onChange={e => {
              const kimMode = e.target.value as 'off' | 'dedicated' | 'natural';
              setDraft(d => ({ ...d, kimMode, kimEnabled: kimMode !== 'off' }));
            }}>
              <option value="natural">Kim dari tile yang ada</option>
              <option value="dedicated">Kim khusus — pemula (148 tile)</option>
              <option value="off">Tanpa Kim</option>
            </select>
            <small>Kim natural: Kim dipilih acak dari tile yang ada setiap game (144 tile). Semua Kim yang dipakai sesuai nomer/jenis mendapat Bo KIM.</small>
          </label>
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
          <Toggle label={`Animasi tile: ${draft.animationSpeed === 'off' ? 'mati' : 'aktif'}`}
            checked={draft.animationSpeed !== 'off'} onChange={enabled => set('animationSpeed', enabled ? 'slow' : 'off')} />
          <Toggle label="Suara" checked={draft.soundEnabled} onChange={(v) => set('soundEnabled', v)} />
        </section>
      </div>
    </Modal>
  );
}
