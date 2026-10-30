import { DEPTHS } from '../data/depths';
import { levelDef } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { depthsMapOf } from './depths';
import { colonyBonus, workerPower } from './kiwis';
import { hungerWork } from './needs';
import { bedsOf, colonyMood, kiwiMoraleWork, presence } from './rest';
import { capacity } from './selectors';
import type { GameState, Villager } from './state';

/**
 * Chantier 48: the galleries of the depths. A room taken is a post for miners (job `mine`):
 * it yields the resource of its kind (sap → juice, bundle → fibre, nest → pulp, scree and
 * raphides → seeds) by the miners' power, day and night, in every season — the depths know
 * neither. Miners are not at the surface: no militia, no garrison, no evening; a speech or a
 * shelter up there does not stop them. A closed door stops the mines.
 */

const EPS = 1e-6;

export function minersIn(state: GameState, roomId: string): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'mine' && v.job.roomId === roomId);
}

export function galleryResource(state: GameState, roomId: string): ResourceId | null {
  const g = state.depths.galleries[roomId];
  return g ? DEPTHS.gallery.resource[g.kind] : null;
}

/** Places for miners in a gallery (by its depth). */
export function gallerySlots(state: GameState, roomId: string): number {
  const room = depthsMapOf(state).byId.get(roomId);
  if (!room || !state.depths.galleries[roomId]) return 0;
  return DEPTHS.gallery.slots[room.depth - 1] ?? 0;
}

/** The mines are open: a tunnel entrance whose door is not closed. */
export function minesOpen(state: GameState): boolean {
  return !state.depths.door.closed && state.buildings.some((b) => b.type === 'tunnel');
}

/** Summed power of the miners (rest, morale, hunger; no gathering stops them below). */
function minersWork(state: GameState, miners: readonly Villager[], resource: ResourceId): number {
  if (miners.length === 0) return 0;
  const beds = bedsOf(state);
  const mood = colonyMood(state);
  const sum = miners.reduce(
    (total, v) =>
      total +
      workerPower(v, resource) *
        presence(state, v, beds.get(v.id)) *
        kiwiMoraleWork(state, v, beds, mood),
    0,
  );
  return sum * colonyBonus(state) * hungerWork(state);
}

/** Output per hour of a gallery right now (0 with the door closed or nobody there). */
export function galleryRate(state: GameState, roomId: string): number {
  const resource = galleryResource(state, roomId);
  if (!resource || !minesOpen(state)) return 0;
  const room = depthsMapOf(state).byId.get(roomId);
  if (!room) return 0;
  const work = minersWork(state, minersIn(state, roomId), resource);
  if (work <= 0) return 0;
  const tunnel = state.buildings.find((b) => b.type === 'tunnel');
  const damaged = tunnel?.damaged ? DEPTHS.gallery.damagedWork : 1;
  return (
    DEPTHS.gallery.perMiner[room.depth - 1]! *
    minerOutput(resource, tunnel?.level ?? 1) *
    work *
    damaged
  );
}

/** What one worker yields per hour in the producer of a resource at level `6 + tunnel level`. */
export function minerOutput(resource: ResourceId, tunnelLevel: number): number {
  const def = levelDef(DEPTHS.gallery.producer[resource], 6 + Math.max(1, tunnelLevel));
  return (def?.production?.[resource] ?? 0) / Math.max(1, def?.workerSlots ?? 1);
}

/** Every gallery with miners at work, and what it yields per hour. */
export function galleryRates(
  state: GameState,
): { roomId: string; resource: ResourceId; rate: number }[] {
  const out: { roomId: string; resource: ResourceId; rate: number }[] = [];
  for (const roomId of Object.keys(state.depths.galleries).sort()) {
    const rate = galleryRate(state, roomId);
    if (rate > 0) out.push({ roomId, resource: galleryResource(state, roomId)!, rate });
  }
  return out;
}

/**
 * A gallery is worth its miners while the mines are open and its resource is below the
 * storage cap (reaching the cap is an event: exact offline).
 */
export function galleryWorth(state: GameState, roomId: string, cap = capacity(state)): boolean {
  const r = galleryResource(state, roomId);
  return !!r && minesOpen(state) && state.resources[r] < cap[r] - EPS;
}

/** Who can be sent down a mine: kiwis at home, at work, picking or mining (not Kikiwiwis). */
export function canDig(v: Villager): boolean {
  if (v.kikiwiwi) return false;
  const k = v.job.kind;
  return k === 'idle' || k === 'work' || k === 'stardust' || k === 'meteor' || k === 'mine';
}
