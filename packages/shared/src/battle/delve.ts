import { SKILLS } from '../data/classes';
import { hexDisk, hexDistance, type Hex } from '../hex/hex';
import { DEPTHS, type HazardKind } from '../data/depths';
import type { LandingOrders } from '../data/landing';
import { isFlyer } from '../data/units';
import { createRng } from '../rng/rng';
import type { AlienUnit } from '../sim/civ';
import type { GameState, RoomHazard, Villager } from '../sim/state';
import { alienUnit, capped } from './landing';
import { kiwiUnit } from './units';
import type { BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 48: a delve as a battle. The field is a round room of the flesh; the crew comes in
 * from the passage on one side (its way back), the Grouillants wait on the far side and charge
 * (bold, to the last). Before the fight, the room's hazard strikes: each kiwi may lose a share
 * of its hit points (falls: Endurance; cuts: Dexterity), drawn from the battle's seed so the
 * journal starts from the very same wounds. The same builder serves the truth and the forecast.
 */

export interface DelveInput {
  units: AlienUnit[];
  hazard: RoomHazard | null;
  orders: LandingOrders;
  /** Share of the outbound rations the crew had (hunger weakens the blows). */
  fed: number;
  /** Seed of the hazard's draws (the battle's own seed). */
  seed: string;
}

/** A hazard's harm on one kiwi: who was hit and the share of its hit points lost. */
export interface HazardHit {
  id: string;
  share: number;
}

const ROOM_RADIUS = 4;
const ENTRY: Hex = { q: 0, r: ROOM_RADIUS };
const FAR: Hex = { q: 0, r: -ROOM_RADIUS };
const CENTRE: Hex = { q: 0, r: 0 };

/** The stat that lessens a hazard. */
export function hazardStat(kind: HazardKind): 'endurance' | 'dexterity' {
  return kind === 'cuts' ? 'dexterity' : 'endurance';
}

/**
 * Share of a hazard a kiwi escapes by its stat (0–`statCap`), then by the crew's spelunkers
 * (`hazardFactor`, chantier 48 part 4): the chance to be hit and the harm both shrink by it.
 */
export function hazardShield(v: Villager, kind: HazardKind): number {
  const h = DEPTHS.hazard;
  return Math.min(h.statCap, h.perStat * Math.max(0, v.stats[hazardStat(kind)] - 5));
}

/**
 * Multiplier of a hazard on this kiwi from the crew: a spelunker's sure footing for itself,
 * a quarter less for the others of a crew with one (1 without).
 */
export function hazardFactor(v: Villager, crew: readonly Villager[]): number {
  if (v.classId === 'spelunker') return SKILLS.spelunkerSelf;
  return crew.some((x) => x.classId === 'spelunker') ? SKILLS.spelunkerCrew : 1;
}

/** Chance to be hit and share of hit points lost for one kiwi (before the floor). */
export function hazardOdds(
  v: Villager,
  crew: readonly Villager[],
  hazard: RoomHazard,
): { chance: number; harm: number } {
  const keep = (1 - hazardShield(v, hazard.kind)) * hazardFactor(v, crew);
  return { chance: DEPTHS.hazard.chance * keep, harm: hazard.strength * keep };
}

/** The hazard's draws: who is hit, and how hard (never below the floor of hit points). */
export function hazardHits(
  crew: readonly Villager[],
  hazard: RoomHazard | null,
  seed: string,
): HazardHit[] {
  if (!hazard) return [];
  const rng = createRng(`${seed}/hazard`);
  const out: HazardHit[] = [];
  for (const v of crew) {
    const { chance, harm } = hazardOdds(v, crew, hazard);
    const roll = rng.next();
    if (roll >= chance) continue;
    const share = Math.min(1 - DEPTHS.hazard.floor, harm);
    if (share > 0) out.push({ id: v.id, share: Math.round(share * 100) / 100 });
  }
  return out;
}

export function delveSetup(
  state: GameState,
  crew: readonly Villager[],
  input: DelveInput,
): BattleSetup {
  const disk = hexDisk(CENTRE, ROOM_RADIUS);
  const tiles: BattleTile[] = disk.map((h) => ({ q: h.q, r: h.r, cost: 1 }));
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => hexDistance(t, ENTRY) <= 1)
    .map(({ i }) => i);
  const byEntry = [...disk].sort(
    (a, b) => hexDistance(a, ENTRY) - hexDistance(b, ENTRY) || a.q - b.q || a.r - b.r,
  );
  const hits = new Map(hazardHits(crew, input.hazard, input.seed).map((h) => [h.id, h.share]));
  const hunger = 0.5 + 0.5 * Math.max(0, Math.min(1, input.fed));
  const units: BattleUnitSetup[] = [];
  crew.forEach((v, i) => {
    const at = byEntry[Math.floor(i / 2) % byEntry.length] ?? ENTRY;
    const u = kiwiUnit(v, state, 'guard', at, null, 1);
    units.push({
      ...u,
      role: 'assault',
      power: 1,
      hp: u.hp * (1 - (hits.get(v.id) ?? 0)),
      weapon: { ...u.weapon, damage: u.weapon.damage * hunger },
    });
  });
  // The Grouillants wait at the far end of the room: crawlers nearest the far wall, fliers
  // over the middle of their side.
  const far = [...disk]
    .filter((h) => hexDistance(h, ENTRY) >= ROOM_RADIUS)
    .sort((a, b) => hexDistance(a, FAR) - hexDistance(b, FAR) || a.q - b.q || a.r - b.r);
  const middle = [...far].sort(
    (a, b) => hexDistance(a, CENTRE) - hexDistance(b, CENTRE) || a.q - b.q || a.r - b.r,
  );
  let n = 0;
  for (const { unit, count, k } of capped(input.units)) {
    const list = isFlyer(unit.kind) ? middle : far;
    for (let i = 0; i < count; i++, n++)
      units.push(alienUnit(unit, k, `g${n}`, list[n % list.length]!, 0));
  }
  return {
    tiles,
    exits,
    buildings: [],
    units,
    orders: [
      { posture: 'bold', retreatBelow: 0 },
      {
        posture: input.orders.posture,
        retreatBelow: 1 - input.orders.retreatAt + 1e-6,
        priority: input.orders.priority,
      },
    ],
    clearEnds: true,
  };
}
