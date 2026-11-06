import { moduleFits, ORBIT, type KiwaiType } from '../data/orbit';
import { crystalUnits } from '../data/crystal';
import { dustPoints, STARDUST_SCALE } from '../data/comets';
import type { Hex } from '../hex/hex';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import type { CommandError } from './commands';
import { meteorIronOf } from './iron';
import { siteSpotError, smallMap, thingAt, type SiteError, type SmallMap } from './sites';
import type { Building, GameState, Kiwai, OrbitModule } from './state';

/**
 * Chantier 53: the kiwais in orbit. Each is a small map of its own (`sim/sites.ts`) drawn from
 * a public seed (`<seed>/<face>/kiwai/<id>`), with its modules kept on the kiwai, never in
 * `state.buildings`. Everything up there is public.
 */

/** The small map of a kiwai (memoized; the same for the client, the server and the bot). */
export function kiwaiMapOf(
  state: Pick<GameState, 'seed' | 'face'>,
  kiwai: Pick<Kiwai, 'id'>,
): SmallMap {
  return smallMap(`${state.seed}/${state.face}/kiwai/${kiwai.id}`, ORBIT.radius, ORBIT.rocks);
}

export function kiwaiById(state: GameState, id: string): Kiwai | undefined {
  return state.orbit.kiwais.find((k) => k.id === id);
}

/** The module on a tile of that kiwai (its own map only). */
export function moduleAt(kiwai: Kiwai, h: Hex): OrbitModule | undefined {
  return thingAt(kiwai.modules, h);
}

/** Why no module can be set on that tile of the kiwai (null: it can). */
export function moduleSpotError(state: GameState, kiwai: Kiwai, h: Hex): SiteError | null {
  return siteSpotError(kiwaiMapOf(state, kiwai), kiwai.modules, h);
}

/** The orbital yard (one per colony), or undefined. */
export function yardOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'orbitalYard');
}

/** Kiwais the yard holds in orbit at its level (0 without a yard). */
export function kiwaiCap(state: GameState): number {
  const yard = yardOf(state);
  return yard ? (ORBIT.kiwais[Math.min(yard.level, ORBIT.kiwais.length - 1)] ?? 0) : 0;
}

/** Module places on each kiwai at the yard's level. */
export function moduleSlots(state: GameState): number {
  const yard = yardOf(state);
  return yard ? (ORBIT.moduleSlots[Math.min(yard.level, ORBIT.moduleSlots.length - 1)] ?? 0) : 0;
}

export type LaunchCost = (typeof ORBIT.launch)[number];

/** What the next launch costs (a core of giant seeds, crystal, iron, stardust) and takes. */
export function kiwaiLaunchCost(state: GameState): LaunchCost {
  return ORBIT.launch[Math.min(state.orbit.launched, ORBIT.launch.length - 1)]!;
}

/** A kiwai is in orbit (its launch is over). */
export function inOrbit(kiwai: Kiwai, now: TimeMs): boolean {
  return kiwai.readyAt <= now;
}

/**
 * Why no kiwai can be launched now (null: it can). The stocks come last, so the screen can
 * show the price of a launch the yard allows.
 */
export function launchLock(state: GameState): CommandError | null {
  if (!yardOf(state)) return 'noOrbitalYard';
  if (state.orbit.kiwais.length >= kiwaiCap(state)) return 'kiwaiLimit';
  const cost = kiwaiLaunchCost(state);
  if (state.giantSeeds < cost.giantSeeds) return 'notEnoughGiantSeeds';
  if (crystalUnits(state.crystal) < cost.crystal) return 'notEnoughCrystal';
  if (meteorIronOf(state) < cost.iron) return 'notEnoughIron';
  if (dustPoints(state.stardust) < cost.stardust) return 'notEnoughStardust';
  return null;
}

/** Sets a new kiwai on its way (the caller paid): in orbit at `now + durationMs`. */
export function startKiwai(s: GameState, type: KiwaiType, now: TimeMs): Kiwai {
  const cost = kiwaiLaunchCost(s);
  const taken = new Set(s.orbit.kiwais.map((k) => k.place));
  let place = 0;
  while (taken.has(place)) place++;
  const kiwai: Kiwai = {
    id: `kiwai-${s.nextId++}`,
    type,
    place,
    launchedAt: now,
    readyAt: now + cost.durationMs,
    modules: [],
    dust: 0,
    wear: { n: 0, at: 0, moduleId: null },
  };
  s.orbit.kiwais.push(kiwai);
  s.orbit.launched++;
  return kiwai;
}

/** The next time something happens in orbit (a launch ends…), after `s.now`. */
export function nextOrbitEvent(s: GameState): TimeMs {
  let at = Infinity;
  for (const k of s.orbit.kiwais) if (k.readyAt > s.now) at = Math.min(at, k.readyAt);
  return at;
}

/** What happens in orbit at `at`. */
export function orbitTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const k of s.orbit.kiwais)
    if (k.readyAt === at) events.push({ type: 'kiwaiReady', at, kiwaiId: k.id, kiwaiType: k.type });
}

/**
 * Anti-cheat for imported saves: as many kiwais as launched and as the yard holds, modules on
 * free ground of their own map, fitting their kiwai, within the places; tanks within their cap.
 */
export function plausibleOrbit(state: GameState): boolean {
  const o = state.orbit;
  if (o.kiwais.length !== o.launched || o.kiwais.length > kiwaiCap(state)) return false;
  if (new Set(o.kiwais.map((k) => k.place)).size !== o.kiwais.length) return false;
  for (const k of o.kiwais) {
    if (k.modules.length > moduleSlots(state)) return false;
    if (k.dust > ORBIT.dust.tank * STARDUST_SCALE) return false;
    const map = kiwaiMapOf(state, k);
    for (let i = 0; i < k.modules.length; i++) {
      const m = k.modules[i]!;
      if (!moduleFits(m.type, k.type)) return false;
      if (siteSpotError(map, k.modules.slice(0, i), m) !== null) return false;
    }
  }
  return true;
}
