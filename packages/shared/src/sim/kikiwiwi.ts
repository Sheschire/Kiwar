import { KIKIWIWI } from '../data/kikiwiwi';
import { KIWI } from '../data/kiwis';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { ageOf, techEffects } from './research';
import { withRng, type Building, type GameState, type Villager } from './state';

/** Chantier 08: Kikiwiwis — the laboratory against nature, the infusion and its risk. */

export function isKikiwiwi(v: Villager): boolean {
  return v.kikiwiwi !== undefined;
}

/**
 * Power multiplier of a Kikiwiwi at home: green blood makes it stronger, an empty juice stock
 * weakens it (1 for an ordinary kiwi). Changes only at events (stock empty, refilled).
 */
export function titanPower(state: GameState, v: Villager): number {
  if (!v.kikiwiwi) return 1;
  const weak = state.resources.juice <= 1e-6 ? KIKIWIWI.weakPower : 1;
  return techEffects(state).kikiwiwiPower * weak;
}

/** Whether the colony's Kikiwiwis go thirsty (no juice left). */
export function kikiwiwiWeak(state: GameState): boolean {
  return state.resources.juice <= 1e-6;
}

/** Juice the Kikiwiwis at home drink per hour. */
export function kikiwiwiUpkeep(state: GameState): number {
  const n = state.villagers.filter((v) => v.kikiwiwi && v.job.kind !== 'expedition').length;
  return n * KIKIWIWI.upkeep * techEffects(state).kikiwiwiUpkeep;
}

export function laboratoryOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'lab');
}

/** Kikiwiwis the colony may have at its age (from the Iron age, one per age reached). */
export function kikiwiwiCap(state: GameState): number {
  const caps = KIKIWIWI.capByAge;
  return caps[Math.min(ageOf(state), caps.length - 1)] ?? 0;
}

/** Kikiwiwis alive plus the kiwis in a vat (they count against the cap). */
export function kikiwiwiCount(state: GameState): number {
  return state.villagers.filter((v) => isKikiwiwi(v) || v.job.kind === 'transform').length;
}

/** Chance that the infusion fails: Endurance, level and a better laboratory lower it. */
export function infusionRisk(state: GameState, v: Villager, lab: Building): number {
  const r = KIKIWIWI.risk;
  const risk =
    r.base -
    r.endurance * (v.stats.endurance - KIWI.stat.average) -
    r.level * (v.level - 1) -
    (r.lab[lab.level - 1] ?? 0) -
    techEffects(state).infusionRisk;
  return Math.round(Math.min(r.max, Math.max(r.min, risk)) * 1000) / 1000;
}

export function infusionDuration(lab: Building): number {
  const d = KIKIWIWI.durationMs;
  return d[Math.min(lab.level, d.length) - 1] ?? d[0]!;
}

export function nextInfusionEnd(state: GameState): TimeMs {
  let next = Infinity;
  for (const v of state.villagers)
    if (v.job.kind === 'transform') next = Math.min(next, v.job.until);
  return next;
}

/**
 * Infusions ending at `at`: the colony RNG decides (in villager order). Success: a Kikiwiwi
 * (idle, never joins a workplace by itself). Failure: the juice is lost, the kiwi rests a day
 * and loses a point of Strength and Endurance.
 */
export function finishInfusions(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'transform' || v.job.until !== at) continue;
    const risk = v.job.risk;
    const failed = withRng(s, (rng) => rng.next() < risk);
    if (failed) {
      for (const stat of KIKIWIWI.failure.stats)
        v.stats[stat] = Math.max(KIWI.stat.min, v.stats[stat] - 1);
      v.job = { kind: 'injured', until: at + KIKIWIWI.failure.injuredMs };
      events.push({ type: 'infusionFailed', at, villagerId: v.id, name: v.name });
    } else {
      v.kikiwiwi = { since: at };
      v.job = { kind: 'idle' };
      events.push({ type: 'kikiwiwiBorn', at, villagerId: v.id, name: v.name });
    }
  }
}
