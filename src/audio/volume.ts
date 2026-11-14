export const DEFAULT_MASTER_VOLUME = 1;
export const DEFAULT_MUSIC_VOLUME = 0.5;
export const DEFAULT_EFFECTS_VOLUME = 0.4;

export function clampVolume(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/** Both 0..1 sliders use v²: effective gain = master² × channel² × mix trim. */
export function effectiveGain(master: number, channel: number, trim = 1): number {
  return clampVolume(master) ** 2 * clampVolume(channel) ** 2 * trim;
}
