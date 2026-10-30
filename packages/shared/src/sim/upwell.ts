import { DEPTHS } from '../data/depths';
import { THREATS } from '../data/threats';
import { DEPTH_KINDS, ENEMIES } from '../data/units';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { depthsMapOf, depthsKnown, roomTruth } from './depths';
import { fortLevel } from './beacons';
import { nest } from './selectors';
import { rampartSectorOf } from './threats';
import { tunnelOf } from './delves';
import { withDepthRng, type GameState, type PlannedWave, type Squad } from './state';

/**
 * Chantier 48: upwellings — the Grouillants come up through the tunnel entrance as announced
 * waves, on their own calendar (their own RNG stream), never within `DEPTHS.upwell.gapMs` of a
 * surface wave. Their power grows with the nests not taken next to our works (the entrance and
 * the galleries): it needs the truth, so online the server announces them. Answers: close the
 * door (it holds back up to its strength, else breaks), fortify it (stronger, and two turrets
 * at the door), or guard the entrance (guards, turrets nearby).
 */

/** What the closed door holds back (0 without a tunnel, or with a damaged door). */
export function doorStrength(state: GameState): number {
  const t = tunnelOf(state);
  if (!t || t.damaged) return 0;
  const base = DEPTHS.door[Math.min(t.level, DEPTHS.door.length - 1)] ?? 0;
  return base + (state.depths.door.fort > 0 ? DEPTHS.fortify.strength : 0);
}

/**
 * Share of an upwelling's power that comes out at this luck: all of it with the door open, what
 * exceeds the door's strength with it closed (0: held back).
 */
export function doorPass(state: GameState, wave: PlannedWave, luck: number): number {
  if (!wave.tunnel || !state.depths.door.closed) return 1;
  const power = (wave.ground + wave.air) * luck;
  if (power <= 0) return 0;
  return Math.max(0, power - doorStrength(state)) / power;
}

/** Nests not taken next to the entrance or to a gallery (hidden: needs the depths' seed). */
export function nestsNear(state: GameState): number {
  const seed = state.depthSeed;
  if (seed === undefined) return 0;
  const map = depthsMapOf(state);
  const taken = state.depths.galleries;
  return map.rooms.filter(
    (r) =>
      !taken[r.id] &&
      (r.entrance || r.links.some((id) => taken[id])) &&
      roomTruth(seed, r).kind === 'nest',
  ).length;
}

/** Power of an upwelling announced now. */
export function upwellPower(state: GameState): number {
  const u = DEPTHS.upwell;
  const factor = THREATS.nestFactor[nest(state).level] ?? THREATS.nestFactor.at(-1)!;
  return u.base * factor * (1 + u.perNest * nestsNear(state));
}

/** The Grouillants of an upwelling: larvae and woodlice on the ground, fruit flies above. */
export function upwellSquads(state: GameState, ground: number, air: number): Squad[] {
  const sector = rampartSectorOf(tunnelOf(state)!);
  const crawl = DEPTHS.mix.larva + DEPTHS.mix.woodlouse;
  const out: Squad[] = [];
  for (const kind of DEPTH_KINDS) {
    const power =
      kind === 'fruitFly' ? air : (ground * DEPTHS.mix[kind as 'larva' | 'woodlouse']) / crawl;
    const count = Math.round(power / ENEMIES[kind].power);
    if (count > 0) out.push({ kind, sector, count });
  }
  if (out.length === 0) out.push({ kind: 'larva', sector, count: 1 });
  return out;
}

/** Plans the next upwelling once the tunnel entrance stands (never close to a surface wave). */
export function planUpwell(s: GameState): void {
  const d = s.depths;
  const tunnel = tunnelOf(s);
  if (d.next || !tunnel || s.colony.index !== 0) return;
  const u = DEPTHS.upwell;
  withDepthRng(s, (rng) => {
    const gap = Math.round(rng.range(u.intervalMs[0], u.intervalMs[1]));
    let at = Math.max(
      tunnel.builtAt + u.firstMs,
      d.lastUpwellAt > 0 ? d.lastUpwellAt + gap : 0,
      s.now + u.noticeMs,
    );
    const wave = s.threats.next;
    if (wave && Math.abs(at - wave.at) < u.gapMs) at = wave.at + u.gapMs;
    d.next = {
      id: `u${d.upwells + 1}`,
      announceAt: at - u.noticeMs,
      at,
      announced: false,
      ground: 0,
      air: 0,
    };
  });
}

/** Next upwelling event (its announcement waits for the truth). */
export function nextUpwellEvent(s: GameState): TimeMs {
  const w = s.depths.next;
  if (!w) return Infinity;
  if (w.announced) return w.at;
  return depthsKnown(s) ? w.announceAt : Infinity;
}

/** An upwelling is due to be announced and only the server holds the depths' seed. */
export function upwellAwaited(s: GameState, now: TimeMs): boolean {
  const w = s.depths.next;
  return !!w && !w.announced && w.announceAt <= now && !depthsKnown(s);
}

export function upwellDue(s: GameState, now: TimeMs): TimeMs[] {
  const w = s.depths.next;
  return w && !w.announced && w.announceAt <= now ? [w.announceAt] : [];
}

/** The announcement: power, Grouillants, the gate at the tunnel entrance. */
export function announceUpwell(s: GameState, wave: PlannedWave, events: GameEvent[]): void {
  const tunnel = tunnelOf(s);
  if (!tunnel) {
    // The entrance is gone: nothing can come up.
    s.depths.next = null;
    return;
  }
  const u = DEPTHS.upwell;
  const power = upwellPower(s);
  withDepthRng(s, (rng) => {
    wave.ground = tenth(power * (1 - u.airShare) * (1 + rng.range(-u.spread, u.spread)));
    wave.air = tenth(power * u.airShare * (1 + rng.range(-u.spread, u.spread)));
  });
  wave.tunnel = { q: tunnel.q, r: tunnel.r };
  wave.squads = upwellSquads(s, wave.ground, wave.air);
  wave.gates = { [rampartSectorOf(tunnel)]: { q: tunnel.q, r: tunnel.r } };
  wave.announced = true;
  events.push({
    type: 'waveAnnounced',
    at: wave.announceAt,
    waveId: wave.id,
    strikeAt: wave.at,
    ground: wave.ground,
    air: wave.air,
    tunnel: true,
  });
}

const tenth = (x: number) => Math.round(x * 10) / 10;

// --- The door ----------------------------------------------------------------------------------

export type DoorLock = 'noTunnel' | 'fortifying' | 'alreadyFortified';

/** Level of the door's fortification ordered now (like a beacon's: the first of our age). */
export function doorFortLevel(state: GameState): number {
  return fortLevel(state);
}

export function fortifyDoorLock(state: GameState): DoorLock | null {
  if (!tunnelOf(state)) return 'noTunnel';
  if (state.depths.door.fortifying) return 'fortifying';
  if (state.depths.door.fort >= doorFortLevel(state)) return 'alreadyFortified';
  return null;
}

/** Next fortification done. */
export function nextDoorEvent(s: GameState): TimeMs {
  return s.depths.door.fortifying?.until ?? Infinity;
}

export function upwellTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const door = s.depths.door;
  if (door.fortifying && door.fortifying.until === at) {
    door.fort = door.fortifying.level;
    delete door.fortifying;
    events.push({ type: 'doorFortified', at, level: door.fort });
  }
  const w = s.depths.next;
  if (w && !w.announced && w.announceAt === at && depthsKnown(s)) announceUpwell(s, w, events);
}
