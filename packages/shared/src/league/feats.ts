import { crownOf, pineappleOf } from '../sim/pineapple';
/**
 * Chantier 56: which feats a colony has passed, read from its state. Only public facts are
 * read (never `aliens` nor what `depthSeed` hides), so the client can show the same list in
 * solo and the server can write it for the leagues from the state it holds.
 */
import { AGE_FEATS, FEATS, FEAT_KEYS, type FeatId, type FeatKey } from '../data/feats';
import { CLASSES } from '../data/classes';
import { ITEMS, type ItemId } from '../data/gear';
import { isInner } from '../sim/civ';
import { CORE_DEPTH, LOCULE_DEPTH, depthsMapOf } from '../sim/depths';
import { ageOf } from '../sim/research';
import type { GameState } from '../sim/state';

/** The numbers the tiered families are measured on. */
export function featMeasures(state: GameState): Partial<Record<FeatId, number>> {
  const out: Partial<Record<FeatId, number>> = {};
  out.wavesHeld = state.stats.wavesHeld;
  out.landingsWon = Object.values(state.victories).reduce((sum, n) => sum + n, 0);
  out.kiwiLevel = state.villagers.reduce((best, v) => Math.max(best, v.level), 0);
  out.population = state.villagers.length;
  out.constructions = state.stats.constructionsCompleted;
  return out;
}

function ownedItems(state: GameState): ItemId[] {
  const items = Object.entries(state.forge.armory)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([id]) => id as ItemId);
  for (const v of state.villagers) {
    if (v.gear?.weapon) items.push(v.gear.weapon);
    if (v.gear?.armor) items.push(v.gear.armor);
  }
  return items;
}

function singleFeats(state: GameState): Set<FeatId> {
  const out = new Set<FeatId>();
  const age = ageOf(state);
  for (const [id, a] of AGE_FEATS) if (age >= a) out.add(id);
  const beacons = Object.values(state.faceViews).flatMap((v) => v.beacons);
  if (beacons.length > 0) out.add('firstBeacon');
  if (beacons.some((b) => isInner(b.sector))) out.add('centreBeacon');
  if (state.siege.conqueredAt > 0) out.add('conquest');
  if (state.colony.index === 1 || state.colony.foundedAt > 0) out.add('sisterColony');
  if (state.buildings.some((b) => b.type === 'tunnel')) out.add('tunnel');
  const galleries = Object.keys(state.depths.galleries);
  if (galleries.length > 0) {
    out.add('firstGallery');
    const map = depthsMapOf(state);
    if (galleries.some((id) => map.byId.get(id)?.depth === LOCULE_DEPTH)) out.add('locules');
    if (galleries.some((id) => map.byId.get(id)?.depth === CORE_DEPTH)) out.add('caverns');
  }
  if (state.depths.weevil?.fellAt !== undefined) out.add('weevil');
  if (state.orbit.kiwais.some((k) => k.readyAt <= state.now)) out.add('firstKiwai');
  // Chantier 54: the orchard (both public: visits counted, the post standing once).
  if (state.orchard.visited.includes('raspberry')) out.add('raspberry');
  // Chantier 55: the other fruits, the pineapple's crown taken, a route standing.
  if (state.orchard.visited.includes('apple')) out.add('apple');
  if (state.orchard.visited.includes('pineapple')) out.add('pineapple');
  if (state.orchard.taken[crownOf(pineappleOf(state.orchard.seed)).id] !== undefined)
    out.add('crown');
  if (state.orchard.routes.some((r) => !r.cut)) out.add('orchardRoute');
  if (Object.values(state.orchard.posts).some((p) => p.readyAt <= state.now))
    out.add('tradingPost');
  if (state.villagers.some((v) => v.kikiwiwi)) out.add('kikiwiwi');
  if (state.villagers.some((v) => v.shiny === 'star')) out.add('starEgg');
  if (state.villagers.some((v) => v.classId && CLASSES[v.classId].tier === 3)) {
    out.add('masterClass');
  }
  const tiers = new Set(ownedItems(state).map((id) => ITEMS[id]?.tier));
  if (tiers.has('steel') || tiers.has('crystal')) out.add('steelGear');
  if (tiers.has('crystal')) out.add('crystalGear');
  return out;
}

/** Every feat the colony has passed (keys in table order). */
export function featsOf(state: GameState): FeatKey[] {
  const singles = singleFeats(state);
  const measures = featMeasures(state);
  return FEAT_KEYS.filter((key) => {
    const [id, raw] = key.split(':') as [FeatId, string | undefined];
    if (raw === undefined) return singles.has(id);
    return (measures[id] ?? 0) >= Number(raw);
  });
}

/** Feats passed in `after` and not in `before`. */
export function newFeats(before: readonly FeatKey[], after: readonly FeatKey[]): FeatKey[] {
  const had = new Set(before);
  return after.filter((k) => !had.has(k));
}

/**
 * The next step of each tiered family, with where the colony stands (for the "next feats"
 * list): families fully passed are left out.
 */
export function nextTiers(state: GameState): { key: FeatKey; value: number; target: number }[] {
  const measures = featMeasures(state);
  const out: { key: FeatKey; value: number; target: number }[] = [];
  for (const def of Object.values(FEATS)) {
    if (!def.tiers) continue;
    const value = measures[def.id] ?? 0;
    const target = def.tiers.find((t) => t > value);
    if (target !== undefined) out.push({ key: `${def.id}:${target}`, value, target });
  }
  return out;
}
