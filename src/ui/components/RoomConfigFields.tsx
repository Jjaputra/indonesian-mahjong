import type { KimMode } from '../../core/types';
import type { RoomConfig } from '../../net/protocol';
import type { AIDifficulty } from '../../storage';
import { DIFFICULTY_LABEL } from '../labels';
import { MenuChoice } from './MainMenu';

interface Option<T> { value: T; label: string; note: string }

const KIM_OPTIONS: readonly Option<KimMode>[] = [
  { value: 'natural', label: 'Kim dari tile', note: 'Satu wajah tile diundi tiap game; keempat kopinya jadi Kim.' },
  { value: 'dedicated', label: 'Kim tambahan', note: 'Empat tile KIM khusus ditambahkan ke tembok (148 tile).' },
  { value: 'off', label: 'Tanpa Kim', note: 'Tidak ada Kim; semua tile dimainkan dengan wajah aslinya.' },
];
const MIN_TAY_OPTIONS: readonly Option<RoomConfig['minHuTay']>[] = ([0, 3, 5, 8] as const).map(value => ({
  value, label: String(value), note: value === 5 ? 'Standar turnamen: Hu minimal 5 Tay.' : `Hu sah mulai ${value} Tay.`,
}));
const TURN_OPTIONS: readonly Option<RoomConfig['turnSeconds']>[] = [
  { value: null, label: 'Tanpa batas (latihan)', note: 'Tidak ada waktu giliran; cocok untuk latihan santai.' },
  ...([5, 10, 15, 20, 30, 60] as const).map(value => ({ value, label: `${value} dtk`, note: `Waktu habis: tile yang baru ditarik dibuang, klaim dilewati.` })),
];
const LIMIT_OPTIONS: readonly Option<RoomConfig['timeLimitMinutes']>[] = [
  { value: null, label: 'Tanpa batas', note: 'Pertandingan berjalan sampai 16 game selesai.' },
  { value: 90, label: '90 menit', note: 'Setelah 90 menit, selesaikan game yang sedang berjalan.' },
];
const BOT_FILL_OPTIONS: readonly Option<boolean>[] = [
  { value: true, label: 'Isi dengan bot', note: 'Kursi kosong diisi bot saat host menekan Mulai.' },
  { value: false, label: 'Hanya pemain', note: 'Mulai hanya bila keempat kursi sudah diduduki.' },
];
const BOT_LEVEL_OPTIONS: readonly Option<AIDifficulty>[] = (['easy', 'normal', 'hard'] as const).map(value => ({
  value, label: DIFFICULTY_LABEL[value], note: 'Tingkat kesulitan bot di kursi kosong.',
}));
const WATCH_OPTIONS: readonly Option<boolean>[] = [
  { value: true, label: 'Boleh ditonton', note: 'Teman lain bisa menonton tanpa kursi (tile mereka tidak terlihat).' },
  { value: false, label: 'Tidak', note: 'Hanya pemain yang duduk yang bisa masuk.' },
];

/** The Buat Room fields; the host also edits them in the lobby. */
export function RoomConfigFields({ config, onChange }: { config: RoomConfig; onChange: (patch: Partial<RoomConfig>) => void }) {
  return (
    <>
      <MenuChoice label="Mode Kim" value={config.kimMode} options={KIM_OPTIONS} onChange={kimMode => onChange({ kimMode })} />
      <MenuChoice label="Min Tay" value={config.minHuTay} options={MIN_TAY_OPTIONS} onChange={minHuTay => onChange({ minHuTay })} />
      <MenuChoice label="Waktu giliran" value={config.turnSeconds} options={TURN_OPTIONS} onChange={turnSeconds => onChange({ turnSeconds })} />
      <MenuChoice label="Batas waktu 90 menit" value={config.timeLimitMinutes} options={LIMIT_OPTIONS} onChange={timeLimitMinutes => onChange({ timeLimitMinutes })} />
      <MenuChoice label="Kursi kosong" value={config.fillWithBots} options={BOT_FILL_OPTIONS} onChange={fillWithBots => onChange({ fillWithBots })} />
      {config.fillWithBots && <MenuChoice label="Level bot" value={config.botLevel} options={BOT_LEVEL_OPTIONS} onChange={botLevel => onChange({ botLevel })} />}
      <MenuChoice label="Penonton" value={config.allowSpectators} options={WATCH_OPTIONS} onChange={allowSpectators => onChange({ allowSpectators })} />
    </>
  );
}
