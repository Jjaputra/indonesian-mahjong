import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MainMenu, MenuFront } from '@/ui/components/MainMenu';
import { PremiumModal } from '@/ui/components/PremiumModal';
import { SettingsModal } from '@/ui/components/SettingsModal';
import { DEFAULT_SETTINGS } from '@/storage';
import { OnlineMenu } from '@/ui/components/OnlineMenu';
import { PublicTables } from '@/ui/components/PublicTables';
import { DEFAULT_ROOM_CONFIG } from '@/net/protocol';

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
}));

const noop = () => {};
function buttons(node: any): ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)];
}
describe('room menu', () => {
  it('renders public list rows, joins the selected room, and offers public creation when empty', () => {
    const onJoin = vi.fn(), onCreate = vi.fn();
    const props = { server: 'https://example.com', onJoin, onCreate, onBack: noop,
      initialRooms: [{ code: 'ABC234', hostName: 'Jason', humans: 2, config: { ...DEFAULT_ROOM_CONFIG, public: true }, updatedAt: 1 }] };
    const html = renderToStaticMarkup(createElement(PublicTables, props));
    for (const text of ['Jason', '2/4', 'Kim dari tile', 'Min Tay 5', '15 dtk', 'Bot aktif', 'Gabung', 'Muat ulang']) expect(html).toContain(text);
    buttons(PublicTables(props)).find(b => b.props.children === 'Gabung')!.props.onClick();
    expect(onJoin).toHaveBeenCalledWith('ABC234');
    const emptyProps = { ...props, initialRooms: [] };
    expect(renderToStaticMarkup(createElement(PublicTables, emptyProps))).toContain('Belum ada meja publik.');
    buttons(PublicTables(emptyProps)).find(b => b.props.children === 'Buat meja publik')!.props.onClick();
    expect(onCreate).toHaveBeenCalledOnce();
  });
  it('defaults the visibility radio to private and can preselect public creation', () => {
    const props = { inviteCode: null, busy: false, error: null, onCreate: noop, onJoin: noop, onBack: noop };
    const html = renderToStaticMarkup(createElement(OnlineMenu, props));
    expect(html).toContain('SIAPA YANG BISA GABUNG');
    expect(html).toMatch(/aria-checked="true"[^>]*>Lewat kode\/link/);
    const publicHtml = renderToStaticMarkup(createElement(OnlineMenu, { ...props, initialPublic: true }));
    expect(publicHtml).toMatch(/aria-checked="true"[^>]*>Meja publik/);
    expect(publicHtml).toContain('Meja publik muncul di daftar, siapa aja yang login bisa duduk.');
  });
  it('offers create and join directly, with no solo or developer entry', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { onOnline: noop }));
    for (const text of ['Buat room', 'Gabung room', 'Atur aturan, undang lewat link', 'Isi kode dari teman', 'Premium']) expect(html).toContain(text);
    expect(html).not.toMatch(/Main sendiri|Main bareng|Terakhir:|Developer|Uji Tangan|Level bot/);
    const open = vi.fn();
    const tree = MenuFront({ onOnline: open, onPremium: noop });
    const choices = buttons(tree);
    choices[0]!.props.onClick();
    choices[1]!.props.onClick();
    choices[2]!.props.onClick();
    expect(open.mock.calls).toEqual([['public'], ['create'], ['join']]);
  });
  it('keeps room resume and Premium, and explains an unavailable server', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { resumeRoomCode: 'ABC234', onResumeRoom: noop }));
    expect(html).toContain('Lanjut room ABC234');
    expect(html).toContain('Room belum tersedia. Coba lagi nanti.');
    expect(html).not.toContain('Gabung room');
    expect(renderToStaticMarkup(createElement(MainMenu, { initialPremiumOpen: true }))).toContain('maciokYU! Premium');
  });
  it.each(['create', 'join'] as const)('opens %s immediately and returns to the front menu', initialStep => {
    const props = { initialStep, inviteCode: null, busy: false, error: null, onCreate: noop, onJoin: noop, onBack: vi.fn() };
    const html = renderToStaticMarkup(createElement(OnlineMenu, props));
    expect(html).toContain(initialStep === 'create' ? '<h2>Buat room</h2>' : '<h2>Gabung room</h2>');
    expect(html).not.toContain('Main bareng');
    const back = buttons(OnlineMenu(props)).find(button => button.props.onClick === props.onBack)!;
    back.props.onClick();
    expect(props.onBack).toHaveBeenCalledOnce();
  });
  it('invite links still open join with the room code', () => {
    const html = renderToStaticMarkup(createElement(OnlineMenu, { initialStep: 'create', inviteCode: 'ABC234', busy: false, error: null, onCreate: noop, onJoin: noop, onBack: noop }));
    expect(html).toContain('<h2>Gabung room</h2>');
    expect(html).toContain('value="ABC234"');
  });
  it('the room code field is clamped to its card so the join form cannot scroll sideways', () => {
    const css = readFileSync('src/ui/online.css', 'utf8');
    expect(css).toMatch(/\.mp-field input \{[^}]*box-sizing: border-box; width: 100%; max-width: 100%;/);
    expect(css).toMatch(/\.mp-field > \* \{ min-width: 0; max-width: 100%; \}/);
  });
});


describe('Premium announcement', () => {
  it('has no payment, price, form or email fields', () => {
    const html = renderToStaticMarkup(createElement(PremiumModal, { onClose: noop }));
    expect(html).toContain('Segera hadir');
    expect(html).not.toMatch(/<form|<input|<select|<textarea|type="email"|Rp|IDR|\$|bayar|pembayaran/i);
  });
  it('Oke closes the announcement', () => {
    const onClose = vi.fn();
    const modal = PremiumModal({ onClose });
    buttons(modal.props.footer).find(button => button.props.children === 'Oke')!.props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

it('settings keep screen wake lock without the inactive animation toggle', () => {
  const html = renderToStaticMarkup(createElement(SettingsModal, { settings: DEFAULT_SETTINGS, onSave: noop, onClose: noop }));
  expect(html).toContain('Layar tetap nyala saat main');
  expect(html).not.toContain('Animasi tile');
});

it.each(['create', 'join'] as const)('shows a read-only account name in %s while anonymous names remain editable', initialStep => {
  const props = { initialStep, inviteCode: null, busy: false, error: null, onCreate: noop, onJoin: noop, onBack: noop };
  const html = renderToStaticMarkup(createElement(OnlineMenu, { ...props, username: 'Tomok' }));
  expect(html).toContain('Main sebagai <strong>Tomok</strong>');
  expect(html).not.toContain('autoComplete="nickname"');
  expect(renderToStaticMarkup(createElement(OnlineMenu, props))).toContain('autoComplete="nickname"');
});
