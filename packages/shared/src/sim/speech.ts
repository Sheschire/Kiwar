import { GARRISON } from '../data/threats';
import { MORALE, SPEECH, speechCooldownMs, speechEffectMs } from '../data/needs';
import { KIWI } from '../data/kiwis';
import { SKILLS } from '../data/classes';
import type { TimeMs } from '../types/ids';
import type { CommandError } from './commands';
import { hasSkill, mayorOf } from './kiwis';
import { addMemory } from './rest';
import type { Building, GameState, Villager } from './state';
import { waveAhead } from './threats';

/**
 * Chantier 43: the Speech at the Town Hall. The mayor speaks, every kiwi at home gathers there
 * (no harvest, research, forging or crater work until `state.speech.until`), and each of them
 * remembers it for hours (a `speech` memory). Its cooldown and how long it is remembered
 * follow the Town Hall's level.
 */

export function townHallOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'townHall');
}

/** The colony is gathered somewhere (a speech, or the shelter before a wave): no work. */
export function gathered(state: GameState): boolean {
  return state.threats.shelterUntil > state.now || state.speech.until > state.now;
}

/** Morale points of a speech by this mayor (Charisma, Festival doubles). */
export function speechValue(mayor: Villager): number {
  const charisma = Math.max(0, mayor.stats.charisma - KIWI.stat.average);
  const value = SPEECH.value + SPEECH.perCharisma * charisma;
  const k = hasSkill(mayor, 'festival') ? SKILLS.festivalMultiplier : 1;
  return Math.min(MORALE.memories.speech.best, value * k);
}

/** Why the mayor cannot give a speech right now, or null. */
export function speechLock(state: GameState): CommandError | null {
  if (!townHallOf(state)) return 'noTownHall';
  if (!mayorOf(state)) return 'noMayor';
  if (state.speech.readyAt > state.now) return 'speechCooling';
  if (state.speech.until > state.now || state.threats.shelterUntil > state.now) return 'waveSoon';
  // Never while a wave comes: the gathering ends before the automatic garrison posts its guards.
  const wave = waveAhead(state);
  if (wave && wave.wave.at <= state.now + SPEECH.gatherMs + GARRISON.autoLeadMs) return 'waveSoon';
  return null;
}

/** Starts a speech (the checks of `speechLock` passed). */
export function giveSpeech(state: GameState, now: TimeMs): void {
  const hall = townHallOf(state)!;
  const mayor = mayorOf(state)!;
  const until = now + SPEECH.gatherMs;
  const value = speechValue(mayor);
  const end = until + speechEffectMs(hall.level);
  for (const v of state.villagers)
    if (v.job.kind !== 'expedition' && v.job.kind !== 'outpost') addMemory(v, 'speech', value, end);
  state.speech = { until, readyAt: now + speechCooldownMs(hall.level) };
}

/** When the gathering ends (an `advance` event: work starts again). */
export function nextSpeechEnd(state: GameState): TimeMs {
  return state.speech.until > state.now ? state.speech.until : Infinity;
}
