import { expect, it } from 'vitest';
import { validUsername, usernameKey } from '../../src/net/protocol';

it.each(['Tomok', ' A Liong ', 'Éka', '王小明', 'Budi_2', 'A-B', 'A.B', '123', 'ABCDEFGHIJKL'])('accepts %s', value => {
  expect(validUsername(value)).toBe(true);
});
it.each(['ab', 'abcdefghijklm', 'a  b', '.Budi', 'Budi_', 'a..b', 'a_-b', 'a\tb', 'a\nb', 'ab😀', 'ab\u200d', 'bot', 'ADMIN', 'host', 'pemain', 'maciokyu', 'penonton', 'moderator', 'Bot 2'])('rejects %s', value => {
  expect(validUsername(value)).toBe(false);
});
it('normalizes case, repeated spaces, and Unicode composition consistently', () => {
  expect(usernameKey('  TOMOK  ')).toBe(usernameKey('tomok'));
  expect(usernameKey('A  Liong')).toBe(usernameKey('a liong'));
  expect(usernameKey('E\u0301ka')).toBe(usernameKey('Éka'));
});
