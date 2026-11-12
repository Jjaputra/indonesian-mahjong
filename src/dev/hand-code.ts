import type { TileFace, Seat, Wind } from '../core/types';
import type { HuOutcome } from '../ui/game-controller';
import type { GameEngineState } from '../core/game-engine';
import { isFirstGoAround, isInitialDealtHand, seatWindOf } from '../ui/win-context';

export interface DevHand {
  concealed: TileFace[];
  melds: { type: 'pung' | 'kong' | 'ankong' | 'jia'; faces: TileFace[] }[];
  bonus: { bunga: number[]; musim: number[] };
  winningTile: TileFace;
  win: { method: 'tsumo' | 'ron' | 'chiong_kong'; discarder?: Seat };
  kimFace: TileFace | null;
  seatWind: Wind;
  roundWind: Wind;
  flags: { firstGoAround?: boolean; paoChin?: boolean; consecutiveKongs?: number; initialDealtHand?: boolean };
}
const winds: Record<string, Wind> = { E: 'dong', S: 'nan', W: 'xi', N: 'bei' };
const letters: Record<Wind, string> = { dong: 'E', nan: 'S', xi: 'W', bei: 'N' };
const suits = { m: 'ban', p: 'tong', s: 'sok' } as const;
function bad(token: string): never { throw new Error(`Token tidak valid: "${token}".`); }
function faces(text: string): TileFace[] {
  const result: TileFace[] = [];
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    let rest = token;
    while (rest) {
      const suited = /^([1-9]+)([mps])/.exec(rest);
      if (suited) { result.push(...[...suited[1]!].map(n => ({ type: suits[suited[2] as keyof typeof suits], value: +n }))); rest = rest.slice(suited[0].length); continue; }
      const honor = /^(Zh|[ESWNFPK])/.exec(rest);
      if (!honor) bad(token);
      const h = honor[0];
      result.push(h === 'K' ? { type: 'kim', value: 0 } : winds[h] ? { type: 'wind', value: ['E','S','W','N'].indexOf(h) + 1 } : { type: 'dragon', value: ['Zh','F','P'].indexOf(h) + 1 });
      rest = rest.slice(h.length);
    }
  }
  return result;
}
function one(text: string): TileFace { const f = faces(text); if (f.length !== 1) bad(text); return f[0]!; }
function wind(text: string): Wind { return winds[text] ?? bad(text); }
export function validateDevHand(hand: DevHand): void {
  const all = [...hand.concealed, hand.winningTile, ...hand.melds.flatMap(m => m.faces)];
  const counts = new Map<string, number>();
  for (const f of all) {
    const max = ['ban','tong','sok'].includes(f.type) ? 9 : f.type === 'wind' ? 4 : f.type === 'dragon' ? 3 : f.type === 'kim' ? 0 : -1;
    if (!Number.isInteger(f.value) || f.value > max || f.value < (f.type === 'kim' ? 0 : 1)) bad(JSON.stringify(f));
    const key = `${f.type}:${f.value}`; const n = (counts.get(key) ?? 0) + 1; counts.set(key, n);
    if (n > 4) throw new Error(`Tile ${formatFace(f)} melebihi 4 salinan.`);
  }
  if (hand.melds.length > 4 || all.length !== 14 + hand.melds.filter(m => m.type === 'kong' || m.type === 'ankong').length) throw new Error('Jumlah tile harus 14 ditambah satu untuk setiap Kong.');
  for (const m of hand.melds) {
    const n = m.type === 'kong' || m.type === 'ankong' ? 4 : 3;
    if (m.faces.length !== n) bad(`${m.type} ${m.faces.map(formatFace).join(' ')}`);
    if (m.type === 'jia') {
      const sorted = [...m.faces].sort((a,b) => a.value-b.value);
      if (!['ban','tong','sok'].includes(sorted[0]!.type) || sorted.some((f,i) => f.type !== sorted[0]!.type || f.value !== sorted[0]!.value+i)) bad(`jia ${m.faces.map(formatFace).join(' ')}`);
    } else if (m.faces.some(f => f.type !== m.faces[0]!.type || f.value !== m.faces[0]!.value)) bad(m.type);
  }
  for (const [label, values] of Object.entries(hand.bonus)) if (new Set(values).size !== values.length || values.some(n => !Number.isInteger(n) || n < 1 || n > 4)) bad(`${label} ${values.join(' ')}`);
  if (hand.win.method !== 'tsumo' && (!hand.win.discarder || hand.win.discarder === hand.seatWind)) bad('win: pembuang harus kursi lain');
  if (hand.kimFace) {
    const f = hand.kimFace; const max = f.type === 'wind' ? 4 : f.type === 'dragon' ? 3 : ['ban','tong','sok'].includes(f.type) ? 9 : 0;
    if (!Number.isInteger(f.value) || f.value < 1 || f.value > max) bad('kim');
  }
  if (!Number.isInteger(hand.flags.consecutiveKongs ?? 0) || (hand.flags.consecutiveKongs ?? 0) < 0 || (hand.flags.consecutiveKongs ?? 0) > 4) bad('flags kong');
}
export function parseHandCode(text: string): { ok: true; hand: DevHand } | { ok: false; error: string } {
  try {
    const parts = text.split('|');
    const hand: DevHand = { concealed: faces(parts.shift()!), melds: [], bonus: { bunga: [], musim: [] }, winningTile: { type: 'ban', value: 1 }, win: { method: 'tsumo' }, kimFace: null, seatWind: 'dong', roundWind: 'dong', flags: {} };
    const seen = new Set<string>();
    for (const part of parts) {
      const [key, ...args] = part.trim().split(/\s+/); const value = args.join(' ');
      if (['pung','kong','ankong','jia'].includes(key!)) { hand.melds.push({ type: key as DevHand['melds'][number]['type'], faces: faces(value) }); continue; }
      if (seen.has(key!)) bad(part); seen.add(key!);
      switch (key) {
        case 'bunga': case 'musim': hand.bonus[key] = args.map(Number); break;
        case 'kim': hand.kimFace = one(value); break;
        case 'seat': hand.seatWind = wind(value); break;
        case 'round': hand.roundWind = wind(value); break;
        case 'win': {
          if (args.length !== 2) bad(part); hand.winningTile = one(args[0]!);
          const method = args[1]!;
          if (method === 'ce_mo') hand.win = { method: 'tsumo' };
          else { const match = /^(buangan|chiong_kong):([ESWN])$/.exec(method); if (!match) bad(method); hand.win = { method: match[1] === 'buangan' ? 'ron' : 'chiong_kong', discarder: wind(match[2]!) }; }
          break;
        }
        case 'flags': for (const flag of value.split(',')) {
          if (flag === 'first') hand.flags.firstGoAround = true;
          else if (flag === 'paochin') hand.flags.paoChin = true;
          else if (flag === 'initial') hand.flags.initialDealtHand = true;
          else if (/^kong\d+$/.test(flag)) hand.flags.consecutiveKongs = Number(flag.slice(4));
          else bad(flag);
        } break;
        default: bad(part);
      }
    }
    if (!seen.has('win')) throw new Error('Token wajib belum ada: "win".');
    validateDevHand(hand); return { ok: true, hand };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
function formatFace(f: TileFace): string {
  if (f.type === 'kim') return 'K';
  if (f.type === 'wind') return ['E','S','W','N'][f.value-1]!;
  if (f.type === 'dragon') return ['Zh','F','P'][f.value-1]!;
  return `${f.value}${({ ban: 'm', tong: 'p', sok: 's' } as Record<string,string>)[f.type]}`;
}
export function formatHandCode(h: DevHand): string {
  const parts = [h.concealed.map(formatFace).join(' '), ...h.melds.map(m => `${m.type} ${m.faces.map(formatFace).join(' ')}`)];
  for (const key of ['bunga','musim'] as const) if (h.bonus[key].length) parts.push(`${key} ${h.bonus[key].join(' ')}`);
  parts.push(`win ${formatFace(h.winningTile)} ${h.win.method === 'tsumo' ? 'ce_mo' : `${h.win.method === 'ron' ? 'buangan' : 'chiong_kong'}:${letters[h.win.discarder!]}`}`);
  if (h.kimFace) parts.push(`kim ${formatFace(h.kimFace)}`);
  parts.push(`seat ${letters[h.seatWind]}`, `round ${letters[h.roundWind]}`);
  const flags = [h.flags.firstGoAround && 'first', h.flags.paoChin && 'paochin', h.flags.initialDealtHand && 'initial', h.flags.consecutiveKongs && `kong${h.flags.consecutiveKongs}`].filter(Boolean);
  if (flags.length) parts.push(`flags ${flags.join(',')}`);
  return parts.join(' | ');
}
export function devHandFromOutcome(outcome: HuOutcome, state: Readonly<GameEngineState>): DevHand {
  const face = (t: TileFace): TileFace => ({ type: t.type, value: t.value });
  const concealed = [...outcome.hand]; const index = concealed.findIndex(t => t.id === outcome.winningTile.id); if (index >= 0) concealed.splice(index, 1);
  const flags = outcome.winFlags;
  return { concealed: concealed.map(face), melds: outcome.melds.map(m => ({ type: m.type, faces: m.tiles.map(face) })), bonus: { bunga: outcome.flowers.filter(t => t.type === 'flower').map(t => t.value), musim: outcome.flowers.filter(t => t.type === 'season').map(t => t.value) }, winningTile: face(outcome.winningTile), win: { method: outcome.winMethod, ...(outcome.discarder ? { discarder: seatWindOf(state, outcome.discarder) } : {}) }, kimFace: state.kimFace ?? null, seatWind: outcome.seatWind ?? seatWindOf(state, outcome.winner), roundWind: state.roundWind, flags: { firstGoAround: flags?.isFirstGoAround ?? isFirstGoAround(state), paoChin: flags?.isPaoChin ?? state.players[outcome.winner].isPaoChin, consecutiveKongs: flags?.consecutiveKongs ?? state.consecutiveKongs, initialDealtHand: flags?.isInitialDealtHand ?? isInitialDealtHand(state, outcome.winner) } };
}
