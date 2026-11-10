import { PVP, type PvpGuard } from '../data/pvp';
import { LANDING } from '../data/landing';
import { KIKIWIWI } from '../data/kikiwiwi';
import { KIWI, STAT_IDS, type Stats } from '../data/kiwis';
import { newKiwi } from './kiwis';
import { EXPEDITIONS } from '../data/expeditions';
import { SECTOR_IDS, type SectorId } from '../data/threats';
import { POSTURES, type Posture } from '../data/units';
import { emptyResources, RESOURCE_IDS, type Resources } from '../data/resources';
import type { ClassId } from '../data/classes';
import type { BattleLog, BattleUnitSetup } from '../battle/types';
import { kiwiUnit } from '../battle/units';
import { waveGates } from '../battle/wave';
import { createRng } from '../rng/rng';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { CommandError } from './commands';
import type { GameEvent } from './advance';
import { ageOf } from './research';
import { isSister } from './colonies';
import {
  coverage,
  crewMembers,
  crewOf,
  crewWeight,
  isLaunchpadBusy,
  launchCost,
  launchpadOf,
  maxCrew,
  rations,
  removeVillagers,
  shipCargo,
} from './expeditions';
import { strike } from './threats';
import type {
  Expedition,
  GameState,
  PlannedWave,
  PvpDefense,
  PvpRaid,
  PvpState,
  Villager,
} from './state';

/**
 * Chantier 57: optional PvP. The crew of another player lands on our home colony like a wave:
 * the server writes the attack into our state at the departure (the crew's battle units are
 * hidden from us), the strike plays it against our turrets and garrison where the truth is held,
 * and the attacker's ship gets the outcome from the server afterwards (`applyPvpResult`).
 */

// --- Journeys and protections ------------------------------------------------------------------

/** One-way flight to a colony this many kiwis away (also the notice the target gets). */
export function pvpTravelMs(distance: number): number {
  const T = PVP.travel;
  return Math.max(T.minMs, T.baseMs + T.perDistanceMs * Math.max(0, distance));
}

/** When the player last played (the server refreshes it; the state's time otherwise). */
export function lastActiveOf(state: GameState): TimeMs {
  return Math.max(state.pvp.lastActiveAt, state.now);
}

/**
 * Why this colony cannot be attacked at `now` (null: it can), and until when (absence: as long
 * as it lasts; a beginner below the Stone age: until it gets there, `Infinity`).
 */
export function pvpGuardOf(
  state: GameState,
  now: TimeMs,
): { guard: PvpGuard; until: TimeMs } | null {
  if (!state.pvp.attacked) {
    const until = state.createdAt + PVP.beginner.ms;
    if (ageOf(state) < PVP.beginner.age) return { guard: 'beginner', until: Infinity };
    if (now < until) return { guard: 'beginner', until };
  }
  if (state.pvp.shieldUntil > now) return { guard: 'shield', until: state.pvp.shieldUntil };
  if (now - lastActiveOf(state) > PVP.absentMs) return { guard: 'absent', until: Infinity };
  return null;
}

export const GUARD_ERRORS: Record<PvpGuard, CommandError> = {
  beginner: 'pvpBeginner',
  shield: 'pvpShielded',
  absent: 'pvpAbsent',
};

// --- The plan ----------------------------------------------------------------------------------

export interface PvpOrders {
  posture: Posture;
  /** The survivors run back to the ship once this share of the crew has fallen. */
  retreatAt: number;
}

export interface PvpPlan {
  launchpadId: BuildingId;
  /** A member's home colony (`ally:<user id>`, from `state.pvp.targets`). */
  targetId: string;
  crew: VillagerId[];
  provisions: { pulp: number; juice: number };
  /** The side of their face the crew lands on (their rampart there). */
  sector: SectorId;
  orders: PvpOrders;
}

export function validPvpOrders(o: PvpOrders | undefined): o is PvpOrders {
  const r = LANDING.retreat;
  return (
    !!o &&
    POSTURES.includes(o.posture) &&
    Number.isFinite(o.retreatAt) &&
    o.retreatAt >= r.min - 1e-9 &&
    o.retreatAt <= r.max + 1e-9
  );
}

/** Why this attack cannot leave now (the target's own protections are checked by the server). */
export function pvpLock(state: GameState, plan: PvpPlan, now: TimeMs): CommandError | null {
  if (!state.pvp.on || isSister(state)) return 'notPvp';
  if (!state.pvp.targets.some((t) => t.id === plan.targetId)) return 'unknownPvpTarget';
  const last = state.pvp.lastAttackOn[plan.targetId];
  if (last !== undefined && now < last + PVP.cooldownMs) return 'pvpCooldown';
  const pad = launchpadOf(state, plan.launchpadId);
  if (!pad) return 'notALaunchpad';
  if (isLaunchpadBusy(state, pad.id)) return 'launchpadBusy';
  if (pad.damaged) return 'launchpadDamaged';
  if (!SECTOR_IDS.includes(plan.sector) || !validPvpOrders(plan.orders)) return 'invalidOrders';
  const { pulp, juice } = plan.provisions;
  if (![pulp, juice].every((v) => Number.isFinite(v) && v >= 0)) return 'invalidCount';
  const crew = crewOf(state, plan.crew);
  if (!crew) return 'invalidCrew';
  if (crew.length < PVP.minCrew) return 'crewTooSmall';
  if (crew.length > maxCrew(state, pad, 'land')) return 'crewTooLarge';
  if (crew.filter((v) => v.kikiwiwi).length > KIKIWIWI.perShip) return 'oneKikiwiwi';
  return null;
}

export interface PvpForecast {
  travelMs: number;
  needOneWay: { pulp: number; juice: number };
  fed: number;
  weight: number;
  cargo: number;
  /** Resources the ship can bring back (the hold left once the crew and provisions are in). */
  hold: number;
  launchCost: Resources;
  /** The crew's power as the battle engine measures it (the announcement shows a range). */
  power: number;
  /** Launching ends our own beginners' protection. */
  endsProtection: boolean;
}

/** The logistics of an attack (the outcome is forecast from public data: `pvpOdds`). */
export function pvpForecast(state: GameState, plan: PvpPlan): PvpForecast | null {
  const pad = launchpadOf(state, plan.launchpadId);
  const target = state.pvp.targets.find((t) => t.id === plan.targetId);
  if (!pad || !target) return null;
  const crew = crewOf(state, plan.crew) ?? [];
  const travelMs = pvpTravelMs(target.distance);
  const need = rations(state, crew, travelMs);
  const fed = coverage(plan.provisions, need);
  const w = EXPEDITIONS.resourceWeight;
  const weight = crewWeight(crew) + (plan.provisions.pulp + plan.provisions.juice) * w;
  const cargo = shipCargo(pad);
  return {
    travelMs,
    needOneWay: need,
    fed,
    weight,
    cargo,
    hold: Math.max(0, Math.floor((cargo - weight) / w + 1e-9)),
    launchCost: launchCost(state, crew, 'land'),
    power: crewPower(crewUnits(state, crew, plan.sector, fed)),
    endsProtection: !state.pvp.attacked && pvpGuardOf(state, state.now)?.guard === 'beginner',
  };
}

/** The ship leaves (the fee and the protections were checked by the command). */
export function launchPvp(state: GameState, plan: PvpPlan, now: TimeMs, id: string): Expedition {
  const pad = launchpadOf(state, plan.launchpadId)!;
  const target = state.pvp.targets.find((t) => t.id === plan.targetId)!;
  const crew = crewOf(state, plan.crew)!;
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= plan.provisions.pulp;
  state.resources.juice -= plan.provisions.juice;
  // The flight is the notice: no breakdown changes the announced hour.
  const travelMs = pvpTravelMs(target.distance);
  const e: Expedition = {
    id,
    mission: 'pvp',
    targetId: target.id,
    launchpadId: pad.id,
    crew: crew.map((v) => v.id),
    roster: crew.map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
    })),
    provisions: { ...emptyResources(), pulp: plan.provisions.pulp, juice: plan.provisions.juice },
    cargo: shipCargo(pad),
    departedAt: now,
    arriveAt: now + travelMs,
    returnAt: now + 2 * travelMs,
    status: 'outbound',
    result: null,
    pvpSector: plan.sector,
    orders: {
      ...LANDING.defaultOrders,
      posture: plan.orders.posture,
      retreatAt: plan.orders.retreatAt,
    },
  };
  state.expeditions.push(e);
  // Attacking ends our own protection; one attack a day on the same colony.
  state.pvp.attacked = true;
  state.pvp.lastAttackOn[target.id] = now;
  return e;
}

// --- The crew as raiders -----------------------------------------------------------------------

/** The crew's battle units (side 1, raiders), from the attacker's own state at the departure. */
export function crewUnits(
  state: GameState,
  crew: readonly Villager[],
  sector: SectorId,
  fed: number,
): BattleUnitSetup[] {
  // Hunger weakens the blows (the landing's rule).
  const hunger = 0.5 + 0.5 * Math.max(0, Math.min(1, fed));
  return crew.map((v) => {
    const u = kiwiUnit(v, state, 'guard', { q: 0, r: 0 }, sector, 1);
    return {
      ...u,
      role: 'raider',
      power: 1,
      aura: undefined,
      weapon: { ...u.weapon, damage: u.weapon.damage * hunger },
    };
  });
}

/** Power of one fighter: √(blows per second × hit points). */
export function unitPower(u: BattleUnitSetup): number {
  const dps = u.weapon.damage / Math.max(0.1, u.weapon.reload);
  return Math.sqrt(Math.max(0, dps) * Math.max(0, u.hp));
}

export function crewPower(units: readonly BattleUnitSetup[]): number {
  return Math.round(units.reduce((sum, u) => sum + unitPower(u), 0) * 10) / 10;
}

/**
 * The attack as the target is told about it (and the hidden part the strike reads). `shift`
 * (−1..1, drawn by the server) moves the middle of the announced range.
 */
export function pvpRaidOf(
  attacker: GameState,
  e: Expedition,
  defender: GameState,
  opts: { id: string; from: string; owner: string; seed: string; shift: number },
): PvpRaid {
  const members = crewMembers(attacker, e.crew);
  const sector = e.pvpSector ?? 'front';
  const need = rations(attacker, members, e.arriveAt - e.departedAt);
  const units = crewUnits(attacker, members, sector, coverage(e.provisions, need)).map((u) => ({
    ...u,
    // A unique ref per crew member (the attacker's ids could meet the target's).
    ref: `${opts.id}:${u.ref}`,
  }));
  const power = crewPower(units);
  const s = PVP.powerSpread;
  const middle = power * (1 + Math.max(-1, Math.min(1, opts.shift)) * s);
  const w = EXPEDITIONS.resourceWeight;
  const room = e.cargo - crewWeight(members) - (e.provisions.pulp + e.provisions.juice) * w;
  return {
    id: opts.id,
    from: opts.from,
    owner: opts.owner,
    departedAt: e.departedAt,
    at: e.arriveAt,
    crew: members.length,
    classes: members.map((v) => v.classId),
    power: [round1(middle * (1 - s)), round1(middle * (1 + s))],
    sector,
    gate: waveGates(defender, opts.id)[sector],
    retreatAt: e.orders?.retreatAt ?? LANDING.defaultOrders.retreatAt,
    hold: Math.max(0, Math.floor(room / w + 1e-9)),
    units,
    seed: opts.seed,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The raiders of an attack. With the truth (the server), the crew's units; without it (the
 * target's forecast), kiwis of the announced classes at average stats, scaled to the announced
 * power × `luck`.
 */
export function raidRaiders(raid: PvpRaid, luck: number): BattleUnitSetup[] {
  if (raid.units) return raid.units.map((u) => ({ ...u }));
  const avg = KIWI.stat.average;
  const stats = Object.fromEntries(STAT_IDS.map((id) => [id, avg])) as Stats;
  const fake = raid.classes.map((classId, i): Villager => ({
    ...newKiwi({ stats, trait: null, shiny: null }),
    id: `${raid.id}:${i}` as VillagerId,
    name: '',
    bornAt: 0,
    job: { kind: 'idle' },
    classId,
  }));
  const base = fake.map((v) => {
    const u = kiwiUnit(v, emptyTechState, 'guard', { q: 0, r: 0 }, raid.sector, 1);
    return { ...u, role: 'raider' as const, power: 1, aura: undefined, name: '' };
  });
  const target = ((raid.power[0] + raid.power[1]) / 2) * luck;
  const have = crewPower(base);
  const k = have > 0 ? target / have : 1;
  return base.map((u) => ({
    ...u,
    hp: u.hp * k,
    weapon: { ...u.weapon, damage: u.weapon.damage * k },
  }));
}

/** A state with no technology and no Kikiwiwi (for the estimated raiders). */
const emptyTechState = {
  research: { points: 0, current: null, done: [], outbox: 0 },
  resources: emptyResources(),
} as unknown as GameState;

/** The attack as a wave (the defence window, the forecast and the strike read it this way). */
export function raidWave(raid: PvpRaid): PlannedWave {
  return {
    id: raid.id,
    announceAt: raid.departedAt,
    at: raid.at,
    announced: true,
    ground: Math.round(((raid.power[0] + raid.power[1]) / 2) * 10) / 10,
    air: 0,
    gates: { [raid.sector]: { ...raid.gate } },
    pvp: raid.id,
  };
}

/** The announced attack due first (null: none). */
export function comingRaid(state: GameState): PvpRaid | null {
  let best: PvpRaid | null = null;
  for (const r of state.pvp.incoming) if (!best || r.at < best.at) best = r;
  return best;
}

// --- Time ----------------------------------------------------------------------------------------

/** Next attack this state can play (its crew is known: the server). */
export function nextPvpEvent(state: GameState): TimeMs {
  let next = Infinity;
  for (const r of state.pvp.incoming) if (r.units && r.at < next) next = r.at;
  return next;
}

/** Attacks due by `now` (the server plays them on `load`). */
export function pvpDue(state: GameState, now: TimeMs): TimeMs[] {
  return state.pvp.incoming.filter((r) => r.at <= now).map((r) => r.at);
}

/** An attack is due and only the server knows the crew. */
export function pvpAwaited(state: GameState, now: TimeMs): boolean {
  return state.pvp.incoming.some((r) => r.at <= now && !r.units);
}

/** The attacks due at `at` land: a shield raised meanwhile turns the ship back. */
export function pvpTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const raid of s.pvp.incoming.filter((r) => r.at === at && r.units)) {
    if (s.pvp.shieldUntil > at) {
      s.pvp.incoming = s.pvp.incoming.filter((r) => r.id !== raid.id);
      recordDefense(s, {
        id: raid.id,
        from: raid.from,
        owner: raid.owner,
        at,
        turnedBack: true,
        held: true,
        loot: emptyResources(),
        lost: [],
        escaped: raid.crew,
      });
      continue;
    }
    strike(s, raidWave(raid), events);
  }
}

/** Keeps an attack's end for the attacker's report (a fortnight, a few at most). */
export function recordDefense(s: GameState, d: PvpDefense): void {
  const p: PvpState = s.pvp;
  p.defended = [...p.defended.filter((x) => x.id !== d.id && x.at > d.at - PVP.keepMs), d];
  if (p.defended.length > PVP.keep) p.defended.splice(0, p.defended.length - PVP.keep);
}

/** The attack's end, from the strike's journal. */
export function pvpDefenseEnd(
  raid: PvpRaid,
  at: TimeMs,
  held: boolean,
  loot: Resources,
  log: BattleLog,
): PvpDefense {
  const prefix = `${raid.id}:`;
  return {
    id: raid.id,
    from: raid.from,
    owner: raid.owner,
    at,
    held,
    loot,
    lost: (log.result.lost ?? []).map((ref) =>
      ref.startsWith(prefix) ? ref.slice(prefix.length) : ref,
    ),
    escaped: log.result.attackers.escaped,
    log,
  };
}

// --- The attacker's side -----------------------------------------------------------------------

export type PvpOutcome = 'victory' | 'retreat' | 'defeat';

/** How the attack ended for the crew (the target held: a retreat if someone got away). */
export function pvpOutcome(d: PvpDefense): PvpOutcome {
  if (!d.held) return 'victory';
  return d.escaped > 0 ? 'retreat' : 'defeat';
}

/**
 * The server tells the attacker's ship what happened (null: no news from the target, the ship
 * turns back). The landing's rules: a victory brings its fallen home wounded; a retreat or a
 * defeat leaves its dead (and their gear); a defeat loses the ship.
 */
export function applyPvpResult(state: GameState, e: Expedition, d: PvpDefense | null): void {
  if (e.status !== 'outbound' || e.result) return;
  const members = crewMembers(state, e.crew);
  const need = rations(state, members, e.arriveAt - e.departedAt);
  const fed = coverage(e.provisions, need);
  e.provisions.pulp -= Math.min(e.provisions.pulp, need.pulp);
  e.provisions.juice -= Math.min(e.provisions.juice, need.juice);
  if (!d || d.turnedBack) {
    e.status = 'returning';
    e.result = {
      victory: false,
      aborted: true,
      strength: members.length,
      defense: 0,
      fed: Math.round(fed * 100) / 100,
      lostInBattle: [],
      lostOnReturn: [],
      loot: emptyResources(),
    };
    return;
  }
  const outcome = pvpOutcome(d);
  const crewIds = new Set(e.crew as string[]);
  const fallen = d.lost.filter((ref) => crewIds.has(ref)) as VillagerId[];
  const dead = outcome === 'victory' ? [] : fallen;
  const hurt = outcome === 'victory' ? fallen : [];
  removeVillagers(state, dead, 'battle', e.arriveAt, true);
  e.crew = e.crew.filter((id) => !dead.includes(id));
  const loot = emptyResources();
  for (const r of RESOURCE_IDS) loot[r] = Math.max(0, Math.floor(d.loot[r]));
  e.result = {
    victory: outcome === 'victory',
    outcome,
    strength: members.length,
    defense: 0,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: dead.map((id) => e.roster.find((r) => r.id === id)?.name ?? id),
    lostOnReturn: [],
    loot,
    ...(d.log ? { log: d.log } : {}),
    ...(hurt.length > 0 ? { injured: hurt } : {}),
    ...(outcome === 'defeat' ? { shipLost: true } : {}),
  };
  if (outcome === 'defeat') {
    e.status = 'done';
    e.provisions = emptyResources();
    const pad = state.buildings.find((b) => b.id === e.launchpadId);
    if (pad) pad.damaged = true;
    const done = state.expeditions.filter((x) => x.status === 'done');
    if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
  } else e.status = 'returning';
}

/** Our attacks that landed and wait for the server's news. */
export function pvpWaiting(state: GameState, now: TimeMs): Expedition[] {
  return state.expeditions.filter(
    (e) => e.mission === 'pvp' && e.status === 'outbound' && !e.result && e.arriveAt <= now,
  );
}

// --- The truth stays at the server --------------------------------------------------------------

/** What the client may see of the attacks announced (no crew units, no seed). */
export function publicPvp(p: PvpState): PvpState {
  return {
    ...p,
    incoming: p.incoming.map(({ units: _u, seed: _s, ...r }) => r),
  };
}

/** An imported save keeps nothing of the PvP of where it came from. */
export function forgetPvp(state: GameState): void {
  state.pvp = {
    ...state.pvp,
    incoming: [],
    defended: [],
    lastAttackOn: {},
    targets: [],
    on: false,
  };
  for (const e of state.expeditions)
    if (e.mission === 'pvp' && e.status === 'outbound' && !e.result) applyPvpResult(state, e, null);
}

/** A seeded shift of the announced range (the server passes its own random seed). */
export function powerShift(seed: string): number {
  return createRng(`pvp/${seed}`).range(-1, 1);
}

/** Classes listed for the announcement, most frequent first. */
export function classCounts(classes: readonly (ClassId | null)[]): [ClassId | null, number][] {
  const m = new Map<ClassId | null, number>();
  for (const c of classes) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
