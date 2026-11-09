import { FRUIT_GOOD, FRUIT_IDS, ROUTE, type FruitId, type OrchardGood } from '../data/orchard';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import type { CommandError } from './commands';
import { goodOf, payGood } from './orchard';
import type { GameState, OrchardRoute } from './state';
import { workingPost } from './tradingPost';

/**
 * Chantier 55: routes between two of our trading posts — a relay of nectar, cider and golden
 * fibre. A route standing adds `ROUTE.bonus` to both posts' stalls and shortens trips to them.
 * Its upkeep (each end's good, `ROUTE.upkeep` units a day) is paid a day ahead, at a public
 * time; unpaid (or one post down), the route is cut — nothing is lost, it opens again by paying.
 */

/** What a route between two fruits costs a day. */
export function routeUpkeep(a: FruitId, b: FruitId): Partial<Record<OrchardGood, number>> {
  const out: Partial<Record<OrchardGood, number>> = {};
  for (const f of [a, b]) out[FRUIT_GOOD[f]] = (out[FRUIT_GOOD[f]] ?? 0) + ROUTE.upkeep;
  return out;
}

function canPay(state: GameState, cost: Partial<Record<OrchardGood, number>>): OrchardGood | null {
  for (const [good, n] of Object.entries(cost) as [OrchardGood, number][])
    if (goodOf(state, good) < n) return good;
  return null;
}

function pay(s: GameState, cost: Partial<Record<OrchardGood, number>>): void {
  for (const [good, n] of Object.entries(cost) as [OrchardGood, number][]) payGood(s, good, n);
}

const SHORT: Record<OrchardGood, CommandError> = {
  nectar: 'notEnoughNectar',
  cider: 'notEnoughCider',
  goldFiber: 'notEnoughGoldFiber',
};

/** The route between two fruits, cut or not (null: none). */
export function routeBetween(state: GameState, a: FruitId, b: FruitId): OrchardRoute | null {
  return (
    state.orchard.routes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null
  );
}

/** Why a route between these two posts cannot open now. */
export function openRouteLock(state: GameState, a: FruitId, b: FruitId): CommandError | null {
  if (!FRUIT_IDS.includes(a) || !FRUIT_IDS.includes(b) || a === b) return 'unknownRoute';
  if (!workingPost(state, a) || !workingPost(state, b)) return 'noPost';
  const old = routeBetween(state, a, b);
  if (old && !old.cut) return 'routeExists';
  const short = canPay(state, routeUpkeep(a, b));
  return short ? SHORT[short] : null;
}

/** Opens a route (or a cut one again): the first day's upkeep is paid now. */
export function openRoute(s: GameState, a: FruitId, b: FruitId, id: string): OrchardRoute {
  pay(s, routeUpkeep(a, b));
  const old = routeBetween(s, a, b);
  const route: OrchardRoute = old
    ? { ...old, paidUntil: s.now + ROUTE.dayMs }
    : { id, a, b, openedAt: s.now, paidUntil: s.now + ROUTE.dayMs };
  delete route.cut;
  s.orchard.routes = [...s.orchard.routes.filter((r) => r !== old), route];
  return route;
}

export function closeRouteLock(state: GameState, id: string): CommandError | null {
  return state.orchard.routes.some((r) => r.id === id) ? null : 'unknownRoute';
}

export function closeRoute(s: GameState, id: string): void {
  s.orchard.routes = s.orchard.routes.filter((r) => r.id !== id);
}

/** The next upkeep due. */
export function nextRouteEvent(s: GameState): TimeMs {
  let at = Infinity;
  for (const r of s.orchard.routes)
    if (!r.cut && r.paidUntil > s.now) at = Math.min(at, r.paidUntil);
  return at;
}

/** At a route's due time: its upkeep paid for another day, or the route cut. */
export function routeTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const r of s.orchard.routes) {
    if (r.cut || r.paidUntil !== at) continue;
    const cost = routeUpkeep(r.a, r.b);
    if (workingPost(s, r.a, at) && workingPost(s, r.b, at) && !canPay(s, cost)) {
      pay(s, cost);
      r.paidUntil = at + ROUTE.dayMs;
    } else {
      r.cut = true;
      events.push({ type: 'routeCut', at, routeId: r.id, a: r.a, b: r.b });
    }
  }
}
