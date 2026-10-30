import { isTurret } from '../data/buildings';
import { DEPTHS } from '../data/depths';
import { CRYSTAL, CRYSTAL_SCALE, GIANT_SEEDS, crystalUnits } from '../data/crystal';
import type { BuildingType } from '../data/buildings';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { minersWork, minesOpen, minersIn, tunnelDamage } from './mines';
import { ageOf, techEffects } from './research';
import { nest } from './selectors';
import type { Building, GameState } from './state';
import type { CommandError } from './commands';

/** Chantier 50: crystal cap of the colony in raw units (grows with the Nest). */
export function crystalCap(state: GameState): number {
  const c = CRYSTAL.cap;
  return (c[Math.min(nest(state).level, c.length - 1)] ?? 0) * CRYSTAL_SCALE;
}

/** Whole units of crystal (what costs are paid with). */
export function crystalOf(state: GameState): number {
  return crystalUnits(state.crystal);
}

/** Credits whole units of crystal up to the cap; returns the whole units that fitted. */
export function addCrystal(s: GameState, units: number): number {
  const room = Math.max(0, crystalCap(s) - s.crystal);
  const got = Math.min(units * CRYSTAL_SCALE, room);
  s.crystal += got;
  return crystalUnits(got);
}

/** Pays whole units of crystal (the caller checked there is enough). */
export function payCrystal(s: GameState, units: number): void {
  s.crystal = Math.max(0, s.crystal - units * CRYSTAL_SCALE);
}

/**
 * Raw crystal units per ms cut in a raphide forest: an integer (small steps add up exactly
 * like a big one), by the miners' power, presence, morale and hunger, halved with a damaged
 * door; 0 with the door closed, nobody there or the stock full.
 */
export function galleryCrystalRate(state: GameState, roomId: string): number {
  if (state.depths.galleries[roomId]?.kind !== 'forest') return 0;
  if (!minesOpen(state) || state.crystal >= crystalCap(state)) return 0;
  const work = minersWork(state, minersIn(state, roomId), DEPTHS.gallery.workAs.forest);
  if (work <= 0) return 0;
  return Math.max(1, Math.round(1000 * CRYSTAL.perHour * work * tunnelDamage(state)));
}

/** Raw crystal units per ms cut by the whole colony. */
export function crystalRate(state: GameState): number {
  let rate = 0;
  for (const id of Object.keys(state.depths.galleries)) rate += galleryCrystalRate(state, id);
  return rate;
}

/** Crystal per hour (units, for the UI). */
export function crystalPerHour(state: GameState): number {
  return (crystalRate(state) * 3_600_000) / CRYSTAL_SCALE;
}

/** The crystal stock filling up (its miners stop: exact offline). */
export function nextCrystalEvent(state: GameState): TimeMs {
  const rate = crystalRate(state);
  if (rate <= 0) return Infinity;
  return state.now + Math.max(1, Math.ceil((crystalCap(state) - state.crystal) / rate));
}

/** Cuts `dtMs` of crystal at the rate of the interval's start (computed in `computeFlows`). */
export function accrueCrystal(
  s: GameState,
  rate: number,
  dtMs: number,
  at: TimeMs,
  events: GameEvent[],
): void {
  if (rate <= 0) return;
  const cap = crystalCap(s);
  const before = s.crystal;
  s.crystal = Math.min(cap, s.crystal + rate * dtMs);
  if (before < cap && s.crystal >= cap) events.push({ type: 'crystalFull', at });
}

/** Giant seeds the colony may keep (by age). */
export function giantSeedCap(state: GameState): number {
  const c = GIANT_SEEDS.cap;
  return c[Math.min(ageOf(state), c.length - 1)] ?? 0;
}

/** Credits giant seeds up to the cap; returns how many fitted. */
export function addGiantSeeds(s: GameState, n: number): number {
  const got = Math.max(0, Math.min(n, giantSeedCap(s) - s.giantSeeds));
  s.giantSeeds += got;
  return got;
}

/** Pays giant seeds (the caller checked there are enough). */
export function payGiantSeeds(s: GameState, n: number): void {
  s.giantSeeds = Math.max(0, s.giantSeeds - n);
}

// --- What crystal pays for --------------------------------------------------------------------

/** Why a lens cannot be fitted on this building now, or null. */
export function lensLock(state: GameState, b: Building | undefined): CommandError | null {
  if (!b) return 'unknownBuilding';
  if (!isTurret(b.type)) return 'notATurret';
  if (!techEffects(state).lenses) return 'techMissing';
  if (b.lens) return 'lensFitted';
  if (crystalOf(state) < CRYSTAL.lens.crystal) return 'notEnoughCrystal';
  return null;
}

/** Seed turrets that would fire crystal ammunition in a battle now. */
export function seedTurrets(state: GameState): number {
  return state.buildings.filter((b) => b.type === 'seedTurret').length;
}

/** Crystal a strike costs with the crystal ammunition on (0 when it is off or unaffordable). */
export function crystalAmmoCost(state: GameState): number {
  if (!state.threats.crystalAmmo || !techEffects(state).crystalAmmo) return 0;
  const cost = CRYSTAL.ammo.perTurret * seedTurrets(state);
  return cost > 0 && crystalOf(state) >= cost ? cost : 0;
}

/** The seed turrets pierce armour in a battle now (the toggle on, the crystal there). */
export function crystalAmmoOn(state: GameState): boolean {
  return crystalAmmoCost(state) > 0;
}

// --- Locule trees ------------------------------------------------------------------------------

/** Giant seeds the next building of this type costs (the n-th locule tree: n × `perTree`). */
export function treeSeedCost(state: GameState, type: BuildingType): number {
  if (type !== 'loculeTree') return 0;
  const copies =
    state.buildings.filter((b) => b.type === type).length +
    state.queue.filter((i) => i.kind === 'build' && i.buildingType === type).length;
  return (copies + 1) * GIANT_SEEDS.tree.perTree;
}

/**
 * The next time a locule tree gives a seed (the stock has room; a ripe seed waiting on a tree
 * is given as soon as there is room, i.e. now).
 */
export function nextTreeEvent(state: GameState): TimeMs {
  if (state.giantSeeds >= giantSeedCap(state)) return Infinity;
  let next = Infinity;
  for (const b of state.buildings)
    if (b.type === 'loculeTree' && b.seedAt !== undefined)
      next = Math.min(next, Math.max(state.now, b.seedAt));
  return next;
}

/**
 * Ripe seeds fall into the stock while it has room (oldest tree first); the tree's next one
 * comes `everyMs` after (from now, when it waited for room). Run at the loop top: the time
 * room appears is an event or a command, so small steps give what one big step gives.
 */
export function treeTick(s: GameState, events: GameEvent[]): void {
  for (const b of s.buildings) {
    if (b.type !== 'loculeTree' || b.seedAt === undefined || b.seedAt > s.now) continue;
    if (addGiantSeeds(s, 1) === 0) return;
    const at = b.seedAt;
    b.seedAt = s.now + GIANT_SEEDS.tree.everyMs;
    events.push({ type: 'treeSeed', at: Math.max(at, s.now), buildingId: b.id });
  }
}
