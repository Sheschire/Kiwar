import { DEPTHS } from '../data/depths';
import type { LandingOrders } from '../data/landing';
import { emptyResources } from '../data/resources';
import { landingOutcome, type LandingOutcome } from '../battle/landing';
import { simulateBattle } from '../battle/simulate';
import { stemEscort, stemSetup } from '../battle/stem';
import type { TimeMs, VillagerId } from '../types/ids';
import { removeVillagers, type Odds } from './expeditions';
import { recordBestiary, tollOf } from './landing';
import type { DepthRoom } from './depths';
import type { Expedition, GameState, Villager, WeevilState } from './state';

/**
 * Chantier 52: the Great Weevil of the stem, the final battle of our depths. Its guard is
 * public (the battle is prepared), its wounds of a lost battle heal over `DEPTHS.stem.healMs`.
 * A delve to the stem resolves here, where the truth is held like any other delve.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

export function weevilOf(state: Pick<GameState, 'depths'>): WeevilState {
  return state.depths.weevil ?? { attempts: 0 };
}

/** The Weevil has fallen (the stem is ours). */
export function weevilFallen(state: Pick<GameState, 'depths'>): boolean {
  return state.depths.weevil?.fellAt !== undefined;
}

/** Share of its hit points still missing at a time. */
export function weevilWounds(state: Pick<GameState, 'depths'>, now: TimeMs): number {
  const w = state.depths.weevil?.wounds;
  if (!w) return 0;
  return Math.max(0, w.share * (1 - (now - w.at) / DEPTHS.stem.healMs));
}

/** The crew reaches the stem: the battle against the Weevil. */
export function resolveStem(
  state: GameState,
  e: Expedition,
  room: DepthRoom,
  members: Villager[],
  fed: number,
  seed: string,
): void {
  const at = e.arriveAt;
  const wounds = weevilWounds(state, at);
  const setup = stemSetup(state, members, { wounds, orders: e.orders!, fed });
  const log = simulateBattle(setup, `${seed}/stem/${e.id}`);
  const outcome = landingOutcome(log);
  const crewIds = new Set(members.map((v) => v.id as string));
  const fallen = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  // Chantier 46's rule: a field we hold brings its fallen home wounded.
  const dead = outcome === 'victory' ? [] : fallen;
  const hurt = outcome === 'victory' ? fallen : [];
  removeVillagers(state, dead, 'battle', at, true);
  e.crew = e.crew.filter((id) => !dead.includes(id));

  const w: WeevilState = { ...weevilOf(state), attempts: weevilOf(state).attempts + 1 };
  if (outcome === 'victory') {
    delete w.wounds;
    w.fellAt = at;
    state.depths.galleries[room.id] = { kind: 'stem', since: at };
    state.depths.views[room.id] = { at, source: 'delve', kind: 'stem', units: [], hazard: null };
  } else {
    // It keeps its wounds for a while (never more than `maxWounds`).
    const left = (1 - wounds) * (log.result.leaderLeft ?? 1);
    const share = Math.min(DEPTHS.stem.maxWounds, round2(1 - left));
    if (share > 0) w.wounds = { share, at };
    else delete w.wounds;
    if (!state.depths.views[room.id])
      state.depths.views[room.id] = { at, source: 'retreat', kind: 'stem', hazard: null };
  }
  state.depths.weevil = w;
  if (outcome !== 'defeat') recordBestiary(state, stemEscort(), at);

  e.result = {
    victory: outcome === 'victory',
    strength: members.length,
    defense: setup.units.filter((u) => u.side === 0).length,
    fed: round2(fed),
    lostInBattle: dead.map((id) => members.find((v) => v.id === id)?.name ?? id),
    lostOnReturn: [],
    loot: emptyResources(),
    outcome,
    log,
    injured: hurt,
    weevil: {
      left: round2((1 - wounds) * (log.result.leaderLeft ?? (outcome === 'victory' ? 0 : 1))),
    },
    ...(outcome === 'victory' ? { gallery: true } : {}),
  };
}

// --- The forecast (public) ---------------------------------------------------------------------

export interface StemForecast {
  wounds: number;
  odds: Odds;
  expectedDead: number;
  expectedHurt: number;
  trials: LandingOutcome[];
  /** Share of the Weevil's hit points left after the middle trial. */
  left: number;
  /** Somebody of the crew reaches it in the air. */
  reachesAir: boolean;
}

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number; left: number }>();

/**
 * Three practice battles at luck 1.15 / 1 / 0.85 (the crew's blows): the Weevil's guard is
 * public, only the draws of the battle differ.
 */
export function stemForecast(
  state: GameState,
  crew: readonly Villager[],
  orders: LandingOrders,
  fed = 1,
): StemForecast {
  const wounds = weevilWounds(state, state.now);
  const base = stemSetup(state, crew, { wounds, orders, fed });
  const reachesAir = base.units.some((u) => u.side === 1 && u.weapon.hitsAir);
  if (crew.length === 0)
    return {
      wounds,
      odds: 'unknown',
      expectedDead: 0,
      expectedHurt: 0,
      trials: [],
      left: 1,
      reachesAir,
    };
  const runs = [1.15, 1, 0.85].map((luck, i) => {
    const setup = {
      ...base,
      units: base.units.map((u) =>
        u.side === 1 ? { ...u, weapon: { ...u.weapon, damage: u.weapon.damage * luck } } : u,
      ),
    };
    const seed = `depths/stem/trial/${i}`;
    const key = JSON.stringify([setup.units, setup.orders, seed]);
    let hit = trialCache.get(key);
    if (!hit) {
      const log = simulateBattle(setup, seed);
      const outcome = landingOutcome(log);
      hit = {
        outcome,
        dead: log.result.lost?.length ?? 0,
        left: outcome === 'victory' ? 0 : (log.result.leaderLeft ?? 1),
      };
      if (trialCache.size > 16) trialCache.delete(trialCache.keys().next().value!);
      trialCache.set(key, hit);
    }
    return hit;
  });
  const won = runs.map((r) => r.outcome === 'victory');
  const odds: Odds = won[2] ? 'likely' : won[1] || won[0] ? 'uncertain' : 'unlikely';
  return {
    wounds,
    odds,
    ...tollOf(runs[1]!),
    trials: runs.map((r) => r.outcome),
    left: round2((1 - wounds) * runs[1]!.left),
    reachesAir,
  };
}
