import { gearEffect } from './forge';
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
import { hexDistance, hexKey, hexToPixel, type Hex } from '../hex/hex';
import type { FaceMap, Tile } from '../worldgen/generateFace';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import { calendarAt } from './calendar';
import type { Odds } from './expeditions';
import { removeVillagers } from './expeditions';
import { grantClassXp, kiwiStrength } from './kiwis';
import { CAMP, SKILLS } from '../data/classes';
import { capacity, isRampart, nest, reserves } from './selectors';
import { faceMapOf, pathsKey, terraformKey } from './territory';
import { seasonOf } from './calendar';
import type { BattleLog } from '../battle/types';
import { simulateBattle } from '../battle/simulate';
import { waveGates, waveSetup, waveSquads } from '../battle/wave';
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

/**
 * Chantier 31: the predators smell a rich colony — a full storage (stock and reserves), many
 * building levels and many kiwis make the waves stronger.
 */
export function wealthFactor(state: GameState): number {
  const W = THREATS.wealth;
  const cap = capacity(state);
  const kept = reserves(state);
  let stored = 0;
  let room = 0;
  for (const id of RESOURCE_IDS) {
    stored += state.resources[id] + kept.stock[id];
    room += cap[id];
  }
  const fill = Math.max(0, Math.min(W.maxFill, room > 0 ? stored / room : 0) - W.fillFree);
  const levels = state.buildings.reduce(
    (sum, b) => sum + (b.type === 'nest' || b.type === 'camp' ? 0 : b.level),
    0,
  );
  return (
    1 +
    W.stock * fill +
    W.levels * Math.log(1 + levels / W.levelsRef) +
    W.population * Math.log(1 + state.villagers.length / W.populationRef)
  );
}

/** Total power of a wave announced at `at`: colony size × play time × provocation × wealth. */
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
    wealthFactor(state) *
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

/**
 * Chantier 36: share of a turret's fire for each sector against an announced wave — the
 * sectors whose gate it reaches, evenly (none: it fires at nothing).
 */
export function gateCoverage(
  gates: Partial<Record<SectorId, Hex>>,
  type: BuildingType,
  level: number,
  h: Hex,
): PerSector<number> {
  const range = turretRange(type, level);
  const reach = perSector((s) => {
    const g = gates[s];
    return g && hexDistance(g, h) <= range ? 1 : 0;
  });
  const n = reach.front + reach.left + reach.right;
  return n > 0 ? perSector((s) => reach[s] / n) : reach;
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
  // Chantier 38: the weapon hits harder, the armour lasts longer.
  const gear = gearEffect(v);
  const p =
    kiwiStrength(v) *
    GARRISON.power *
    (tech?.guard ?? 1) *
    titan *
    gear.damage *
    Math.sqrt(gear.hp);
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
  // Chantier 36: against an announced wave, a turret defends the sectors whose gate it reaches.
  const next = state.threats.next;
  const gates = threat && next?.announced && next.gates ? next.gates : null;
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
    const cover = gates
      ? gateCoverage(gates, b.type, b.level, b)
      : turretCoverage(map, b.type, b.level, b);
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
  // Chantier 36: pinned guards first, at their sector.
  const posted = garrisonOf(state);
  const pins = state.threats.pins;
  for (const v of posted) {
    const pin = pins[v.id];
    if (!pin) continue;
    const p = guardPower(v, state);
    garrison.ground += p.ground;
    garrison.air += p.air;
    sectors[pin].ground += p.ground;
    sectors[pin].air += p.air;
    guards.push({ id: v.id as VillagerId, sector: pin });
  }
  for (const v of posted) {
    if (pins[v.id]) continue;
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
// Outcome (chantier 36: read from a battle, for the forecast and the resolution alike)

export interface WaveOutcome {
  victory: boolean;
  /** Chantier 12: threat, defense and what breaks through, sector by sector (an estimate by
   * sums: the battle decides). */
  sectors: PerSector<SectorClash>;
  /** 0 (repelled) to 1 (every predator reached a building). */
  severity: number;
  damaged: number;
  /** Everything carried away (chantier 31: reserves first)… */
  loot: Resources;
  /** …of which this much from the warehouse reserves. */
  lootReserve: Resources;
  injured: number;
  deaths: number;
  pathsLost: number;
}

/** A real defeat may cost a life: a threat far above the defense, outside a shelter. */
export function lethalWave(
  state: GameState,
  threat: Sides,
  defense: Defense,
  sheltered: boolean,
): boolean {
  return (
    !sheltered &&
    state.villagers.length > THREATS.minKiwis &&
    threat.ground + threat.air > THREATS.deathRatio * (defense.ground + defense.air)
  );
}

/**
 * What a wave's battle does to the colony (the strike applies it, the forecast shows it). The
 * buildings of the setup are `state.buildings` in order.
 */
export function battleOutcome(
  state: GameState,
  threat: Sides,
  defense: Defense,
  sheltered: boolean,
  log: BattleLog,
): WaveOutcome {
  const r = log.result;
  const loot = emptyResources();
  const lootReserve = emptyResources();
  for (const l of r.loot) {
    const b = state.buildings[l.building];
    RESOURCE_IDS.forEach((id, k) => {
      const amount = l.amounts[k]!;
      loot[id] += amount;
      lootReserve[id] += Math.min(amount, b?.reserve?.[id] ?? 0);
    });
  }
  for (const id of RESOURCE_IDS) {
    loot[id] = Math.floor(loot[id]);
    lootReserve[id] = Math.min(loot[id], Math.floor(lootReserve[id]));
  }
  const paths = new Set(state.paths);
  const pathsLost = Math.min(
    THREATS.maxPathsLost,
    r.struck.filter((h) => paths.has(hexKey(h))).length,
  );
  // Repelled: nothing broken, and only a few scraps carried away.
  const taken = RESOURCE_IDS.reduce((sum, id) => sum + loot[id], 0);
  const victory = r.damaged.length === 0 && taken <= THREATS.holdLoot * r.lootable + 1e-9;
  // The kiwis who fell are hurt; on a real defeat, one of them may not get up.
  const fallen = r.fallen.filter((id) => state.villagers.some((v) => v.id === id));
  const deaths =
    !victory && fallen.length > 0 && lethalWave(state, threat, defense, sheltered)
      ? Math.min(THREATS.maxDeaths, fallen.length)
      : 0;
  return {
    victory,
    sectors: sectorClash(threat, defense.sectors).sectors,
    severity: r.held ? 0 : Math.max(0.01, Math.min(1, r.reached)),
    damaged: r.damaged.length,
    loot,
    lootReserve,
    injured: fallen.length - deaths,
    deaths,
    pathsLost,
  };
}

/** The battle of a wave against the colony as it is now (`luck` scales the predators). */
export function waveBattle(
  state: GameState,
  wave: PlannedWave,
  luck: number,
  seed: string,
  rough = false,
): BattleLog {
  const announced = { ground: wave.ground, air: wave.air };
  const sheltered = state.threats.shelterUntil >= wave.at;
  return simulateBattle(
    waveSetup(state, wave, announced, { luck, sheltered, roughLoot: rough }),
    seed,
  );
}

// ---------------------------------------------------------------------------------------------
// Forecast

/** The announced wave and the defense it would meet, without its battles (cheap). */
export interface WaveAhead {
  wave: PlannedWave;
  threat: Sides;
  defense: Defense;
  sheltered: boolean;
  /** The shelter can be ordered now. */
  canShelter: boolean;
  /** When the shelter becomes possible. */
  shelterFrom: TimeMs;
}

export interface WaveForecast extends WaveAhead {
  odds: Exclude<Odds, 'unknown'>;
  /** At average luck, with the colony as it is now. */
  expected: WaveOutcome;
}

/** The announced wave without its practice battles (the shelter, the ammo, the threat). */
export function waveAhead(state: GameState): WaveAhead | null {
  const wave = state.threats.next;
  if (!wave || !wave.announced) return null;
  const threat = { ground: wave.ground, air: wave.air };
  const sheltered = state.threats.shelterUntil >= wave.at;
  const shelterFrom = wave.at - SHELTER.beforeMs;
  return {
    wave,
    threat,
    defense: defenseOf(state, threat),
    sheltered,
    canShelter: !sheltered && state.now >= shelterFrom && state.now < wave.at,
    shelterFrom,
  };
}

const forecastCache = new Map<string, WaveOutcome[]>();

/**
 * What the HUD shows about the coming wave (chantier 36): three practice battles at bad,
 * average and good luck, with practice seeds (never the one of the day). Odds: held even at bad
 * luck → likely; held at average or good luck → uncertain; else unlikely. Expected: the average
 * battle. Cached on the setup (the stock moves every second: the loot is rounded).
 */
export function forecastWave(state: GameState): WaveForecast | null {
  const ahead = waveAhead(state);
  if (!ahead) return null;
  const { wave, threat, defense, sheltered } = ahead;
  const L = THREATS.luck;
  const lucks = [1 + L, 1, 1 - L];
  const setupAt = (luck: number) =>
    waveSetup(state, wave, threat, { luck, sheltered, roughLoot: true });
  const average = setupAt(1);
  const { tiles: _tiles, ...rest } = average;
  const key = `${wave.id}|${state.seed}|${state.face}|${terraformKey(state)}|${pathsKey(state.paths)}|${seasonOf(state)}|${JSON.stringify(rest)}`;
  let trials = forecastCache.get(key);
  if (!trials) {
    trials = lucks.map((luck, i) =>
      battleOutcome(
        state,
        threat,
        defense,
        sheltered,
        simulateBattle(luck === 1 ? average : setupAt(luck), `${wave.id}/trial/${i}`),
      ),
    );
    forecastCache.set(key, trials);
    if (forecastCache.size > 16) forecastCache.delete(forecastCache.keys().next().value!);
  }
  const odds: Exclude<Odds, 'unknown'> = trials[0]!.victory
    ? 'likely'
    : trials[1]!.victory || trials[2]!.victory
      ? 'uncertain'
      : 'unlikely';
  return { ...ahead, odds, expected: trials[1]! };
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
    // Chantier 37: an oracle at home sees the wave coming earlier.
    const oracle = s.villagers.some(
      (v) => v.classId === 'oracle' && v.job.kind !== 'expedition' && v.job.kind !== 'outpost',
    )
      ? SKILLS.oracleNotice
      : 0;
    const notice =
      Math.round(rng.range(THREATS.noticeMs[0], THREATS.noticeMs[1])) +
      techEffects(s).waveNotice +
      oracle;
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
  wave.squads = waveSquads(s, { ground: wave.ground, air: wave.air });
  wave.gates = waveGates(s, wave.id);
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

function strike(s: GameState, wave: PlannedWave, events: GameEvent[]): void {
  const t = s.threats;
  const at = wave.at;
  const luck = withThreatRng(s, (rng) => 1 + rng.range(-THREATS.luck, THREATS.luck));
  const seed = withThreatRng(s, (rng) => `${wave.id}/${Math.floor(rng.next() * 2 ** 32)}`);
  const threat = { ground: wave.ground * luck, air: wave.air * luck };
  const announced = { ground: wave.ground, air: wave.air };
  const defense = defenseOf(s, announced);
  const sheltered = t.shelterUntil >= at;
  // Chantier 36: the wave is a battle; its journal says what happened.
  const log = waveBattle(s, wave, luck, seed);
  const out = battleOutcome(s, threat, defense, sheltered, log);
  // The turrets fired these seeds (the loot is taken from what is left).
  const shots = Object.values(log.result.shots).reduce((a, b) => a + b, 0);
  const ammoUsed = Math.min(s.resources.seeds, shots);
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
    log,
  };
  // Loot where the predators took it: a warehouse's reserve first, then the stock.
  const buildings = [...s.buildings];
  for (const l of log.result.loot) {
    const b = buildings[l.building];
    RESOURCE_IDS.forEach((id, k) => {
      let left = Math.floor(l.amounts[k]!);
      const fromReserve = Math.min(left, Math.floor(b?.reserve?.[id] ?? 0));
      if (b && fromReserve > 0) {
        b.reserve = { ...b.reserve!, [id]: b.reserve![id] - fromReserve };
        left -= fromReserve;
      }
      s.resources[id] = Math.max(0, s.resources[id] - left);
    });
  }
  for (const i of log.result.damaged) {
    const b = buildings[i];
    if (!b || b.damaged) continue;
    b.damaged = true;
    report.damaged.push({ id: b.id, type: b.type });
  }
  if (out.pathsLost > 0) {
    const paths = new Set(s.paths);
    const lost = new Set(
      log.result.struck
        .map((h) => hexKey(h) as string)
        .filter((k) => paths.has(k))
        .slice(0, out.pathsLost),
    );
    s.paths = s.paths.filter((k) => !lost.has(k));
    report.pathsLost = lost.size;
  }
  // Chantier 37: the kiwis who fought gain class practice (guards more than the militia).
  for (const u of log.units) {
    if (u[1] !== 0 || u[2] === 'turret') continue;
    const v = s.villagers.find((x) => x.id === u[0]);
    if (!v) continue;
    grantClassXp(
      v,
      v.job.kind === 'guard' ? CAMP.waveHours.guard : CAMP.waveHours.militia,
      at,
      events,
    );
  }
  // The kiwis who fell are hurt; on a real defeat, the first one may not get up.
  const fallen = log.result.fallen
    .map((id) => s.villagers.find((v) => v.id === id))
    .filter((v): v is Villager => !!v);
  const dead = fallen.slice(0, out.deaths);
  for (const v of fallen.slice(out.deaths)) {
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
  // Pins stay with the kiwis still on guard.
  const guards = new Set(garrisonOf(s).map((v) => v.id as string));
  t.pins = Object.fromEntries(Object.entries(t.pins).filter(([id]) => guards.has(id)));
  if (!out.victory) t.shieldUntil = at + THREATS.shieldMs;
  else s.stats.wavesHeld++;
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
