import {
  applyCommand,
  availableCrew,
  BUILDINGS,
  COLONY,
  forecastExpedition,
  foundLock,
  isLaunchpadBusy,
  kiwiStrength,
  researchPower,
  RESOURCE_IDS,
  twinTarget,
  workersOf,
  type Building,
  type Command,
  type ExpeditionForecast,
  type ExpeditionPlan,
  type FaceMap,
  type GameState,
  type Resources,
  type VillagerId,
} from '@kiwar/shared';

/**
 * Chantier 19, after chantier 40: on a conquered twin (older saves; the conquest returns with
 * chantier 42) the bot sends the settlers' ship that founds the second colony.
 */

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

/** The settlers' ship once the twin is conquered, or null. */
export function siegeOrder(state: GameState, map: FaceMap): Command | null {
  const twin = twinTarget(state);
  if (!twin || state.siege.conqueredAt === 0) return null;
  const pad = freePad(state);
  return pad ? found(state, map, pad, twin.id) : null;
}
