import {
  applyCommand,
  availableCrew,
  beaconForecast,
  canAfford,
  faceViewOf,
  forecastExpedition,
  fortifyCost,
  fortifyLock,
  guardsOf,
  isLaunchpadBusy,
  kiwiStrength,
  kiwiWeapon,
  LANDING,
  launchCost,
  rations,
  techEffects,
  travelTime,
  maxCrew,
  meteorIronOf,
  queenOf,
  researchPower,
  twinTarget,
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
 * Chantier 42: the bot defends its beacons and challenges the queen. An announced attack: it
 * fortifies the beacon (4 h, before the strike), then sends a guard if the forecast still says
 * the beacon falls and a guard would hold it with at most one dead; once nothing threatens a
 * beacon its guard comes home. Once the queen is out: the final battle when the practice
 * battles give it a chance (her wounds of a lost battle make the next one easier).
 */

const DAY_MS = 24 * 3_600_000;
/** The bot fights the queen when the middle practice battle would leave her under this. */
const WEAR_DOWN = 0.15;
const GUARD_ORDERS: LandingOrders = { ...LANDING.defaultOrders, retreatAt: 0.5 };
const FINAL_ORDERS: LandingOrders = { ...LANDING.defaultOrders, retreatAt: 0.6, posture: 'bold' };

type Launch = Extract<Command, { type: 'launchExpedition' }>;

function freePad(state: GameState): Building | undefined {
  return state.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(state, b.id),
  );
}

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

/** The strongest kiwis that may leave (a Kikiwiwi too for the queen), a bat-hitter first. */
function pool(state: GameState, titan: boolean): Villager[] {
  const keep = keyKiwis(state);
  let titans = 0;
  const list = availableCrew(state)
    .filter((v) => !keep.has(v.id) && (!v.kikiwiwi || (titan && titans++ < 1)))
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
  const air = list.find((v) => WEAPONS[kiwiWeapon(v, state)].hitsAir);
  return air ? [air, ...list.filter((v) => v !== air)] : list;
}

function provisionsFor(f: ExpeditionForecast): { pulp: number; juice: number } {
  // Chantier 46: the guards brought home eat on the way back too (a crew of 0 sent to fetch
  // a guard took no rations at all, and the relieved starved).
  const back = (id: 'pulp' | 'juice') => Math.max(0, -f.returnSurplus[id]);
  return {
    pulp: Math.ceil(f.needOneWay.pulp * 2.1 + back('pulp') * 1.1),
    juice: Math.ceil(f.needOneWay.juice * 2.1 + back('juice') * 1.1),
  };
}

function launchable(state: GameState, map: FaceMap, plan: Omit<Launch, 'type' | 'provisions'>) {
  const dry = forecastExpedition(state, { ...plan, provisions: { pulp: 0, juice: 0 } });
  if (!dry) return null;
  const cmd: Launch = { type: 'launchExpedition', ...plan, provisions: provisionsFor(dry) };
  return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
}

/** Fortify the threatened beacon, send it a guard, or bring an idle guard home. */
export function beaconOrder(state: GameState, map: FaceMap): Command | null {
  const twin = twinTarget(state);
  if (!twin || state.siege.conqueredAt > 0) return null;
  const face = faceViewOf(state, twin.id);
  const a = face.attack;
  const threatened = a?.announced && a.sector !== null && a.at > state.now ? a.sector : null;
  if (threatened !== null && a?.origin !== null && a?.origin !== undefined) {
    const sector = threatened;
    const cost = fortifyCost(state);
    if (
      fortifyLock(state, twin.id, sector) === null &&
      canAfford(state.resources, cost.resources) &&
      meteorIronOf(state) >= cost.iron
    )
      return { type: 'fortifyBeacon', targetId: twin.id, sector };
    const f = beaconForecast(state, twin.id, sector, a.origin, state.now);
    const pad = freePad(state);
    if (f && f.odds !== 'likely' && pad) {
      const b = face.beacons.find((x) => x.sector === sector)!;
      const here = guardsOf(state, b);
      const crewPool = pool(state, false);
      const most = Math.min(maxCrew(state, pad, 'guard'), crewPool.length);
      for (let n = 2; n <= most; n += 2) {
        const crew = crewPool.slice(0, n);
        const g = beaconForecast(state, twin.id, sector, a.origin, state.now, [...here, ...crew]);
        if (!g || g.odds !== 'likely' || g.expectedDead > 1) continue;
        const cmd = launchable(state, map, {
          launchpadId: pad.id,
          targetId: twin.id,
          crew: crew.map((v) => v.id),
          mission: 'guard',
          sector,
          orders: GUARD_ORDERS,
        });
        // In time only: the guard must land before the strike.
        if (cmd && state.now + forecastExpedition(state, cmd)!.travelMs < a.at) return cmd;
        break;
      }
    }
  }
  // Nothing threatens a guarded beacon any more: its guard comes home to work.
  if (threatened === null) {
    const pad = freePad(state);
    const b = face.beacons.find((x) => (x.guards?.length ?? 0) > 0);
    if (pad && b)
      return launchable(state, map, {
        launchpadId: pad.id,
        targetId: twin.id,
        crew: [],
        mission: 'guard',
        sector: b.sector,
        bringBack: [...b.guards!],
      });
  }
  return null;
}

/** The final battle once the queen is out and the practice battles give it a chance. */
export function finalOrder(state: GameState, map: FaceMap): Command | null {
  const twin = twinTarget(state);
  if (!twin || state.siege.conqueredAt > 0 || !queenOf(state, twin.id)) return null;
  const pad = freePad(state);
  if (!pad) return null;
  const lost = state.expeditions.some(
    (e) => e.mission === 'final' && e.result && state.now - e.arriveAt < DAY_MS / 2,
  );
  if (lost) return null;
  const crewPool = pool(state, true);
  const most = Math.min(maxCrew(state, pad, 'final'), crewPool.length);
  // The biggest crew the colony can pay for (the fee grows with every seat).
  for (let n = most; n >= 4; n--) {
    const crew = crewPool.slice(0, n);
    const fee = launchCost(state, crew, 'final');
    const travel = travelTime(twin, pad, crew, 'final', techEffects(state).travel);
    const eat = rations(state, crew, travel);
    const need = {
      ...fee,
      pulp: fee.pulp + Math.ceil(eat.pulp * 2.1),
      juice: fee.juice + Math.ceil(eat.juice * 2.1),
    };
    if (!canAfford(state.resources, need)) continue;
    const dry = forecastExpedition(state, {
      launchpadId: pad.id,
      targetId: twin.id,
      crew: crew.map((v) => v.id),
      provisions: { pulp: 0, juice: 0 },
      mission: 'final',
      orders: FINAL_ORDERS,
    });
    if (!dry) return null;
    const won = dry.landing?.trials.filter((x) => x === 'victory').length ?? 0;
    // A practice battle won, or one that would leave her nearly fallen (her wounds stay).
    if (won === 0 && (dry.landing?.queenLeft ?? 1) > WEAR_DOWN) return null;
    return launchable(state, map, {
      launchpadId: pad.id,
      targetId: twin.id,
      crew: crew.map((v) => v.id),
      mission: 'final',
      orders: FINAL_ORDERS,
    });
  }
  return null;
}
