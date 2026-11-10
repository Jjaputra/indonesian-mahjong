// ============================================================================
// Persistence Layer (F25): LocalStorage-backed GameSettings & Match History
// ----------------------------------------------------------------------------
// - All reads are defensive: corrupted JSON, wrong shapes, out-of-range values
//   and unavailable/throwing localStorage (private mode, SSR, Node tests) all
//   fall back to safe defaults instead of throwing.
// - Every public function accepts an optional `StorageLike` backend so callers
//   (and tests) can inject a custom store. When omitted, the browser
//   `localStorage` is used if usable, otherwise an in-memory fallback store.
// ============================================================================

import type { GameRules, Seat, Tile, TileType, Wind } from '../core/types';
import type { KimRules } from '../kim/types';
import { CASUAL_KIM_RULES, TOURNAMENT_KIM_RULES } from '../kim/types';

// ============================================================================
// Types
// ============================================================================

export type AIDifficulty = 'easy' | 'normal' | 'hard';

/** How bonus (flower/season) tiles are replaced: automatically or via explicit player action. */
export type FlowerReplacementMode = 'auto' | 'manual';

/**
 * Pattern overlap policy for the scoring engine:
 * - `rulebook_exclusive`: BMC06 exclusion/precedence rules apply (subsumed patterns are dropped).
 * - `cumulative`: overlapping patterns stack (casual / house-rule play).
 */
export type OverlapPolicy = 'rulebook_exclusive' | 'cumulative';

/** UI animation speed. `off` disables animations entirely. */
export type AnimationSpeed = 'off' | 'slow' | 'normal' | 'fast';

export type SettingsPresetName = 'tournament' | 'casual';

export interface GameSettings {
  // --- Kim joker toggles -----------------------------------------------------
  /** Master toggle: enable Kim joker tiles */
  kimEnabled: boolean;
  /** Allow discarding Kim tiles (Tournament: false) */
  kimDiscardAllowed: boolean;
  /** Allow Kim to complete Pung melds */
  allowKimInPung: boolean;
  /** Allow Kim to complete Jia sequences */
  allowKimInJia: boolean;
  /** Allow Kim to complete the winning pair (eye) */
  allowKimInPair: boolean;
  /** Allow Kim to complete triplets (Tris) */
  allowKimInTriplet: boolean;
  /** Allow using Kim from hand to claim Jia/Pung on a discard (Tournament: false -> Lew Fit) */
  allowKimInMeldClaim: boolean;

  // --- Rules -------------------------------------------------------------------
  /** Minimum Tay to declare a legal Hu (default 5) */
  minHuTay: number;
  /** Prevailing round wind */
  roundWind: Wind;
  /** Seat wind of the starting dealer */
  startingSeatWind: Seat;
  flowerReplacementMode: FlowerReplacementMode;
  overlapPolicy: OverlapPolicy;

  // --- AI & presentation ------------------------------------------------------
  aiDifficulty: AIDifficulty;
  animationSpeed: AnimationSpeed;
  soundEnabled: boolean;
}

export type WinMethod = 'tsumo' | 'ron' | 'chiong_kong' | 'draw';

export interface ScoringBreakdownItem {
  /** Rulebook pattern number (1-44) */
  id: number;
  name: string;
  tay: number;
}

export interface MatchHistoryRecord {
  id: string;
  /** Epoch milliseconds when the game finished */
  timestamp: number;
  /** Winning seat, or null for a drawn game (Seri) */
  winner: Seat | null;
  winningHand: Tile[];
  winningTile: Tile | null;
  scoringBreakdown: ScoringBreakdownItem[];
  totalTay: number;
  /** True when won in K mode (Ada Kim) */
  isWithKim: boolean;
  winMethod: WinMethod;
  durationSeconds: number;
}

/** Input to `saveGameRecord`: `id` and `timestamp` are generated when omitted. */
export type NewMatchHistoryRecord = Omit<MatchHistoryRecord, 'id' | 'timestamp'> &
  Partial<Pick<MatchHistoryRecord, 'id' | 'timestamp'>>;

/** Minimal subset of the Web Storage API used by this module. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ============================================================================
// Constants & Presets
// ============================================================================

export const SETTINGS_STORAGE_KEY = 'itm.settings.v1';
export const HISTORY_STORAGE_KEY = 'itm.history.v1';
/** Maximum number of history records retained (oldest are evicted first). */
export const MAX_HISTORY_RECORDS = 200;

export const MIN_HU_TAY_LOWER_BOUND = 0;
export const MIN_HU_TAY_UPPER_BOUND = 100;
export const DEFAULT_MIN_HU_TAY = 5;

const WINDS: readonly Wind[] = ['dong', 'nan', 'xi', 'bei'];
const SEATS: readonly Seat[] = ['dong', 'nan', 'xi', 'bei'];
const AI_DIFFICULTIES: readonly AIDifficulty[] = ['easy', 'normal', 'hard'];
const FLOWER_MODES: readonly FlowerReplacementMode[] = ['auto', 'manual'];
const OVERLAP_POLICIES: readonly OverlapPolicy[] = ['rulebook_exclusive', 'cumulative'];
const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ['off', 'slow', 'normal', 'fast'];
const WIN_METHODS: readonly WinMethod[] = ['tsumo', 'ron', 'chiong_kong', 'draw'];
const TILE_TYPES: readonly TileType[] = [
  'tong',
  'sok',
  'ban',
  'wind',
  'dragon',
  'flower',
  'season',
  'kim',
];

function kimToggles(rules: Readonly<KimRules>) {
  return {
    kimEnabled: rules.kimEnabled,
    kimDiscardAllowed: rules.kimDiscardAllowed,
    allowKimInPung: rules.allowKimInPung,
    allowKimInJia: rules.allowKimInJia,
    allowKimInPair: rules.allowKimInPair,
    allowKimInTriplet: rules.allowKimInTriplet,
    allowKimInMeldClaim: rules.allowKimInMeldClaim,
  };
}

/** Bandung Mahjong Cup ver06 tournament rules. */
export const TOURNAMENT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  ...kimToggles(TOURNAMENT_KIM_RULES),
  minHuTay: DEFAULT_MIN_HU_TAY,
  roundWind: 'dong',
  startingSeatWind: 'dong',
  flowerReplacementMode: 'auto',
  overlapPolicy: 'rulebook_exclusive',
  aiDifficulty: 'normal',
  animationSpeed: 'normal',
  soundEnabled: true,
});

/** Relaxed casual rules (Kim meld claims permitted, patterns stack). */
export const CASUAL_SETTINGS: Readonly<GameSettings> = Object.freeze({
  ...kimToggles(CASUAL_KIM_RULES),
  minHuTay: DEFAULT_MIN_HU_TAY,
  roundWind: 'dong',
  startingSeatWind: 'dong',
  flowerReplacementMode: 'auto',
  overlapPolicy: 'cumulative',
  aiDifficulty: 'easy',
  animationSpeed: 'normal',
  soundEnabled: true,
});

export const SETTINGS_PRESETS: Readonly<Record<SettingsPresetName, Readonly<GameSettings>>> =
  Object.freeze({
    tournament: TOURNAMENT_SETTINGS,
    casual: CASUAL_SETTINGS,
  });

export const DEFAULT_SETTINGS: Readonly<GameSettings> = TOURNAMENT_SETTINGS;

// ============================================================================
// Storage backend resolution
// ============================================================================

/** Simple in-memory `StorageLike`, used as fallback when localStorage is unusable. */
export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

const memoryFallback = new MemoryStorage();

/**
 * Returns true if browser localStorage exists and can be written to.
 * Accessing `localStorage` itself may throw (e.g. SecurityError in sandboxed iframes).
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!ls) return false;
    const probe = '__itm_storage_probe__';
    ls.setItem(probe, probe);
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the storage backend: explicit > usable localStorage > in-memory fallback. */
export function getStorage(storage?: StorageLike): StorageLike {
  if (storage) return storage;
  if (isLocalStorageAvailable()) {
    return (globalThis as unknown as { localStorage: StorageLike }).localStorage;
  }
  return memoryFallback;
}

function safeRead(storage: StorageLike, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function safeWrite(storage: StorageLike, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage: StorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Validation helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ============================================================================
// Settings API
// ============================================================================

/**
 * Normalize arbitrary (possibly corrupted / partial / legacy) data into a valid
 * `GameSettings`. Invalid fields fall back to `base` (default: Tournament).
 */
export function sanitizeSettings(
  raw: unknown,
  base: Readonly<GameSettings> = DEFAULT_SETTINGS,
): GameSettings {
  const src = isRecord(raw) ? raw : {};

  let minHuTay = base.minHuTay;
  if (isFiniteNumber(src.minHuTay)) {
    minHuTay = Math.min(
      MIN_HU_TAY_UPPER_BOUND,
      Math.max(MIN_HU_TAY_LOWER_BOUND, Math.round(src.minHuTay)),
    );
  }

  return {
    kimEnabled: pickBool(src.kimEnabled, base.kimEnabled),
    kimDiscardAllowed: pickBool(src.kimDiscardAllowed, base.kimDiscardAllowed),
    allowKimInPung: pickBool(src.allowKimInPung, base.allowKimInPung),
    allowKimInJia: pickBool(src.allowKimInJia, base.allowKimInJia),
    allowKimInPair: pickBool(src.allowKimInPair, base.allowKimInPair),
    allowKimInTriplet: pickBool(src.allowKimInTriplet, base.allowKimInTriplet),
    allowKimInMeldClaim: pickBool(src.allowKimInMeldClaim, base.allowKimInMeldClaim),
    minHuTay,
    roundWind: pickEnum(src.roundWind, WINDS, base.roundWind),
    startingSeatWind: pickEnum(src.startingSeatWind, SEATS, base.startingSeatWind),
    flowerReplacementMode: pickEnum(
      src.flowerReplacementMode,
      FLOWER_MODES,
      base.flowerReplacementMode,
    ),
    overlapPolicy: pickEnum(src.overlapPolicy, OVERLAP_POLICIES, base.overlapPolicy),
    aiDifficulty: pickEnum(src.aiDifficulty, AI_DIFFICULTIES, base.aiDifficulty),
    animationSpeed: pickEnum(src.animationSpeed, ANIMATION_SPEEDS, base.animationSpeed),
    soundEnabled: pickBool(src.soundEnabled, base.soundEnabled),
  };
}

/** Returns a fresh mutable copy of a named preset. */
export function getPreset(name: SettingsPresetName): GameSettings {
  const preset = SETTINGS_PRESETS[name] ?? DEFAULT_SETTINGS;
  return { ...preset };
}

/**
 * Returns which preset (if any) the given settings match on all rule fields.
 * Presentation fields (AI difficulty, animation, sound, winds) are ignored.
 */
export function detectPreset(settings: GameSettings): SettingsPresetName | 'custom' {
  const ruleKeys: (keyof GameSettings)[] = [
    'kimEnabled',
    'kimDiscardAllowed',
    'allowKimInPung',
    'allowKimInJia',
    'allowKimInPair',
    'allowKimInTriplet',
    'allowKimInMeldClaim',
    'minHuTay',
    'flowerReplacementMode',
    'overlapPolicy',
  ];
  for (const name of Object.keys(SETTINGS_PRESETS) as SettingsPresetName[]) {
    const preset = SETTINGS_PRESETS[name];
    if (ruleKeys.every((k) => preset[k] === settings[k])) return name;
  }
  return 'custom';
}

/** Load persisted settings, or defaults when missing / corrupted / unavailable. */
export function loadSettings(storage?: StorageLike): GameSettings {
  const raw = safeRead(getStorage(storage), SETTINGS_STORAGE_KEY);
  if (raw === undefined) return { ...DEFAULT_SETTINGS };
  return sanitizeSettings(raw);
}

/** Persist settings (sanitized first). Returns false if the write failed. */
export function saveSettings(settings: Partial<GameSettings>, storage?: StorageLike): boolean {
  return safeWrite(getStorage(storage), SETTINGS_STORAGE_KEY, sanitizeSettings(settings));
}

/** Merge a partial patch into the currently stored settings and persist the result. */
export function updateSettings(patch: Partial<GameSettings>, storage?: StorageLike): GameSettings {
  const store = getStorage(storage);
  const merged = sanitizeSettings({ ...loadSettings(store), ...patch });
  safeWrite(store, SETTINGS_STORAGE_KEY, merged);
  return merged;
}

/** Apply and persist a named preset, keeping the user's presentation preferences. */
export function applyPreset(
  name: SettingsPresetName,
  storage?: StorageLike,
  options: { keepPreferences?: boolean } = {},
): GameSettings {
  const store = getStorage(storage);
  const keep = options.keepPreferences ?? true;
  const preset = getPreset(name);
  const next: GameSettings = keep
    ? (() => {
        const current = loadSettings(store);
        return {
          ...preset,
          aiDifficulty: current.aiDifficulty,
          animationSpeed: current.animationSpeed,
          soundEnabled: current.soundEnabled,
        };
      })()
    : preset;
  safeWrite(store, SETTINGS_STORAGE_KEY, next);
  return next;
}

/** Remove persisted settings; subsequent loads return defaults. */
export function resetSettings(storage?: StorageLike): GameSettings {
  safeRemove(getStorage(storage), SETTINGS_STORAGE_KEY);
  return { ...DEFAULT_SETTINGS };
}

/** Project settings into the core engine `GameRules` contract. */
export function toGameRules(settings: GameSettings): GameRules {
  return {
    kimEnabled: settings.kimEnabled,
    kimDiscardAllowed: settings.kimDiscardAllowed,
    allowKimInMeldClaim: settings.allowKimInMeldClaim,
    minHuTay: settings.minHuTay,
  };
}

/** Project settings into the Kim subsystem `KimRules` contract. */
export function toKimRules(settings: GameSettings): KimRules {
  return {
    kimEnabled: settings.kimEnabled,
    kimDiscardAllowed: settings.kimDiscardAllowed,
    allowKimInMeldClaim: settings.allowKimInMeldClaim,
    allowKimInPair: settings.allowKimInPair,
    allowKimInPung: settings.allowKimInPung,
    allowKimInJia: settings.allowKimInJia,
    allowKimInTriplet: settings.allowKimInTriplet,
  };
}

// ============================================================================
// Match History API
// ============================================================================

function sanitizeTile(raw: unknown): Tile | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !isFiniteNumber(raw.value)) return null;
  if (typeof raw.type !== 'string' || !(TILE_TYPES as readonly string[]).includes(raw.type)) {
    return null;
  }
  const tile: Tile = { id: raw.id, type: raw.type as TileType, value: raw.value };
  return raw.isKim === true ? { ...tile, isKim: true } : tile;
}

function sanitizeBreakdownItem(raw: unknown): ScoringBreakdownItem | null {
  if (!isRecord(raw)) return null;
  if (!isFiniteNumber(raw.id) || typeof raw.name !== 'string' || !isFiniteNumber(raw.tay)) {
    return null;
  }
  return { id: raw.id, name: raw.name, tay: raw.tay };
}

/** Validate a single stored history record. Returns null if unrecoverable. */
export function sanitizeGameRecord(raw: unknown): MatchHistoryRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  if (!isFiniteNumber(raw.timestamp)) return null;

  const winner =
    raw.winner === null || raw.winner === undefined
      ? null
      : (SEATS as readonly unknown[]).includes(raw.winner)
        ? (raw.winner as Seat)
        : undefined;
  if (winner === undefined) return null;

  const winningHand = Array.isArray(raw.winningHand)
    ? raw.winningHand.map(sanitizeTile).filter((t): t is Tile => t !== null)
    : [];
  const scoringBreakdown = Array.isArray(raw.scoringBreakdown)
    ? raw.scoringBreakdown
        .map(sanitizeBreakdownItem)
        .filter((b): b is ScoringBreakdownItem => b !== null)
    : [];

  return {
    id: raw.id,
    timestamp: raw.timestamp,
    winner,
    winningHand,
    winningTile: sanitizeTile(raw.winningTile),
    scoringBreakdown,
    totalTay: isFiniteNumber(raw.totalTay)
      ? raw.totalTay
      : scoringBreakdown.reduce((sum, b) => sum + b.tay, 0),
    isWithKim: pickBool(raw.isWithKim, false),
    winMethod: pickEnum(raw.winMethod, WIN_METHODS, winner === null ? 'draw' : 'ron'),
    durationSeconds:
      isFiniteNumber(raw.durationSeconds) && raw.durationSeconds >= 0 ? raw.durationSeconds : 0,
  };
}

let idCounter = 0;

/** Generates a reasonably unique record id without requiring crypto. */
export function generateRecordId(now: number = Date.now()): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // fall through to counter-based id
  }
  idCounter = (idCounter + 1) % 1_000_000;
  return `game-${now.toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Load match history, newest first. Corrupted entries are skipped. */
export function loadGameHistory(storage?: StorageLike): MatchHistoryRecord[] {
  const raw = safeRead(getStorage(storage), HISTORY_STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeGameRecord)
    .filter((r): r is MatchHistoryRecord => r !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Save a completed game record (newest first, capped at MAX_HISTORY_RECORDS).
 * Generates `id`/`timestamp` when absent. If storage quota is exceeded, the
 * oldest half of the history is evicted and the write retried once.
 * Returns the stored record, or null if the record was invalid or could not be persisted.
 */
export function saveGameRecord(
  record: NewMatchHistoryRecord,
  storage?: StorageLike,
): MatchHistoryRecord | null {
  const store = getStorage(storage);
  const timestamp = isFiniteNumber(record.timestamp) ? record.timestamp : Date.now();
  const candidate = sanitizeGameRecord({
    ...record,
    id: typeof record.id === 'string' && record.id.length > 0 ? record.id : generateRecordId(timestamp),
    timestamp,
  });
  if (!candidate) return null;

  const existing = loadGameHistory(store).filter((r) => r.id !== candidate.id);
  let next = [candidate, ...existing]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY_RECORDS);

  if (safeWrite(store, HISTORY_STORAGE_KEY, next)) return candidate;

  // Likely QuotaExceededError: evict the oldest half and retry.
  next = next.slice(0, Math.max(1, Math.floor(next.length / 2)));
  if (!next.some((r) => r.id === candidate.id)) next = [candidate];
  return safeWrite(store, HISTORY_STORAGE_KEY, next) ? candidate : null;
}

/** Remove a single record by id. Returns true if a record was removed and persisted. */
export function deleteGameRecord(id: string, storage?: StorageLike): boolean {
  const store = getStorage(storage);
  const history = loadGameHistory(store);
  const next = history.filter((r) => r.id !== id);
  if (next.length === history.length) return false;
  return safeWrite(store, HISTORY_STORAGE_KEY, next);
}

/** Remove all match history. Returns false if the backend refused. */
export function clearGameHistory(storage?: StorageLike): boolean {
  return safeRemove(getStorage(storage), HISTORY_STORAGE_KEY);
}

export interface HistoryStats {
  gamesPlayed: number;
  wins: Record<Seat, number>;
  draws: number;
  highestTay: number;
  averageTay: number;
  kimWins: number;
  noKimWins: number;
}

/** Aggregate simple statistics over stored history. */
export function computeHistoryStats(history: readonly MatchHistoryRecord[]): HistoryStats {
  const wins: Record<Seat, number> = { dong: 0, nan: 0, xi: 0, bei: 0 };
  let draws = 0;
  let highestTay = 0;
  let tayTotal = 0;
  let kimWins = 0;
  let noKimWins = 0;
  for (const r of history) {
    if (r.winner === null) {
      draws++;
      continue;
    }
    wins[r.winner]++;
    highestTay = Math.max(highestTay, r.totalTay);
    tayTotal += r.totalTay;
    if (r.isWithKim) kimWins++;
    else noKimWins++;
  }
  const decided = history.length - draws;
  return {
    gamesPlayed: history.length,
    wins,
    draws,
    highestTay,
    averageTay: decided > 0 ? tayTotal / decided : 0,
    kimWins,
    noKimWins,
  };
}
