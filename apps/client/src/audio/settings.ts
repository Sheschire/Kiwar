import { BUSES, type Bus } from './catalog';

/** Player volume settings (0..1 per bus), kept in this browser. */
export type AudioSettings = Record<'master' | Bus, number> & { muted: boolean };

export const SETTINGS_KEY = 'kiwar.audio.settings';

export const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.5,
  ambience: 0.6,
  sfx: 0.8,
  ui: 0.6,
  muted: false,
};

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function parseSettings(raw: string | null): AudioSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ['master', ...BUSES] as const) out[key] = clamp01(data[key], out[key]);
    out.muted = data.muted === true;
  } catch {
    // keep defaults
  }
  return out;
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()) {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: AudioSettings,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private mode / quota: settings just won't persist
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Perceptual volume curve: slider position → gain. */
export const sliderGain = (v: number) => v * v;
