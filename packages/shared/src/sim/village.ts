import { CABARET, FIREWORKS, type FireworksPattern } from '../data/needs';
import type { CommandError } from './commands';
import { stardustOf } from './comets';
import { canAfford } from './selectors';
import { hexDistance } from '../hex/hex';
import { calendarAt } from './calendar';
import { addMemory, bedsOf, canSup } from './rest';
import type { Building, GameState } from './state';
import type { TimeMs } from '../types/ids';

/**
 * Chantier 44: the evenings of the village — the Robin's Cabaret (and, in part 5, the fireworks).
 * Everything happens at nightfall (an `advance` event) or on a command: exact offline.
 */

export function cabaretOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'cabaret');
}

/** Kiwis sleeping within the cabaret's reach, free for the evening (its guests tonight). */
export function cabaretGuests(state: GameState, cabaret: Building): string[] {
  const beds = bedsOf(state);
  const homes = new Map(state.buildings.map((b) => [b.id, b]));
  const out: string[] = [];
  for (const v of state.villagers) {
    const hutId = beds.get(v.id)?.buildingId;
    const hut = hutId ? homes.get(hutId) : undefined;
    if (!hut || !canSup(v) || hexDistance(hut, cabaret) > CABARET.radius) continue;
    out.push(v.id);
  }
  return out;
}

export type CabaretNight =
  { open: true; guests: number } | { open: false; reason: 'closed' | 'juice' | 'none' };

/**
 * At nightfall: an open cabaret takes its juice and its guests remember the evening until the
 * next nightfall. Without the juice it stays shut (nothing else is lost).
 */
export function openCabaret(state: GameState, at: TimeMs): CabaretNight {
  const cabaret = cabaretOf(state);
  if (!cabaret) return { open: false, reason: 'none' };
  if (!state.village.cabaretOpen) return { open: false, reason: 'closed' };
  if (state.resources.juice < CABARET.juice) return { open: false, reason: 'juice' };
  state.resources.juice -= CABARET.juice;
  const c = calendarAt(state.calendarStart, at);
  const until = calendarAt(state.calendarStart, c.dawnAt).nightAt;
  const guests = new Set(cabaretGuests(state, cabaret));
  for (const v of state.villagers)
    if (guests.has(v.id)) addMemory(v, 'cabaret', CABARET.value, until);
  return { open: true, guests: guests.size };
}

/** Chantier 44: the kiwi spends this evening at the cabaret. */
export function atCabaretTonight(
  state: GameState,
  v: { memories?: { kind: string; until: number }[] },
): boolean {
  return v.memories?.some((m) => m.kind === 'cabaret' && m.until > state.now) ?? false;
}

/** Chantier 44: the fireworks cannon. */
export function fireworksOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'fireworks');
}

/** Why the fireworks cannot be fired now (no cannon, by day, already tonight, cost), or null. */
export function fireworksLock(state: GameState, pattern: FireworksPattern): CommandError | null {
  if (!fireworksOf(state)) return 'noFireworks';
  const c = calendarAt(state.calendarStart, state.now);
  if (!c.night) return 'notNight';
  if (state.village.fireworksNight === c.nightAt) return 'fireworksDone';
  const def = FIREWORKS[pattern];
  if (!canAfford(state.resources, def.cost)) return 'notEnoughResources';
  if (stardustOf(state) < def.stardust) return 'notEnoughStardust';
  return null;
}

/**
 * Fires the show (already paid): every kiwi at home remembers it, the night is used up and the
 * client is told what to play.
 */
export function fireFireworks(state: GameState, pattern: FireworksPattern, at: TimeMs): void {
  const def = FIREWORKS[pattern];
  const c = calendarAt(state.calendarStart, at);
  state.village = { ...state.village, fireworksNight: c.nightAt, lastShow: { at, pattern } };
  for (const v of state.villagers) {
    if (v.job.kind === 'expedition' || v.job.kind === 'outpost') continue;
    addMemory(v, 'fireworks', def.value, at + def.ms);
  }
}
