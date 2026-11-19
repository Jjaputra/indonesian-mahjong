// Multiplayer wire protocol, shared by the room server (server/) and the client (src/net/).
// Design: .agents/notes-multiplayer-design.md. Every message is one JSON object per WebSocket frame.
import type { KimMode, Seat } from '../core/types';
import type { AIDifficulty } from '../storage';
import type { MatchTimeLimit } from '../session/match';
import type { SeatView, SessionAction } from '../session';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_SPECTATORS = 8;
export const NAME_MAX_LENGTH = 20;

export const isRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every(ch => ROOM_CODE_ALPHABET.includes(ch));

/** The "Buat Room" form. Host only, editable in the lobby. */
export interface RoomConfig {
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
  phase: RoomPhase;
  seatDice?: SeatDice | null;
  continueAt?: number | null;
}

/** Client → server. */
export type ClientMessage =
  | { type: 'hello'; token?: string; name: string }
  | { type: 'sit'; seat: Seat }
  | { type: 'stand' }
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
  | 'bad_message' | 'room_not_found' | 'room_full' | 'seat_taken' | 'not_host'
  | 'not_seated' | 'wrong_phase' | 'stale_version' | 'illegal_action' | 'rate_limited' | 'server_busy';

/** Server → client. */
export type ServerMessage =
  /** Sent once per hello. Keep `token` to rejoin; `serverNow` lets the client correct its clock for deadlines. */
  | { type: 'welcome'; token: string; seat: Seat | null; host: boolean; serverNow: number; room: RoomInfo }
  /** Lobby state, personalized: `seat` and `host` describe the receiving socket. */
  | { type: 'room'; room: RoomInfo; seat: Seat | null; host: boolean }
  | { type: 'view'; view: SeatView; serverNow: number }
  | { type: 'event'; text: string; seat?: Seat }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; serverNow: number }
  /** The server closes this socket next, e.g. the same seat opened on another device. */
  | { type: 'kicked'; reason: 'replaced' | 'room_closed' };

/** HTTP: POST {server}/rooms → CreateRoomResponse. WebSocket: {server}/rooms/{code}/ws. */
export interface CreateRoomResponse { code: string }
