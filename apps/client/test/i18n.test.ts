import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { formatDuration, translate } from '../src/i18n/i18n';

function leaves(obj: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  const enLeaves = leaves(en);
  const frLeaves = leaves(fr);

  it('has the same keys in French and English', () => {
    expect([...frLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('has no empty strings and the same placeholders in both languages', () => {
    for (const [key, value] of enLeaves) {
      const other = frLeaves.get(key)!;
      expect(value.trim(), key).not.toBe('');
      expect(other.trim(), key).not.toBe('');
      expect(placeholders(other), key).toEqual(placeholders(value));
    }
  });

  it('interpolates parameters, including nested keys', () => {
    expect(translate('fr', 'events.built', { name: '@buildings.hut.name' })).toBe(
      'Construction terminée : Hutte !',
    );
    expect(translate('en', 'common.levelShort', { level: 2 })).toBe('Lv 2');
  });

  it('formats durations', () => {
    expect(formatDuration('en', 45_000)).toBe('45 s');
    expect(formatDuration('fr', 3 * 60_000 + 20_000)).toBe('3 min 20 s');
    expect(formatDuration('en', 2 * 3_600_000 + 5 * 60_000)).toBe('2 h 05');
  });
});
