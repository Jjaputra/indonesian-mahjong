// Per-room player token, last room and nickname in localStorage, plus the invite-link helpers.
import { getStorage, type StorageLike } from '../storage';
import { NAME_MAX_LENGTH, normalizeName, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from './protocol';

export interface StoredRoom { code: string; token: string; name: string }

const ROOMS_KEY = 'itm.mp.rooms.v1';
const LAST_KEY = 'itm.mp.last.v1';
const NAME_KEY = 'itm.mp.name.v1';

function readRooms(storage?: StorageLike): Record<string, StoredRoom> {
  try {
    const parsed: unknown = JSON.parse(getStorage(storage).getItem(ROOMS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, StoredRoom> : {};
  } catch { return {}; }
}

export function saveRoom(room: StoredRoom, storage?: StorageLike): void {
  try {
    const s = getStorage(storage);
    s.setItem(ROOMS_KEY, JSON.stringify({ ...readRooms(s), [room.code]: { ...room, name: cleanName(room.name) } }));
    s.setItem(LAST_KEY, room.code);
  } catch { /* storage full or blocked: the seat just won't be remembered */ }
}

export function loadRoom(code: string, storage?: StorageLike): StoredRoom | null {
  const room = readRooms(storage)[code];
  return room && typeof room.token === 'string' && room.code === code ? room : null;
}

/** The room to offer as "Lanjutkan room CODE". */
export function loadLastRoom(storage?: StorageLike): StoredRoom | null {
  try {
    const code = getStorage(storage).getItem(LAST_KEY);
    return code ? loadRoom(code, storage) : null;
  } catch { return null; }
}

export function forgetRoom(code: string, storage?: StorageLike): void {
  try {
    const s = getStorage(storage);
    const rooms = readRooms(s);
    delete rooms[code];
    s.setItem(ROOMS_KEY, JSON.stringify(rooms));
    if (s.getItem(LAST_KEY) === code) s.removeItem(LAST_KEY);
  } catch { /* nothing to forget */ }
}

export function loadPlayerName(storage?: StorageLike): string {
  try { return getStorage(storage).getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export function savePlayerName(name: string, storage?: StorageLike): void {
  try { getStorage(storage).setItem(NAME_KEY, cleanName(name)); } catch { /* keep the live value */ }
}

export const cleanName = (name: string): string => normalizeName(name).slice(0, NAME_MAX_LENGTH).trimEnd();

/** Uppercase and drop characters outside the room-code alphabet (no 0/O/1/I/L), at most 6. */
export function normalizeRoomCode(input: string): string {
  return [...input.toUpperCase()].filter(ch => ROOM_CODE_ALPHABET.includes(ch)).join('').slice(0, ROOM_CODE_LENGTH);
}

/** `?room=CODE` from a location search string; null when absent or malformed. */
export function parseRoomParam(search: string): string | null {
  const raw = new URLSearchParams(search).get('room');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return isRoomCode(code) ? code : null;
}

/** The clean invite URL: the app's own address with only `?room=CODE`. */
export function inviteLink(code: string, location: Pick<Location, 'origin' | 'pathname'>): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

export const buildShareText = (code: string, link: string): string => `Ayo main mahjong bareng! Kode room: ${code}\n${link}`;

export const whatsAppUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Base URL of the room server, or null when online play isn't configured. */
export function mpServerUrl(): string | null {
  const raw = (import.meta.env.VITE_MP_SERVER as string | undefined)?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export const roomSocketUrl = (server: string, code: string): string =>
  `${server.replace(/^http/i, 'ws')}/rooms/${code}/ws`;
