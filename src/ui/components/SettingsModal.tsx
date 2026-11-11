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
  type BonusTileRule,
  type GameSettings,
  type ScoringBasis,
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

const PRESET_LABEL: Record<SettingsPresetName, string> = {
  tournament: 'Referensi PDF Turnamen (BMC ver06)',
  house: 'Aturan rumah (catatan Anda)',
  casual: 'Kasual',
};

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
            {(['house', 'tournament', 'casual'] as SettingsPresetName[]).map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={preset === name}
                className={preset === name ? 'is-on' : ''}
                onClick={() => setDraft((d) => withPreset(d, name))}
              >
                {PRESET_LABEL[name]}
              </button>
            ))}
            <span className={`segmented-note${preset === 'custom' ? ' is-on' : ''}`}>{preset === 'custom' ? 'Kustom' : ''}</span>
          </div>
          <p className="muted small">
            Referensi PDF memakai nilai tabel seperti tercetak dan pembacaan kolom lama. Aturan rumah berisi pilihan Anda yang tidak
            tertulis di PDF: tabel mengikuti pilihan Kim pertandingan, dan hanya Bunga/Musim posisi sendiri yang bernilai.
          </p>
        </section>

        <section>
          <h3>Penilaian Tay</h3>
          <Field label="Kolom tabel (Ada Kim / Tanpa Kim)">
            <select value={draft.scoringBasis} onChange={(e) => set('scoringBasis', e.target.value as ScoringBasis)}>
              <option value="match_table">Ikut pilihan pertandingan: Ada Kim → tabel Ada Kim, Tanpa Kim → tabel Tanpa Kim</option>
              <option value="hand_kim_usage">Ikut Kim di tangan pemenang (pembacaan lama)</option>
            </select>
          </Field>
          <Field label="Bunga/Musim individual">
            <select value={draft.bonusTileRule} onChange={(e) => set('bonusTileRule', e.target.value as BonusTileRule)}>
              <option value="own_seat_only">Hanya posisi sendiri +1, posisi lain 0 (aturan rumah)</option>
              <option value="rulebook_per_tile">Per tile sesuai PDF: Bunga 0, Musim 1, posisi sendiri +1</option>
            </select>
          </Field>
          <p className="muted small">
            Jumlah Kim yang benar-benar dipegang tetap menentukan pola Kim (#7 Tile KIM, #8 Bo KIM, #30, #32, #40); kolom hanya
            menentukan nilainya. Hadiah koleksi #4, #5 dan #6 tetap sama pada kedua aturan Bunga/Musim.
          </p>
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
