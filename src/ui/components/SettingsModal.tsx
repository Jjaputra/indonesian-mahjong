import { useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  getPreset,
  type AIDifficulty,
  type GameSettings,
  type SettingsPresetName,
} from '../../storage';
import { soundEffects } from '../../audio';
import { DIFFICULTY_LABEL } from '../labels';
import { Modal } from './Modal';

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (settings: GameSettings) => void;
  onClose: () => void;
  onAudioChange?: (patch: Partial<Pick<GameSettings, 'soundEnabled' | 'musicEnabled' | 'musicVolume' | 'masterVolume' | 'effectsVolume'>>) => void;
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
    musicEnabled: current.musicEnabled,
    musicVolume: current.musicVolume,
    masterVolume: current.masterVolume,
    effectsVolume: current.effectsVolume,
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

export function SettingsModal({ settings, onSave, onClose, onAudioChange, devMode = false, onDevModeChange }: SettingsModalProps) {
  const [initialAudio] = useState(() => ({
    soundEnabled: settings.soundEnabled, musicEnabled: settings.musicEnabled,
    musicVolume: settings.musicVolume, masterVolume: settings.masterVolume, effectsVolume: settings.effectsVolume,
  }));
  const lastSample = useRef(-Infinity);
  const [draft, setDraft] = useState<GameSettings>({ ...settings });
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const setAudio = <K extends 'soundEnabled' | 'musicEnabled' | 'musicVolume' | 'masterVolume' | 'effectsVolume'>(key: K, value: GameSettings[K]) => {
    set(key, value);
    onAudioChange?.({ [key]: value });
    if (key === 'effectsVolume' && onAudioChange && performance.now() - lastSample.current >= 150) {
      lastSample.current = performance.now();
      soundEffects.playTileDiscard();
    }
  };

  return (
    <Modal
      title="Pengaturan"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => { setDraft({ ...settings, ...initialAudio }); onAudioChange?.(initialAudio); }}>
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
          <Toggle label={`Animasi tile: ${draft.animationSpeed === 'off' ? 'mati' : 'aktif'}`}
            checked={draft.animationSpeed !== 'off'} onChange={enabled => set('animationSpeed', enabled ? 'slow' : 'off')} />
        </section>
        <section>
          <h3>Suara</h3>
          <label className="field">
            <span>Volume utama: {Math.round(draft.masterVolume * 100)}%</span>
            <input type="range" aria-label="Volume utama" min="0" max="100" step="1" value={Math.round(draft.masterVolume * 100)} onChange={(e) => setAudio('masterVolume', Number(e.target.value) / 100)} />
          </label>
          <Toggle label="Musik latar" checked={draft.musicEnabled} onChange={(v) => setAudio('musicEnabled', v)} />
          <label className="field">
            <span>Volume musik: {Math.round(draft.musicVolume * 100)}%</span>
            <input type="range" aria-label="Volume musik" min="0" max="100" step="1" value={Math.round(draft.musicVolume * 100)} onChange={(e) => setAudio('musicVolume', Number(e.target.value) / 100)} />
          </label>
          <Toggle label="Efek suara" checked={draft.soundEnabled} onChange={(v) => setAudio('soundEnabled', v)} />
          <label className="field">
            <span>Volume efek: {Math.round(draft.effectsVolume * 100)}%</span>
            <input type="range" aria-label="Volume efek" min="0" max="100" step="1" value={Math.round(draft.effectsVolume * 100)} onChange={(e) => setAudio('effectsVolume', Number(e.target.value) / 100)} />
          </label>
          <p className="field-note">Audio langsung diterapkan dan disimpan.</p>
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
