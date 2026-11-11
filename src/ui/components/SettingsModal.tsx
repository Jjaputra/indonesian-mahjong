import { useState, type ReactNode } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  getPreset,
  type AIDifficulty,
  type AnimationSpeed,
  type GameSettings,
  type SettingsPresetName,
} from '../../storage';
import { ANIMATION_LABEL, DIFFICULTY_LABEL } from '../labels';
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
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
          <Field label="Kecepatan animasi">
            <select value={draft.animationSpeed} onChange={(e) => set('animationSpeed', e.target.value as AnimationSpeed)}>
              {(['off', 'slow', 'normal', 'fast'] as AnimationSpeed[]).map((a) => (
                <option key={a} value={a}>
                  {ANIMATION_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
          <Toggle label="Suara" checked={draft.soundEnabled} onChange={(v) => set('soundEnabled', v)} />
        </section>
      </div>
    </Modal>
  );
}
