import { nextMonumentDust } from './sky';
import {
  buildLock,
  applyCommand,
  buildCost,
  canAfford,
  HEART,
  infusionRisk,
  KIKIWIWI,
  kikiwiwiCap,
  kikiwiwiCount,
  kikiwiwiWeak,
  laboratoryOf,
  OBSTACLE_RULES,
  techEffects,
  titanAt,
  hexDistance,
  nest,
  type BuildingType,
  type Command,
  type FaceMap,
  type GameState,
  stardustOf,
  currentObjective,
  pendingUpgrade,
} from '@kiwar/shared';
import { upgradeOk } from './economy';

/** Juice kept aside for the Kikiwiwis' upkeep before spending on infusions and works. */
export const JUICE_RESERVE = 1500;

/**
 * Kikiwiwis: transform the safest candidate when the cap allows it, then keep each one on the
 * rampart, sent now and then to smash a rock or a wreck when the juice allows it.
 */
export function titanOrders(state: GameState, map: FaceMap): Command | null {
  const lab = laboratoryOf(state);
  if (
    lab &&
    kikiwiwiCount(state) < kikiwiwiCap(state) &&
    !state.villagers.some((v) => v.job.kind === 'transform') &&
    state.resources.juice >= (KIKIWIWI.cost.juice ?? 0) + JUICE_RESERVE &&
    stardustOf(state) >= KIKIWIWI.stardust + nextMonumentDust(state) &&
    canAfford(state.resources, KIKIWIWI.cost)
  ) {
    const best = state.villagers
      .filter(
        (v) =>
          !v.kikiwiwi &&
          v.level >= KIKIWIWI.minLevel &&
          v.classId !== 'mayor' &&
          (v.job.kind === 'idle' || v.job.kind === 'work'),
      )
      .sort((a, b) => infusionRisk(state, a, lab) - infusionRisk(state, b, lab))[0];
    if (best) return { type: 'transform', villagerId: best.id, labId: lab.id };
  }
  for (const v of state.villagers) {
    if (!v.kikiwiwi || (v.job.kind !== 'idle' && v.job.kind !== 'guard')) continue;
    const target = state.obstacles
      .filter((o) => o.kind !== 'stump' && !titanAt(state, o.q, o.r))
      .sort((a, b) => hexDistance(a, HEART) - hexDistance(b, HEART))[0];
    if (target && state.resources.juice >= JUICE_RESERVE * 1.5 && !kikiwiwiWeak(state)) {
      const cmd: Command = {
        type: 'titanWork',
        villagerId: v.id,
        q: target.q,
        r: target.r,
        work: 'smash',
      };
      if (applyCommand(state, cmd, { now: state.now, map }).ok) return cmd;
    }
    if (v.job.kind === 'idle')
      return {
        type: 'setGarrison',
        villagerIds: [
          ...state.villagers.filter((x) => x.job.kind === 'guard').map((x) => x.id),
          v.id,
        ],
      };
  }
  return null;
}

/** The laboratory as soon as it is known and affordable; a stump cleared when the queue is idle. */
export function labDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  // Chantier 38: only once it can be built (the lab needs the Nest 7: an order that always
  // failed froze the bot before the Nest's own upgrade).
  if (techEffects(state).laboratory && !has('lab') && buildLock(state, 'lab') === null) {
    if (canAfford(state.resources, buildCost(state, 'lab'))) return build('lab');
  }
  // A stump costs a few meals (40 pulp): any colony can afford it (chantier 12: a 400 pulp
  // threshold made only pulp-rich biomes clear them, and their fiber loot sped up the Nest 3).
  const meals = (OBSTACLE_RULES.clearCost.pulp ?? 0) * 2;
  // Chantier 15: not while saving up for the Nest (a stump holds a construction place for an
  // hour, the Nest 3 waited behind it).
  const n = nest(state);
  const savingForNest =
    !currentObjective(state) && upgradeOk(state, n) && !pendingUpgrade(state, n.id);
  if (state.queue.length === 0 && n.level >= 2 && !savingForNest && state.resources.pulp >= meals) {
    const stump = state.obstacles
      .filter((o) => o.kind === 'stump')
      .sort((a, b) => hexDistance(a, HEART) - hexDistance(b, HEART))[0];
    if (stump) return { type: 'clearObstacle', q: stump.q, r: stump.r };
  }
  return null;
}
