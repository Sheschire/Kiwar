import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildLock,
  cloneState,
  GIANT_SEEDS,
  giantSeedCap,
  HOUR_MS,
  STAT_IDS,
  treeSeedCost,
  type BuildingId,
  type GameState,
} from '../src';
import { delveColony, findTile, run, T0 } from './helpers';

/** An Industry colony (Nest 10) with giant seeds in store. */
function seedColony(seeds = 3) {
  const { map, s } = delveColony('giant');
  s.buildings.find((b) => b.type === 'monument')!.level = 3;
  s.buildings[0]!.level = 10;
  s.giantSeeds = seeds;
  s.egg = null;
  return { map, s };
}

/** A locule tree standing since `at`. */
function withTree(s: GameState, map: ReturnType<typeof seedColony>['map'], at = s.now) {
  const t = findTile(map, 'flesh', 4);
  s.buildings.push({
    id: 'btree' as BuildingId,
    type: 'loculeTree',
    q: t.q,
    r: t.r,
    level: 1,
    richness: 1,
    builtAt: at,
    seedAt: at + GIANT_SEEDS.tree.growMs,
  });
  return s.buildings.at(-1)!;
}

describe('giant seeds: locule eggs and locule trees (chantier 50)', () => {
  it('hatches a gifted kiwi from a locule egg', () => {
    const { map, s } = seedColony(1);
    const plain = run(s, { type: 'hatchEgg' }, s.now, map);
    const gifted = run(s, { type: 'hatchEgg', locule: true }, s.now, map);
    expect(gifted.giantSeeds).toBe(0);
    expect(gifted.egg?.locule).toBe(true);
    const a = advance(plain, plain.egg!.readyAt + 1).state.villagers.at(-1)!;
    const b = advance(gifted, gifted.egg!.readyAt + 1).state.villagers.at(-1)!;
    for (const k of STAT_IDS) expect(b.stats[k]).toBe(a.stats[k] + GIANT_SEEDS.egg.stat);
    const none = cloneState(s);
    none.giantSeeds = 0;
    const r = applyCommand(none, { type: 'hatchEgg', locule: true }, { now: s.now, map });
    expect(r.ok ? null : r.error).toBe('notEnoughGiantSeeds');
  });

  it('plants locule trees for 1, 2, 3… giant seeds, refunded on a cancel', () => {
    const { map, s } = seedColony(3);
    expect(treeSeedCost(s, 'loculeTree')).toBe(1);
    expect(buildLock(s, 'loculeTree')).toBeNull();
    const t = findTile(map, 'flesh', 4);
    const one = run(s, { type: 'build', buildingType: 'loculeTree', q: t.q, r: t.r }, s.now, map);
    expect(one.giantSeeds).toBe(2);
    expect(treeSeedCost(one, 'loculeTree')).toBe(2);
    const item = one.queue.find((i) => i.buildingType === 'loculeTree')!;
    const back = run(one, { type: 'cancel', queueItemId: item.id }, one.now, map);
    expect(back.giantSeeds).toBe(3);
    const poor = cloneState(one);
    poor.giantSeeds = 1;
    expect(buildLock(poor, 'loculeTree')).toBe('notEnoughGiantSeeds');
    const early = cloneState(s);
    early.buildings.find((b) => b.type === 'monument')!.level = 2;
    expect(buildLock(early, 'loculeTree')).toBe('ageTooLow');
    // At most `maxTrees` by age (the last one's price stays within the cap).
    const many = cloneState(s);
    many.giantSeeds = giantSeedCap(many);
    for (let i = 0; i < GIANT_SEEDS.maxTrees[3]!; i++)
      many.buildings.push({ ...withTree(cloneState(s), map), id: `bt${i}` as BuildingId });
    expect(buildLock(many, 'loculeTree')).toBe('treeLimit');
    expect(GIANT_SEEDS.maxTrees[3]!).toBeLessThanOrEqual(giantSeedCap(many));
    // Built: it grows before its first seed.
    const done = advance(one, one.now + HOUR_MS).state;
    const tree = done.buildings.find((b) => b.type === 'loculeTree')!;
    expect(tree.seedAt).toBe(tree.builtAt + GIANT_SEEDS.tree.growMs);
  });

  it('gives a seed every few days; a ripe one waits for room', () => {
    const { map, s } = seedColony(0);
    withTree(s, map);
    const grown = advance(s, s.now + GIANT_SEEDS.tree.growMs + 1).state;
    expect(grown.giantSeeds).toBe(1);
    const next = advance(grown, s.now + GIANT_SEEDS.tree.growMs + GIANT_SEEDS.tree.everyMs + 1);
    expect(next.state.giantSeeds).toBe(2);
    expect(next.events.some((e) => e.type === 'treeSeed')).toBe(true);
    // A full stock: the ripe seed waits, then falls as soon as a seed is spent.
    const full = cloneState(s);
    full.giantSeeds = giantSeedCap(full);
    const later = advance(full, s.now + GIANT_SEEDS.tree.growMs + 10 * HOUR_MS).state;
    expect(later.giantSeeds).toBe(giantSeedCap(full));
    const spent = run(later, { type: 'hatchEgg', locule: true }, later.now, map);
    const after = advance(spent, spent.now + 1).state;
    expect(after.giantSeeds).toBe(giantSeedCap(full));
    expect(after.buildings.find((b) => b.type === 'loculeTree')!.seedAt).toBe(
      spent.now + GIANT_SEEDS.tree.everyMs,
    );
  });

  it('gives the same seeds in one big step or many small ones', () => {
    const { map, s } = seedColony(0);
    withTree(s, map, T0);
    const end = s.now + 12 * 24 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now + 5 * HOUR_MS + 17; t < end; t += 5 * HOUR_MS + 17)
      small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.giantSeeds).toBe(big.giantSeeds);
    expect(small.buildings.find((b) => b.type === 'loculeTree')!.seedAt).toBe(
      big.buildings.find((b) => b.type === 'loculeTree')!.seedAt,
    );
  });
});
