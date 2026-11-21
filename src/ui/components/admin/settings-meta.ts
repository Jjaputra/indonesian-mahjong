import type { AdminSettings } from '../../../net/admin-api';

export type SettingKey = keyof AdminSettings;
export const SETTING_LABELS: Record<SettingKey, string> = {
  dailyMatchLimit: 'Jatah host sehari', discardRevealMs: 'Jeda tampil buangan', loginRequired: 'Wajib masuk', facebookEnabled: 'Masuk pakai Facebook', announcement: 'Pengumuman',
};
export const settingLabel = (key: string) => SETTING_LABELS[key as SettingKey] ?? key;

export function settingValueText(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'aktif' : 'nonaktif';
  if (key === 'discardRevealMs') return `${String(value)} ms`;
  if (key === 'announcement') return value === '' ? '(kosong)' : `“${String(value)}”`;
  return String(value);
}
