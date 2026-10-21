import { CALENDAR } from '../data/cycles';
import { ALIENS, EXPEDITIONS, INTEL } from '../data/expeditions';
import { emptyResources } from '../data/resources';
import { SIEGE } from '../data/siege';
import { GARRISON } from '../data/threats';
import { createRng } from '../rng/rng';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import {
  crewMembers,
  drawLosses,
  lossShare,
  rations,
  removeVillagers,
  shipOf,
  strengthOf,
  type Odds,
} from './expeditions';
import { ageOf } from './research';
import {
  nextId,
  withRng,
  type AlienGarrison,
  type Bridgehead,
  type DatedRange,
  type Expedition,
  type ExpeditionTarget,
  type GameState,
  type IntelRange,
  type MissionKind,
  type SiegeIntel,
  type Villager,
} from './state';
import { guardPower, type Sides } from './threats';
import type { Freshness } from './aliens';

/**
 * Chantier 19: the siege of the twin face (see `data/siege.ts`). The truth (holds, queen) is
 * derived from the garrison's secret seed, so it exists only where `state.aliens` does (the
 * server online); everything here that reads it is resolved at events the client skips.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Missions of the siege (resolved here at landing, apart from raids and reconnaissance). */
export function isSiegeMission(m: MissionKind): boolean {
  return m === 'assault' || m === 'reinforce' || m === 'final' || m === 'retreat';
}

export function isOuterSector(sector: number): boolean {
  return SIEGE.outerSectors.includes(sector);
}

/** Outer sector of the slice of an inner sector (the one beside the queen's lair). */
export function outerOf(inner: number): number {
  return inner + INTEL.sectors / 2;
}

/** The alien-held other face of our own kiwi: the only face a siege can take. */
export function twinTarget(state: Pick<GameState, 'targets'>): ExpeditionTarget | undefined {
  return state.targets.find((t) => t.distance === 0);
}

export type SiegeLock = 'unknownTarget' | 'conquered' | 'ageTooLow' | 'needsKikiwiwi';

/** Why the siege cannot go on (new assaults, deep reconnaissance, the final assault). */
export function siegeLock(state: GameState): SiegeLock | null {
  if (!twinTarget(state)) return 'unknownTarget';
  if (state.siege.conqueredAt > 0) return 'conquered';
  if (ageOf(state) < SIEGE.minAge) return 'ageTooLow';
  if (!state.villagers.some((v) => v.kikiwiwi)) return 'needsKikiwiwi';
  return null;
}

// --- The truth (hidden) ---------------------------------------------------------------------

export interface SiegeTruth {
  /** Base strength of the aliens holding each outer sector. */
  holds: Record<number, number>;
  /** Inner sector of the queen's lair. */
  queenSector: number;
  queen: Sides;
}

const truths = new Map<string, SiegeTruth>();

/** What the siege really faces, drawn from the garrison's secret seed (never stored). */
export function siegeTruth(g: Pick<AlienGarrison, 'seed'>): SiegeTruth {
  const cached = truths.get(g.seed);
  if (cached) return cached;
  const rng = createRng(`${g.seed}/siege`);
  const holds: Record<number, number> = {};
  for (const s of SIEGE.outerSectors)
    holds[s] = round1(SIEGE.hold.base * rng.range(...SIEGE.hold.spread));
  const queenSector = rng.int(0, INTEL.sectors / 2 - 1);
  const q = SIEGE.queen;
  const truth = {
    holds,
    queenSector,
    queen: {
      ground: round1(q.ground * rng.range(...q.spread)),
      air: round1(q.air * rng.range(...q.spread)),
    },
  };
  if (truths.size > 256) truths.clear();
  truths.set(g.seed, truth);
  return truth;
}

/** The face's aliens grow like its garrison (same rate, same cap). */
export function siegeGrowth(g: AlienGarrison, at: TimeMs): number {
  const days = Math.max(0, at - g.since) / CALENDAR.dayMs;
  const rate = g.defense > 0 ? g.growth / g.defense : 0;
  return 1 + Math.min(rate * days, ALIENS.maxGrowth - 1);
}

export function holdStrength(g: AlienGarrison, sector: number, at: TimeMs): number {
  return round1((siegeTruth(g).holds[sector] ?? 0) * siegeGrowth(g, at));
}

/** Share of the queen's power the bridgeheads take away. */
export function queenReduction(
  bridgeheads: readonly Pick<Bridgehead, 'sector'>[],
  queenSector: number | null,
): number {
  const q = SIEGE.queen;
  const beside = queenSector !== null && bridgeheads.some((b) => b.sector === outerOf(queenSector));
  return Math.min(0.9, q.perBridgehead * bridgeheads.length + (beside ? q.besideQueen : 0));
}

/** The queen's real power at a time, weakened by the bridgeheads held. */
export function queenPower(state: GameState, g: AlienGarrison, at: TimeMs): Sides {
  const t = siegeTruth(g);
  const k = siegeGrowth(g, at) * (1 - queenReduction(state.siege.bridgeheads, t.queenSector));
  return { ground: round1(t.queen.ground * k), air: round1(t.queen.air * k) };
}

/** Escalation of the counter-attacks (each one hits harder). */
export function counterEscalation(counters: number): number {
  return Math.min(SIEGE.counter.maxEscalation, 1 + SIEGE.counter.perCounter * counters);
}

// --- Public views ---------------------------------------------------------------------------

export function bridgeheadAt(state: GameState, sector: number): Bridgehead | undefined {
  return state.siege.bridgeheads.find((b) => b.sector === sector);
}

export function holdersOf(state: GameState, b: Pick<Bridgehead, 'holders'>): Villager[] {
  return crewMembers(state, b.holders);
}

/** Strength of a bridgehead's holders: cover, fortification (no luck). */
export function holdDefense(state: GameState, b: Bridgehead): number {
  const k = SIEGE.holdBonus * (b.fortified ? SIEGE.fortify.bonus : 1);
  return strengthOf(state, holdersOf(state, b), 1) * k;
}

/** What one kiwi brings against the queen: the garrison's class affinities (sides). */
export function fighterSides(state: GameState, v: Villager, fed = 1): Sides {
  const p = guardPower(v, state);
  const hunger = EXPEDITIONS.starvingStrength + (1 - EXPEDITIONS.starvingStrength) * fed;
  return {
    ground: (p.ground / GARRISON.power) * hunger,
    air: (p.air / GARRISON.power) * hunger,
  };
}

/** Kiwis posted on every bridgehead. */
export function allHolders(state: GameState): Villager[] {
  return state.siege.bridgeheads.flatMap((b) => holdersOf(state, b));
}

/** Sides of the final assault: the ship's crew and every posted kiwi. */
export function assaultSides(state: GameState, crew: readonly Villager[], fed: number): Sides {
  const out = { ground: 0, air: 0 };
  const add = (v: Villager, f: number) => {
    const s = fighterSides(state, v, f);
    out.ground += s.ground;
    out.air += s.air;
  };
  for (const v of crew) add(v, fed);
  for (const v of allHolders(state)) add(v, 1);
  return out;
}

export interface AgedRange extends IntelRange {
  days: number;
  freshness: Freshness;
}

/** A dated range widened for what may have grown since. */
export function ageRange(r: DatedRange, now: TimeMs): AgedRange {
  const days = Math.max(0, now - r.at) / CALENDAR.dayMs;
  const grow = Math.min(1 + ALIENS.growthPerDay[1] * days, ALIENS.maxGrowth);
  return {
    min: r.min,
    max: round1(r.max * grow),
    days,
    freshness: days < INTEL.fresh ? 'fresh' : days < INTEL.stale ? 'stale' : 'old',
  };
}

export interface SiegeView {
  seen: number[];
  holds: Record<number, AgedRange>;
  queen: { sector: number; ground: AgedRange; air: AgedRange } | null;
}

/** What we know of the siege, aged to `now`. */
export function siegeView(state: GameState, now: TimeMs): SiegeView {
  const twin = twinTarget(state);
  const intel = twin ? state.intel[twin.id]?.siege : undefined;
  const holds: Record<number, AgedRange> = {};
  for (const [k, r] of Object.entries(intel?.holds ?? {})) holds[Number(k)] = ageRange(r, now);
  const q = intel?.queen;
  return {
    seen: intel?.seen ?? [],
    holds,
    queen: q
      ? { sector: q.sector, ground: ageRange(q.ground, now), air: ageRange(q.air, now) }
      : null,
  };
}

/** Assaults and reinforcements on their way, per mission. */
function inFlight(state: GameState, mission: MissionKind): Expedition[] {
  return state.expeditions.filter((e) => e.mission === mission && e.status === 'outbound');
}

export type AssaultLock =
  SiegeLock | 'notASector' | 'sectorUnseen' | 'bridgeheadHere' | 'bridgeheadLimit';

/** Why an assault on this outer sector cannot leave. */
export function assaultLock(state: GameState, sector: number): AssaultLock | null {
  const lock = siegeLock(state);
  if (lock) return lock;
  if (!isOuterSector(sector)) return 'notASector';
  const twin = twinTarget(state)!;
  if (!(state.intel[twin.id]?.sectors ?? []).includes(sector)) return 'sectorUnseen';
  const flying = inFlight(state, 'assault');
  if (bridgeheadAt(state, sector) || flying.some((e) => e.sector === sector))
    return 'bridgeheadHere';
  if (state.siege.bridgeheads.length + flying.length >= SIEGE.maxBridgeheads)
    return 'bridgeheadLimit';
  return null;
}

export type FinalLock = SiegeLock | 'queenUnknown' | 'needBridgeheads' | 'needFortified';

/** Why the final assault cannot leave. */
export function finalLock(state: GameState): FinalLock | null {
  const lock = siegeLock(state);
  if (lock) return lock;
  if (!siegeView(state, state.now).queen) return 'queenUnknown';
  if (state.siege.bridgeheads.length < SIEGE.neededBridgeheads) return 'needBridgeheads';
  if (!state.siege.bridgeheads.some((b) => b.fortified)) return 'needFortified';
  return null;
}

export type FortifyLock =
  | 'noBridgehead'
  | 'notAKikiwiwi'
  | 'alreadyFortified'
  | 'fortifying'
  | 'kikiwiwiWeak'
  | 'notEnoughResources';

/** Why this bridgehead cannot be fortified now. */
export function fortifyLock(state: GameState, sector: number): FortifyLock | null {
  const b = bridgeheadAt(state, sector);
  if (!b) return 'noBridgehead';
  if (b.fortified) return 'alreadyFortified';
  if (b.fortifyUntil !== undefined) return 'fortifying';
  if (!holdersOf(state, b).some((v) => v.kikiwiwi)) return 'notAKikiwiwi';
  if (state.resources.juice < SIEGE.fortify.juice) return 'notEnoughResources';
  return null;
}

/** A Kikiwiwi posted there starts fortifying the bridgehead (validated by `fortifyLock`). */
export function startFortify(state: GameState, sector: number, now: TimeMs): void {
  const b = bridgeheadAt(state, sector)!;
  const titan = holdersOf(state, b).find((v) => v.kikiwiwi)!;
  state.resources.juice -= SIEGE.fortify.juice;
  b.fortifyUntil = now + SIEGE.fortify.durationMs;
  b.fortifierId = titan.id;
}

// --- Forecasts ------------------------------------------------------------------------------

function oddsOf(strength: IntelRange, enemy: IntelRange | null): Odds {
  if (!enemy) return 'unknown';
  if (strength.min >= enemy.max) return 'likely';
  if (strength.max >= enemy.min) return 'uncertain';
  return 'unlikely';
}

const luckRange = (v: number): IntelRange => ({
  min: v * (1 - EXPEDITIONS.luck),
  max: v * (1 + EXPEDITIONS.luck),
});

export interface CounterForecast {
  sector: number;
  at: TimeMs;
  announced: boolean;
  /** Holders' strength (luck range) and the aliens' estimated strength (null: hold unknown). */
  strength: IntelRange;
  enemy: IntelRange | null;
  odds: Odds;
}

/** The next counter-attack as the player can foresee it (public numbers only). */
export function counterForecast(state: GameState, now: TimeMs): CounterForecast | null {
  const c = state.siege.counter;
  if (!c) return null;
  const b = bridgeheadAt(state, c.sector) ?? state.siege.bridgeheads[0];
  if (!b) return null;
  const strength = luckRange(holdDefense(state, b));
  const hold = siegeView(state, now).holds[b.sector];
  const k = counterEscalation(state.siege.counters);
  const enemy = hold
    ? { min: hold.min * SIEGE.counter.share[0] * k, max: hold.max * SIEGE.counter.share[1] * k }
    : null;
  return {
    sector: b.sector,
    at: c.at,
    announced: c.announced,
    strength,
    enemy,
    odds: oddsOf(strength, enemy),
  };
}

export interface FinalForecast {
  strength: { ground: IntelRange; air: IntelRange };
  /** The queen's estimated power, weakened by the bridgeheads held (null: not located). */
  queen: { ground: IntelRange; air: IntelRange } | null;
  /** Share of her power the bridgeheads take away. */
  reduction: number;
  odds: Odds;
}

/** The final assault with this crew (and every posted kiwi). */
export function finalForecast(
  state: GameState,
  crew: readonly Villager[],
  fed: number,
  now: TimeMs,
): FinalForecast {
  const sides = assaultSides(state, crew, fed);
  const strength = { ground: luckRange(sides.ground), air: luckRange(sides.air) };
  const view = siegeView(state, now).queen;
  const reduction = queenReduction(state.siege.bridgeheads, view?.sector ?? null);
  const k = 1 - reduction;
  const queen = view
    ? {
        ground: { min: view.ground.min * k, max: view.ground.max * k },
        air: { min: view.air.min * k, max: view.air.max * k },
      }
    : null;
  const g = oddsOf(strength.ground, queen?.ground ?? null);
  const a = oddsOf(strength.air, queen?.air ?? null);
  const rank: Odds[] = ['unknown', 'unlikely', 'uncertain', 'likely'];
  const odds = rank[Math.min(rank.indexOf(g), rank.indexOf(a))]!;
  return { strength, queen, reduction, odds };
}

/** The enemy an assault on this sector expects (aged hold, null when unknown). */
export function assaultEnemy(state: GameState, sector: number, now: TimeMs): IntelRange | null {
  const hold = siegeView(state, now).holds[sector];
  return hold ? { min: hold.min, max: hold.max } : null;
}

// --- Intel ----------------------------------------------------------------------------------

/** Merges what was learnt about the siege into the twin's report (it must exist). */
export function recordSiegeIntel(
  state: GameState,
  targetId: string,
  patch: Partial<SiegeIntel> & { sectors?: number[] },
): void {
  const report = state.intel[targetId];
  if (!report) return;
  report.siege = mergeSiegeIntel(report.siege, patch);
  if (patch.sectors)
    report.sectors = [...new Set([...report.sectors, ...patch.sectors])].sort((a, b) => a - b);
}

export function mergeSiegeIntel(
  prev: SiegeIntel | undefined,
  next: Partial<SiegeIntel> | undefined,
): SiegeIntel | undefined {
  if (!prev && !next) return undefined;
  const seen = [...new Set([...(prev?.seen ?? []), ...(next?.seen ?? [])])].sort((a, b) => a - b);
  const queen = next?.queen ?? prev?.queen;
  return {
    seen,
    holds: { ...(prev?.holds ?? {}), ...(next?.holds ?? {}) },
    ...(queen ? { queen } : {}),
  };
}

/**
 * Deep reconnaissance (siege open): order of the sectors to look at (never deep-seen first),
 * then what the scouts learn there (ranges around the truth). Draws from `rng` only when the
 * siege is open, so plain reconnaissance is unchanged.
 */
export function deepRecon(
  g: AlienGarrison,
  known: readonly number[],
  count: number,
  spread: number,
  at: TimeMs,
  rng: { shuffle<T>(a: T[]): T[]; next(): number },
): { sectors: number[]; siege: Partial<SiegeIntel> } {
  const seen = new Set(known);
  const all = Array.from({ length: INTEL.sectors }, (_, i) => i);
  const order = [
    ...rng.shuffle(all.filter((i) => !seen.has(i))),
    ...rng.shuffle(all.filter((i) => seen.has(i))),
  ];
  const sectors = order.slice(0, count).sort((a, b) => a - b);
  const around = (value: number): DatedRange => {
    const width = 2 * spread * value;
    const min = Math.max(0, value - width * rng.next());
    return { at, min: Math.floor(min * 10) / 10, max: Math.ceil((min + width) * 10) / 10 };
  };
  const truth = siegeTruth(g);
  const holds: Record<string, DatedRange> = {};
  for (const s of sectors) if (isOuterSector(s)) holds[s] = around(holdStrength(g, s, at));
  const out: Partial<SiegeIntel> = { seen: sectors, holds };
  if (sectors.includes(truth.queenSector)) {
    const k = siegeGrowth(g, at);
    out.queen = {
      sector: truth.queenSector,
      ground: around(round1(truth.queen.ground * k)),
      air: around(round1(truth.queen.air * k)),
    };
  }
  return { sectors, siege: out };
}

// --- Counter-attacks ------------------------------------------------------------------------

/** Plans the next counter-attack while bridgeheads stand (public: hashed from the face seed). */
export function planCounter(s: GameState): void {
  const siege = s.siege;
  if (siege.counter || siege.bridgeheads.length === 0 || siege.conqueredAt > 0) return;
  const since = Math.min(...siege.bridgeheads.map((b) => b.since));
  const base = Math.max(siege.lastCounterAt, since);
  const rng = createRng(`${s.seed}/${s.face}/siege/${siege.counters}`);
  const [lo, hi] = SIEGE.counter.intervalMs;
  const at = base + Math.round(rng.range(lo, hi) / 60_000) * 60_000;
  const target = siege.bridgeheads[rng.int(0, siege.bridgeheads.length - 1)]!;
  siege.counter = {
    id: `ca${siege.counters + 1}`,
    sector: target.sector,
    announceAt: at - SIEGE.counter.noticeMs,
    at,
    announced: false,
  };
}

function truthOf(s: GameState): AlienGarrison | undefined {
  const twin = twinTarget(s);
  return twin ? s.aliens?.[twin.id] : undefined;
}

/** Next siege event: an announcement, a fortification done, a strike (only with the truth). */
export function nextSiegeEvent(s: GameState): TimeMs {
  let next = Infinity;
  const c = s.siege.counter;
  if (c && !c.announced) next = Math.max(s.now, c.announceAt);
  else if (c && truthOf(s)) next = Math.max(s.now, c.at);
  for (const b of s.siege.bridgeheads)
    if (b.fortifyUntil !== undefined) next = Math.min(next, Math.max(s.now, b.fortifyUntil));
  return next;
}

/** A counter-attack struck and only the server can tell the outcome. */
export function counterAwaited(s: GameState, now: TimeMs): boolean {
  const c = s.siege.counter;
  return !!c && c.announced && c.at <= now && !truthOf(s);
}

export function siegeTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const b of s.siege.bridgeheads) {
    if (b.fortifyUntil === undefined || b.fortifyUntil > at) continue;
    b.fortified = true;
    delete b.fortifyUntil;
    delete b.fortifierId;
    events.push({ type: 'bridgeheadFortified', at, sector: b.sector });
  }
  const c = s.siege.counter;
  if (c && !c.announced && c.announceAt <= at) {
    c.announced = true;
    events.push({ type: 'counterAnnounced', at, sector: c.sector, strikeAt: c.at });
  } else if (c && c.announced && c.at <= at && truthOf(s)) strikeCounter(s, at, events);
}

function strikeCounter(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const c = s.siege.counter!;
  s.siege.counter = null;
  const b = bridgeheadAt(s, c.sector) ?? s.siege.bridgeheads[0];
  if (!b) return;
  const g = truthOf(s)!;
  const { luck, share } = withRng(s, (rng) => ({
    luck: rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck),
    share: rng.range(...SIEGE.counter.share),
  }));
  const enemy = round2(holdStrength(g, b.sector, at) * share * counterEscalation(s.siege.counters));
  s.siege.counters++;
  s.siege.lastCounterAt = at;
  const holders = holdersOf(s, b);
  const strength = round2(holdDefense(s, b) * luck);
  const victory = strength >= enemy;
  let dead: VillagerId[] = [];
  let retreating = 0;
  if (!victory) {
    const lost = withRng(s, (rng) => rng.range(...SIEGE.fallLosses));
    dead = drawLosses(s, holders, Math.round(holders.length * lost));
    const names = new Map(holders.map((v) => [v.id, v.name]));
    removeVillagers(s, dead, 'battle', at);
    const survivors = b.holders.filter((id) => !dead.includes(id));
    s.siege.bridgeheads = s.siege.bridgeheads.filter((x) => x !== b);
    if (survivors.length > 0) sendHome(s, survivors, at, b.sector);
    retreating = survivors.length;
    s.siege.reports.push({
      id: c.id,
      at,
      sector: b.sector,
      victory,
      strength,
      enemy,
      dead: dead.map((id) => names.get(id) ?? id),
      retreating,
    });
  } else {
    s.siege.reports.push({
      id: c.id,
      at,
      sector: b.sector,
      victory,
      strength,
      enemy,
      dead: [],
      retreating,
    });
  }
  if (s.siege.reports.length > 5) s.siege.reports.splice(0, s.siege.reports.length - 5);
  events.push({ type: 'counterStruck', at, sector: b.sector, victory, dead: dead.length });
}

/** Survivors of a fallen bridgehead fly home on their own (fed by the colony: no famine). */
function sendHome(s: GameState, ids: VillagerId[], at: TimeMs, sector: number): void {
  const twin = twinTarget(s)!;
  const members = crewMembers(s, ids);
  const need = rations(s, members, twin.travelMs);
  const id = nextId(s, 'x');
  for (const v of members) v.job = { kind: 'expedition', expeditionId: id };
  s.expeditions.push({
    id,
    mission: 'retreat',
    targetId: twin.id,
    launchpadId: 'none' as BuildingId,
    crew: [...ids],
    roster: members.map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
    })),
    provisions: { ...emptyResources(), pulp: need.pulp, juice: need.juice },
    cargo: 0,
    departedAt: at,
    arriveAt: at,
    returnAt: at + twin.travelMs,
    status: 'returning',
    sector,
    result: {
      victory: false,
      strength: 0,
      defense: 0,
      fed: 1,
      lostInBattle: [],
      lostOnReturn: [],
      loot: emptyResources(),
    },
  });
}

/** A kiwi leaves a bridgehead: a fortification under way stops with its Kikiwiwi. */
function leave(b: Bridgehead, id: VillagerId): void {
  b.holders = b.holders.filter((x) => x !== id);
  if (b.fortifierId === id) {
    delete b.fortifyUntil;
    delete b.fortifierId;
  }
}

/** Drops the bridgeheads nobody holds any more. */
function dropEmpty(s: GameState): void {
  s.siege.bridgeheads = s.siege.bridgeheads.filter((b) => b.holders.length > 0);
  if (s.siege.counter && s.siege.bridgeheads.length === 0) s.siege.counter = null;
}

/** Kiwis removed from the colony are also gone from their bridgehead. */
export function forgetHolders(s: GameState, ids: readonly VillagerId[]): void {
  if (ids.length === 0) return;
  for (const b of s.siege.bridgeheads)
    for (const id of ids) if (b.holders.includes(id)) leave(b, id);
  dropEmpty(s);
}

// --- Landings -------------------------------------------------------------------------------

/** The ship of a siege mission lands on the twin (the target exists, the ship is whole). */
export function resolveSiegeLanding(
  s: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
): void {
  if (e.mission === 'reinforce') return landReinforcement(s, e, members, fed);
  const g = s.aliens?.[e.targetId];
  if (!g) throw new Error('resolveSiegeLanding: hidden garrison');
  if (e.mission === 'assault') return landAssault(s, e, g, members, fed);
  return landFinal(s, e, g, members, fed);
}

function result(fed: number, extra: Partial<NonNullable<Expedition['result']>> = {}) {
  return {
    victory: false,
    strength: 0,
    defense: 0,
    fed: round2(fed),
    lostInBattle: [] as string[],
    lostOnReturn: [] as string[],
    loot: emptyResources(),
    ...extra,
  };
}

function nameIn(e: Expedition, id: VillagerId): string {
  return e.roster.find((r) => r.id === id)?.name ?? id;
}

function landReinforcement(s: GameState, e: Expedition, members: Villager[], fed: number): void {
  e.status = 'returning';
  const b = e.sector === undefined ? undefined : bridgeheadAt(s, e.sector);
  if (!b) {
    // The bridgehead fell meanwhile: everybody comes back.
    e.result = result(fed, { aborted: true });
    return;
  }
  for (const v of members) {
    v.job = { kind: 'outpost', sector: b.sector };
    b.holders.push(v.id);
  }
  const back = (e.bringBack ?? []).filter(
    (id) => b.holders.includes(id) && !members.some((v) => v.id === id),
  );
  for (const v of crewMembers(s, back)) {
    leave(b, v.id);
    v.job = { kind: 'expedition', expeditionId: e.id };
    e.roster.push({ id: v.id, name: v.name, level: v.level, shiny: v.shiny, classId: v.classId });
  }
  e.crew = back;
  dropEmpty(s);
  e.result = result(fed);
}

function landAssault(
  s: GameState,
  e: Expedition,
  g: AlienGarrison,
  members: Villager[],
  fed: number,
): void {
  const sector = e.sector!;
  const enemy = holdStrength(g, sector, e.arriveAt);
  const luck = withRng(s, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
  const strength = strengthOf(s, members, fed) * luck;
  // Taken meanwhile by another assault, or no room left: the fight still happens, no new post.
  const room = !bridgeheadAt(s, sector) && s.siege.bridgeheads.length < SIEGE.maxBridgeheads;
  const victory = strength >= enemy;
  const losses = Math.min(
    e.crew.length,
    Math.round(e.crew.length * lossShare(strength, enemy) * (1 - shipOf(s).armor)),
  );
  const hit = drawLosses(s, members, losses);
  const lost = victory ? [] : hit;
  removeVillagers(s, lost, 'battle', e.arriveAt);
  e.crew = e.crew.filter((id) => !lost.includes(id));
  recordSiegeIntel(s, e.targetId, {
    seen: [sector],
    holds: { [sector]: { at: e.arriveAt, min: enemy, max: enemy } },
  });
  let stay: VillagerId[] = [];
  if (victory && room) {
    stay = (e.holders ?? []).filter((id) => e.crew.includes(id));
    if (stay.length === 0 && e.crew.length > 0) stay = [e.crew[0]!];
    for (const v of crewMembers(s, stay)) v.job = { kind: 'outpost', sector };
    s.siege.bridgeheads.push({ sector, since: e.arriveAt, holders: stay, fortified: false });
    e.crew = e.crew.filter((id) => !stay.includes(id));
  }
  const injured = victory ? hit.filter((id) => !stay.includes(id)) : [];
  e.status = 'returning';
  e.result = result(fed, {
    victory,
    strength: round2(strength),
    defense: enemy,
    lostInBattle: lost.map((id) => nameIn(e, id)),
    ...(injured.length > 0 ? { injured } : {}),
    ...(victory && room ? { bridgehead: true } : {}),
  });
}

function landFinal(
  s: GameState,
  e: Expedition,
  g: AlienGarrison,
  members: Villager[],
  fed: number,
): void {
  const queen = queenPower(s, g, e.arriveAt);
  const luck = withRng(s, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
  const base = assaultSides(s, members, fed);
  const strength = { ground: round2(base.ground * luck), air: round2(base.air * luck) };
  const victory = strength.ground >= queen.ground && strength.air >= queen.air;
  const holders = allHolders(s);
  const fighters = [...members, ...holders];
  // The weaker side decides how hard the fight was.
  const ratio = Math.max(
    queen.ground / Math.max(strength.ground, 1e-6),
    queen.air / Math.max(strength.air, 1e-6),
  );
  const share = lossShare(1, Math.min(ratio, 1e6));
  const count = Math.min(
    fighters.length,
    Math.round(fighters.length * share * (1 - shipOf(s).armor)),
  );
  const hit = drawLosses(s, fighters, count);
  for (const v of holders)
    if (!e.roster.some((r) => r.id === v.id))
      e.roster.push({ id: v.id, name: v.name, level: v.level, shiny: v.shiny, classId: v.classId });
  const lost = victory ? [] : hit;
  removeVillagers(s, lost, 'battle', e.arriveAt);
  e.crew = e.crew.filter((id) => !lost.includes(id));
  forgetHolders(s, lost);
  const t = siegeTruth(g);
  const k = siegeGrowth(g, e.arriveAt);
  const exact = (v: number): DatedRange => ({ at: e.arriveAt, min: round1(v), max: round1(v) });
  recordSiegeIntel(s, e.targetId, {
    seen: [t.queenSector],
    queen: {
      sector: t.queenSector,
      ground: exact(t.queen.ground * k),
      air: exact(t.queen.air * k),
    },
  });
  if (victory) {
    // The queen falls: the face is ours, the posted kiwis fly home with the ship.
    for (const v of allHolders(s)) {
      v.job = { kind: 'expedition', expeditionId: e.id };
      e.crew.push(v.id);
    }
    s.siege.bridgeheads = [];
    s.siege.counter = null;
    s.siege.conqueredAt = e.arriveAt;
    recordSiegeIntel(s, e.targetId, {
      sectors: Array.from({ length: INTEL.sectors }, (_, i) => i),
    });
  }
  e.status = 'returning';
  e.result = result(fed, {
    victory,
    strength: round2(strength.ground + strength.air),
    defense: round2(queen.ground + queen.air),
    lostInBattle: lost.map((id) => nameIn(e, id)),
    sides: { strength, queen },
    ...(victory && hit.length > 0 ? { injured: hit } : {}),
    ...(victory ? { queenFallen: true } : {}),
  });
}

/**
 * A local save imported online carries a siege nobody can check (the truth is drawn again):
 * the posted kiwis and the siege crews come home, and what was learnt of the siege is dropped.
 */
export function resetSiege(s: GameState): void {
  const flying = new Set(
    s.expeditions.filter((e) => isSiegeMission(e.mission) && e.status !== 'done').map((e) => e.id),
  );
  for (const v of s.villagers)
    if (v.job.kind === 'outpost' || (v.job.kind === 'expedition' && flying.has(v.job.expeditionId)))
      v.job = { kind: 'idle' };
  s.expeditions = s.expeditions.filter((e) => !flying.has(e.id));
  s.siege = { ...s.siege, bridgeheads: [], counter: null, conqueredAt: 0 };
  for (const report of Object.values(s.intel)) delete report.siege;
}
