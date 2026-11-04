import { describe, expect, it } from 'vitest';
import {
  cloneState,
  depthsMapOf,
  FEAT_KEYS,
  featPoints,
  featsOf,
  isFeatKey,
  isLocule,
  LEAGUE,
  newFeats,
  nextTiers,
  parseFeatKey,
  podiumOf,
  rankSeason,
  seasonsToOpen,
  type ClassId,
} from '../src';
import { kiwi, setup, T0 } from './helpers';

describe('feats (chantier 56)', () => {
  it('keys parse back and points follow rarity', () => {
    for (const key of FEAT_KEYS) expect(isFeatKey(key)).toBe(true);
    expect(isFeatKey('wavesHeld:7')).toBe(false);
    expect(isFeatKey('stoneAge:1')).toBe(false);
    expect(isFeatKey('nope')).toBe(false);
    expect(parseFeatKey('wavesHeld:40')).toEqual({ id: 'wavesHeld', tier: 40 });
    expect(featPoints('stoneAge')).toBeLessThan(featPoints('starsAge'));
    expect(featPoints('wavesHeld:5')).toBeLessThan(featPoints('wavesHeld:200'));
  });

  it('a new colony has passed nothing', () => {
    const { state } = setup();
    expect(featsOf(state)).toEqual([]);
  });

  it('reads ages, beacons, the conquest, the depths, kiwis and gear from the state', () => {
    const { state } = setup();
    const s = cloneState(state);
    s.buildings.push({ ...s.buildings[0]!, id: 'm' as never, type: 'monument', level: 2 });
    s.faceViews['aliens:0:kiwino'] = { beacons: [{ sector: 1, since: T0 }], parcels: {} };
    s.siege.conqueredAt = T0;
    s.buildings.push({ ...s.buildings[0]!, id: 't' as never, type: 'tunnel', level: 1 });
    const locule = depthsMapOf(s).rooms.find(isLocule)!;
    s.depths.galleries[locule.id] = { kind: 'forest', since: T0 };
    const k = { ...kiwi('a'), level: 20, shiny: 'star' as const, kikiwiwi: { since: T0 } };
    s.villagers.push({ ...k, gear: { weapon: 'blade-crystal' as never } });
    s.stats.wavesHeld = 16;
    const feats = featsOf(s);
    for (const key of ['stoneAge', 'ironAge', 'firstBeacon', 'centreBeacon', 'conquest']) {
      expect(feats).toContain(key);
    }
    for (const key of ['tunnel', 'firstGallery', 'locules', 'kikiwiwi', 'starEgg']) {
      expect(feats).toContain(key);
    }
    expect(feats).toContain('steelGear');
    expect(feats).toContain('crystalGear');
    expect(feats).toContain('wavesHeld:5');
    expect(feats).toContain('wavesHeld:15');
    expect(feats).not.toContain('wavesHeld:40');
    expect(feats).toContain('kiwiLevel:20');
    expect(feats).not.toContain('industryAge');
    expect(feats).not.toContain('sisterColony');
    expect(nextTiers(s).find((t) => t.key.startsWith('wavesHeld'))).toEqual({
      key: 'wavesHeld:40',
      value: 16,
      target: 40,
    });
  });

  it('a master class counts, a first-tier class does not', () => {
    const { state } = setup();
    const s = cloneState(state);
    s.villagers.push({ ...kiwi('b'), classId: 'scout' as ClassId });
    expect(featsOf(s)).not.toContain('masterClass');
    s.villagers.push({ ...kiwi('c'), classId: 'paladin' as ClassId });
    expect(featsOf(s)).toContain('masterClass');
  });

  it('new feats are the difference, in table order', () => {
    expect(newFeats(['stoneAge'], ['stoneAge', 'ironAge', 'wavesHeld:5'])).toEqual([
      'ironAge',
      'wavesHeld:5',
    ]);
    expect(newFeats(['a'], ['a'])).toEqual([]);
  });
});

describe('seasons (chantier 56)', () => {
  it('opens the first season at once, then follows on without a gap', () => {
    const [first] = seasonsToOpen(null, T0);
    expect(first).toEqual({ n: 1, startsAt: T0, endsAt: T0 + LEAGUE.seasonMs, closedAt: null });
    expect(seasonsToOpen(first!, T0 + 1000)).toEqual([]);
    const later = seasonsToOpen(first!, T0 + 2.5 * LEAGUE.seasonMs);
    expect(later.map((s) => s.n)).toEqual([2, 3]);
    expect(later[0]!.startsAt).toBe(first!.endsAt);
    expect(later[1]!.endsAt).toBe(T0 + 3 * LEAGUE.seasonMs);
  });

  it('ranks by points, the first to reach a total wins a tie', () => {
    const ranking = rankSeason([
      { userId: 'a', points: 25, at: 30 },
      { userId: 'b', points: 10, at: 5 },
      { userId: 'b', points: 15, at: 10 },
      { userId: 'c', points: 50, at: 99 },
      { userId: 'd', points: 0, at: 1 },
      { userId: 'e', points: 10, at: 1 },
    ]);
    expect(ranking.map((r) => r.userId)).toEqual(['c', 'b', 'a', 'e']);
    expect(podiumOf(ranking).map((r) => r.userId)).toEqual(['c', 'b', 'a']);
  });
});
