// Numbers derived from a game state, memoized per state object. The controller replaces the
// state at every tick and never mutates a state it has emitted, so a WeakMap keyed on it
// computes each number once per tick for the interface and the 3D views together.
import {
  bedsOf as sharedBedsOf,
  buildingHarvest,
  consumption as sharedConsumption,
  emptyResources,
  passiveRates,
  RESOURCE_IDS,
  storageFullCheck,
  type BuildingId,
  type GameState,
  type Harvest,
  type Resources,
} from '@kiwar/shared';

/** Wraps a one-argument selector of the game state with a per-state cache. */
export function perGame<R>(fn: (state: GameState) => R): (state: GameState) => R {
  const cache = new WeakMap<GameState, R>();
  return (state) => {
    if (cache.has(state)) return cache.get(state)!;
    const value = fn(state);
    cache.set(state, value);
    return value;
  };
}

export const consumption = perGame(sharedConsumption);

/** Beds of the kiwis (default map of the state). */
export const bedsOf = perGame((state) => sharedBedsOf(state));

/** Which stocks are full and cannot grow (lazy inside, like the shared check). */
export const storageFull = perGame((state) => storageFullCheck(state));

/** Harvest of every producer with its current staff (the sim's `buildingHarvest`), once. */
export const harvests = perGame((state) => {
  const full = storageFull(state);
  const out = new Map<BuildingId, Harvest | null>();
  for (const b of state.buildings) out.set(b.id, buildingHarvest(state, b, full));
  return out;
});

/** Harvest of one building (null for buildings that harvest nothing). */
export function harvestOf(state: GameState, id: BuildingId): Harvest | null {
  return harvests(state).get(id) ?? null;
}

/** Same as the shared `productionRates`, from the cached harvests. */
export const productionRates = perGame((state): Resources => {
  const total = emptyResources();
  const all = harvests(state);
  for (const b of state.buildings) {
    const passive = passiveRates(state, b);
    for (const id of RESOURCE_IDS) total[id] += passive[id];
    const h = all.get(b.id);
    if (h) total[h.resource] += h.output;
  }
  return total;
});

/** Same as the shared `netRates`, from the cached production. */
export const netRates = perGame((state): Resources => {
  const full = storageFull(state);
  const prod = productionRates(state);
  const eaten = consumption(state);
  const out = emptyResources();
  for (const id of RESOURCE_IDS) {
    if (full(id)) continue;
    const net = prod[id] - eaten[id];
    out[id] = net < 0 && state.resources[id] <= 0 ? 0 : net;
  }
  return out;
});
