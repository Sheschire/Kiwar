import {
  applyCommand,
  availableCrew,
  beaconsOf,
  buildCost,
  canAfford,
  faceViewOf,
  forecastExpedition,
  isInner,
  isLaunchpadBusy,
  kiwiStrength,
  kiwiWeapon,
  LANDING,
  maxCrew,
  minCrew,
  nest,
  researchPower,
  waveAhead,
  WEAPONS,
  workersOf,
  type Building,
  type Command,
  type ExpeditionForecast,
  type FaceMap,
  type GameState,
  type LandingOrders,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';

/**
 * Chantier 40: the bot lands on the twin. It starts from the edge (the parcel it knows best,
 * the weakest first), then the centre once a beacon lights its edge; a crew is the strongest
 * kiwis with at least one who hits the bats, the smallest that wins all three practice
 * battles with few dead expected; cautious, back to the ship at half the crew, burning.
 */

const DAY_MS = 24 * 3_600_000;
/** After a landing that cost this many kiwis (or the ship), the bot waits a day. */
const BAD_LANDING = 2;
/** Parcels weighed per look (each costs a few practice battles per crew size). */
const CANDIDATES = 2;

const ORDERS: LandingOrders = { ...LANDING.defaultOrders, retreatAt: 0.5, goal: 'burn' };

/** Kiwis the colony cannot spare: the mayor, the builders and the best researcher. */
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

/** Provisions for the round trip. */
function provisionsFor(f: ExpeditionForecast): { pulp: number; juice: number } {
  return { pulp: Math.ceil(f.needOneWay.pulp * 2.1), juice: Math.ceil(f.needOneWay.juice * 2.1) };
}

/** A wave strikes before the ship would be back (the crew would miss the defense). */
function waveBefore(state: GameState, returnAt: number): boolean {
  const w = waveAhead(state);
  return !!w && w.wave.at < returnAt;
}

function launchpadFree(state: GameState): Building | undefined {
  return state.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(state, b.id),
  );
}

/** A landing that went badly lately (the ship lost, or kiwis dead). */
function recentBadLanding(state: GameState): boolean {
  return state.expeditions.some(
    (e) =>
      e.mission === 'land' &&
      e.result &&
      (e.result.outcome === 'defeat' || e.result.lostInBattle.length >= BAD_LANDING) &&
      state.now - e.arriveAt < DAY_MS,
  );
}

/** The parcels worth a look: no beacon, no landing on its way; the edge first, weakest seen. */
function candidates(state: GameState, targetId: string): number[] {
  const lit = new Set(beaconsOf(state, targetId));
  const face = faceViewOf(state, targetId);
  const flying = new Set(
    state.expeditions
      .filter((e) => e.mission === 'land' && e.status === 'outbound')
      .map((e) => e.sector),
  );
  const strength = (s: number) => face.parcels[String(s)]?.power.max ?? Infinity;
  return (
    Array.from({ length: 12 }, (_, s) => s)
      .filter((s) => !lit.has(s) && !flying.has(s))
      // An unseen centre parcel is formidable: only once a beacon lit its edge.
      .filter((s) => !isInner(s) || !!face.parcels[String(s)])
      .sort((a, b) => Number(isInner(a)) - Number(isInner(b)) || strength(a) - strength(b) || a - b)
      .slice(0, CANDIDATES)
  );
}

/** The strongest kiwis that may leave, the best bat-hitter first. */
function crewPool(state: GameState): Villager[] {
  const keep = keyKiwis(state);
  const pool = availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
  const air = pool.find((v) => WEAPONS[kiwiWeapon(v, state)].hitsAir);
  return air ? [air, ...pool.filter((v) => v !== air)] : pool;
}

/** A launchpad once the Library stands (the economy and research come first). */
export function launchpadOrder(
  state: GameState,
  build: (type: 'launchpad') => Command | null,
): Command | null {
  if (state.buildings.some((b) => b.type === 'launchpad')) return null;
  if (state.queue.some((i) => i.buildingType === 'launchpad')) return null;
  if (nest(state).level < 2 || !state.buildings.some((b) => b.type === 'library')) return null;
  return canAfford(state.resources, buildCost(state, 'launchpad')) ? build('launchpad') : null;
}

/** One landing on the twin when a parcel can be won with few losses, or null. */
export function expeditionOrder(state: GameState, map: FaceMap): Command | null {
  const target = state.targets.find((t) => t.distance === 0) ?? state.targets[0];
  if (!target || state.siege.conqueredAt > 0) return null;
  const pad = launchpadFree(state);
  if (!pad || recentBadLanding(state)) return null;
  const pool = crewPool(state);
  const most = Math.min(maxCrew(state, pad, 'land'), pool.length);
  for (const sector of candidates(state, target.id)) {
    for (let n = Math.max(minCrew('land'), 3); n <= most; n += 2) {
      const plan = {
        launchpadId: pad.id,
        targetId: target.id,
        crew: pool.slice(0, n).map((v) => v.id),
        provisions: { pulp: 0, juice: 0 },
        mission: 'land' as const,
        sector,
        orders: ORDERS,
      };
      const dry = forecastExpedition(state, plan);
      if (!dry) return null;
      const f = forecastExpedition(state, { ...plan, provisions: provisionsFor(dry) })!;
      if (f.weight > f.cargo) break;
      const l = f.landing;
      if (!l || l.odds !== 'likely' || l.expectedDead > Math.max(1, Math.floor(n / 5))) continue;
      if (waveBefore(state, state.now + 2 * f.travelMs)) return null;
      const cmd: Command = { type: 'launchExpedition', ...plan, provisions: provisionsFor(dry) };
      if (applyCommand(state, cmd, { now: state.now, map }).ok) return cmd;
    }
  }
  return null;
}
