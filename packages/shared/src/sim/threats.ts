import { KIKIWIWI } from '../data/kikiwiwi';
import { titanPower } from './kikiwiwi';
import { BIOMES } from '../data/biomes';
import { COLONY } from '../data/colonies';
import { levelDef, type BuildingType } from '../data/buildings';
import { emptyResources, RESOURCE_IDS, type ResourceId, type Resources } from '../data/resources';
import {
  FRONT_AZIMUTH,
  GARRISON,
  INCIDENTS,
  SECTOR_IDS,
  SECTORS,
  SHELTER,
  THREATS,
  type IncidentKind,
  type SectorId,
} from '../data/threats';
import { hexDistance, hexToPixel, type Hex } from '../hex/hex';
import type { FaceMap, Tile } from '../worldgen/generateFace';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import { calendarAt } from './calendar';
import type { Odds } from './expeditions';
import { removeVillagers } from './expeditions';
import { kiwiExposure, kiwiStrength } from './kiwis';
import { isRampart, nest } from './selectors';
import { faceMapOf } from './territory';
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
  return (
    THREATS.basePower *
    factor *
    age *
    (1 + THREATS.perDay * days) *
    (1 + provocation) *
    sisterThreat(state, at)
  );
}

/**
 * Chantier 19: the last aliens of a colonised face. Their waves start weak and reach full
 * power after `COLONY.rampMs`; each ferret den still standing makes them stronger.
 */
export function sisterThreat(state: GameState, at: TimeMs): number {
  if (state.colony.index !== 1) return 1;
  const t = Math.min(1, Math.max(0, at - state.colony.foundedAt) / COLONY.rampMs);
  const ramp = COLONY.rampStart + (1 - COLONY.rampStart) * t;
  const dens = state.obstacles.filter((o) => o.kind === 'den').length;
  return ramp * (1 + COLONY.denWave * dens);
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
// Sectors (chantier 12)

export type PerSector<T> = Record<SectorId, T>;

const perSector = <T>(make: (s: SectorId) => T): PerSector<T> =>
  ({ front: make('front'), left: make('left'), right: make('right') }) as PerSector<T>;

/** Sector of a tile: its angle around the heart, against the direction of the alien planet. */
export function rampartSectorOf(h: Hex): SectorId {
  const p = hexToPixel(h);
  const a = Math.atan2(p.x, p.y) - FRONT_AZIMUTH;
  const d = Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(d) <= SECTORS.frontHalfAngle + 1e-9) return 'front';
  return d > 0 ? 'left' : 'right';
}

const rampartCache = new WeakMap<FaceMap, { tiles: Tile[]; sectors: SectorId[] }>();

/** Rampart tiles of a face and their sector (memoized per map). */
export function rampartSectors(map: FaceMap): { tiles: Tile[]; sectors: SectorId[] } {
  let r = rampartCache.get(map);
  if (!r) {
    const tiles = map.tiles.filter((t) => isRampart(map, t.q, t.r));
    r = { tiles, sectors: tiles.map(rampartSectorOf) };
    rampartCache.set(map, r);
  }
  return r;
}

/** Range of a turret in tiles. */
export function turretRange(type: BuildingType, level: number): number {
  const base = SECTORS.range[Math.min(level, SECTORS.range.length - 1)] ?? 0;
  return base + (type === 'skyTurret' ? SECTORS.skyRangeBonus : 0);
}

/** Rampart tiles a turret placed at `h` would defend. */
export function coveredRampart(
  map: FaceMap,
  type: BuildingType,
  level: number,
  h: Hex,
): { tile: Tile; sector: SectorId }[] {
  const range = turretRange(type, level);
  const r = rampartSectors(map);
  const out: { tile: Tile; sector: SectorId }[] = [];
  r.tiles.forEach((tile, i) => {
    if (hexDistance(tile, h) <= range) out.push({ tile, sector: r.sectors[i]! });
  });
  return out;
}

const coverageCache = new WeakMap<FaceMap, Map<string, PerSector<number>>>();

/**
 * Share of a turret's fire that goes to each sector: the share of the rampart tiles it covers
 * there. A turret covers at least its own tile.
 */
export function turretCoverage(
  map: FaceMap,
  type: BuildingType,
  level: number,
  h: Hex,
): PerSector<number> {
  let cache = coverageCache.get(map);
  if (!cache) coverageCache.set(map, (cache = new Map()));
  const key = `${type}|${level}|${h.q},${h.r}`;
  let c = cache.get(key);
  if (!c) {
    const counts = perSector(() => 0);
    const covered = coveredRampart(map, type, level, h);
    for (const x of covered) counts[x.sector]++;
    if (covered.length === 0) counts[rampartSectorOf(h)] = 1;
    const total = counts.front + counts.left + counts.right;
    c = perSector((s) => counts[s] / total);
    cache.set(key, c);
  }
  return c;
}

/** How a threat spreads over the sectors. */
export function sectorThreat(threat: Sides): PerSector<Sides> {
  return perSector((s) => ({
    ground: threat.ground * SECTORS.share.ground[s],
    air: threat.air * SECTORS.share.air[s],
  }));
}

export interface SectorClash {
  threat: Sides;
  defense: Sides;
  /** What breaks through this sector (after the overflow towards the weakest flank). */
  through: Sides;
}

/**
 * Sector by sector: what each sector does not stop breaks through, except a share that turns
 * to the least defended flank, where the defense left over can still stop it.
 */
export function sectorClash(
  threat: Sides,
  defense: PerSector<Sides>,
): { sectors: PerSector<SectorClash>; through: Sides } {
  const t = sectorThreat(threat);
  const sectors = perSector((s) => ({
    threat: t[s],
    defense: defense[s],
    through: { ground: 0, air: 0 },
  }));
  const through = { ground: 0, air: 0 };
  for (const side of ['ground', 'air'] as const) {
    const spare = perSector((s) => Math.max(0, defense[s][side] - t[s][side]));
    for (const s of SECTOR_IDS) {
      const excess = Math.max(0, t[s][side] - defense[s][side]);
      if (excess <= 0) continue;
      const flanks = SECTOR_IDS.filter((x) => x !== 'front' && x !== s);
      const target = flanks.reduce((a, b) => (defense[b][side] < defense[a][side] ? b : a));
      const absorbed = Math.min(spare[target], SECTORS.overflow * excess);
      spare[target] -= absorbed;
      sectors[s].through[side] = excess - absorbed;
      through[side] += excess - absorbed;
    }
  }
  return { sectors, through };
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
  // A Kikiwiwi reaches ferrets and bats alike (chantier 08).
  const a = v.kikiwiwi ? KIKIWIWI.affinity : GARRISON.affinity[v.classId ?? 'none'];
  const tech = state ? techEffects(state) : null;
  const titan = state ? titanPower(state, v) : 1;
  const p = kiwiStrength(v) * GARRISON.power * (tech?.guard ?? 1) * titan;
  // Firearms (Industrial age): warriors reach the bats.
  const air =
    v.classId === 'warrior' && tech?.firearms ? Math.max(a.air, GARRISON.firearmsAir) : a.air;
  return { ground: p * a.ground, air: p * air };
}

export interface Defense extends Sides {
  /** Chantier 12: defense of each sector (turrets in range, militia, garrison sent there). */
  sectors: PerSector<Sides>;
  /** Sector each guard defends. */
  guards: { id: VillagerId; sector: SectorId }[];
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
  const map = faceMapOf(state);
  const turrets = { ground: 0, air: 0 };
  const sectors = perSector(() => ({ ground: 0, air: 0 }));
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
    const cover = turretCoverage(map, b.type, b.level, b);
    for (const s of SECTOR_IDS) {
      sectors[s].ground += g * k * cover[s];
      sectors[s].air += a * k * cover[s];
    }
  }
  const have = state.resources.seeds;
  const share = need > 0 ? Math.min(1, have / need) : 1;
  const tech = techEffects(state).turretDefense;
  turrets.ground *= share * tech;
  turrets.air *= share * tech;
  for (const s of SECTOR_IDS) {
    sectors[s].ground *= share * tech;
    sectors[s].air *= share * tech;
  }
  // The kiwis at home chase a few ferrets away, running first where the turrets leave a gap;
  // nobody reaches the bats without help.
  let militia = 0;
  for (const v of state.villagers)
    if (v.job.kind === 'work' || v.job.kind === 'idle')
      militia += THREATS.militia * kiwiStrength(v) * titanPower(state, v);
  // The garrison and the militia face the announced wave (or an even threat).
  const want = sectorThreat(threat ?? { ground: 1, air: 1 });
  const gaps = perSector((s) => Math.max(0, want[s].ground - sectors[s].ground));
  const gapSum = gaps.front + gaps.left + gaps.right;
  const filled = Math.min(militia, gapSum);
  for (const s of SECTOR_IDS) {
    const rest = (militia - filled) * SECTORS.share.ground[s];
    sectors[s].ground += (gapSum > 0 ? (filled * gaps[s]) / gapSum : 0) + rest;
  }
  // Then each guard goes where the defense is missing most, one kiwi at a time.
  const garrison = { ground: 0, air: 0 };
  const guards: { id: VillagerId; sector: SectorId }[] = [];
  for (const v of garrisonOf(state)) {
    const p = guardPower(v, state);
    garrison.ground += p.ground;
    garrison.air += p.air;
    let best: SectorId = 'front';
    let bestScore = -Infinity;
    for (const s of SECTOR_IDS) {
      const gap = (side: keyof Sides) => Math.max(0, want[s][side] - sectors[s][side]);
      const covered = (side: keyof Sides) =>
        want[s][side] > 0 ? sectors[s][side] / want[s][side] : Infinity;
      // Fill a gap first; with no gap left, reinforce the sector with the thinnest margin.
      const fills = Math.min(p.ground, gap('ground')) + Math.min(p.air, gap('air'));
      const margin = Math.min(
        p.ground > 0 ? covered('ground') : Infinity,
        p.air > 0 ? covered('air') : Infinity,
      );
      const score = fills > 1e-9 ? 1e6 + fills : -margin;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = s;
      }
    }
    sectors[best].ground += p.ground;
    sectors[best].air += p.air;
    guards.push({ id: v.id as VillagerId, sector: best });
  }
  return {
    ground: turrets.ground + garrison.ground + militia,
    air: turrets.air + garrison.air,
    sectors,
    guards,
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
  /** Chantier 12: threat, defense and what breaks through, sector by sector. */
  sectors: PerSector<SectorClash>;
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
  defense: Defense,
  sheltered: boolean,
): WaveOutcome {
  const total = threat.ground + threat.air;
  const clash = sectorClash(threat, defense.sectors);
  const groundExcess = clash.through.ground;
  const excess = groundExcess + clash.through.air;
  const severity = total > 0 ? Math.min(1, excess / total) : 0;
  const groundSeverity = total > 0 ? Math.min(1, groundExcess / total) : 0;
  const loot = emptyResources();
  if (excess <= 1e-9) {
    return {
      victory: true,
      sectors: clash.sectors,
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
  return {
    victory: false,
    sectors: clash.sectors,
    severity,
    groundSeverity,
    damaged,
    loot,
    injured,
    deaths,
    pathsLost,
  };
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
  // Same sector maths as the strike: the wave holds when nothing breaks through anywhere.
  const holds = (k: number) => {
    const through = sectorClash(
      { ground: threat.ground * k, air: threat.air * k },
      defense.sectors,
    ).through;
    return through.ground + through.air <= 1e-9;
  };
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
    const notice =
      Math.round(rng.range(THREATS.noticeMs[0], THREATS.noticeMs[1])) + techEffects(s).waveNotice;
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
