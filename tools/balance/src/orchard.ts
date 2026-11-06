// Chantier 54: the orchard probe. The attentive bot plays a long run; one line at the end: the
// days of the Age of the stars, the Great Weevil, the wormholes, the first voyage and the post,
// voyages, nectar, kiwis at the post, attacks lost, and the share of the time since the first
// voyage spent with the nectar at its cap.
//   pnpm --filter @kiwar/balance orchard [--seed s] [--face kiwisu] [--days 34] [--casual]
import { hasTech, nectarCap, type Face } from '@kiwar/shared';
import { runBot } from './bot';

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
let wormholesAt: number | null = null;
let openMs = 0;
let cappedMs = 0;
const result = runBot({
  seed,
  face,
  horizonMs: days * DAY,
  fullHorizon: true,
  ...(casual ? { activeMs: 6 * HOUR, sessionEveryMs: 8 * HOUR } : {}),
  onStep(state) {
    const dt = last > 0 ? state.now - last : 0;
    last = state.now;
    if (wormholesAt === null && hasTech(state, 'wormholes'))
      wormholesAt = state.now - state.createdAt;
    if (state.orchard.visits === 0) return;
    openMs += dt;
    if (state.nectar >= nectarCap(state)) cappedMs += dt;
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
    `visits ${s.visits ?? 0} nectar ${s.nectar ?? 0} at post ${s.postKiwis ?? 0} lost ${s.postsLost ?? 0}`,
    `nectar at cap ${openMs > 0 ? Math.round((cappedMs / openMs) * 100) : 0} %`,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  ].join(' · '),
);
