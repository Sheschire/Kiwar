import {
  ageOf,
  buildCost,
  buildingCount,
  canAfford,
  CLASS_FAMILY,
  forgeLock,
  forgeQueueSize,
  GEAR_TIERS,
  hasTech,
  ITEMS,
  levelDef,
  meteorIronOf,
  nestDef,
  RESOURCE_IDS,
  tierIndex,
  type BuildingType,
  type Command,
  type GameState,
  type GearKind,
  type ItemId,
} from '@kiwar/shared';

/**
 * Chantier 38: the Forge once its technology is known (after the training camp's age has
 * come), then pieces for the fighters: a weapon of its line for each kiwi with a class (guards
 * and crews first: the automation hands them out), an armour for each — the best tier open,
 * never with the iron the next monument level needs, never with resources the economy needs
 * (twice the price in stock).
 */
export function forgeBuildDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (ageOf(state) < 1 || !hasTech(state, 'forge') || has('forge') || !has('trainingCamp'))
    return null;
  if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
  if (!canAfford(state.resources, buildCost(state, 'forge'))) return null;
  return build('forge');
}

/** Iron kept for the next monument level (the ages come first). */
function ironReserve(state: GameState): number {
  const monument = state.buildings.find((b) => b.type === 'monument');
  return levelDef('monument', (monument?.level ?? 0) + 1)?.iron ?? 0;
}

export function forgeOrder(state: GameState): Command | null {
  const forge = state.buildings.find((b) => b.type === 'forge');
  if (!forge || state.forge.orders.length >= forgeQueueSize(state)) return null;
  // Pieces of each kind the colony has (worn, in the armory, ordered), by tier.
  const owned = new Map<ItemId, number>();
  const add = (id: ItemId | undefined) => id && owned.set(id, (owned.get(id) ?? 0) + 1);
  for (const v of state.villagers) {
    add(v.gear?.weapon);
    add(v.gear?.armor);
  }
  for (const [id, n] of Object.entries(state.forge.armory) as [ItemId, number][])
    for (let i = 0; i < n; i++) add(id);
  for (const o of state.forge.orders) add(o.item);
  // Kiwis who want a piece of each kind.
  const want = new Map<GearKind, number>();
  const classed = state.villagers.filter((v) => v.classId && !v.kikiwiwi);
  for (const v of classed) {
    const family = CLASS_FAMILY[v.classId!];
    if (family) want.set(family, (want.get(family) ?? 0) + 1);
    const armor = family === 'bow' || family === 'staff' ? 'light' : 'heavy';
    want.set(armor, (want.get(armor) ?? 0) + 1);
  }
  const reserve = ironReserve(state);
  // The best tier first: a kind short of pieces at least that good gets one.
  for (const tier of [...GEAR_TIERS].reverse()) {
    for (const [kind, n] of want) {
      const id = `${kind}-${tier}` as ItemId;
      const def = ITEMS[id];
      const good = [...owned]
        .filter(([o]) => ITEMS[o].kind === kind && tierIndex(ITEMS[o].tier) >= tierIndex(tier))
        .reduce((sum, [, c]) => sum + c, 0);
      if (good >= n) continue;
      if (forgeLock(state, id)) continue;
      if (def.iron > 0 && meteorIronOf(state) - def.iron < reserve) continue;
      if (RESOURCE_IDS.some((r) => state.resources[r] < 2 * (def.cost[r] ?? 0))) continue;
      return { type: 'forgeItem', item: id };
    }
  }
  return null;
}
