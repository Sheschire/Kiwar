import {
  BUILDINGS,
  buildingAt,
  buildingRates,
  catchmentPreview,
  consumption,
  depotDistance,
  emptyResources,
  obstacleAt,
  titanAt,
  HARVESTS,
  hexDistance,
  logisticsEfficiency,
  levelDef,
  type Building,
  ageOf,
  nest,
  queuedBuildAt,
  RESOURCE_IDS,
  defenseOf,
  gateOdds,
  turretRange,
  SECTOR_IDS,
  SECTORS,
  isRampart,
  isTurret,
  type BuildingType,
  type FaceMap,
  type GameState,
  type ResourceId,
  capacity,
  coveredHarvest,
  footprintHexes,
  footprintOf,
  getTile,
  rotationsOf,
  siteError,
} from '@kiwar/shared';

export const PRODUCERS: Record<ResourceId, BuildingType> = {
  pulp: 'pulpery',
  fiber: 'fiberWorkshop',
  seeds: 'seedQuarry',
  juice: 'juiceWell',
};
/** Relative needs of the economy (roughly the mix of upgrade costs). */
export const NEED: Record<ResourceId, number> = { pulp: 1, fiber: 1, seeds: 0.18, juice: 0.32 };

export const BUILD_ORDER: BuildingType[] = [
  'pulpery',
  'fiberWorkshop',
  'juiceWell',
  'seedQuarry',
  'hut',
  'warehouse',
];

/**
 * Best free tile for a building. Producers: the most deposit regrowth in reach (now and at
 * level 3), weighted by logistics. Others: rays and the heart first (no deposit lost), close
 * to the producers for warehouses, close to the heart otherwise.
 */
export function bestTile(state: GameState, map: FaceMap, type: BuildingType): Site | null {
  let best: Site | null = null;
  let bestScore = -Infinity;
  const big = footprintOf(type) > 1;
  const producers = state.buildings.filter((b) => HARVESTS[b.type]);
  // Huts: each producer's walk to its nearest home today.
  const homes = state.buildings.filter((b) => b.type === 'hut' || b.type === 'nest');
  const homeWalk = producers.map((p) => Math.min(...homes.map((h) => hexDistance(p, h))));
  // Turrets (chantier 12): where the sectors lack defense against their share of a wave.
  const side = type === 'skyTurret' ? 'air' : 'ground';
  const sectors = isTurret(type) ? defenseOf(state).sectors : null;
  const unit = isTurret(type) ? (levelDef(type, 1)?.defense?.[side] ?? 1) : 1;
  const odds = isTurret(type)
    ? Object.fromEntries(
        SECTOR_IDS.map((s) => [
          s,
          gateOdds(state, s).map((o) => ({
            ...o,
            covered: state.buildings.some(
              (b) => b.type === type && hexDistance(b, o.tile) <= turretRange(b.type, b.level),
            ),
          })),
        ]),
      )
    : null;
  for (const t of map.tiles) {
    if (!BUILDINGS[type].allowedTiles.includes(t.type)) continue;
    if (buildingAt(state, t.q, t.r) || queuedBuildAt(state, t.q, t.r)) continue;
    if (obstacleAt(state, t.q, t.r) || titanAt(state, t.q, t.r)) continue;
    if (t.q === 0 && t.r === 0) continue;
    if (isTurret(type) && !isRampart(map, t.q, t.r)) continue;
    // A sensible player keeps clear of the floodable shores (lagoons).
    if (t.flood) continue;
    let score: number;
    if (sectors && odds) {
      // Chantier 36: the chance that a gate falls within reach and no turret of this model
      // covers it yet, weighted by the sector's share of the wave.
      const range = turretRange(type, 1);
      score = 0;
      for (const s of SECTOR_IDS)
        for (const o of odds[s] ?? [])
          if (!o.covered && hexDistance(o.tile, t) <= range) score += o.p * SECTORS.share[side][s];
      score += 1e-3 / (1 + sectors.front[side] / unit);
    } else if (HARVESTS[type]) {
      const now = catchmentPreview(state, map, type, t, 1).regen;
      const later = catchmentPreview(state, map, type, t, 3).regen;
      score = (now + 0.5 * later) * logisticsEfficiency(depotDistance(state, map, t));
    } else if (type === 'hut' && producers.length > 0) {
      // Huts go where kiwis work far from any bed (chantier 04: the walk to bed costs work).
      let walk = 0;
      for (let i = 0; i < producers.length; i++)
        walk += Math.min(hexDistance(producers[i]!, t), homeWalk[i]!);
      score = (t.type === 'flesh' ? -1 : 0) - walk * 0.3;
    } else {
      const spare = t.type === 'flesh' ? -1 : 0;
      const near =
        type === 'warehouse' && producers.length > 0
          ? -producers.reduce((sum, b) => sum + hexDistance(b, t), 0) / producers.length
          : -t.rho * 5;
      score = spare + near * 0.3;
    }
    if (!big) {
      if (score > bestScore) {
        bestScore = score;
        best = { q: t.q, r: t.r, rot: 0 };
      }
      continue;
    }
    // Chantier 35: a big building turns to fit and to cover the fewest deposits.
    for (const rot of rotationsOf(type)) {
      if (score <= bestScore) break;
      if (siteError(state, map, type, t, rot)) continue;
      const lost = footprintHexes(type, t.q, t.r, rot)
        .slice(1)
        .reduce((sum, h) => {
          const tile = getTile(map, h);
          return sum + (tile && tile.type !== 'ray' && tile.type !== 'heart' ? 1 : 0);
        }, 0);
      const taken = coveredHarvest(state, type, t.q, t.r, rot).length;
      const total = score - 0.3 * lost - 2 * taken;
      if (total > bestScore) {
        bestScore = total;
        best = { q: t.q, r: t.r, rot };
      }
    }
  }
  return best;
}

/** Chantier 35: where and how a building goes (`rot` turns a 3-tile footprint). */
export interface Site {
  q: number;
  r: number;
  rot: number;
}

/** The next level exists in this age and the Nest allows it. */
export function upgradeOk(state: GameState, b: Building): boolean {
  const def = levelDef(b.type, b.level + 1);
  if (!def || (def.requiresAge ?? 0) > ageOf(state)) return false;
  return b.type === 'nest' || nest(state).level >= def.requiresNestLevel;
}

/** Whether production (gross, by day) covers the meals of one more kiwi, with a margin. */
export function canFeedOneMore(state: GameState): boolean {
  const rates = emptyResources();
  for (const b of state.buildings) {
    const r = buildingRates(state, b, () => false);
    for (const id of RESOURCE_IDS) rates[id] += r[id];
  }
  const eaten = consumption(state);
  const n = Math.max(1, state.villagers.length);
  return (['pulp', 'juice'] as const).every(
    (id) => rates[id] >= (eaten[id] * (n + 1) * 1.2) / n || eaten[id] === 0,
  );
}

/**
 * Resources from the scarcest to the most plentiful: net rate (after the meals, with a margin)
 * over the economy's need; a nearly full resource counts as plentiful (Infinity).
 */
export function bottlenecks(state: GameState): {
  rates: Record<ResourceId, number>;
  order: ResourceId[];
} {
  // What is left after the meals: food comes first when the kiwis eat it all.
  const rates = emptyResources();
  for (const b of state.buildings) {
    const r = buildingRates(state, b, () => false);
    for (const id of RESOURCE_IDS) rates[id] += r[id];
  }
  const eaten = consumption(state);
  for (const id of RESOURCE_IDS) rates[id] = Math.max(0, rates[id] - eaten[id] * 1.3);
  for (const id of RESOURCE_IDS)
    if (state.resources[id] >= capacity(state)[id] * 0.95) rates[id] = Infinity;
  const order = [...RESOURCE_IDS].sort((a, b) => rates[a] / NEED[a] - rates[b] / NEED[b]);
  return { rates, order };
}
