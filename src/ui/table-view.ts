import { getStorage, type StorageLike } from '../storage';

/**
 * Table presentation: `3d` tilts the felt away from the player; `flat` is a top-down table for
 * players who find the perspective warped. A per-device preference, kept outside GameSettings.
 */
export type TableView = '3d' | 'flat';
export const TABLE_VIEW_KEY = 'itm.table-view.v1';
export const DEFAULT_TABLE_VIEW: TableView = '3d';

export function loadTableView(storage?: StorageLike): TableView {
  try { return (storage ?? getStorage()).getItem(TABLE_VIEW_KEY) === 'flat' ? 'flat' : '3d'; }
  catch { return DEFAULT_TABLE_VIEW; }
}

export function saveTableView(view: TableView, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(TABLE_VIEW_KEY, view); } catch { /* Keep the live choice. */ }
}

export const TABLE_VIEW_LABEL: Record<TableView, string> = { '3d': '3D (miring)', flat: 'Datar' };
