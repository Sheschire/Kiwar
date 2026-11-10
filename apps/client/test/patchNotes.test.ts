import { describe, expect, it } from 'vitest';
import { LANGS } from '../src/i18n/i18n';
import { PATCH_NOTES } from '../src/i18n/patchNotes';
import { unseenNotes } from '../src/ui/patchNotes';

describe('patch notes', () => {
  it('has unique ids, newest first, with a date in the id', () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(0);
    const ids = new Set(PATCH_NOTES.map((n) => n.id));
    expect(ids.size).toBe(PATCH_NOTES.length);
    for (const note of PATCH_NOTES) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.id.startsWith(note.date)).toBe(true);
    }
    const dates = PATCH_NOTES.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('is written in every language, line for line', () => {
    for (const note of PATCH_NOTES) {
      const count = note.items.en.length;
      expect(count).toBeGreaterThan(0);
      for (const lang of LANGS) {
        expect(note.title[lang].trim()).not.toBe('');
        expect(note.items[lang]).toHaveLength(count);
        for (const line of note.items[lang]) expect(line.trim()).not.toBe('');
      }
    }
  });

  it('lists only the notes newer than the last one seen', () => {
    expect(unseenNotes(null)).toEqual(PATCH_NOTES);
    expect(unseenNotes('unknown-id')).toEqual(PATCH_NOTES);
    expect(unseenNotes(PATCH_NOTES[0]!.id)).toEqual([]);
    if (PATCH_NOTES.length > 1) expect(unseenNotes(PATCH_NOTES[1]!.id)).toEqual([PATCH_NOTES[0]]);
  });
});
