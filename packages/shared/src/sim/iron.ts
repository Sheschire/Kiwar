import { IRON, IRON_SCALE, ironUnits } from '../data/iron';
import { nest } from './selectors';
import type { GameState } from './state';

/** Chantier 38: iron cap of the colony in raw units (grows with the Nest). */
export function ironCap(state: GameState): number {
  const c = IRON.cap;
  return (c[Math.min(nest(state).level, c.length - 1)] ?? 0) * IRON_SCALE;
}

/** Whole units of meteoric iron of the colony (what costs are paid with). */
export function meteorIronOf(state: GameState): number {
  return ironUnits(state.meteorIron);
}

/** Credits whole units of iron up to the cap; returns the whole units that fitted. */
export function addIron(s: GameState, units: number): number {
  const room = Math.max(0, ironCap(s) - s.meteorIron);
  const got = Math.min(units * IRON_SCALE, room);
  s.meteorIron += got;
  return ironUnits(got);
}
