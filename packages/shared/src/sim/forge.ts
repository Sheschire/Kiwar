import { levelDef } from '../data/buildings';
import {
  CLASS_FAMILY,
  FORGE,
  ITEMS,
  ITEM_IDS,
  orderWork,
  tierIndex,
  type GearSlot,
  type ItemId,
  type WeaponFamily,
} from '../data/gear';
import { IRON_SCALE } from '../data/iron';
import { KIWI } from '../data/kiwis';
import { RESOURCE_IDS } from '../data/resources';
import { THREATS } from '../data/threats';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { isNight } from './calendar';
import type { CommandError } from './commands';
import { addIron, meteorIronOf } from './iron';
import { kiwiStrength } from './kiwis';
import { hungerWork } from './needs';
import { nightWork, techEffects } from './research';
import { bedsOf, colonyMood, kiwiMoraleWork, presence } from './rest';
import { canAfford } from './selectors';
import type { Building, GameState, Villager } from './state';

/**
 * Chantier 38: the Forge. The player orders pieces (paid at once, refunded on cancel); the first
 * order of the queue is worked by the smiths (Strength and Dexterity) at an integer rate, and
 * lands in the armory. Pieces go from the armory onto the kiwis (two slots), by hand or through
 * the automation (`equipGear`), and back when a kiwi dies at home or takes another line.
 */

/** The colony's Forge (one at most). */
export function forgeOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'forge');
}

/** A smith's power, 1 for an average kiwi: Strength and Dexterity. */
export function forgePower(v: Villager): number {
  const avg = KIWI.stat.average;
  const p =
    1 + FORGE.strength * (v.stats.strength - avg) + FORGE.dexterity * (v.stats.dexterity - avg);
  return Math.max(KIWI.minPower, p);
}

/** Kiwis working at the Forge. */
export function smithsOf(state: GameState): Villager[] {
  const b = forgeOf(state);
  if (!b) return [];
  return state.villagers.filter((v) => v.job.kind === 'work' && v.job.buildingId === b.id);
}

/**
 * Raw work units per ms on the first order (an integer: small steps add up exactly like a big
 * one). Presence, night, hunger, morale and damage apply like at the Library; nothing in a
 * shelter or without an order.
 */
export function forgeRate(state: GameState): number {
  const b = forgeOf(state);
  if (!b || state.forge.orders.length === 0) return 0;
  if (state.threats.shelterUntil > state.now) return 0;
  const beds = bedsOf(state);
  const mood = colonyMood(state);
  let work = 0;
  for (const v of smithsOf(state))
    work +=
      forgePower(v) * presence(state, v, beds.get(v.id)) * kiwiMoraleWork(state, v, beds, mood);
  if (work <= 0) return 0;
  const speed = levelDef(b.type, b.level)?.forging ?? 1;
  const damaged = b.damaged ? THREATS.damagedWork : 1;
  const night = isNight(state) ? nightWork(state) : 1;
  const f = work * speed * damaged * night * hungerWork(state);
  return f > 0 ? Math.max(1, Math.round(FORGE.rate * f)) : 0;
}

/** Orders the Forge keeps at once (its level). */
export function forgeQueueSize(state: GameState): number {
  const b = forgeOf(state);
  return b ? (levelDef(b.type, b.level)?.forgeQueue ?? 0) : 0;
}

/** Why a piece cannot be ordered now (no Forge, technology, queue full, price), or null. */
export function forgeLock(state: GameState, id: ItemId): CommandError | null {
  const def = ITEMS[id];
  if (!def) return 'unknownItem';
  if (!forgeOf(state)) return 'noForge';
  if (!state.research.done.includes(def.tech)) return 'techMissing';
  if (state.forge.orders.length >= forgeQueueSize(state)) return 'forgeQueueFull';
  if (meteorIronOf(state) < def.iron) return 'notEnoughIron';
  if (!canAfford(state.resources, def.cost)) return 'notEnoughResources';
  return null;
}

/** Pays and queues a piece (checked with `forgeLock` first). */
export function orderItem(state: GameState, id: ItemId, orderId: string): void {
  const def = ITEMS[id];
  for (const r of RESOURCE_IDS) state.resources[r] -= def.cost[r] ?? 0;
  state.meteorIron -= def.iron * IRON_SCALE;
  state.forge.orders.push({
    id: orderId,
    item: id,
    progress: 0,
    paid: { ...def.cost },
    iron: def.iron,
  });
}

/** Removes an order and gives its price back (resources even above the cap, iron up to it). */
export function cancelOrder(state: GameState, index: number): void {
  const [order] = state.forge.orders.splice(index, 1);
  if (!order) return;
  for (const r of RESOURCE_IDS) state.resources[r] += order.paid[r] ?? 0;
  addIron(state, order.iron);
}

/** Next time the first order is done. */
export function nextForgeEvent(state: GameState): TimeMs {
  const order = state.forge.orders[0];
  if (!order) return Infinity;
  const need = orderWork(order.item) - order.progress;
  if (need <= 0) return state.now;
  const rate = forgeRate(state);
  if (rate <= 0) return Infinity;
  return state.now + Math.max(1, Math.ceil(need / rate));
}

/** Time left before the first order is done (UI), or null. */
export function forgeEta(state: GameState): number | null {
  const at = nextForgeEvent(state);
  return Number.isFinite(at) ? at - state.now : null;
}

/** Works `dtMs` on the first order at `rate` (read at the start of the interval). */
export function accrueForge(state: GameState, rate: number, dtMs: number): void {
  const order = state.forge.orders[0];
  if (!order || rate <= 0) return;
  order.progress = Math.min(orderWork(order.item), order.progress + rate * dtMs);
}

/** Finished orders go to the armory. */
export function forgeTick(state: GameState, at: TimeMs, events: GameEvent[]): void {
  const orders = state.forge.orders;
  while (orders[0] && orders[0].progress >= orderWork(orders[0].item)) {
    const done = orders.shift()!;
    storeItem(state, done.item);
    events.push({ type: 'itemForged', at, item: done.item });
  }
}

/** Puts a piece in the armory (a full shelf keeps its count). */
export function storeItem(state: GameState, id: ItemId): void {
  const armory = state.forge.armory;
  armory[id] = Math.min(FORGE.armoryMax, (armory[id] ?? 0) + 1);
}

function takeItem(state: GameState, id: ItemId): void {
  const armory = state.forge.armory;
  const left = (armory[id] ?? 0) - 1;
  if (left > 0) armory[id] = left;
  else delete armory[id];
}

/** Weapon family a kiwi can wield (null: none, e.g. without a class or a Kikiwiwi). */
export function familyOf(v: Villager): WeaponFamily | null {
  if (v.kikiwiwi) return null;
  return CLASS_FAMILY[v.classId ?? 'none'];
}

/** Why a kiwi cannot wear a piece, or null. */
export function wearLock(v: Villager, id: ItemId): CommandError | null {
  const def = ITEMS[id];
  if (v.kikiwiwi) return 'kikiwiwiNoWork';
  if (def.slot === 'weapon' && familyOf(v) !== def.kind) return 'wrongFamily';
  return null;
}

/** Gives a kiwi's piece of a slot back to the armory. */
export function unequip(state: GameState, v: Villager, slot: GearSlot): void {
  const id = v.gear?.[slot];
  if (!id || !v.gear) return;
  storeItem(state, id);
  delete v.gear[slot];
  if (!v.gear.weapon && !v.gear.armor) delete v.gear;
}

/** Puts a piece from the armory on a kiwi (its former piece of that slot goes back). */
export function equip(state: GameState, v: Villager, id: ItemId, kept: boolean): void {
  const slot = ITEMS[id].slot;
  unequip(state, v, slot);
  takeItem(state, id);
  v.gear = { ...v.gear, [slot]: id };
  if (kept) v.gear.kept = true;
  else delete v.gear.kept;
}

/** A kiwi dies at home: its gear goes back to the armory. */
export function returnGear(state: GameState, v: Villager): void {
  unequip(state, v, 'weapon');
  unequip(state, v, 'armor');
}

/** Armour a kiwi wears best: heavy for the front line, light for archers and casters. */
function armorKind(v: Villager): 'light' | 'heavy' {
  const f = familyOf(v);
  return f === 'bow' || f === 'staff' ? 'light' : 'heavy';
}

/** The best piece of the armory for a kiwi's slot, better than what it wears (or null). */
function betterPiece(state: GameState, v: Villager, slot: GearSlot): ItemId | null {
  const worn = v.gear?.[slot];
  let best: ItemId | null = null;
  let score = worn
    ? tierIndex(ITEMS[worn].tier) * 2 + (ITEMS[worn].kind === armorKind(v) ? 1 : 0)
    : -1;
  for (const id of ITEM_IDS) {
    const def = ITEMS[id];
    if (def.slot !== slot || !state.forge.armory[id] || wearLock(v, id)) continue;
    const s = tierIndex(def.tier) * 2 + (slot === 'armor' && def.kind === armorKind(v) ? 1 : 0);
    if (s > score) {
      score = s;
      best = id;
    }
  }
  return best;
}

/**
 * Chantier 38: weapons of another line go back to the armory (always); then, in automatic mode,
 * the guards first, then the strongest kiwis at home take the best pieces they can wear (kiwis
 * equipped by the player keep theirs). Reads only what changes at events (exact offline).
 */
export function equipGear(state: GameState): void {
  for (const v of state.villagers) {
    const w = v.gear?.weapon;
    if (w && wearLock(v, w)) unequip(state, v, 'weapon');
    if (v.gear?.armor && v.kikiwiwi) unequip(state, v, 'armor');
  }
  if (!state.automation.equip || Object.keys(state.forge.armory).length === 0) return;
  const away = (v: Villager) => v.job.kind === 'expedition' || v.job.kind === 'outpost';
  const order = state.villagers
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => !v.kikiwiwi && !v.gear?.kept && !away(v))
    .sort(
      (a, b) =>
        Number(b.v.job.kind === 'guard') - Number(a.v.job.kind === 'guard') ||
        kiwiStrength(b.v) - kiwiStrength(a.v) ||
        a.i - b.i,
    );
  for (const { v } of order) {
    for (const slot of ['weapon', 'armor'] as const) {
      const id = betterPiece(state, v, slot);
      if (id) equip(state, v, id, false);
    }
  }
}

/** What a kiwi's gear does in a fight. */
export interface GearEffect {
  damage: number;
  hp: number;
  armor: number;
  speed: number;
}

const NO_GEAR: GearEffect = { damage: 1, hp: 1, armor: 0, speed: 1 };

export function gearEffect(v: Villager): GearEffect {
  if (!v.gear) return NO_GEAR;
  const w = v.gear.weapon ? ITEMS[v.gear.weapon] : null;
  const a = v.gear.armor ? ITEMS[v.gear.armor] : null;
  return {
    damage: w?.damage ?? 1,
    hp: a?.hp ?? 1,
    armor: a?.armor ?? 0,
    speed: a?.speed ?? 1,
  };
}

/** Pieces in the armory (all kinds together). */
export function armoryCount(state: GameState): number {
  return Object.values(state.forge.armory).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** Whether the technologies already open a piece (for the Forge's list). */
export function itemOpen(state: GameState, id: ItemId): boolean {
  return techEffects(state).forge && state.research.done.includes(ITEMS[id].tech);
}
