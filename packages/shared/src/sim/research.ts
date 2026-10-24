import { gathered } from './speech';
import { levelDef } from '../data/buildings';
import { CYCLES } from '../data/cycles';
import { KIWI } from '../data/kiwis';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import {
  RESEARCH,
  RESEARCH_SCALE,
  TECH_IDS,
  TECHS,
  type TechEffects,
  type TechId,
} from '../data/research';
import { THREATS } from '../data/threats';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { isNight } from './calendar';
import { modifiers, rankOf } from './kiwis';
import { hungerWork } from './needs';
import { bedsOf, colonyMood, kiwiMoraleWork, presence } from './rest';
import type { Building, GameState, Villager } from './state';

/** Age reached by the colony (index in AGE_IDS, 0 = Eden): the level of its monument. */
export function ageOf(state: GameState): number {
  return state.buildings.find((b) => b.type === 'monument')?.level ?? 0;
}

/** Chantier 13: work rate at night (clear nights make it better, never more than by day). */
export function nightWork(state: GameState): number {
  return Math.min(1, CYCLES.nightWork * techEffects(state).nightWork);
}

export function hasTech(state: GameState, id: TechId): boolean {
  return state.research.done.includes(id);
}

export interface Effects {
  harvest: Record<ResourceId, number>;
  storage: number;
  turretDefense: number;
  guard: number;
  travel: number;
  rations: number;
  build: number;
  injuries: number;
  armor: number;
  recon: number;
  firearms: boolean;
  laboratory: boolean;
  terraform: boolean;
  kikiwiwiPower: number;
  kikiwiwiUpkeep: number;
  infusionRisk: number;
  nightWork: number;
  waveNotice: number;
  cometInterval: number;
  meteorStock: number;
  meteorDrill: boolean;
  forge: boolean;
}

const effectsCache = new Map<string, Effects>();

/** Everything the researched technologies change, combined (multipliers multiply). */
export function techEffects(state: GameState): Effects {
  const key = state.research.done.join(',');
  let out = effectsCache.get(key);
  if (out) return out;
  out = {
    harvest: { pulp: 1, fiber: 1, seeds: 1, juice: 1 },
    storage: 1,
    turretDefense: 1,
    guard: 1,
    travel: 1,
    rations: 1,
    build: 1,
    injuries: 1,
    armor: 0,
    recon: 0,
    firearms: false,
    laboratory: false,
    terraform: false,
    kikiwiwiPower: 1,
    kikiwiwiUpkeep: 1,
    infusionRisk: 0,
    nightWork: 1,
    waveNotice: 0,
    cometInterval: 1,
    meteorStock: 1,
    meteorDrill: false,
    forge: false,
  };
  for (const id of state.research.done) {
    const e: TechEffects = TECHS[id].effects;
    for (const r of RESOURCE_IDS) out.harvest[r] *= e.harvest?.[r] ?? 1;
    out.storage *= e.storage ?? 1;
    out.turretDefense *= e.turretDefense ?? 1;
    out.guard *= e.guard ?? 1;
    out.travel *= e.travel ?? 1;
    out.rations *= e.rations ?? 1;
    out.build *= e.build ?? 1;
    out.injuries *= e.injuries ?? 1;
    out.armor += e.armor ?? 0;
    out.recon += e.recon ?? 0;
    out.firearms ||= e.firearms ?? false;
    out.laboratory ||= e.laboratory ?? false;
    out.terraform ||= e.terraform ?? false;
    out.kikiwiwiPower *= e.kikiwiwiPower ?? 1;
    out.kikiwiwiUpkeep *= e.kikiwiwiUpkeep ?? 1;
    out.infusionRisk += e.infusionRisk ?? 0;
    out.nightWork *= e.nightWork ?? 1;
    out.waveNotice += e.waveNotice ?? 0;
    out.cometInterval *= e.cometInterval ?? 1;
    out.meteorStock *= e.meteorStock ?? 1;
    out.meteorDrill ||= e.meteorDrill ?? false;
    out.forge ||= e.forge ?? false;
  }
  if (effectsCache.size > 64) effectsCache.clear();
  effectsCache.set(key, out);
  return out;
}

export function libraries(state: GameState): Building[] {
  return state.buildings.filter((b) => b.type === 'library');
}

/** Highest Library level of the colony (0: none). */
export function libraryLevel(state: GameState): number {
  return libraries(state).reduce((max, b) => Math.max(max, b.level), 0);
}

/** Research power of one kiwi, 1 for an average newborn: Spirit, research mastery, class. */
export function researchPower(v: Villager): number {
  const spirit = 1 + RESEARCH.spirit * (v.stats.spirit - KIWI.stat.average);
  const rank = 1 + KIWI.rankBonus * rankOf(v.mastery.research);
  return Math.max(KIWI.minPower, spirit * rank * modifiers(v).research);
}

/** Research points per hour of the whole colony (constant between two events). */
export function researchPerHour(state: GameState): number {
  if (gathered(state)) return 0;
  const libs = libraries(state);
  if (libs.length === 0) return 0;
  const beds = bedsOf(state);
  const mood = colonyMood(state);
  let total = 0;
  for (const b of libs) {
    const base = levelDef(b.type, b.level)?.research ?? 0;
    const damaged = b.damaged ? THREATS.damagedWork : 1;
    for (const v of state.villagers) {
      if (v.job.kind !== 'work' || v.job.buildingId !== b.id) continue;
      total +=
        base *
        researchPower(v) *
        presence(state, v, beds.get(v.id)) *
        kiwiMoraleWork(state, v, beds, mood) *
        damaged;
    }
  }
  if (total <= 0) return 0;
  const night = isNight(state) ? nightWork(state) : 1;
  return total * night * hungerWork(state);
}

/** Raw research units per ms (an integer, so small steps add up exactly like a big one). */
export function researchRate(state: GameState): number {
  const perHour = researchPerHour(state);
  return perHour > 0 ? Math.max(1, Math.round(perHour * 100)) : 0;
}

/**
 * Chantier 19: points sent by a sister colony join the shared research: the current
 * technology, or the bank up to its cap.
 */
export function receiveResearch(state: GameState, raw: number): void {
  if (raw <= 0) return;
  const r = state.research;
  if (r.current) r.points += raw;
  else r.points = Math.max(r.points, Math.min(researchBank(state), r.points + raw));
}

/** Points kept when no technology is chosen (raw units). */
export function researchBank(state: GameState): number {
  const level = libraryLevel(state);
  return level > 0 ? (RESEARCH.bank[level - 1] ?? 0) * RESEARCH_SCALE : 0;
}

/** Research points as a number of points (for the UI). */
export function researchPoints(state: GameState): number {
  return state.research.points / RESEARCH_SCALE;
}

export type TechStatus = 'done' | 'current' | 'available' | 'library' | 'age';

/** Why a technology can or cannot be researched now. */
export function techStatus(state: GameState, id: TechId): TechStatus {
  if (hasTech(state, id)) return 'done';
  if (state.research.current === id) return 'current';
  const def = TECHS[id];
  if (def.age > ageOf(state)) return 'age';
  if (libraryLevel(state) < def.libraryLevel) return 'library';
  return 'available';
}

/** Technologies of an age, in data order. */
export function techsOfAge(age: number): TechId[] {
  return TECH_IDS.filter((id) => TECHS[id].age === age);
}

/** Next time the current technology completes. */
export function nextResearchEvent(state: GameState): TimeMs {
  const current = state.research.current;
  // A sister colony never completes a technology itself (chantier 19: shared research).
  if (!current || state.colony.index === 1) return Infinity;
  const need = TECHS[current].cost * RESEARCH_SCALE - state.research.points;
  if (need <= 0) return state.now;
  const rate = researchRate(state);
  if (rate <= 0) return Infinity;
  return state.now + Math.max(1, Math.ceil(need / rate));
}

/** Time left before the current technology completes (UI), or null. */
export function researchEta(state: GameState): number | null {
  const at = nextResearchEvent(state);
  return Number.isFinite(at) ? at - state.now : null;
}

/** Adds `dtMs` of research: into the current technology, or into the bank up to its cap. */
export function accrueResearch(state: GameState, dtMs: number): void {
  const rate = researchRate(state);
  if (rate <= 0) return;
  const r = state.research;
  const gain = rate * dtMs;
  if (state.colony.index === 1) r.outbox += gain;
  else if (r.current) r.points += gain;
  else {
    const cap = researchBank(state);
    if (r.points < cap) r.points = Math.min(cap, r.points + gain);
  }
}

/** Completes the current technology once its points are in. */
export function researchTick(state: GameState, at: TimeMs, events: GameEvent[]): void {
  const r = state.research;
  const current = r.current;
  if (!current || state.colony.index === 1) return;
  const cost = TECHS[current].cost * RESEARCH_SCALE;
  if (r.points < cost) return;
  r.points -= cost;
  r.done.push(current);
  r.current = null;
  events.push({ type: 'researchDone', at, tech: current });
}
