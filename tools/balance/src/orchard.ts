// Chantier 54: the orchard probe. The attentive bot plays a long run; one line at the end: the
// days of the Age of the stars, the Great Weevil, the wormholes, the first voyage and the post,
// voyages, nectar, kiwis at the post, attacks lost, and the share of the time since the first
// voyage spent with each good of the orchard at its cap (chantier 55: the apple, the pineapple,
// posts, routes, cider and golden fibre).
//   pnpm --filter @kiwar/balance orchard [--seed s] [--face kiwisu] [--days 34] [--casual]
import {
  goodCap,
  hasTech,
  stardustOf,
  type Face,
  type GameState,
  type OrchardGood,
} from '@kiwar/shared';
import { runBot } from './bot';
import { orchardWhy } from './bot/orchard';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const seed = arg('seed', 'orchard-1');
const face = arg('face', 'kiwisu') as Face;
const days = Number(arg('days', '34'));
const casual = process.argv.includes('--casual');
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
const t0 = Date.now();

let last = 0;
let end: GameState | null = null;
let wormholesAt: number | null = null;
let openMs = 0;
const cappedMs: Record<OrchardGood, number> = { nectar: 0, cider: 0, goldFiber: 0 };
/** Chantier 55: the first visit to each fruit, and the time each good spent at its cap. */
const firstVisit: Record<string, number> = {};
const result = runBot({
  seed,
  face,
  horizonMs: days * DAY,
  fullHorizon: true,
  ...(casual ? { activeMs: 6 * HOUR, sessionEveryMs: 8 * HOUR } : {}),
  onStep(state) {
    const dt = last > 0 ? state.now - last : 0;
    last = state.now;
    end = state;
    if (wormholesAt === null && hasTech(state, 'wormholes'))
      wormholesAt = state.now - state.createdAt;
    for (const f of state.orchard.visited) firstVisit[f] ??= state.now - state.createdAt;
    if (state.orchard.visits === 0) return;
    openMs += dt;
    for (const g of ['nectar', 'cider', 'goldFiber'] as const)
      if (state[g] > 0 && state[g] >= goodCap(state, g)) cappedMs[g] += dt;
  },
});
const day = (ms: number | null) => (ms === null ? '—' : (ms / DAY).toFixed(1));
const s = result.final;
console.log(
  [
    `${seed} ${face}${casual ? ' casual' : ''}`,
    `stars ${day(result.times.stars)}`,
    `weevil ${day(result.times.weevil)}`,
    `wormholes ${day(wormholesAt)}`,
    `voyage ${day(result.times.wormhole)}`,
    `post ${day(result.times.post)}`,
    `apple ${day(firstVisit.apple ?? null)} pineapple ${day(firstVisit.pineapple ?? null)}`,
    `visits ${s.visits ?? 0} posts ${s.posts ?? 0} routes ${s.routes ?? 0} at posts ${s.postKiwis ?? 0} lost ${s.postsLost ?? 0}`,
    `nectar ${s.nectar ?? 0} cider ${s.cider ?? 0} fibre ${s.goldFiber ?? 0}`,
    `at cap ${(['nectar', 'cider', 'goldFiber'] as const)
      .map((g) => `${g} ${openMs > 0 ? Math.round((cappedMs[g] / openMs) * 100) : 0} %`)
      .join(' ')}`,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  ].join(' · '),
);

if (end) {
  const st = end as GameState;
  const lvl = (t: string) =>
    Math.max(0, ...st.buildings.filter((b) => b.type === t).map((b) => b.level));
  console.log(
    [
      `end: nest ${lvl('nest')} library ${lvl('library')} launchpad ${lvl('launchpad')}`,
      `research ${st.research.current ?? '—'} (${Math.round(st.research.points)} pts)`,
      `done ${st.research.done.slice(-5).join(',')}`,
      `crystal ${Math.floor(st.crystal / 3.6e9)} stardust ${stardustOf(st)}`,
    ].join(' · '),
  );
}
console.log(`why: ${JSON.stringify(orchardWhy)}`);
