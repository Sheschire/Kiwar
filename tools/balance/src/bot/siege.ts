import {
  applyCommand,
  assaultLock,
  availableCrew,
  BUILDINGS,
  COLONY,
  counterForecast,
  EXPEDITIONS,
  finalLock,
  forecastExpedition,
  fortifyLock,
  foundLock,
  isLaunchpadBusy,
  kikiwiwiWeak,
  kiwiStrength,
  maxCrew,
  outerOf,
  reconForecast,
  researchPower,
  RESOURCE_IDS,
  SIEGE,
  siegeLock,
  siegeView,
  strengthOf,
  twinTarget,
  workersOf,
  type Building,
  type Command,
  type ExpeditionForecast,
  type ExpeditionPlan,
  type FaceMap,
  type GameState,
  type MissionKind,
  type Resources,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';

/**
 * Chantier 19: the bot besieges the twin face. Deep reconnaissance until the queen and the
 * holds are known, assaults on the weakest holds with a margin, reinforcements before a
 * counter-attack it would lose, its Kikiwiwi posted on a bridgehead to fortify it, the final
 * assault once the forecast is likely, then the settlers' ship. It plays on its own state,
 * garrison included (local game): the same rules as a player, never the hidden numbers.
 */

/** An assault leaves only when its weakest luck beats the strongest estimate by this much. */
const ASSAULT_MARGIN = 1.15;
/** Settlers of the founding ship, and the share of each stock (up to the Nest 1) they carry. */
const SETTLERS = 6;
const FREIGHT_SHARE = 0.3;

type Launch = Extract<Command, { type: 'launchExpedition' }>;

function freePad(state: GameState): Building | undefined {
  return state.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(state, b.id),
  );
}

/** The mayor, the builders and the best researcher stay home. */
function keyKiwis(state: GameState): Set<VillagerId> {
  const keep = new Set<VillagerId>();
  for (const v of state.villagers)
    if (v.classId === 'mayor' || v.classId === 'builder') keep.add(v.id);
  const library = state.buildings.find((b) => b.type === 'library');
  if (library) {
    const best = workersOf(state, library.id).sort(
      (a, b) => researchPower(b) - researchPower(a),
    )[0];
    if (best) keep.add(best.id);
  }
  return keep;
}

/** Strongest kiwis that may leave (no Kikiwiwi: it goes on its own). */
function fighters(state: GameState): Villager[] {
  const keep = keyKiwis(state);
  return availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
}

function provisionsFor(f: ExpeditionForecast): { pulp: number; juice: number } {
  return { pulp: Math.ceil(f.needOneWay.pulp * 2.1), juice: Math.ceil(f.needOneWay.juice * 2.1) };
}

/** The plan with its provisions, if it fits and the command would be accepted. */
function launchable(state: GameState, map: FaceMap, plan: ExpeditionPlan): Launch | null {
  const dry = forecastExpedition(state, plan);
  if (!dry) return null;
  const cmd: Launch = {
    type: 'launchExpedition',
    ...(plan as Omit<Launch, 'type'>),
    provisions: provisionsFor(dry),
  };
  return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
}

function inFlight(state: GameState, mission: MissionKind): boolean {
  return state.expeditions.some((e) => e.mission === mission && e.status === 'outbound');
}

/** The Kikiwiwi at home, able to fly (it leaves the rampart first). */
function homeTitan(state: GameState): Villager | undefined {
  return state.villagers.find(
    (v) => v.kikiwiwi && (v.job.kind === 'idle' || v.job.kind === 'guard') && !kikiwiwiWeak(state),
  );
}

/** The Kikiwiwi on the rampart must stand down before boarding. */
function standDown(state: GameState, titan: Villager): Command | null {
  if (titan.job.kind !== 'guard') return null;
  const guards = state.villagers.filter((v) => v.job.kind === 'guard' && v.id !== titan.id);
  return { type: 'setGarrison', villagerIds: guards.map((v) => v.id) };
}

function recon(state: GameState, map: FaceMap, pad: Building, targetId: string): Command | null {
  const keep = keyKiwis(state);
  const scout = availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => reconForecast([b]).quality - reconForecast([a]).quality)[0];
  if (!scout) return null;
  return launchable(state, map, {
    launchpadId: pad.id,
    targetId,
    crew: [scout.id],
    provisions: { pulp: 0, juice: 0 },
    mission: 'recon',
  });
}

/** The smallest crew that wins the assault with a margin; most of it stays on the post. */
function assault(
  state: GameState,
  map: FaceMap,
  pad: Building,
  targetId: string,
  sector: number,
): Command | null {
  // The Kikiwiwi leads the first assault and stays: it fortifies the bridgehead at once.
  const titan =
    state.siege.bridgeheads.length === 0 && !state.villagers.some((v) => v.job.kind === 'outpost')
      ? homeTitan(state)
      : undefined;
  const pool = [...(titan ? [titan] : []), ...fighters(state)];
  const most = Math.min(maxCrew(state, pad, 'assault') + (titan ? 1 : 0), pool.length);
  const view = siegeView(state, state.now).holds[sector];
  if (!view) return null;
  for (let n = EXPEDITIONS.minCrew; n <= most; n++) {
    const crew = pool.slice(0, n);
    const strength = strengthOf(state, crew, 1) * (1 - EXPEDITIONS.luck);
    if (strength < view.max * ASSAULT_MARGIN) continue;
    if (titan?.job.kind === 'guard') return standDown(state, titan);
    // Holders: the strongest half (the others bring the ship home); reinforcements follow
    // before a counter-attack they would lose.
    const holders = crew.slice(0, Math.max(1, Math.ceil(n / 2))).map((v) => v.id);
    return launchable(state, map, {
      launchpadId: pad.id,
      targetId,
      crew: crew.map((v) => v.id),
      provisions: { pulp: 0, juice: 0 },
      mission: 'assault',
      sector,
      holders,
    });
  }
  return null;
}

/** Kiwis flown to a bridgehead (no fight). */
function reinforce(
  state: GameState,
  map: FaceMap,
  pad: Building,
  targetId: string,
  sector: number,
  crew: Villager[],
): Command | null {
  if (crew.length === 0) return null;
  return launchable(state, map, {
    launchpadId: pad.id,
    targetId,
    crew: crew.map((v) => v.id),
    provisions: { pulp: 0, juice: 0 },
    mission: 'reinforce',
    sector,
  });
}

/** Before a counter-attack the holders would lose: the strongest kiwis that tip it. */
function shoreUp(state: GameState, map: FaceMap, pad: Building, targetId: string): Command | null {
  const c = counterForecast(state, state.now);
  if (!c || !c.announced || !c.enemy || c.odds === 'likely') return null;
  if (inFlight(state, 'reinforce')) return null;
  const b = state.siege.bridgeheads.find((x) => x.sector === c.sector);
  if (!b) return null;
  const k = SIEGE.holdBonus * (b.fortified ? SIEGE.fortify.bonus : 1);
  const need =
    (c.enemy.max * 1.1) / k / (1 - EXPEDITIONS.luck) - c.strength.max / (1 + EXPEDITIONS.luck);
  const pool = fighters(state);
  const room = maxCrew(state, pad, 'reinforce');
  const crew: Villager[] = [];
  for (const v of pool) {
    if (crew.length >= room || strengthOf(state, crew, 1) >= need) break;
    crew.push(v);
  }
  return reinforce(state, map, pad, targetId, c.sector, crew);
}

/** The final assault: as many as the hold takes, the Kikiwiwi if at home, when likely. */
function finalAssault(
  state: GameState,
  map: FaceMap,
  pad: Building,
  targetId: string,
): Command | null {
  const titan = homeTitan(state);
  const pool = fighters(state);
  const seats = Math.floor(maxCrew(state, pad, 'final') * 0.75);
  const crew = [...(titan ? [titan] : []), ...pool].slice(0, seats).map((v) => v.id);
  const plan: ExpeditionPlan = {
    launchpadId: pad.id,
    targetId,
    crew,
    provisions: { pulp: 0, juice: 0 },
    mission: 'final',
  };
  const f = forecastExpedition(state, plan);
  if (!f || f.odds !== 'likely') return null;
  if (titan && titan.job.kind === 'guard') return standDown(state, titan);
  return launchable(state, map, plan);
}

/** The settlers' ship: the kiwis that matter least here, and some of every stock. */
function found(state: GameState, map: FaceMap, pad: Building, targetId: string): Command | null {
  if (foundLock(state)) return null;
  const keep = keyKiwis(state);
  const settlers = availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => kiwiStrength(a) - kiwiStrength(b))
    .slice(0, SETTLERS);
  if (settlers.length < COLONY.minSettlers) return null;
  const cap = BUILDINGS.nest.levels[0]?.storage ?? 0;
  const freight = {} as Resources;
  for (const id of RESOURCE_IDS)
    freight[id] = Math.floor(Math.min(cap, state.resources[id] * FREIGHT_SHARE));
  const plan = (load: Resources): ExpeditionPlan => ({
    launchpadId: pad.id,
    targetId,
    crew: settlers.map((v) => v.id),
    provisions: { pulp: 0, juice: 0 },
    mission: 'found',
    freight: load,
  });
  // Lighten the freight until the hold takes it.
  for (let share = 1; share > 0.05; share *= 0.7) {
    const load = {} as Resources;
    for (const id of RESOURCE_IDS) load[id] = Math.floor(freight[id] * share);
    const cmd = launchable(state, map, plan(load));
    if (cmd) return cmd;
  }
  return null;
}

/** One siege decision, or null when nothing is worth doing now. */
export function siegeOrder(state: GameState, map: FaceMap): Command | null {
  const twin = twinTarget(state);
  if (!twin) return null;
  const pad = freePad(state);
  if (state.siege.conqueredAt > 0) return pad ? found(state, map, pad, twin.id) : null;
  if (siegeLock(state)) return null;
  // A Kikiwiwi on a bridgehead fortifies it.
  for (const b of state.siege.bridgeheads)
    if (fortifyLock(state, b.sector) === null)
      return { type: 'fortifyBridgehead', sector: b.sector };
  if (!pad) return null;
  const counter = shoreUp(state, map, pad, twin.id);
  if (counter) return counter;
  const view = siegeView(state, state.now);
  const heads = state.siege.bridgeheads;
  const assaults = state.expeditions.filter(
    (e) => e.mission === 'assault' && e.status === 'outbound',
  );
  // The final assault as soon as it is allowed and likely.
  if (finalLock(state) === null && !inFlight(state, 'final')) {
    const final = finalAssault(state, map, pad, twin.id);
    if (final) return final;
  }
  // The Kikiwiwi goes to a bridgehead to fortify it (one is enough).
  const fortified = heads.some((b) => b.fortified || b.fortifyUntil !== undefined);
  const titanPosted = state.villagers.some((v) => v.kikiwiwi && v.job.kind === 'outpost');
  if (heads.length > 0 && !fortified && !titanPosted && !inFlight(state, 'reinforce')) {
    const titan = homeTitan(state);
    if (titan && state.resources.juice >= SIEGE.fortify.juice) {
      if (titan.job.kind === 'guard') return standDown(state, titan);
      const cmd = reinforce(state, map, pad, twin.id, heads[0]!.sector, [titan]);
      if (cmd) return cmd;
    }
  }
  // Bridgeheads: two, then the one beside the queen's lair when the final is not likely yet.
  const wanted = heads.length + assaults.length < SIEGE.neededBridgeheads;
  const beside = view.queen ? outerOf(view.queen.sector) : null;
  const third =
    !wanted &&
    heads.length + assaults.length < SIEGE.maxBridgeheads &&
    finalLock(state) === null &&
    beside !== null;
  if (wanted || third) {
    const known = SIEGE.outerSectors
      .filter((s) => assaultLock(state, s) === null && view.holds[s])
      .sort((a, b) =>
        third
          ? a === beside
            ? -1
            : b === beside
              ? 1
              : 0
          : view.holds[a]!.max - view.holds[b]!.max,
      );
    for (const sector of third ? known.slice(0, 1) : known) {
      const cmd = assault(state, map, pad, twin.id, sector);
      if (cmd) return cmd;
    }
  }
  // Deep reconnaissance until the queen and enough holds are known.
  const knownHolds = SIEGE.outerSectors.filter((s) => view.holds[s]).length;
  if ((!view.queen || knownHolds < 3) && !inFlight(state, 'recon'))
    return recon(state, map, pad, twin.id);
  return null;
}

/** Diagnostics for the probe: the best assault the colony can field against the known holds. */
export function siegeDebug(state: GameState): string {
  const pad = state.buildings.find((b) => b.type === 'launchpad');
  if (!pad) return 'no pad';
  const pool = fighters(state);
  const most = Math.min(maxCrew(state, pad, 'assault'), pool.length);
  const best = strengthOf(state, pool.slice(0, most), 1) * (1 - EXPEDITIONS.luck);
  const view = siegeView(state, state.now);
  const holds = SIEGE.outerSectors
    .filter((s) => view.holds[s])
    .map((s) => `${s}:${view.holds[s]!.min.toFixed(0)}-${view.holds[s]!.max.toFixed(0)}`)
    .join(' ');
  const f = finalLock(state);
  return `pool ${pool.length} (max ${most}) best ${best.toFixed(1)} · holds ${holds || '?'} · queen ${view.queen ? 'known' : '?'} · final ${f ?? 'ok'}`;
}
