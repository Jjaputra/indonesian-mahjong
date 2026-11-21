import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../src/storage';
import { buildShareText, cleanName, forgetRoom, inviteLink, loadLastRoom, loadPlayerName, loadRoom, normalizeRoomCode, parseRoomParam, roomSocketUrl, saveRoom, savePlayerName, whatsAppUrl } from '../../src/net/room-store';

describe('?room= parsing', () => {
  it('reads and uppercases a valid code', () => {
    expect(parseRoomParam('?room=abc234')).toBe('ABC234');
    expect(parseRoomParam('?x=1&room=KMNP23')).toBe('KMNP23');
  });
  it('rejects missing, short, long and ambiguous-character codes', () => {
    expect(parseRoomParam('')).toBeNull();
    expect(parseRoomParam('?room=')).toBeNull();
    expect(parseRoomParam('?room=ABC23')).toBeNull();
    expect(parseRoomParam('?room=ABC2345')).toBeNull();
    expect(parseRoomParam('?room=ABC10O')).toBeNull();
  });
  it('normalizes typed input: uppercase, no ambiguous characters, six at most', () => {
    expect(normalizeRoomCode('a-b0c 1i2l3o4zz')).toBe('ABC234');
  });
});

describe('sharing', () => {
  const link = inviteLink('ABC234', { origin: 'https://jjaputra.github.io', pathname: '/indo-mahjong/' });
  it('builds the clean invite link', () => {
    expect(link).toBe('https://jjaputra.github.io/indo-mahjong/?room=ABC234');
  });
  it('builds the share text', () => {
    expect(buildShareText('ABC234', link)).toBe('Yuk main maciokYU! bareng. Kode room: ABC234\nhttps://jjaputra.github.io/indo-mahjong/?room=ABC234');
  });
  it('encodes the WhatsApp url', () => {
    const url = whatsAppUrl(buildShareText('ABC234', link));
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(buildShareText('ABC234', link));
  });
  it('maps the server url to the socket url', () => {
    expect(roomSocketUrl('https://mp.example', 'ABC234')).toBe('wss://mp.example/rooms/ABC234/ws');
    expect(roomSocketUrl('http://localhost:8787', 'ABC234')).toBe('ws://localhost:8787/rooms/ABC234/ws');
  });
});

describe('room store', () => {
  it('keeps a token per room and the last one', () => {
    const s = new MemoryStorage();
    saveRoom({ code: 'ABC234', token: 't1', name: 'Jason' }, s);
    saveRoom({ code: 'KMNP23', token: 't2', name: 'Jason' }, s);
    expect(loadRoom('ABC234', s)?.token).toBe('t1');
    expect(loadLastRoom(s)?.code).toBe('KMNP23');
    forgetRoom('KMNP23', s);
    expect(loadLastRoom(s)).toBeNull();
    expect(loadRoom('ABC234', s)?.token).toBe('t1');
  });
  it('remembers the name and trims it', () => {
    const s = new MemoryStorage();
    savePlayerName('Jason', s);
    expect(loadPlayerName(s)).toBe('Jason');
    expect(cleanName('  Jason   J  ')).toBe('Jason J');
    expect(cleanName('x'.repeat(40)).length).toBe(20);
  });
});


it('normalizes Unicode names before client storage and submission', () => {
  expect(cleanName(' \u200bCafe\u0301\u00a0\u2009Liong\u2060 ')).toBe('Caf\u00e9 Liong');
  expect(cleanName('\u200b\u00a0')).toBe('');
});


it('stores canonical names even when storage helpers receive raw input', () => {
  const storage = new MemoryStorage();
  const name = ' \u200bCafe\u0301\u00a0\u2009Liong\u2060 ';
  savePlayerName(name, storage);
  expect(loadPlayerName(storage)).toBe('Caf\u00e9 Liong');
  saveRoom({ code: 'ABC234', token: 'token', name }, storage);
  expect(loadRoom('ABC234', storage)?.name).toBe('Caf\u00e9 Liong');
});
