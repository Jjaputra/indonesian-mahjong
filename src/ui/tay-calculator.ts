/**
 * Manual 44-Tay calculator (the v0.1 "Kalkulator Tay" brief) and receipt builders.
 * Pattern values come from the canonical rulebook table in src/scoring/patterns.ts.
 */
import type { KimMode } from '../kim/types';
import { PATTERNS, type PatternDefinition, type ScoringResult } from '../scoring';
import type { HuOutcome } from './game-controller';
import { PLAYER_NAME, SEAT_LABEL, WIN_METHOD_LABEL, tileText } from './labels';

export const ALL_PATTERNS: readonly PatternDefinition[] = [...PATTERNS.values()].sort((a, b) => a.id - b.id);

/** Rulebook groupings used to section the reference list. */
export const PATTERN_GROUPS: readonly { title: string; ids: readonly number[] }[] = [
  { title: 'Bunga, Musim & Kim', ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { title: 'Hand Pembukaan', ids: [10, 11, 12] },
  { title: 'Bentuk Hand', ids: [13, 14, 15, 16, 17, 18, 19, 20, 39] },
  { title: 'Naga & Angin', ids: [21, 22, 23, 24, 25, 26, 27, 28, 29] },
  { title: 'Kim Khusus', ids: [30, 32, 40] },
  { title: 'Kong & Tris Tertutup', ids: [33, 34, 35, 36, 37, 38] },
  { title: 'Cara Menang & Lainnya', ids: [31, 41, 42, 43, 44] },
];

export function modeLabel(mode: KimMode): string {
  return mode === 'K' ? 'Ada Kim' : 'Tanpa Kim';
}

export function formatTay(value: number | null): string {
  return value === null ? '—' : String(value);
}

/** Case-insensitive search over number, name and Keterangan. */
export function searchPatterns(query: string, patterns: readonly PatternDefinition[] = ALL_PATTERNS): PatternDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...patterns];
  return patterns.filter(
    (p) => String(p.id) === q || `#${p.id}` === q || p.name.toLowerCase().includes(q) || p.keterangan.toLowerCase().includes(q)
  );
}

export interface CalculatorLine {
  id: number;
  name: string;
  tay: number;
}

export interface CalculatorResult {
  mode: KimMode;
  lines: CalculatorLine[];
  total: number;
  minHuTay: number;
  meetsMinimum: boolean;
  /** Selected patterns that do not exist in the active mode ("—") and are ignored */
  ignoredIds: number[];
  statusText: string;
}

/** Pattern selectable in a mode (the "—" column cannot be chosen). */
export function isSelectable(id: number, withKim: boolean): boolean {
  const def = PATTERNS.get(id);
  return !!def && (withKim ? def.K : def.NK) !== null;
}

export function calculateTay(selectedIds: Iterable<number>, withKim: boolean, minHuTay: number): CalculatorResult {
  const mode: KimMode = withKim ? 'K' : 'NK';
  const lines: CalculatorLine[] = [];
  const ignoredIds: number[] = [];
  const unique = [...new Set(selectedIds)].sort((a, b) => a - b);
  for (const id of unique) {
    const def = PATTERNS.get(id);
    if (!def) continue;
    const tay = def[mode];
    if (tay === null) ignoredIds.push(id);
    else lines.push({ id, name: def.name, tay });
  }
  const total = lines.reduce((s, l) => s + l.tay, 0);
  const min = Math.max(0, Math.floor(minHuTay));
  const meetsMinimum = total >= min;
  return {
    mode,
    lines,
    total,
    minHuTay: min,
    meetsMinimum,
    ignoredIds,
    statusText: meetsMinimum ? `MEMENUHI SYARAT HU · ${total} ≥ ${min} Tay` : `Belum memenuhi syarat Hu · ${total} / ${min} Tay`,
  };
}

export function buildCalculatorReceipt(result: CalculatorResult): string {
  const rows = result.lines.map((l) => `#${l.id} ${l.name}: ${l.tay} Tay`);
  return [
    `Kalkulator Tay ITM (${modeLabel(result.mode)})`,
    ...(rows.length ? rows : ['(belum ada pola dipilih)']),
    `Total: ${result.total} Tay`,
    result.statusText,
  ].join('\n');
}

/** Plain-text receipt of a finished Hu, used by the Copy Receipt button. */
export function buildHuReceipt(outcome: HuOutcome): string {
  const r: ScoringResult = outcome.scoring;
  const lines = [
    '=== STRUK HU — Mahjong Tradisional Indonesia ===',
    `Pemenang      : ${PLAYER_NAME[outcome.winner]} — ${SEAT_LABEL[outcome.winner]}`,
    `Tile menang   : ${tileText(outcome.winningTile)}`,
    `Cara menang   : ${WIN_METHOD_LABEL[outcome.winMethod]}${outcome.discarder ? ` (dari ${PLAYER_NAME[outcome.discarder]})` : ''}`,
    `Mode          : ${modeLabel(r.mode)}`,
    `Hand          : ${outcome.hand.map(tileText).join(', ')}`,
  ];
  if (outcome.melds.length) {
    lines.push(`Meld terbuka  : ${outcome.melds.map((m) => `${m.type.toUpperCase()}[${m.tiles.map(tileText).join(' ')}]`).join(' ')}`);
  }
  if (outcome.flowers.length) lines.push(`Bunga/Musim   : ${outcome.flowers.map(tileText).join(', ')}`);
  lines.push('--- Rincian Tay ---');
  for (const p of r.patterns) lines.push(`#${p.id} ${p.name}: ${p.tay} Tay`);
  lines.push(`TOTAL         : ${r.totalTay} Tay (minimum ${r.minHuTay})`);
  lines.push(r.isValidHu ? `HU SAH ✓ (${r.totalTay} ≥ ${r.minHuTay} Tay)` : `LEW FIT ✗ ${r.rejectionReason ?? ''}`.trim());
  lines.push(`Durasi        : ${outcome.durationSeconds} detik`);
  return lines.join('\n');
}

/** Hand classification label for the result modal. */
export function classifyHand(r: ScoringResult): string {
  if (r.isInstantHu) return 'Hu Instan (tanpa hand lengkap)';
  switch (r.decomposition?.shape) {
    case 'seven_pairs':
      return 'Tjit Tuei (7 pasang)';
    case 'thirteen_orphans':
      return 'Cap Sa Yau Kiu (13 yatim)';
    case 'se_sam_pu_tat':
      return 'Se Sam Pu Tat';
    case 'shi_kim':
      return 'Shi Kim (4 Kim)';
    case 'standard':
      return '4 set + 1 pasang (standar)';
    default:
      return 'Tidak membentuk Hu';
  }
}
