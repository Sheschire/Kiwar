// Chantier 53: the orbit probe. The attentive bot plays a long run; one line at the end: the
// day of the Age of the stars, of the orbital yard and of the first kiwai, the kiwais and their
// modules, the kiwis up there, the hours a module stayed broken with nobody to repair it, the
// share of the stars' time spent with the stardust at its cap, swarms and services.
//   pnpm --filter @kiwar/balance orbit [--seed s] [--face kiwisu] [--days 28] [--casual]
import { ageOf, STARDUST, stardustOf, type Face } from '@kiwar/shared';
import { runBot } from './bot';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const seed = arg('seed', 'orbit-1');
const face = arg('face', 'kiwisu') as Face;
const days = Number(arg('days', '28'));
const casual = process.argv.includes('--casual');
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
const t0 = Date.now();

let last = 0;
let starsMs = 0;
let cappedMs = 0;
let waitingMs = 0;
let swarms = 0;
const result = runBot({
  seed,
  face,
  horizonMs: days * DAY,
  fullHorizon: true,
  ...(casual ? { activeMs: 6 * HOUR, sessionEveryMs: 8 * HOUR } : {}),
  onStep(state) {
    const dt = last > 0 ? state.now - last : 0;
    last = state.now;
    if (ageOf(state) < 4) return;
    starsMs += dt;
    if (stardustOf(state) >= STARDUST.cap) cappedMs += dt;
    if (
      state.orbit.kiwais.some((k) =>
        k.modules.some((m) => m.broken !== undefined && m.repairAt === undefined),
      )
    )
      waitingMs += dt;
    swarms = state.comets.passes;
  },
});
const day = (ms: number | null) => (ms === null ? '—' : (ms / DAY).toFixed(1));
const s = result.final;
console.log(
  [
    `${seed} ${face}${casual ? ' casual' : ''}`,
    `stars ${day(result.times.stars)}`,
    `yard ${day(result.times.yard)}`,
    `kiwai ${day(result.times.kiwai)}`,
    `kiwais ${s.kiwais ?? 0} modules ${s.orbitModules ?? 0} up ${s.orbitCrew ?? 0}`,
    `waiting repair ${(waitingMs / HOUR).toFixed(1)} h`,
    `dust at cap ${starsMs > 0 ? Math.round((cappedMs / starsMs) * 100) : 0} %`,
    `comets ${swarms}`,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  ].join(' · '),
);
