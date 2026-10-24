import { hexDisk, hexDistance, hexKey, hexNeighbors, type Hex } from '../hex/hex';
import { CIV } from '../data/aliens';
import { INTEL } from '../data/expeditions';
import { ITEMS } from '../data/gear';
import { LANDING, type LandingOrders } from '../data/landing';
import { BATTLE, ENEMIES, KIWI_UNIT } from '../data/units';
import type { AlienBuilding, AlienUnit } from '../sim/civ';
import { sectorOf } from '../sim/aliens';
import type { GameState, Villager } from '../sim/state';
import { enemyUnit, kiwiUnit } from './units';
import type { BattleBuilding, BattleLog, BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 40: a landing as a battle. The field is the parcel of the alien face (plus a margin
 * where help from the neighbouring parcels comes in), its buildings are walls, its garrison
 * charges the crew (bold, to the last), our kiwis fight by their orders around the ship and
 * run back to it past the retreat threshold. The same builder serves the truth (server) and the
 * forecast (public view), so the practice battles play by the very same rules.
 */

/** Help sent from a neighbouring parcel (a standing barracks there). */
export interface LandingHelp {
  from: number;
  units: AlienUnit[];
}

export interface LandingInput {
  sector: number;
  units: AlienUnit[];
  help: LandingHelp[];
  buildings: AlienBuilding[];
  orders: LandingOrders;
  /** Share of the outbound rations the crew had (hunger weakens the blows). */
  fed: number;
}

export type LandingOutcome = 'victory' | 'retreat' | 'defeat';

const FIELD_RADIUS = CIV.ring.max + 1;
const SLICE = Math.PI / 3;

/** Angle of a tile around the heart, as `sectorOf` measures it. */
function angleOf(h: Hex): number {
  const p = { x: Math.sqrt(3) * (h.q + h.r / 2), y: 1.5 * h.r };
  return (Math.atan2(p.y, p.x) + 2 * Math.PI) % (2 * Math.PI);
}

/** The tiles of a parcel (inside the face's ring of buildings). */
export function parcelTiles(sector: number): Hex[] {
  return hexDisk({ q: 0, r: 0 }, FIELD_RADIUS).filter(
    (h) => hexDistance(h, { q: 0, r: 0 }) >= 1 && sectorOf(h.q, h.r) === sector,
  );
}

/**
 * Where the ship sets down: near the outer edge of the parcel, in the middle of its slice (an
 * inner parcel is reached from the outer ring), never on a building.
 */
export function landingTile(sector: number, blocked: ReadonlySet<string> = new Set()): Hex {
  const inner = sector < INTEL.sectors / 2;
  const edge = (inner ? INTEL.innerRadius : FIELD_RADIUS) - LANDING.inset;
  const mid = ((sector % 6) + 0.5) * SLICE;
  const gap = (h: Hex) => {
    const d = angleOf(h) - mid;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  };
  const tiles = parcelTiles(sector).filter((h) => !blocked.has(hexKey(h)));
  let best = tiles[0] ?? { q: 0, r: 0 };
  let bestScore = Infinity;
  for (const h of tiles) {
    const score = Math.abs(hexDistance(h, { q: 0, r: 0 }) - edge) * 2 + gap(h);
    if (score < bestScore - 1e-9) {
      best = h;
      bestScore = score;
    }
  }
  return best;
}

/** A unit of the parcel's garrison: its kind scaled by `k`, its level, its gear. */
export function alienUnit(
  u: AlienUnit,
  k: number,
  ref: string,
  at: Hex,
  delay: number,
): BattleUnitSetup {
  const base = enemyUnit(u.kind, k, ref, at, delay, null, u.level);
  const level = 1 + KIWI_UNIT.perLevel * Math.max(0, u.level - 1);
  const w = u.weapon ? ITEMS[u.weapon] : null;
  const a = u.armor ? ITEMS[u.armor] : null;
  return {
    ...base,
    side: 0,
    role: 'guard',
    hp: base.hp * level * (a?.hp ?? 1),
    armor: Math.min(0.6, base.armor + (a?.armor ?? 0)),
    speed: base.speed * (a?.speed ?? 1),
    weapon: { ...base.weapon, damage: base.weapon.damage * level * (w?.damage ?? 1) },
    carry: 0,
  };
}

/** Unit counts within the caps: more power makes the aliens stronger, not more numerous. */
export function capped(units: AlienUnit[]): { unit: AlienUnit; count: number; k: number }[] {
  const flying = (u: AlienUnit) => ENEMIES[u.kind].body === 'bat';
  const scale = (air: boolean) => {
    const total = units.filter((u) => flying(u) === air).reduce((s, u) => s + u.count, 0);
    const cap = air ? LANDING.maxAir : LANDING.maxGround;
    return total > cap ? total / cap : 1;
  };
  const k = { ground: scale(false), air: scale(true) };
  return units
    .filter((u) => u.count > 0)
    .map((unit) => {
      const f = flying(unit) ? k.air : k.ground;
      const count = Math.max(1, Math.round(unit.count / f));
      return { unit, count, k: unit.count / count };
    });
}

/** The field of a parcel's battle: the parcel and a margin of two tiles, its alien buildings. */
export interface ParcelField {
  own: Hex[];
  keys: Set<string>;
  field: Map<string, Hex>;
  tiles: BattleTile[];
  buildings: BattleBuilding[];
  blocked: Set<string>;
}

export function parcelField(
  sector: number,
  alien: readonly AlienBuilding[],
  side: 0 | 1 = 0,
): ParcelField {
  const own = parcelTiles(sector);
  const keys = new Set(own.map((h) => hexKey(h)));
  // A margin of two tiles around the parcel: help comes in from there.
  const field = new Map<string, Hex>();
  for (const h of own) field.set(hexKey(h), h);
  for (let ring = 0; ring < 2; ring++)
    for (const h of [...field.values()])
      for (const n of hexNeighbors(h)) {
        const d = hexDistance(n, { q: 0, r: 0 });
        if (d < 1 || d > FIELD_RADIUS) continue;
        field.set(hexKey(n), n);
      }
  const tiles: BattleTile[] = [...field.values()]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((h) => ({ q: h.q, r: h.r, cost: 1 }));
  const blocked = new Set<string>();
  const buildings: BattleBuilding[] = [];
  for (const b of alien) {
    const key = hexKey(b);
    if (!field.has(key) || blocked.has(key)) continue;
    blocked.add(key);
    buildings.push({
      ref: `${b.kind}:${b.q},${b.r}`,
      type: b.kind,
      side,
      tiles: [{ q: b.q, r: b.r }],
      hp: 0,
      loot: [0, 0, 0, 0],
      priority: 0,
    });
  }
  return { own, keys, field, tiles, buildings, blocked };
}

export function landingSetup(
  state: GameState,
  crew: readonly Villager[],
  input: LandingInput,
): BattleSetup {
  const { sector } = input;
  const { own, keys, field, tiles, buildings, blocked } = parcelField(sector, input.buildings);
  const ship = landingTile(sector, blocked);
  const shipKey = hexKey(ship);
  const free = (h: Hex) => field.has(hexKey(h)) && !blocked.has(hexKey(h));
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => hexDistance(t, ship) <= 1 && free(t))
    .map(({ i }) => i);

  const units: BattleUnitSetup[] = [];
  // The crew steps out around the ship (closest tiles first, a few per tile).
  const around = tiles
    .filter((t) => free(t))
    .sort(
      (a, b) =>
        hexDistance(a, ship) - hexDistance(b, ship) ||
        (hexKey(a) === shipKey ? -1 : 0) ||
        a.q - b.q ||
        a.r - b.r,
    );
  const hunger = 0.5 + 0.5 * Math.max(0, Math.min(1, input.fed));
  crew.forEach((v, i) => {
    const at = around[Math.floor(i / 2) % Math.max(1, around.length)] ?? ship;
    const u = kiwiUnit(v, state, 'guard', at, null, 1);
    units.push({
      ...u,
      role: 'assault',
      power: 1,
      weapon: { ...u.weapon, damage: u.weapon.damage * hunger },
    });
  });

  // The garrison stands around its burrows (ferrets) and roosts (bats), the others anywhere.
  const posts = (air: boolean): Hex[] => {
    const kind = air ? 'roost' : 'burrow';
    const near = input.buildings.filter((b) => b.kind === kind && field.has(hexKey(b)));
    const from = near.length > 0 ? near : input.buildings.filter((b) => keys.has(hexKey(b)));
    const out: Hex[] = [];
    for (const b of from)
      for (const n of hexNeighbors(b)) if (free(n) && keys.has(hexKey(n))) out.push(n);
    if (out.length === 0) out.push(...own.filter((h) => free(h) && hexDistance(h, ship) >= 3));
    return out.length > 0 ? out : [ship];
  };
  const groundPosts = posts(false);
  const airPosts = posts(true);
  let n = 0;
  for (const { unit, count, k } of capped(input.units)) {
    const air = ENEMIES[unit.kind].body === 'bat';
    const list = air ? airPosts : groundPosts;
    for (let i = 0; i < count; i++, n++)
      units.push(alienUnit(unit, k, `a${n}`, list[n % list.length]!, 0));
  }
  // Help from a neighbouring parcel comes in from its side of the margin.
  for (const help of input.help) {
    const gate = tiles.filter((t) => free(t) && sectorOf(t.q, t.r) === help.from);
    const entry = gate.length > 0 ? gate : groundPosts;
    let j = 0;
    for (const { unit, count, k } of capped(help.units))
      for (let i = 0; i < count; i++, j++, n++)
        units.push(
          alienUnit(
            unit,
            k,
            `h${n}`,
            entry[j % entry.length]!,
            LANDING.reinforce.delayS + j * BATTLE.enterGap,
          ),
        );
  }
  return {
    tiles,
    exits,
    buildings,
    units,
    orders: [
      { posture: 'bold', retreatBelow: 0 },
      {
        posture: input.orders.posture,
        // "Once this share has fallen": the engine runs below the share left.
        retreatBelow: 1 - input.orders.retreatAt + 1e-6,
        priority: input.orders.priority,
      },
    ],
    clearEnds: true,
  };
}

/** How a landing's battle ended: the field cleared with someone left, a retreat, or nobody back. */
export function landingOutcome(log: BattleLog): LandingOutcome {
  const r = log.result;
  const lost = r.lost?.length ?? r.attackers.fallen;
  if ((r.defendersLeft ?? 1) === 0 && lost < r.attackers.total) return 'victory';
  return r.attackers.escaped > 0 ? 'retreat' : 'defeat';
}
