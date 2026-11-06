import { ORBIT } from '../data/orbit';
import type { Hex } from '../hex/hex';
import { siteSpotError, smallMap, thingAt, type SiteError, type SmallMap } from './sites';
import type { GameState, Kiwai, OrbitModule } from './state';

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
