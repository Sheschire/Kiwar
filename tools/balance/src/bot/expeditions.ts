import {
  HOUR_MS,
  KIWI,
  potentialLoot,
  applyCommand,
  availableCrew,
  buildCost,
  canAfford,
  eggCost,
  EXPEDITIONS,
  forecastExpedition,
  forecastWave,
  intelView,
  isLaunchpadBusy,
  kikiwiwiWeak,
  kiwiStrength,
  maxCrew,
  minCrew,
  nest,
  reconForecast,
  researchPower,
  RESOURCE_IDS,
  workersOf,
  type Building,
  type Command,
  type ExpeditionForecast,
  type FaceMap,
  type GameState,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';

/** A raid must bring back this much more than it costs (provisions eaten, kiwis lost). */
const RAID_MARGIN = 1.2;
/** After a raid that cost this many kiwis, the bot waits a day before the next one. */
const BAD_RAID = 2;
const DAY_MS = 24 * 3_600_000;
/** Share of an hour of work that an hour's worth of XP is worth (it pays back slowly). */
const XP_WORTH = 0.25;

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

/** What a kiwi is worth: the egg that replaces it, plus the levels it took to grow. */
function kiwiValue(state: GameState, v: Villager): number {
  const egg = eggCost(state);
  return ((egg.pulp ?? 0) + (egg.juice ?? 0)) * (1 + 0.15 * (v.level - 1));
}

/** What one kiwi has harvested in an hour, on average since the start (raw units). */
function workPerKiwiHour(state: GameState): number {
  const hours = Math.max(1, (state.now - state.createdAt) / HOUR_MS);
  const produced = RESOURCE_IDS.reduce((sum, id) => sum + state.stats.produced[id], 0);
  return produced / hours / Math.max(1, state.villagers.length);
}

/** A kiwi wounded in a victory: the work it misses while it heals. */
function woundValue(state: GameState): number {
  return (workPerKiwiHour(state) * EXPEDITIONS.victoryInjuryMs) / HOUR_MS;
}

/** Provisions for the round trip (loot may feed the return, but not reliably). */
function provisionsFor(f: ExpeditionForecast): { pulp: number; juice: number } {
  return { pulp: Math.ceil(f.needOneWay.pulp * 2.1), juice: Math.ceil(f.needOneWay.juice * 2.1) };
}

/** A wave strikes before the ship would be back (the crew would miss the defense). */
function waveBefore(state: GameState, returnAt: number): boolean {
  const w = forecastWave(state);
  return !!w && w.wave.at < returnAt;
}

function launchpadFree(state: GameState): Building | undefined {
  return state.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(state, b.id),
  );
}

function ok(state: GameState, map: FaceMap, cmd: Command): Command | null {
  return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
}

/** Reconnaissance: the scouts with the best report quality, one or two. */
function reconOrder(
  state: GameState,
  map: FaceMap,
  pad: Building,
  targetId: string,
): Command | null {
  const keep = keyKiwis(state);
  const crew = availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => reconForecast([b]).quality - reconForecast([a]).quality)
    .slice(0, 1)
    .map((v) => v.id);
  if (crew.length < minCrew('recon')) return null;
  const plan = {
    launchpadId: pad.id,
    targetId,
    crew,
    provisions: { pulp: 0, juice: 0 },
    mission: 'recon' as const,
  };
  const f = forecastExpedition(state, plan);
  if (!f || waveBefore(state, state.now + 2 * f.travelMs)) return null;
  return ok(state, map, { type: 'launchExpedition', ...plan, provisions: provisionsFor(f) });
}

/**
 * A raid when the shared forecast gives a likely victory and the loot (limited by the hold)
 * beats what the raid costs: the provisions eaten and the kiwis expected to fall.
 */
function raidOrder(
  state: GameState,
  map: FaceMap,
  pad: Building,
  targetId: string,
): { cmd: Command; value: number; cost: number } | null {
  const keep = keyKiwis(state);
  const target = state.targets.find((t) => t.id === targetId)!;
  // The strongest first; the Kikiwiwi (one per ship) when it can leave its post.
  const pool = availableCrew(state)
    .filter((v) => !keep.has(v.id) && !v.kikiwiwi)
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
  const titan = state.villagers.find(
    (v) =>
      v.kikiwiwi &&
      (v.job.kind === 'idle' || (v.job.kind === 'guard' && !forecastWave(state))) &&
      !kikiwiwiWeak(state),
  );
  // Plans are weighed as if the Kikiwiwi had already stood down from the rampart.
  const free: GameState =
    titan?.job.kind === 'guard'
      ? {
          ...state,
          villagers: state.villagers.map((v) =>
            v.id === titan.id ? { ...v, job: { kind: 'idle' as const } } : v,
          ),
        }
      : state;
  const most = maxCrew(free, pad);
  let best: { cmd: Command; value: number; cost: number } | null = null;
  for (let n = minCrew(); n <= Math.min(most, pool.length + (titan ? 1 : 0)); n++) {
    const crew = [...(titan ? [titan] : []), ...pool].slice(0, n).map((v) => v.id);
    const plan = { launchpadId: pad.id, targetId, crew, provisions: { pulp: 0, juice: 0 } };
    const dry = forecastExpedition(free, plan);
    if (!dry) return null;
    const provisions = provisionsFor(dry);
    const f = forecastExpedition(free, { ...plan, provisions })!;
    if (f.weight > f.cargo) break;
    if (f.odds !== 'likely' || !f.defense) continue;
    const ratio = f.strength.min / Math.max(f.defense.max, 1);
    const bonus = Math.min(2, 1 + 0.25 * (ratio - 1));
    const loot = potentialLoot(free, target.distance);
    const wanted = RESOURCE_IDS.reduce((sum, id) => sum + loot[id] * bonus, 0);
    const value = Math.min(wanted, f.lootRoom / EXPEDITIONS.resourceWeight);
    // A victory only wounds (chantier 18): the hours of work lost; a defeat costs the kiwis.
    const lost = f.woundsOnly
      ? f.expectedLosses * woundValue(state)
      : f.crew.reduce((sum, v) => sum + (f.risk[v.id] ?? 0) * kiwiValue(free, v), 0);
    // The crew's work while away (round trip), less the experience it brings back: a victory
    // is worth hours of work in XP (KIWI.expeditionXp against KIWI.xpPerHour.work).
    const xpHours = (KIWI.expeditionXp.base + KIWI.expeditionXp.victory) / KIWI.xpPerHour.work;
    const awayHours = Math.max(0, (2 * f.travelMs) / HOUR_MS - xpHours * XP_WORTH);
    const away = f.crew.length * awayHours * workPerKiwiHour(state);
    // Chantier 31: the launch costs fibre and juice per kiwi aboard.
    const fee = f.launchCost.fiber + f.launchCost.juice;
    const cost = f.needOneWay.pulp * 2 + f.needOneWay.juice * 2 + lost + away + fee;
    if (!best || value - cost > best.value - best.cost)
      best = { cmd: { type: 'launchExpedition', ...plan, provisions }, value, cost };
  }
  if (!best || best.value < best.cost * RAID_MARGIN) return null;
  const launch = best.cmd as Extract<Command, { type: 'launchExpedition' }>;
  const e = forecastExpedition(free, launch)!;
  if (waveBefore(state, state.now + 2 * e.travelMs)) return null;
  // The Kikiwiwi first stands down; the launch follows at the next decision.
  if (
    titan?.job.kind === 'guard' &&
    typeof launch.crew !== 'number' &&
    launch.crew.includes(titan.id)
  ) {
    const guards = state.villagers.filter((v) => v.job.kind === 'guard' && v.id !== titan.id);
    return { ...best, cmd: { type: 'setGarrison', villagerIds: guards.map((v) => v.id) } };
  }
  return ok(state, map, best.cmd) ? best : null;
}

/** Last raid that cost the colony dearly, if any (the bot waits a day after it). */
function recentBadRaid(state: GameState): boolean {
  return state.expeditions.some(
    (e) =>
      e.mission !== 'recon' &&
      e.result &&
      e.result.lostInBattle.length + e.result.lostOnReturn.length >= BAD_RAID &&
      state.now - e.returnAt < DAY_MS,
  );
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

/**
 * Chantier 18: expeditions to the twin face. A reconnaissance whenever the intel is missing or
 * stale, then raids that pay for themselves; the Kikiwiwi leaves the rampart for a raid when
 * no wave is announced.
 */
export function expeditionOrder(state: GameState, map: FaceMap): Command | null {
  const target = state.targets.find((t) => t.distance === 0) ?? state.targets[0];
  if (!target) return null;
  const pad = launchpadFree(state);
  if (!pad) return null;
  const intel = intelView(state, target.id, state.now);
  if (!intel || intel.freshness !== 'fresh') return reconOrder(state, map, pad, target.id);
  if (recentBadRaid(state)) return null;
  return raidOrder(state, map, pad, target.id)?.cmd ?? null;
}
