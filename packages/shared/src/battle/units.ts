import type { Hex } from '../hex/hex';
import type { SectorId } from '../data/threats';
import {
  CLASS_WEAPONS,
  ENEMIES,
  KIWI_UNIT,
  TURRET_SHOT,
  WEAPONS,
  type EnemyKind,
  type WeaponId,
} from '../data/units';
import { KIWI } from '../data/kiwis';
import type { Building, GameState, Villager } from '../sim/state';
import { modifiers } from '../sim/kiwis';
import { techEffects } from '../sim/research';
import { titanPower } from '../sim/kikiwiwi';
import { levelDef } from '../data/buildings';
import { turretRange } from '../sim/threats';
import type { BattleSide, BattleUnitSetup, UnitRole } from './types';

/**
 * Chantier 36: fighters from the game. A kiwi's profile comes from its stats (Strength → hits,
 * Endurance → hit points, Agility → speed and dodge, Dexterity → aim, Spirit → spells), its
 * level, its class (beak, mace, sword, fireball, sling) and the technologies; a predator from
 * its kind, scaled to the wave; a turret from its level and the seeds it can fire.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Weapon of a kiwi (class, firearms, Kikiwiwi). */
export function kiwiWeapon(v: Villager, state: GameState): WeaponId {
  if (v.kikiwiwi) return 'stomp';
  if (v.classId === 'warrior' && techEffects(state).firearms) return 'musket';
  return CLASS_WEAPONS[v.classId ?? 'none'];
}

export function kiwiUnit(
  v: Villager,
  state: GameState,
  role: Extract<UnitRole, 'guard' | 'militia'>,
  at: Hex,
  sector: SectorId | null,
  side: BattleSide = 0,
): BattleUnitSetup {
  const K = KIWI_UNIT;
  const avg = KIWI.stat.average;
  const st = v.stats;
  const tech = techEffects(state);
  const weaponId = role === 'militia' && !v.kikiwiwi ? 'beak' : kiwiWeapon(v, state);
  const base = WEAPONS[weaponId];
  const level = 1 + K.perLevel * (v.level - 1);
  const fight = Math.sqrt(modifiers(v).fight);
  const titan = titanPower(state, v);
  const spell = weaponId === 'fireball';
  const power = spell
    ? 1 + K.spiritDamage * (st.spirit - avg)
    : 1 + K.strengthDamage * (st.strength - avg);
  const damage =
    base.damage *
    Math.max(0.5, power) *
    level *
    fight *
    titan *
    (role === 'guard' ? tech.guard : K.militiaDamage);
  const aim =
    base.style === 'melee'
      ? base.accuracy
      : clamp(base.accuracy + K.dexterityAccuracy * (st.dexterity - avg), ...K.accuracy);
  const hp =
    K.hp *
    Math.max(0.5, 1 + K.enduranceHp * (st.endurance - avg)) *
    level *
    fight *
    (v.kikiwiwi ? K.titanHp / 2 : 1);
  return {
    ref: v.id,
    side,
    body: v.kikiwiwi ? 'kikiwiwi' : 'kiwi',
    role,
    kind: v.classId ?? 'none',
    name: v.name,
    level: v.level,
    classId: v.classId,
    hp,
    // Armour (technology) spares the kiwis.
    armor: clamp(1 - tech.injuries, 0, 0.6),
    speed: K.speed * Math.max(0.5, 1 + K.agilitySpeed * (st.agility - avg)),
    dodge: clamp(K.dodge + K.agilityDodge * (st.agility - avg), 0, K.maxDodge),
    size: v.kikiwiwi ? K.titanSize : 1,
    flying: false,
    fixed: false,
    weaponId,
    weapon: { ...base, damage, accuracy: aim },
    ammo: null,
    carry: 0,
    power: 0,
    at,
    delay: 0,
    building: null,
    fightsBack: true,
    huntsKiwis: false,
    sector,
  };
}

/**
 * A predator of a wave. `k` scales its power (hit points and damage each by √k): a wave stronger
 * than its unit cap sends stronger predators, not more of them.
 */
export function enemyUnit(
  kind: EnemyKind,
  k: number,
  ref: string,
  at: Hex,
  delay: number,
  sector: SectorId | null,
  level: number,
): BattleUnitSetup {
  const p = ENEMIES[kind];
  const s = Math.sqrt(Math.max(0.05, k));
  const weapon = WEAPONS[p.weapon];
  return {
    ref,
    side: 1,
    body: p.body,
    role: 'raider',
    kind,
    name: '',
    level,
    classId: null,
    hp: p.hp * s,
    armor: p.armor,
    speed: p.speed,
    dodge: p.dodge,
    size: p.body === 'bat' ? 0 : p.size,
    flying: p.body === 'bat',
    fixed: false,
    weaponId: p.weapon,
    weapon: { ...weapon, damage: weapon.damage * s },
    ammo: null,
    carry: p.carry,
    power: p.power * k,
    at,
    delay,
    building: null,
    fightsBack: p.fightsBack,
    huntsKiwis: p.huntsKiwis,
    sector,
  };
}

/**
 * A turret as a fixed unit: a shot deals its defense × `TURRET_SHOT` (× technologies), and it
 * fires its level's ammo × the share of seeds the colony has (null: no defense).
 */
export function turretUnit(
  b: Building,
  state: GameState,
  ammoShare: number,
  buildingIndex: number,
): BattleUnitSetup | null {
  const def = levelDef(b.type, b.level);
  if (!def?.defense) return null;
  const air = (def.defense.air ?? 0) > 0;
  const defense = (air ? def.defense.air : def.defense.ground) ?? 0;
  const weaponId: WeaponId = air ? 'skyShot' : 'seedShot';
  const w = WEAPONS[weaponId];
  return {
    ref: b.id,
    side: 0,
    body: 'turret',
    role: 'turret',
    kind: b.type,
    name: '',
    level: b.level,
    classId: null,
    hp: 1,
    armor: 0,
    speed: 0,
    dodge: 0,
    size: 0,
    flying: false,
    fixed: true,
    weaponId,
    weapon: {
      ...w,
      damage: defense * TURRET_SHOT * techEffects(state).turretDefense,
      range: turretRange(b.type, b.level),
    },
    ammo: Math.floor((def.ammo ?? 0) * ammoShare + 1e-9),
    carry: 0,
    power: 0,
    at: { q: b.q, r: b.r },
    delay: 0,
    building: buildingIndex,
    fightsBack: false,
    huntsKiwis: false,
    sector: null,
  };
}
