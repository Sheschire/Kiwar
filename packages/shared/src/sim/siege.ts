import { INTEL } from '../data/expeditions';
import { SIEGE } from '../data/siege';
import { createRng } from '../rng/rng';
import type { AlienGarrison, ExpeditionTarget, GameState } from './state';
import type { Sides } from './threats';

/**
 * The conquest of the twin face. Chantier 19's siege (bridgeheads, counter-attacks, deep
 * reconnaissance) gave way to the landings of chantier 40 and the beacons' defence and the queen
 * of chantier 42; what is left here: the twin, its conquest and the queen's secret draw.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The alien-held other face of our own kiwi: the only face a conquest can take. */
export function twinTarget(state: Pick<GameState, 'targets'>): ExpeditionTarget | undefined {
  return state.targets.find((t) => t.distance === 0);
}

/** The queen fell: the twin face is ours. */
export function isConquered(state: Pick<GameState, 'siege'>): boolean {
  return state.siege.conqueredAt > 0;
}

export interface QueenTruth {
  /** Inner parcel of the royal burrow at the start. */
  sector: number;
  /** Her base power (ground and air), before her parcel's growth. */
  power: Sides;
}

const truths = new Map<string, QueenTruth>();

/** The queen as drawn from the garrison's secret seed (never stored, hidden). */
export function queenTruth(g: Pick<AlienGarrison, 'seed'>): QueenTruth {
  const cached = truths.get(g.seed);
  if (cached) return cached;
  const rng = createRng(`${g.seed}/siege`);
  // The old holds' draws are kept so that the queen stays where older games found her.
  for (let i = 0; i < SIEGE.oldHolds; i++) rng.next();
  const sector = rng.int(0, INTEL.sectors / 2 - 1);
  const q = SIEGE.queen;
  const truth = {
    sector,
    power: {
      ground: round1(q.ground * rng.range(...q.spread)),
      air: round1(q.air * rng.range(...q.spread)),
    },
  };
  if (truths.size > 256) truths.clear();
  truths.set(g.seed, truth);
  return truth;
}

/**
 * A local save imported online: nobody can check its conquest (the truth is drawn again).
 */
export function resetSiege(s: GameState): void {
  s.siege = { conqueredAt: 0 };
}
