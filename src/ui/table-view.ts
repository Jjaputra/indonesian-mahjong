import { getStorage, type StorageLike } from '../storage';

/**
 * Table presentation: `flat` is a top-down table (the default players preferred); `3d` tilts the
 * felt away from the player. A per-device preference, kept outside GameSettings: an explicitly
 * stored choice always wins over the default.
 */
export type TableView = '3d' | 'flat';
export const TABLE_VIEW_KEY = 'itm.table-view.v1';
export const DEFAULT_TABLE_VIEW: TableView = 'flat';

export function loadTableView(storage?: StorageLike): TableView {
  try {
    const stored = (storage ?? getStorage()).getItem(TABLE_VIEW_KEY);
    return stored === 'flat' || stored === '3d' ? stored : DEFAULT_TABLE_VIEW;
  }
  catch { return DEFAULT_TABLE_VIEW; }
}

export function saveTableView(view: TableView, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(TABLE_VIEW_KEY, view); } catch { /* Keep the live choice. */ }
}

export const TABLE_VIEW_LABEL: Record<TableView, string> = { '3d': '3D (miring)', flat: 'Datar' };
