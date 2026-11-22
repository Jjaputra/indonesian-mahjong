import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MainMenu, MenuFront } from '@/ui/components/MainMenu';
import { PremiumModal } from '@/ui/components/PremiumModal';
import { SettingsModal } from '@/ui/components/SettingsModal';
import { DEFAULT_SETTINGS } from '@/storage';
import { OnlineMenu } from '@/ui/components/OnlineMenu';

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
}));

const noop = () => {};
function buttons(node: any): ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)];
}
describe('room menu', () => {
  it('offers create and join directly, with no solo or developer entry', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { onOnline: noop }));
    for (const text of ['Buat room', 'Gabung room', 'Atur aturan, undang lewat link', 'Isi kode dari teman', 'Premium']) expect(html).toContain(text);
    expect(html).not.toMatch(/Main sendiri|Main bareng|Terakhir:|Developer|Uji Tangan|Level bot/);
    const open = vi.fn();
    const tree = MenuFront({ onOnline: open, onPremium: noop });
    const choices = buttons(tree);
    choices[0]!.props.onClick();
    choices[1]!.props.onClick();
    expect(open.mock.calls).toEqual([['create'], ['join']]);
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
