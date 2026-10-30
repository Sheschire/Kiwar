import { hexDisk, hexDistance, hexKey, hexToPixel, type Hex } from '../hex/hex';
import { createRng } from '../rng/rng';
import { levelDef } from '../data/buildings';
import { RESOURCE_IDS } from '../data/resources';
import { FRONT_AZIMUTH, SECTOR_IDS, SECTORS, THREATS, type SectorId } from '../data/threats';
import { BATTLE, ENEMIES, WAVE_UNITS, isFlyer, type EnemyKind } from '../data/units';
import type { Building, GameState, PlannedWave, Squad } from '../sim/state';
import type { Sides } from '../sim/threats';
import {
  defenseOf,
  garrisonOf,
  protectedStock,
  rampartSectorOf,
  rampartSectors,
  turretRange,
} from '../sim/threats';
import { faceMapOf, pathSet, walkCost } from '../sim/territory';
import { footprintTiles } from '../sim/footprint';
import { isRampart } from '../sim/selectors';
import { seasonOf } from '../sim/calendar';
import { ageOf } from '../sim/research';
import { enemyUnit, kiwiUnit, turretUnit } from './units';
import type { BattleBuilding, BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 36: a predator wave as a battle on the whole face. The predators come in by the
 * rampart of their sector (the shares of chantier 12), the turrets fire with the seeds there
 * are, the garrison stands at its posts (pinned sector, or where it is needed), the kiwis at
 * work defend their workplace with their beaks (not during a shelter).
 */

/** The predators of a wave of this power, by kind and sector (no draw: the same every time). */
export function waveSquads(state: GameState, threat: Sides): Squad[] {
  const age = Math.min(ageOf(state), 3);
  const out: Squad[] = [];
  const add = (kind: EnemyKind, count: number, side: 'ground' | 'air') => {
    if (count <= 0) return;
    // Largest remainder over the sectors, in a fixed order.
    const shares = SECTORS.share[side];
    const raw = SECTOR_IDS.map((s) => count * shares[s]);
    const counts = raw.map(Math.floor);
    let left = count - counts.reduce((a, b) => a + b, 0);
    const order = SECTOR_IDS.map((_, i) => i).sort(
      (a, b) => raw[b]! - counts[b]! - (raw[a]! - counts[a]!) || a - b,
    );
    for (const i of order) if (left-- > 0) counts[i]!++;
    SECTOR_IDS.forEach((sector, i) => {
      if (counts[i]! > 0) out.push({ kind, sector, count: counts[i]! });
    });
  };
  const fit = (counts: [EnemyKind, number][], cap: number) => {
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    if (total <= cap) return counts;
    return counts.map(([k, n]): [EnemyKind, number] => [k, Math.round((n * cap) / total)]);
  };
  const G = threat.ground;
  if (G > 0) {
    const brutes = Math.round((G * WAVE_UNITS.brute[age]!) / ENEMIES.brute.power);
    const scouts = Math.round((G * WAVE_UNITS.scout) / ENEMIES.scout.power);
    const rest = G - brutes * ENEMIES.brute.power - scouts * ENEMIES.scout.power;
    const soldiers = Math.max(1, Math.round(rest / ENEMIES.soldier.power));
    for (const [k, n] of fit(
      [
        ['soldier', soldiers],
        ['scout', scouts],
        ['brute', brutes],
      ],
      BATTLE.maxGround,
    ))
      add(k, n, 'ground');
  }
  const A = threat.air;
  if (A > 0) {
    const spitters = Math.round((A * WAVE_UNITS.spitter[age]!) / ENEMIES.spitter.power);
    const rest = A - spitters * ENEMIES.spitter.power;
    const divers = Math.max(1, Math.round(rest / ENEMIES.diver.power));
    for (const [k, n] of fit(
      [
        ['diver', divers],
        ['spitter', spitters],
      ],
      BATTLE.maxAir,
    ))
      add(k, n, 'air');
  }
  return out;
}

/**
 * Where each sector's pack comes in: a rampart tile drawn around the middle of the sector, from
 * the wave's own hash (no draw from the colony's streams; the same on every device). Shown at
 * the announcement: turrets and guards there make the difference.
 */
export function waveGates(state: GameState, waveId: string): Record<SectorId, Hex> {
  const rng = createRng(`${state.seed}/${state.face}/${state.colony.index}/${waveId}/gates`);
  const out = {} as Record<SectorId, Hex>;
  for (const s of SECTOR_IDS) {
    const tiles = gateTiles(state, s);
    // The middle of the sector more often than its edges (mean of three draws).
    const u = (rng.next() + rng.next() + rng.next()) / 3;
    const pick = tiles[Math.min(tiles.length - 1, Math.floor(u * tiles.length))];
    out[s] = pick ? { q: pick.q, r: pick.r } : { q: 0, r: 0 };
  }
  return out;
}

/** Rampart tiles of a sector, from one edge to the other (where its gate may be). */
export function gateTiles(state: GameState, sector: SectorId): Hex[] {
  const rampart = rampartSectors(faceMapOf(state));
  const signed = (t: Hex) => {
    const d = angleOf(t) - SECTOR_MIDDLE[sector];
    return Math.atan2(Math.sin(d), Math.cos(d));
  };
  return rampart.tiles
    .filter((_, i) => rampart.sectors[i] === sector)
    .map((t) => ({ t, a: signed(t) }))
    .sort((x, y) => x.a - y.a || x.t.q - y.t.q || x.t.r - y.t.r)
    .map((x) => ({ q: x.t.q, r: x.t.r }));
}

/**
 * Chance of each rampart tile of a sector to be its next gate (the same law as `waveGates`:
 * the mean of three uniform draws), for planning turrets.
 */
export function gateOdds(state: GameState, sector: SectorId): { tile: Hex; p: number }[] {
  const tiles = gateTiles(state, sector);
  const n = tiles.length;
  // CDF of the mean of three uniforms (Irwin–Hall, n = 3, scaled).
  const cdf = (x: number) => {
    const y = Math.max(0, Math.min(3, 3 * x));
    if (y <= 1) return y ** 3 / 6;
    if (y <= 2) return (-2 * y ** 3 + 9 * y ** 2 - 9 * y + 3) / 6;
    return 1 - (3 - y) ** 3 / 6;
  };
  return tiles.map((tile, i) => ({ tile, p: cdf((i + 1) / n) - cdf(i / n) }));
}

/** Power multiplier of each predator so that the squads weigh what the wave announced. */
function squadScale(squads: Squad[], threat: Sides): Sides {
  const nominal = { ground: 0, air: 0 };
  for (const q of squads) {
    const p = ENEMIES[q.kind];
    nominal[isFlyer(q.kind) ? 'air' : 'ground'] += q.count * p.power;
  }
  return {
    ground: nominal.ground > 0 ? threat.ground / nominal.ground : 1,
    air: nominal.air > 0 ? threat.air / nominal.air : 1,
  };
}

/** Level shown on a predator's card: its age, then how much stronger than nominal it is. */
function enemyLevel(age: number, k: number): number {
  const extra = Math.max(0, Math.min(2, Math.round(2 * Math.log2(Math.max(1, k)))));
  return Math.min(30, 1 + 3 * age + extra);
}

/** Azimuth of the middle of a sector. */
const SECTOR_MIDDLE: Record<SectorId, number> = {
  front: FRONT_AZIMUTH,
  left: FRONT_AZIMUTH + (2 * Math.PI) / 3,
  right: FRONT_AZIMUTH - (2 * Math.PI) / 3,
};

const angleOf = (h: Hex) => {
  const p = hexToPixel(h);
  return Math.atan2(p.x, p.y);
};
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Walk cost of a rampart tile for the predators (they climb down from the skin). */
const RAMPART_COST = 3;

export interface WaveBattleOptions {
  /** Multiplies the predators' power (luck on the day, or the forecast's bad / good luck). */
  luck: number;
  sheltered: boolean;
  /** Round the loot (the forecast: the stock moves every second, the outcome barely). */
  roughLoot?: boolean;
}

/** Battle setup of a wave against the colony as it is now. */
export function waveSetup(
  state: GameState,
  wave: PlannedWave,
  threat: Sides,
  opts: WaveBattleOptions,
): BattleSetup {
  const map = faceMapOf(state);
  const season = seasonOf(state);
  const paths = pathSet(state);
  const age = ageOf(state);

  // --- Tiles and the rampart -------------------------------------------------------------------
  const covered = new Set<string>();
  const footprints = state.buildings.map((b) => {
    const tiles = footprintTiles(b);
    for (const h of tiles) covered.add(hexKey(h));
    return tiles;
  });
  const tiles: BattleTile[] = [];
  const exits: Record<SectorId, { i: number; a: number }[]> = { front: [], left: [], right: [] };
  for (const t of map.tiles) {
    const rampart = isRampart(map, t.q, t.r);
    const cost = rampart ? RAMPART_COST : walkCost(map, paths, t, season);
    if (rampart && !covered.has(hexKey(t)))
      exits[rampartSectorOf(t)].push({ i: tiles.length, a: angleOf(t) });
    tiles.push({ q: t.q, r: t.r, cost });
  }
  for (const s of SECTOR_IDS) exits[s].sort((x, y) => x.a - y.a || x.i - y.i);
  const walkable = (k: string, i: number) => Number.isFinite(tiles[i]!.cost) && !covered.has(k);
  const tileIndex = new Map(tiles.map((t, i) => [hexKey(t), i]));

  // --- Buildings and what can be carried away ---------------------------------------------------
  const safe = protectedStock(state);
  const depots = state.buildings.filter((b) => b.type === 'nest' || b.type === 'warehouse');
  const depotStorage = depots.map((b) => levelDef(b.type, b.level)?.storage ?? 0);
  const storageSum = depotStorage.reduce((a, b) => a + b, 0);
  const rough = (x: number) => {
    if (x <= 0) return 0;
    // Whole units (floats of the stock never change a battle), two digits for the forecast.
    if (!opts.roughLoot) return Math.floor(x);
    const p = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
    return Math.round(x / p) * p;
  };
  const damageable = (b: Building) =>
    b.type !== 'nest' && b.type !== 'camp' && b.type !== 'monument' && !b.damaged;
  const buildings: BattleBuilding[] = state.buildings.map((b, i) => {
    const d = depots.indexOf(b);
    const loot: [number, number, number, number] = [0, 0, 0, 0];
    RESOURCE_IDS.forEach((r, k) => {
      const stock =
        d >= 0 && storageSum > 0
          ? (Math.max(0, state.resources[r] - safe[r]) * depotStorage[d]!) / storageSum
          : 0;
      loot[k] = rough(THREATS.lootShare * (stock + (b.reserve?.[r] ?? 0)));
    });
    const reserve = RESOURCE_IDS.some((r) => (b.reserve?.[r] ?? 0) > 0);
    const turret = !!levelDef(b.type, b.level)?.defense;
    return {
      ref: b.id,
      type: b.type,
      side: 0,
      tiles: footprints[i]!,
      hp: damageable(b) ? BATTLE.buildingHp.base + BATTLE.buildingHp.perLevel * b.level : 0,
      loot,
      priority: reserve ? 1.2 : d >= 0 ? 1 : turret ? 0.4 : 0.6 + 0.05 * Math.min(b.level, 12),
    };
  });
  const lootTotal = buildings.reduce((sum, b) => sum + b.loot.reduce((a, x) => a + x, 0), 0);

  // --- Predators ----------------------------------------------------------------------------
  const squads = wave.squads ?? waveSquads(state, threat);
  const gates = { ...waveGates(state, wave.id), ...wave.gates };
  const scale = squadScale(squads, threat);
  const units: BattleUnitSetup[] = [];
  let carrySum = 0;
  for (const q of squads) carrySum += q.count * ENEMIES[q.kind].carry;
  const carryUnit = carrySum > 0 ? (BATTLE.carry * lootTotal) / carrySum : 0;
  for (const sector of SECTOR_IDS) {
    // The pack comes in around its gate (the free rampart tiles closest to it).
    const all = SECTOR_IDS.flatMap((s) => exits[s]);
    const gate = gates[sector];
    const byGate = (exits[sector].length > 0 ? exits[sector] : all)
      .map((e) => ({ e, d: hexDistance(tiles[e.i]!, gate) }))
      .sort((x, y) => x.d - y.d || x.e.i - y.e.i);
    const pack = byGate.filter((x) => x.d <= byGate[0]!.d + BATTLE.packWidth).map((x) => x.e);
    const inSector = squads.filter((q) => q.sector === sector);
    let j = 0;
    for (const q of inSector) {
      const air = isFlyer(q.kind);
      const k = (air ? scale.air : scale.ground) * opts.luck;
      for (let c = 0; c < q.count; c++, j++) {
        const at = tiles[pack[j % pack.length]!.i]!;
        const u = enemyUnit(
          q.kind,
          k,
          `${wave.id}-${units.length + 1}`,
          { q: at.q, r: at.r },
          j * BATTLE.enterGap,
          sector,
          enemyLevel(age, k),
        );
        u.carry = ENEMIES[q.kind].carry * carryUnit;
        units.push(u);
      }
    }
    // The pack gathers at its gate until its last member is in, then charges.
    const hold = Math.max(0, j - 1) * BATTLE.enterGap + BATTLE.gather;
    for (const u of units) if (u.side === 1 && u.sector === sector) u.hold = hold;
  }
  const exitList = SECTOR_IDS.flatMap((s) => exits[s].map((e) => e.i));

  // --- Turrets ------------------------------------------------------------------------------
  const defense = defenseOf(state, threat);
  state.buildings.forEach((b, i) => {
    const t = turretUnit(b, state, defense.ammo.share, i);
    if (!t) return;
    const def = levelDef(b.type, b.level)!.defense!;
    if (!((def.ground ?? 0) > 0 && threat.ground > 0) && !((def.air ?? 0) > 0 && threat.air > 0))
      return;
    units.push(t);
  });

  // --- Kiwis --------------------------------------------------------------------------------
  const taken = new Map<number, number>();
  const room = (i: number, size: number) => (taken.get(i) ?? 0) + size <= BATTLE.tileCap;
  const take = (i: number, size: number) => taken.set(i, (taken.get(i) ?? 0) + size);
  /** Nearest free tile around a spot (rings up to 3). */
  const near = (h: Hex, size: number): Hex | null => {
    for (let r = 0; r <= 3; r++)
      for (const x of hexDisk(h, r)) {
        const k = hexKey(x);
        const i = tileIndex.get(k);
        if (i === undefined || !walkable(k, i) || !room(i, size)) continue;
        take(i, size);
        return x;
      }
    return null;
  };
  // The garrison at its posts: a band near the rampart, from the middle of the sector outwards.
  const sectorOf = new Map(defense.guards.map((g) => [g.id, g.sector]));
  const posts: Record<SectorId, number[]> = { front: [], left: [], right: [] };
  map.tiles.forEach((t, i) => {
    const k = hexKey(t);
    if (t.rho < 0.6 || t.rho > 0.85 || !walkable(k, i)) return;
    posts[rampartSectorOf(t)].push(i);
  });
  for (const s of SECTOR_IDS)
    posts[s].sort(
      (a, b) =>
        hexDistance(tiles[a]!, gates[s]) - hexDistance(tiles[b]!, gates[s]) ||
        angleGap(angleOf(tiles[a]!), SECTOR_MIDDLE[s]) -
          angleGap(angleOf(tiles[b]!), SECTOR_MIDDLE[s]) ||
        a - b,
    );
  for (const v of garrisonOf(state)) {
    const sector = state.threats.pins[v.id] ?? sectorOf.get(v.id) ?? 'front';
    const size = v.kikiwiwi ? 2 : 1;
    const post = posts[sector].find((i) => room(i, size) && (taken.get(i) ?? 0) === 0);
    let at: Hex | null = null;
    if (post !== undefined) {
      take(post, size);
      at = tiles[post]!;
    } else at = near(state.buildings[0] ?? { q: 0, r: 0 }, size);
    if (at) units.push(kiwiUnit(v, state, 'guard', { q: at.q, r: at.r }, sector));
  }
  // The kiwis at work or idle peck at whatever comes near (nobody during a shelter).
  if (!opts.sheltered) {
    const nestB = state.buildings.find((b) => b.type === 'nest');
    for (const v of state.villagers) {
      if (v.job.kind !== 'work' && v.job.kind !== 'idle') continue;
      const job = v.job;
      const place =
        job.kind === 'work' ? state.buildings.find((b) => b.id === job.buildingId) : nestB;
      if (!place) continue;
      const at = near(place, v.kikiwiwi ? 2 : 1);
      if (at) units.push(kiwiUnit(v, state, 'militia', at, rampartSectorOf(at)));
    }
  }

  return {
    tiles,
    exits: exitList,
    maxDamaged: THREATS.maxDamaged,
    buildings,
    units,
    orders: [
      { posture: state.threats.posture, retreatBelow: 0 },
      { posture: 'bold', retreatBelow: BATTLE.retreatBelow },
    ],
  };
}

/**
 * The gates of an announced wave that no turret of the right model reaches (a pack of ferrets
 * needs a seed turret, a flight of bats a sky turret, within range of its gate).
 */
export function uncoveredGates(
  state: GameState,
  wave: PlannedWave,
): { sector: SectorId; side: 'ground' | 'air' }[] {
  const gates = { ...waveGates(state, wave.id), ...wave.gates };
  const squads = wave.squads ?? waveSquads(state, { ground: wave.ground, air: wave.air });
  const out: { sector: SectorId; side: 'ground' | 'air' }[] = [];
  for (const sector of SECTOR_IDS)
    for (const side of ['ground', 'air'] as const) {
      const comes = squads.some((q) => q.sector === sector && isFlyer(q.kind) === (side === 'air'));
      if (!comes) continue;
      const type = side === 'air' ? 'skyTurret' : 'seedTurret';
      const reached = state.buildings.some(
        (b) => b.type === type && hexDistance(b, gates[sector]) <= turretRange(b.type, b.level),
      );
      if (!reached) out.push({ sector, side });
    }
  return out;
}
