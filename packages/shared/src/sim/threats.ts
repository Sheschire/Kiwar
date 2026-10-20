import { BIOMES } from '../data/biomes';
import { levelDef } from '../data/buildings';
import { emptyResources, RESOURCE_IDS, type ResourceId, type Resources } from '../data/resources';
import { GARRISON, INCIDENTS, SHELTER, THREATS, type IncidentKind } from '../data/threats';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import { calendarAt } from './calendar';
import type { Odds } from './expeditions';
import { removeVillagers } from './expeditions';
import { kiwiExposure, kiwiStrength } from './kiwis';
import { nest } from './selectors';
import { ageOf, techEffects } from './research';
import {
  withThreatRng,
  type GameState,
  type PlannedWave,
  type Villager,
  type WaveReport,
} from './state';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Sides {
  ground: number;
  air: number;
}

// ---------------------------------------------------------------------------------------------
// Threat

/** Total power of a wave announced at `at`: colony size × play time × provocation. */
export function wavePower(state: GameState, at: TimeMs): number {
  const level = nest(state).level;
  const factor = THREATS.nestFactor[level] ?? THREATS.nestFactor[THREATS.nestFactor.length - 1]!;
  const days = Math.min(THREATS.maxDays, Math.max(0, (at - state.createdAt) / DAY));
  const victories = Object.values(state.victories).reduce((a, b) => a + b, 0);
  const provocation = Math.min(THREATS.maxProvocation, THREATS.perVictory * victories);
  const age = THREATS.ageFactor[ageOf(state)] ?? 1;
  return THREATS.basePower * factor * age * (1 + THREATS.perDay * days) * (1 + provocation);
}

/** Ground / air split of a wave striking at `at` (night bats, winter ferrets, biome). */
export function waveMix(state: GameState, power: number, at: TimeMs): Sides {
  const c = calendarAt(state.calendarStart, at);
  const air = c.night ? THREATS.airShare.night : THREATS.airShare.day;
  const biome = BIOMES[state.params.biome].threats;
  const season = THREATS.season[c.season];
  return {
    ground: power * (1 - air) * biome.ferrets * season.ferrets,
    air: power * air * biome.bats * season.bats,
  };
}

// ---------------------------------------------------------------------------------------------
// Defense

/** Kiwis who can be hurt by a wave (at home or on guard, not building or learning). */
export function exposedKiwis(state: GameState): Villager[] {
  return state.villagers.filter(
    (v) => v.job.kind === 'work' || v.job.kind === 'idle' || v.job.kind === 'guard',
  );
}

export function garrisonOf(state: GameState): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'guard');
}

/** What one posted kiwi adds to each side (swords never reach the bats). */
export function guardPower(v: Villager, state?: GameState): Sides {
  const a = GARRISON.affinity[v.classId ?? 'none'];
  const tech = state ? techEffects(state) : null;
  const p = kiwiStrength(v) * GARRISON.power * (tech?.guard ?? 1);
  // Firearms (Industrial age): warriors reach the bats.
  const air = v.classId === 'warrior' && tech?.firearms ? GARRISON.firearmsAir : a.air;
  return { ground: p * a.ground, air: p * air };
}

export interface Defense extends Sides {
  /** Per source, for the UI. */
  turrets: Sides;
  garrison: Sides;
  militia: number;
  /** Seeds the turrets fire at this wave, and the share they can fire with the stock. */
  ammo: { need: number; have: number; share: number };
}

/**
 * Defense of the colony right now, per side. With a threat, only the turrets facing it fire
 * (and need seeds); without, every turret counts (incidents).
 */
export function defenseOf(state: GameState, threat?: Sides): Defense {
  const turrets = { ground: 0, air: 0 };
  let need = 0;
  for (const b of state.buildings) {
    const def = levelDef(b.type, b.level);
    if (!def?.defense) continue;
    const g = def.defense.ground ?? 0;
    const a = def.defense.air ?? 0;
    if (threat && !((g > 0 && threat.ground > 0) || (a > 0 && threat.air > 0))) continue;
    const k = b.damaged ? THREATS.damagedWork : 1;
    turrets.ground += g * k;
    turrets.air += a * k;
    need += def.ammo ?? 0;
  }
  const have = state.resources.seeds;
  const share = need > 0 ? Math.min(1, have / need) : 1;
  const tech = techEffects(state).turretDefense;
  turrets.ground *= share * tech;
  turrets.air *= share * tech;
  const garrison = { ground: 0, air: 0 };
  for (const v of garrisonOf(state)) {
    const p = guardPower(v, state);
    garrison.ground += p.ground;
    garrison.air += p.air;
  }
  // The kiwis at home chase a few ferrets away; nobody reaches the bats without help.
  let militia = 0;
  for (const v of state.villagers)
    if (v.job.kind === 'work' || v.job.kind === 'idle')
      militia += THREATS.militia * kiwiStrength(v);
  return {
    ground: turrets.ground + garrison.ground + militia,
    air: turrets.air + garrison.air,
    turrets,
    garrison,
    militia,
    ammo: { need, have, share },
  };
}

/** Chance of each kiwi to be hurt: posted kiwis stand in the front line. */
function hurtWeight(v: Villager): number {
  return kiwiExposure(v) * (v.job.kind === 'guard' ? GARRISON.exposure : 1);
}

/** Stock the Nest and the Warehouses keep safe from looting. */
export function protectedStock(state: GameState): Resources {
  let safe = 0;
  for (const b of state.buildings) {
    const share = THREATS.protectedShare[b.type];
    if (share) safe += (levelDef(b.type, b.level)?.storage ?? 0) * share;
  }
  return { pulp: safe, fiber: safe, seeds: safe, juice: safe };
}

// ---------------------------------------------------------------------------------------------
// Outcome (shared by the forecast and the resolution)

export interface WaveOutcome {
  victory: boolean;
  /** 0 (repelled) to 1 (nothing stood in the way). */
  severity: number;
  /** Part of the severity due to the ferrets (they trample the paths). */
  groundSeverity: number;
  damaged: number;
  loot: Resources;
  injured: number;
  deaths: number;
  pathsLost: number;
}

export function waveOutcome(
  state: GameState,
  threat: Sides,
  defense: Sides,
  sheltered: boolean,
): WaveOutcome {
  const total = threat.ground + threat.air;
  const groundExcess = Math.max(0, threat.ground - defense.ground);
  const excess = groundExcess + Math.max(0, threat.air - defense.air);
  const severity = total > 0 ? Math.min(1, excess / total) : 0;
  const groundSeverity = total > 0 ? Math.min(1, groundExcess / total) : 0;
  const loot = emptyResources();
  if (excess <= 1e-9) {
    return {
      victory: true,
      severity: 0,
      groundSeverity: 0,
      damaged: 0,
      loot,
      injured: 0,
      deaths: 0,
      pathsLost: 0,
    };
  }
  const safe = protectedStock(state);
  for (const id of RESOURCE_IDS) {
    const exposed = Math.max(0, state.resources[id] - safe[id]);
    loot[id] = Math.floor(exposed * THREATS.lootShare * severity);
  }
  const candidates = damageable(state).length;
  const damaged = Math.min(candidates, Math.max(1, Math.round(severity * THREATS.maxDamaged)));
  const exposed = exposedKiwis(state).length;
  const lethal = total > THREATS.deathRatio * (defense.ground + defense.air);
  const deaths =
    !sheltered && lethal && state.villagers.length > THREATS.minKiwis && exposed > 0
      ? THREATS.maxDeaths
      : 0;
  const injured = sheltered
    ? 0
    : Math.min(
        exposed - deaths,
        Math.round(severity * THREATS.injuryShare * techEffects(state).injuries * exposed),
      );
  const pathsLost = Math.min(state.paths.length, Math.round(groundSeverity * THREATS.maxPathsLost));
  return { victory: false, severity, groundSeverity, damaged, loot, injured, deaths, pathsLost };
}

/** Buildings predators can damage (never the Nest, nor camps, nor what is already broken). */
function damageable(state: GameState) {
  return state.buildings.filter(
    (b) => b.type !== 'nest' && b.type !== 'camp' && b.type !== 'monument' && !b.damaged,
  );
}

// ---------------------------------------------------------------------------------------------
// Forecast

export interface WaveForecast {
  wave: PlannedWave;
  threat: Sides;
  defense: Defense;
  odds: Exclude<Odds, 'unknown'>;
  /** At average luck, with the colony as it is now. */
  expected: WaveOutcome;
  sheltered: boolean;
  /** The shelter can be ordered now. */
  canShelter: boolean;
  /** When the shelter becomes possible. */
  shelterFrom: TimeMs;
}

/** What the HUD shows about the coming wave; the same maths resolve it. */
export function forecastWave(state: GameState): WaveForecast | null {
  const wave = state.threats.next;
  if (!wave || !wave.announced) return null;
  const threat = { ground: wave.ground, air: wave.air };
  const defense = defenseOf(state, threat);
  const L = THREATS.luck;
  const holds = (k: number) =>
    threat.ground * k <= defense.ground + 1e-9 && threat.air * k <= defense.air + 1e-9;
  const odds: Exclude<Odds, 'unknown'> = holds(1 + L)
    ? 'likely'
    : holds(1 - L)
      ? 'uncertain'
      : 'unlikely';
  const sheltered = state.threats.shelterUntil >= wave.at;
  const shelterFrom = wave.at - SHELTER.beforeMs;
  return {
    wave,
    threat,
    defense,
    odds,
    expected: waveOutcome(state, threat, defense, sheltered),
    sheltered,
    canShelter: !sheltered && state.now >= shelterFrom && state.now < wave.at,
    shelterFrom,
  };
}

// ---------------------------------------------------------------------------------------------
// Time (called from the `advance` loop)

/** Next time something happens with the predators (planning aside). */
export function nextThreatEvent(state: GameState): TimeMs {
  const t = state.threats;
  let next = t.nextIncidentAt;
  if (t.next) next = Math.min(next, t.next.announced ? t.next.at : t.next.announceAt);
  if (t.shelterUntil > state.now) next = Math.min(next, t.shelterUntil);
  return next;
}

/** Plans the next wave as soon as the colony is out of the beginners' protection. */
export function planWave(s: GameState): void {
  const t = s.threats;
  if (t.next || nest(s).level < THREATS.protectionNestLevel) return;
  withThreatRng(s, (rng) => {
    const gap = Math.round(rng.range(THREATS.intervalMs[0], THREATS.intervalMs[1]));
    const notice = Math.round(rng.range(THREATS.noticeMs[0], THREATS.noticeMs[1]));
    const earliest = Math.max(
      s.createdAt + THREATS.protectionMs,
      t.lastWaveAt > 0 ? t.lastWaveAt + gap : 0,
      t.shieldUntil,
    );
    const at = Math.max(earliest, s.now + notice);
    t.next = {
      id: `w${t.waves + 1}`,
      announceAt: at - notice,
      at,
      announced: false,
      ground: 0,
      air: 0,
    };
  });
}

/** Handles the predator events due at `at`. */
export function threatTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const t = s.threats;
  if (t.next && !t.next.announced && t.next.announceAt === at) announce(s, t.next, events);
  if (t.next && t.next.announced && t.next.at === at) strike(s, t.next, events);
  if (t.nextIncidentAt === at) incident(s, at, events);
  if (t.shelterUntil === at) events.push({ type: 'shelterOver', at });
}

const tenth = (x: number) => Math.round(x * 10) / 10;

function announce(s: GameState, wave: PlannedWave, events: GameEvent[]): void {
  const mix = waveMix(s, wavePower(s, wave.announceAt), wave.at);
  withThreatRng(s, (rng) => {
    const S = THREATS.spread;
    wave.ground = tenth(mix.ground * (1 + rng.range(-S, S)));
    wave.air = tenth(mix.air * (1 + rng.range(-S, S)));
  });
  wave.announced = true;
  events.push({
    type: 'waveAnnounced',
    at: wave.announceAt,
    waveId: wave.id,
    strikeAt: wave.at,
    ground: wave.ground,
    air: wave.air,
  });
}

/** Weighted draw without replacement (heavier weights first, more often). */
function drawWeighted<T>(
  s: GameState,
  items: readonly T[],
  weight: (x: T) => number,
  count: number,
): T[] {
  if (count <= 0) return [];
  return withThreatRng(s, (rng) => {
    const pool = items.map((x) => ({ x, w: Math.max(1e-6, weight(x)) }));
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      let roll = rng.next() * pool.reduce((sum, p) => sum + p.w, 0);
      let i = 0;
      for (; i < pool.length - 1; i++) {
        roll -= pool[i]!.w;
        if (roll < 0) break;
      }
      out.push(pool[i]!.x);
      pool.splice(i, 1);
    }
    return out;
  });
}

function strike(s: GameState, wave: PlannedWave, events: GameEvent[]): void {
  const t = s.threats;
  const at = wave.at;
  const luck = withThreatRng(s, (rng) => 1 + rng.range(-THREATS.luck, THREATS.luck));
  const threat = { ground: wave.ground * luck, air: wave.air * luck };
  const defense = defenseOf(s, threat);
  const sheltered = t.shelterUntil >= at;
  const out = waveOutcome(s, threat, defense, sheltered);
  // The turrets fire first (the loot is taken from what is left).
  const ammoUsed = Math.min(s.resources.seeds, defense.ammo.need);
  s.resources.seeds -= ammoUsed;
  const report: WaveReport = {
    id: wave.id,
    at,
    victory: out.victory,
    sheltered,
    threat,
    defense: { ground: defense.ground, air: defense.air },
    severity: out.severity,
    ammoUsed,
    damaged: [],
    loot: out.loot,
    injured: [],
    dead: [],
    pathsLost: 0,
  };
  for (const id of RESOURCE_IDS) s.resources[id] = Math.max(0, s.resources[id] - out.loot[id]);
  // Bigger buildings attract more predators.
  for (const b of drawWeighted(s, damageable(s), (b) => b.level, out.damaged)) {
    b.damaged = true;
    report.damaged.push({ id: b.id, type: b.type });
  }
  if (out.pathsLost > 0) {
    const lost = new Set(drawWeighted(s, s.paths, () => 1, out.pathsLost));
    s.paths = s.paths.filter((k) => !lost.has(k));
    report.pathsLost = lost.size;
  }
  const hurt = drawWeighted(s, exposedKiwis(s), hurtWeight, out.deaths + out.injured);
  const dead = hurt.slice(0, out.deaths);
  for (const v of hurt.slice(out.deaths)) {
    const until = withThreatRng(s, (rng) =>
      Math.round(at + rng.range(THREATS.injuryMs[0], THREATS.injuryMs[1])),
    );
    v.job = { kind: 'injured', until };
    report.injured.push({ id: v.id, name: v.name });
  }
  report.dead = dead.map((v) => ({ id: v.id, name: v.name }));
  if (dead.length > 0)
    removeVillagers(
      s,
      dead.map((v) => v.id as VillagerId),
      'predator',
      at,
    );
  if (!out.victory) t.shieldUntil = at + THREATS.shieldMs;
  t.lastWaveAt = at;
  t.waves++;
  t.next = null;
  t.reports.push(report);
  if (t.reports.length > THREATS.history) t.reports.splice(0, t.reports.length - THREATS.history);
  events.push({ type: 'waveStruck', at, waveId: wave.id, victory: out.victory });
}

function incident(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const t = s.threats;
  const defense = defenseOf(s);
  const block = (d: number) => Math.min(INCIDENTS.maxBlock, d / (d + INCIDENTS.blockHalf));
  const report = withThreatRng(s, (rng) => {
    const kinds: IncidentKind[] = s.paths.length > 0 ? ['thief', 'bat', 'storm'] : ['thief', 'bat'];
    const kind = rng.pick(kinds);
    if (kind === 'storm') {
      const n = Math.min(s.paths.length, rng.int(INCIDENTS.stormPaths[0], INCIDENTS.stormPaths[1]));
      const lost = new Set(rng.shuffle(s.paths).slice(0, n));
      s.paths = s.paths.filter((k) => !lost.has(k));
      return { at, kind, blocked: false, resource: null, amount: n };
    }
    const resource: ResourceId = kind === 'bat' ? 'juice' : rng.pick(['pulp', 'fiber'] as const);
    const [lo, hi] = kind === 'bat' ? INCIDENTS.batShare : INCIDENTS.thiefShare;
    const share = rng.range(lo, hi);
    const blocked = rng.chance(block(kind === 'bat' ? defense.air : defense.ground));
    const amount = blocked ? 0 : Math.floor(s.resources[resource] * share);
    s.resources[resource] -= amount;
    return { at, kind, blocked, resource, amount };
  });
  t.incidents.push(report);
  if (t.incidents.length > INCIDENTS.history)
    t.incidents.splice(0, t.incidents.length - INCIDENTS.history);
  t.nextIncidentAt =
    at +
    withThreatRng(s, (rng) =>
      Math.round(rng.range(INCIDENTS.intervalMs[0], INCIDENTS.intervalMs[1])),
    );
  events.push({ type: 'incident', ...report });
}
