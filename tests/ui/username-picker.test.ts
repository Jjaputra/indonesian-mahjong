import { expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsernamePicker } from '../../src/ui/components/UsernamePicker';
import { setUsername } from '../../src/net/auth';
const h = vi.hoisted(() => ({ name: '  ABCDEFGHIJKLMNO  ' }));
vi.mock('../../src/net/room-store', () => ({ loadPlayerName: () => h.name }));
vi.mock('../../src/net/auth', () => ({ setUsername: vi.fn(async () => {}) }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
}));
it('prefills the last device name at 12 characters and warns that it is permanent', async () => {
  const html = renderToStaticMarkup(createElement(UsernamePicker));
  expect(html).toContain('value="ABCDEFGHIJKL"');
  expect(html).toContain('Nama ini permanen dan nggak bisa diganti sendiri.');
  expect(html).toContain('Simpan nama');
  const tree = UsernamePicker();
  const section = tree.props.children;
  const form = section.props.children.find((e: ReactElement | null) => e?.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });
  expect(setUsername).toHaveBeenCalledWith('ABCDEFGHIJKL');
});
it('disables saving an invalid prefill', () => {
  h.name = 'Bot 2';
  expect(renderToStaticMarkup(createElement(UsernamePicker))).toContain('disabled=""');
});
it('explains why a reserved name is refused', () => {
  h.name = 'admin';
  const html = renderToStaticMarkup(createElement(UsernamePicker));
  expect(html).toContain('Nama itu nggak boleh dipakai, coba yang lain.');
  expect(html).toContain('disabled=""');
  h.name = 'Tomok';
  expect(renderToStaticMarkup(createElement(UsernamePicker))).not.toContain('nggak boleh dipakai');
});
