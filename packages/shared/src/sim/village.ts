import { CABARET } from '../data/needs';
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
