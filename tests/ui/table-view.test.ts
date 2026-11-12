import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryStorage, getPreset } from '@/storage';
import { SettingsModal } from '@/ui/components/SettingsModal';
import { DEFAULT_TABLE_VIEW, TABLE_VIEW_KEY, loadTableView, saveTableView } from '@/ui/table-view';

describe('table view preference', () => {
  it('defaults to flat, keeps an explicit stored choice under its own key, and ignores junk', () => {
    const store = new MemoryStorage();
    expect(DEFAULT_TABLE_VIEW).toBe('flat');
    expect(loadTableView(store)).toBe('flat');
    saveTableView('3d', store);
    expect(store.getItem(TABLE_VIEW_KEY)).toBe('3d');
    expect(loadTableView(store)).toBe('3d');
    saveTableView('flat', store);
    expect(loadTableView(store)).toBe('flat');
    store.setItem(TABLE_VIEW_KEY, 'warped');
    expect(loadTableView(store)).toBe('flat');
  });

  it('settings offer both table views with the current one pressed', () => {
    const html = renderToString(createElement(SettingsModal, { settings: { ...getPreset('tournament'), soundEnabled: false }, onSave: () => undefined, onClose: () => undefined, tableView: 'flat' }));
    expect(html).toContain('Tampilan meja');
    expect(html).toContain('3D (miring)');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Datar/);
  });
});
