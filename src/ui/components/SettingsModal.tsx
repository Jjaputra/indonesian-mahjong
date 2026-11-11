import { useState, type ReactNode } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { Seat } from '../../core/types';
import {
  MIN_HU_TAY_LOWER_BOUND,
  MIN_HU_TAY_UPPER_BOUND,
  detectPreset,
  getPreset,
  type AIDifficulty,
  type AnimationSpeed,
  type GameSettings,
  type SettingsPresetName,
} from '../../storage';
import { ANIMATION_LABEL, DIFFICULTY_LABEL, SEAT_LABEL } from '../labels';
import { Modal } from './Modal';

interface SettingsModalProps {
  settings: GameSettings;
  onSave: (settings: GameSettings) => void;
  onClose: () => void;
}

const SEATS: Seat[] = ['dong', 'nan', 'xi', 'bei'];

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
  const preset = detectPreset(draft);
  const kimOff = !draft.kimEnabled;

  return (
    <Modal
      title="Pengaturan"
      onClose={onClose}
      wide
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
          <h3>Preset Aturan</h3>
          <div className="segmented" role="radiogroup" aria-label="Preset">
            {(['tournament', 'casual'] as SettingsPresetName[]).map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={preset === name}
                className={preset === name ? 'is-on' : ''}
                onClick={() => setDraft((d) => withPreset(d, name))}
              >
                {name === 'tournament' ? 'Turnamen (BMC ver06)' : 'Kasual'}
              </button>
            ))}
            <span className={`segmented-note${preset === 'custom' ? ' is-on' : ''}`}>{preset === 'custom' ? 'Kustom' : ''}</span>
          </div>
        </section>

        <section>
          <h3>Kim (Joker)</h3>
          <p className="muted small">
            Mode Kim di aplikasi ini memakai 4 tile Kim khusus (set 148 tile), model lama yang tidak ditetapkan oleh rulebook.
            Usulan Kim yang dipilih lewat dadu belum diterapkan karena detailnya belum terkonfirmasi. Kim nonaktif mengeluarkan
            keempat tile Kim sebelum dikocok (144 tile).
          </p>
          <Toggle label="Kim aktif" checked={draft.kimEnabled} onChange={(v) => set('kimEnabled', v)} />
          <Toggle label="Kim boleh dibuang" hint="Turnamen: tidak boleh" checked={draft.kimDiscardAllowed} disabled={kimOff} onChange={(v) => set('kimDiscardAllowed', v)} />
          <Toggle label="Kim dalam Pung" checked={draft.allowKimInPung} disabled={kimOff} onChange={(v) => set('allowKimInPung', v)} />
          <Toggle label="Kim dalam Jia" checked={draft.allowKimInJia} disabled={kimOff} onChange={(v) => set('allowKimInJia', v)} />
          <Toggle label="Kim sebagai pasangan (kaki)" checked={draft.allowKimInPair} disabled={kimOff} onChange={(v) => set('allowKimInPair', v)} />
          <Toggle label="Kim dalam Tris" checked={draft.allowKimInTriplet} disabled={kimOff} onChange={(v) => set('allowKimInTriplet', v)} />
          <Toggle
            label="Kim untuk klaim Jia/Pung dari buangan"
            hint="Turnamen: Lew Fit"
            checked={draft.allowKimInMeldClaim}
            disabled={kimOff}
            onChange={(v) => set('allowKimInMeldClaim', v)}
          />
        </section>

        <section>
          <h3>Aturan Permainan</h3>
          <Field label="Minimum Tay untuk Hu">
            <input
              type="number"
              min={MIN_HU_TAY_LOWER_BOUND}
              max={MIN_HU_TAY_UPPER_BOUND}
              value={draft.minHuTay}
              onChange={(e) => set('minHuTay', Math.min(MIN_HU_TAY_UPPER_BOUND, Math.max(MIN_HU_TAY_LOWER_BOUND, Number(e.target.value) || 0)))}
            />
          </Field>
          <Field label="Angin putaran">
            <select value={draft.roundWind} onChange={(e) => set('roundWind', e.target.value as Seat)}>
              {SEATS.map((s) => (
                <option key={s} value={s}>
                  {SEAT_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dealer awal (angin duduk)">
            <select value={draft.startingSeatWind} onChange={(e) => set('startingSeatWind', e.target.value as Seat)}>
              {SEATS.map((s) => (
                <option key={s} value={s}>
                  {SEAT_LABEL[s]}
                  {s === 'dong' ? ' — Anda' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Penggantian Bunga/Musim awal">
            <select value={draft.flowerReplacementMode} onChange={(e) => set('flowerReplacementMode', e.target.value as GameSettings['flowerReplacementMode'])}>
              <option value="auto">Otomatis</option>
              <option value="manual">Manual (tombol Ganti Bunga)</option>
            </select>
          </Field>
          <Field label="Kebijakan pola tumpang tindih">
            <select value={draft.overlapPolicy} onChange={(e) => set('overlapPolicy', e.target.value as GameSettings['overlapPolicy'])}>
              <option value="rulebook_exclusive">Eksklusif (pola lebih tinggi menggantikan; hanya Thi Fu → Pao Chin tertulis di rulebook)</option>
              <option value="cumulative">Kumulatif (semua pola dijumlah)</option>
            </select>
          </Field>
        </section>

        <section>
          <h3>AI &amp; Tampilan</h3>
          <Field label="Tingkat kesulitan AI">
            <div className="segmented">
              {(['easy', 'normal', 'hard'] as AIDifficulty[]).map((d) => (
                <button key={d} type="button" className={draft.aiDifficulty === d ? 'is-on' : ''} onClick={() => set('aiDifficulty', d)}>
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </Field>
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
        <p className="muted small">Perubahan aturan berlaku mulai permainan berikutnya. Suara, animasi dan AI langsung diterapkan.</p>
      </div>
    </Modal>
  );
}
