import { en } from './en';
import { fr } from './fr';

export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Same shape as the English dictionary, but every leaf is just a string. */
export type DictShape<T> = { readonly [K in keyof T]: T[K] extends string ? string : DictShape<T[K]> };
export type Dict = DictShape<typeof en>;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every valid translation key, e.g. `"hud.population"`. Checked at compile time. */
export type TKey = Leaves<typeof en>;
export type TParams = Record<string, string | number>;

const DICTS: Record<Lang, Dict> = { en, fr };
const STORAGE_KEY = 'kiwar.lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // storage unavailable (private mode…): fall through to the browser language
  }
  const candidates = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const c of candidates) {
    const base = c.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  document.documentElement.lang = lang;
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const raw = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return typeof v === 'number' ? formatNumber(lang, v) : v;
  });
}

export function formatNumber(lang: Lang, value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 || Number.isInteger(value) ? 0 : 1;
  return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
}

/** Compact duration such as "45 s", "3 min 20 s", "2 h 05". */
export function formatDuration(lang: Lang, ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const u = DICTS[lang].units;
  if (d > 0) return `${d} ${u.day} ${h} ${u.hour}`;
  if (h > 0) return `${h} ${u.hour} ${String(m).padStart(2, '0')}`;
  if (m > 0) return s > 0 && m < 10 ? `${m} ${u.minute} ${s} ${u.second}` : `${m} ${u.minute}`;
  return `${s} ${u.second}`;
}
