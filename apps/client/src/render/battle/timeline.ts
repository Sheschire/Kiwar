import {
  decodeEvents,
  EV,
  tileOfCode,
  type BattleLog,
  type Hex,
  type LogEvent,
  type LogUnit,
} from '@kiwar/shared';

/**
 * Chantier 36: a battle journal read as one track per unit — where it walks, whom it hits and
 * when, what it takes, when it falls or leaves — so the show can be drawn at any instant (live,
 * rewound, ×4). The journal is what happened: nothing here decides anything.
 */

export interface Step {
  t0: number;
  t1: number;
  from: Hex;
  to: Hex;
}

export interface Strike {
  t: number;
  /** A unit index, or a building index when `building` is true. */
  target: number;
  building: boolean;
  /** Hit points taken (0: missed). */
  damage: number;
  splash: boolean;
}

export interface Track {
  index: number;
  unit: LogUnit;
  side: 0 | 1;
  maxHp: number;
  steps: Step[];
  strikes: Strike[];
  /** Damage received, in time order. */
  hurts: { t: number; damage: number }[];
  /** Appears then (attackers come in; the others are there from the start). */
  enter: number;
  /** Falls or leaves then (null: still there at the end). */
  end: number | null;
  endKind: 'fall' | 'gone' | null;
  flee: number | null;
}

export interface Timeline {
  dt: number;
  /** The fight itself, in seconds. */
  fight: number;
  /** The fight and a short tail for the last falls. */
  duration: number;
  tracks: Track[];
  events: LogEvent[];
  /** When each building (index) was damaged. */
  damagedAt: Map<number, number>;
}

/** Seconds the show lingers after the last blow. */
export const TAIL_S = 2;

export function buildTimeline(log: BattleLog): Timeline {
  const events = decodeEvents(log.events, log.dt);
  const tracks: Track[] = log.units.map((unit, index) => ({
    index,
    unit,
    side: unit[1],
    maxHp: unit[7] / 10,
    steps: [],
    strikes: [],
    hurts: [],
    enter: unit[1] === 1 ? Infinity : 0,
    end: null,
    endKind: null,
    flee: null,
  }));
  const at = (track: Track): Hex =>
    track.steps.at(-1)?.to ?? { q: track.unit[8], r: track.unit[9] };
  const damagedAt = new Map<number, number>();
  for (const e of events) {
    const [a, b, c] = e.args;
    const track = tracks[a!];
    switch (e.code) {
      case EV.enter:
        if (track) track.enter = Math.min(track.enter, e.t);
        break;
      case EV.move:
        if (track)
          track.steps.push({ t0: e.t, t1: e.t + c! / 10, from: at(track), to: tileOfCode(b!) });
        break;
      case EV.attack: {
        if (!track) break;
        const building = b! % 2 === 1;
        const target = building ? (b! - 1) / 2 : b! / 2;
        track.strikes.push({ t: e.t, target, building, damage: c! / 10, splash: false });
        if (!building && c! > 0) tracks[target]?.hurts.push({ t: e.t, damage: c! / 10 });
        break;
      }
      case EV.splash:
        if (!track) break;
        track.strikes.push({ t: e.t, target: b!, building: false, damage: c! / 10, splash: true });
        tracks[b!]?.hurts.push({ t: e.t, damage: c! / 10 });
        break;
      case EV.fall:
      case EV.gone:
        if (track && track.end === null) {
          track.end = e.t;
          track.endKind = e.code === EV.fall ? 'fall' : 'gone';
        }
        break;
      case EV.flee:
        if (track && track.flee === null) track.flee = e.t;
        break;
      case EV.damaged:
        if (!damagedAt.has(a!)) damagedAt.set(a!, e.t);
        break;
      default:
        break;
    }
  }
  // An attacker that never came in (the battle ended first) never shows.
  const fight = log.steps * log.dt;
  return { dt: log.dt, fight, duration: fight + TAIL_S, tracks, events, damagedAt };
}

/** Where a unit is at `t`: the two tiles it walks between and how far along (0–1). */
export function placeAt(
  track: Track,
  t: number,
): { from: Hex; to: Hex; k: number; moving: boolean } {
  const steps = track.steps;
  // Last step started at or before t (binary search).
  let lo = 0;
  let hi = steps.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid]!.t0 <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) {
    const start = { q: track.unit[8], r: track.unit[9] };
    return { from: start, to: start, k: 1, moving: false };
  }
  const s = steps[found]!;
  const span = Math.max(1e-6, s.t1 - s.t0);
  const k = Math.min(1, (t - s.t0) / span);
  return { from: s.from, to: s.to, k, moving: k < 1 };
}

/** Hit points of a unit at `t`. */
export function hpAt(track: Track, t: number): number {
  let hp = track.maxHp;
  for (const h of track.hurts) {
    if (h.t > t) break;
    hp -= h.damage;
  }
  return Math.max(0, hp);
}

/** The last blow a unit dealt at or before `t` (within `window` seconds), or null. */
export function strikeAt(track: Track, t: number, window: number): Strike | null {
  for (let i = track.strikes.length - 1; i >= 0; i--) {
    const s = track.strikes[i]!;
    if (s.t > t || s.splash) continue;
    return t - s.t <= window ? s : null;
  }
  return null;
}

/** Whether a unit is on the field at `t` (falls stay visible a moment, then fade). */
export function shownAt(track: Track, t: number, linger: number): boolean {
  if (t < track.enter) return false;
  if (track.end === null) return true;
  return t < track.end + (track.endKind === 'fall' ? linger : 0.4);
}
