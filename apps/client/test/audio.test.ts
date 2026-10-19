import { describe, expect, it } from 'vitest';
import { bindingSchema, DEFAULT_CONTEXT, makeBinding, resolvePlay } from '../src/audio/binding';
import { defaultBindings, SOUND_EVENT_IDS, SOUND_EVENTS } from '../src/audio/catalog';
import { DEFAULT_SETTINGS, parseSettings } from '../src/audio/settings';
import { renderPreset, SYNTH_PRESET_IDS, SYNTH_PRESETS } from '../src/audio/synth';
import { kiwiVoicePitch } from '../src/audio/sounds';
import { assetUrls, EMPTY_MANIFEST, parseManifest } from '../src/audio/manifest';

const fixed = (v: number) => () => v;

describe('resolvePlay', () => {
  const b = makeBinding({ sources: ['synth:click', 'synth:tick'], cooldownMs: 100 });

  it('plays a source with the binding gain', () => {
    const d = resolvePlay(b, DEFAULT_CONTEXT, 0, { activeVoices: 0 }, fixed(0));
    expect(d).toEqual({ source: 'synth:click', rate: 1, gain: 1 });
  });

  it('respects the cooldown and the voice limit', () => {
    expect(resolvePlay(b, DEFAULT_CONTEXT, 50, { lastPlayed: 0, activeVoices: 0 }, fixed(0))).toBe(
      null,
    );
    expect(
      resolvePlay(b, DEFAULT_CONTEXT, 150, { lastPlayed: 0, activeVoices: 0 }, fixed(0)),
    ).not.toBe(null);
    expect(resolvePlay(b, DEFAULT_CONTEXT, 150, { activeVoices: 4 }, fixed(0))).toBe(null);
  });

  it('applies probability, pitch and conditions', () => {
    const p = makeBinding({ sources: ['synth:click'], probability: 0.5, pitch: 12 });
    expect(resolvePlay(p, DEFAULT_CONTEXT, 0, { activeVoices: 0 }, fixed(0.7))).toBe(null);
    expect(resolvePlay(p, DEFAULT_CONTEXT, 0, { activeVoices: 0 }, fixed(0.2))?.rate).toBeCloseTo(
      2,
    );
    const close = makeBinding({ sources: ['synth:chirp'], conditions: { zoomMax: 0.4 } });
    expect(
      resolvePlay(close, { ...DEFAULT_CONTEXT, zoom: 0.9 }, 0, { activeVoices: 0 }, fixed(0)),
    ).toBe(null);
    const off = makeBinding({ sources: ['synth:click'], enabled: false });
    expect(resolvePlay(off, DEFAULT_CONTEXT, 0, { activeVoices: 0 }, fixed(0))).toBe(null);
  });

  it('rejects invalid bindings', () => {
    expect(bindingSchema.safeParse({ sources: ['http://evil'] }).success).toBe(false);
    expect(bindingSchema.safeParse({ volume: 5 }).success).toBe(false);
  });
});

describe('catalogue', () => {
  it('every active event has a working default sound', () => {
    const bindings = defaultBindings();
    for (const id of SOUND_EVENT_IDS) {
      const meta = SOUND_EVENTS[id] as { reserved?: boolean; bus: string };
      if (meta.reserved || meta.bus === 'music') continue;
      expect(bindings[id].sources.length, id).toBeGreaterThan(0);
      for (const src of bindings[id].sources) {
        expect(src.startsWith('synth:') || src.startsWith('builtin:'), src).toBe(true);
        if (src.startsWith('synth:'))
          expect(SYNTH_PRESET_IDS, src).toContain(
            src.slice(6) as (typeof SYNTH_PRESET_IDS)[number],
          );
      }
    }
  });
});

describe('synth', () => {
  it('renders every preset to clean, normalised samples', () => {
    for (const id of SYNTH_PRESET_IDS) {
      const preset = SYNTH_PRESETS[id];
      const out = renderPreset(preset, 8000);
      expect(out.length, id).toBeGreaterThan(0);
      let max = 0;
      for (const v of out) {
        expect(Number.isFinite(v), id).toBe(true);
        max = Math.max(max, Math.abs(v));
      }
      expect(max, id).toBeCloseTo(preset.peak ?? 0.5, 5);
    }
  });

  it('is deterministic', () => {
    expect(renderPreset(SYNTH_PRESETS.hatch, 8000)).toEqual(
      renderPreset(SYNTH_PRESETS.hatch, 8000),
    );
  });
});

describe('settings', () => {
  it('parses stored settings and clamps them', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"master":3,"music":0.2,"muted":true}')).toEqual({
      ...DEFAULT_SETTINGS,
      master: 1,
      music: 0.2,
      muted: true,
    });
  });
});

describe('kiwi voices', () => {
  it('gives each kiwi a stable pitch within ±4 semitones', () => {
    expect(kiwiVoicePitch('v1')).toBe(kiwiVoicePitch('v1'));
    expect(kiwiVoicePitch('v1')).not.toBe(kiwiVoicePitch('v2'));
    for (const id of ['a', 'b', 'v12', 'villager-99'])
      expect(Math.abs(kiwiVoicePitch(id))).toBeLessThanOrEqual(4);
  });
});

describe('manifest', () => {
  it('keeps valid bindings and assets, drops the rest', () => {
    const m = parseManifest({
      bindings: {
        'ui.click': { sources: ['asset:abc'], volume: 0.5 },
        'ui.open': { volume: 99 },
        'not.an.event': { sources: [] },
      },
      assets: [
        { id: 'abc', name: 'Click', path: 'ui/click.ogg', mime: 'audio/ogg', durationMs: 120 },
        { id: '../bad', name: 'x', path: 'x', mime: 'audio/ogg' },
      ],
    });
    expect(Object.keys(m.bindings)).toEqual(['ui.click']);
    expect(m.bindings['ui.click']?.volume).toBe(0.5);
    expect(m.assets.map((a) => a.id)).toEqual(['abc']);
    const urls = assetUrls(m, (a) => `https://x/${a.path}`);
    expect(urls.get('asset:abc')).toBe('https://x/ui/click.ogg');
    expect(parseManifest('garbage')).toEqual(EMPTY_MANIFEST);
  });
});
