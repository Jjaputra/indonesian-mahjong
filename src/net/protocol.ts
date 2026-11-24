// Multiplayer wire protocol, shared by the room server (server/) and the client (src/net/).
// Design: .agents/notes-multiplayer-design.md. Every message is one JSON object per WebSocket frame.
import type { KimMode, Seat } from '../core/types';
import type { AIDifficulty } from '../storage';
import type { MatchTimeLimit } from '../session/match';
import type { SeatView, SessionAction } from '../session';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_SPECTATORS = 8;
export const REACTIONS = ['👍', '😂', '😮', '😭', '🔥', 'Ayo cepet!', 'Nice Hu!', 'Hoki banget!'] as const;
export type ReactionId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const CHAT_MAX_LENGTH = 120;
/** Lines the room keeps and replays on join or reconnect. */
export const CHAT_HISTORY = 50;
/** Minimum gap between two chat messages or reactions from one person. */
export const CHAT_INTERVAL_MS = 1000;

/** Canonical chat text: one line, trimmed, no control or invisible format characters (emoji joiners stay). */
export const normalizeChat = (text: string): string =>
  text.normalize('NFC').replace(/\p{Cc}/gu, ' ').replace(/(?!\u200d)\p{Cf}/gu, '').replace(/\s+/gu, ' ').trim();

/** One line in the room chat. Either free `text` or a preset `reaction`. `seat` is null for a spectator. */
export interface ChatLine {
  id: number;
  /** Server clock, ms. */
  at: number;
  seat: Seat | null;
  name: string;
  text?: string;
  reaction?: ReactionId;
}
export const NAME_MAX_LENGTH = 20;
export const usernameKey = (name: string): string => name.normalize('NFC').toLowerCase().replace(/ +/g, ' ').trim();
export const reservedUsername = (name: string): boolean => {
  const key = usernameKey(name);
  return ['bot', 'admin', 'host', 'pemain', 'maciokyu', 'penonton', 'moderator'].includes(key) || key.startsWith('bot ');
};
export function validUsername(value: unknown): value is string {
  if (typeof value !== 'string' || /\p{C}/u.test(value)) return false;
  const name = value.trim().normalize('NFC');
  return [...name].length >= 3 && [...name].length <= 12
    && /^[\p{L}\p{Nd}]+(?:[ ._-][\p{L}\p{Nd}]+)*$/u.test(name)
    && !reservedUsername(name);
}

/** Canonical room names: no invisible format characters or lookalike whitespace. */
export const normalizeName = (name: string): string =>
  name.normalize('NFC').replace(/\p{Cf}/gu, '').replace(/\s+/gu, ' ').trim().normalize('NFC');

export const isRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every(ch => ROOM_CODE_ALPHABET.includes(ch));

/** The "Buat Room" form. Host only, editable in the lobby. */
export interface RoomConfig {
  public: boolean;
  kimMode: KimMode;
  minHuTay: 0 | 3 | 5 | 8;
  /** Seconds per decision; null means no limit (practice). */
  turnSeconds: 5 | 10 | 15 | 20 | 30 | 60 | null;
  /** A match is 16 counted hands (RULES.md); 90 adds the optional 90-minute limit. */
  timeLimitMinutes: MatchTimeLimit;
  fillWithBots: boolean;
  botLevel: AIDifficulty;
  allowSpectators: boolean;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  public: false,
  kimMode: 'natural',
  minHuTay: 5,
  turnSeconds: 15,
  timeLimitMinutes: null,
  fillWithBots: true,
  botLevel: 'normal',
  allowSpectators: true,
};

export type RoomPhase = 'lobby' | 'seating' | 'playing' | 'finished';

export interface RoomSeat {
  premium?: boolean;
  seat: Seat;
  /** null when the seat is empty (a bot fills it at start when allowed). */
  name: string | null;
  bot: boolean;
  connected: boolean;
  host: boolean;
  ready?: boolean;
  takeover?: boolean;
}

export interface SeatDice {
  groups: Seat[][];
  dice: Partial<Record<Seat, number[]>>;
  deadline: number;
  botAt: Partial<Record<Seat, number>>;
  settledAt: number | null;
}

export interface RoomInfo {
  code: string;
  config: RoomConfig;
  seats: RoomSeat[];
  spectators: number;
  spectatorNames?: string[];
  spectatorDetails?: { name: string; premium?: boolean }[];
  hostName?: string;
  phase: RoomPhase;
  seatDice?: SeatDice | null;
  continueAt?: number | null;
}

/** Client → server. */
export type ClientMessage =
  | { type: 'hello'; token?: string; name: string; reclaim?: boolean; switchRoom?: boolean }
  | { type: 'reaction'; preset: ReactionId }
  | { type: 'chat'; text: string }
  | { type: 'leave' }
  | { type: 'rename'; name: string }
  | { type: 'sit'; seat: Seat }
  | { type: 'stand' }
  | { type: 'kick'; name: string }
  | { type: 'config'; config: RoomConfig }
  | { type: 'start' }
  | { type: 'rematch' }
  | { type: 'rollSeats' }
  | { type: 'ready' }
  | { type: 'replaceBot'; seat: Seat }
  | { type: 'act'; action: SessionAction }
  /** Ask for a fresh `room` + `view` (after a stale-version error or returning to the tab). */
  | { type: 'resync' }
  | { type: 'ping' };

export type ErrorCode =
  | 'username_required' | 'username_locked' | 'login_required' | 'daily_limit' | 'bad_message' | 'room_not_found' | 'room_full' | 'seat_taken' | 'not_host'
  | 'not_seated' | 'wrong_phase' | 'stale_version' | 'illegal_action' | 'rate_limited' | 'server_busy' | 'current_room';

/** Server → client. */
export type ServerMessage =
  /** Sent once per hello. Keep `token` to rejoin; `serverNow` lets the client correct its clock for deadlines. */
  | { type: 'welcome'; token: string; seat: Seat | null; host: boolean; serverNow: number; room: RoomInfo; name?: string }
  /** Lobby state, personalized: `seat` and `host` describe the receiving socket. */
  | { type: 'room'; room: RoomInfo; seat: Seat | null; host: boolean; name?: string }
  | { type: 'view'; view: SeatView; serverNow: number }
  | { type: 'event'; text: string; seat?: Seat }
  /** One new chat line, for everyone in the room: seated players and spectators. */
  | { type: 'chat'; line: ChatLine }
  /** The last lines of the room chat, sent after every welcome (join and reconnect). Replaces the client's copy. */
  | { type: 'chatHistory'; lines: ChatLine[] }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; serverNow: number }
  /** The server closes this socket next, e.g. the same seat opened on another device. */
  | { type: 'kicked'; reason: 'replaced' | 'room_closed' | 'kicked' };

/** HTTP: POST {server}/rooms → CreateRoomResponse. WebSocket: {server}/rooms/{code}/ws. */
export interface PublicRoom { code: string; hostName: string; hostPremium?: boolean; humans: number; config: RoomConfig; updatedAt: number }

export interface CreateRoomResponse { code: string }
