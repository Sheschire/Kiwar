// Chantier 42: the conquest probe. The bot plays a long run and prints, every game day, where
// the conquest of the twin stands (beacons, attacks, the queen, finals), then one summary line.
//   pnpm --filter @kiwar/balance conquest [--seed s] [--face kiwisu] [--days 21] [--casual]
import { ageOf, civAt, queenWounds, twinTarget, type Face } from '@kiwar/shared';
import { runBot } from './bot';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const seed = arg('seed', 'conquest-1');
const face = arg('face', 'kiwisu') as Face;
const days = Number(arg('days', '21'));
const casual = process.argv.includes('--casual');
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
let nextDay = 0;
const t0 = Date.now();

const result = runBot({
  seed,
  face,
  horizonMs: days * DAY,
  fullHorizon: true,
  ...(casual ? { activeMs: 6 * HOUR, sessionEveryMs: 8 * HOUR } : {}),
  onStep(state) {
    const day = Math.floor((state.now - state.createdAt) / DAY);
    if (day < nextDay) return;
    nextDay = day + 1;
    const twin = twinTarget(state);
    const face = twin ? state.faceViews[twin.id] : undefined;
    const g = twin ? state.aliens?.[twin.id] : undefined;
    const q = face?.queen;
    const guards = face?.beacons.reduce((n, b) => n + (b.guards?.length ?? 0), 0) ?? 0;
    const forts = face?.beacons.filter((b) => (b.fort ?? 0) > 0).length ?? 0;
    const crew = state.villagers.filter((v) => !v.kikiwiwi).length;
    const best = Math.max(0, ...state.villagers.map((v) => v.level));
    console.log(
      [
        `day ${day}`,
        `age ${ageOf(state)}`,
        `civ ${g ? civAt(g, state.now).age : '?'}`,
        `kiwis ${crew} (lv ≤ ${best})`,
        `beacons ${face?.beacons.length ?? 0} (forts ${forts}, guards ${guards})`,
        `attacks ${face?.attacks ?? 0}`,
        q
          ? `queen ${Math.round(q.ground)}/${Math.round(q.air)} wounds ${Math.round(queenWounds(q, state.now) * 100)} %`
          : 'queen hidden',
        state.siege.conqueredAt > 0 ? 'CONQUERED' : '',
      ].join(' | '),
    );
  },
});

const h = (ms: number | null) => (ms === null ? '—' : `${(ms / DAY).toFixed(1)} d`);
const f = result.final;
console.log(
  [
    `${seed} ${face} ${result.biome}${casual ? ' casual' : ''}`,
    `iron ${h(result.times.iron)}`,
    `industry ${h(result.times.industry)}`,
    `beacon ${h(result.times.landingWon)}`,
    `centre ${h(result.times.centreWon)}`,
    `queen ${h(result.times.queenOut)}`,
    `conquest ${h(result.times.conquest)}`,
    `founded ${h(result.times.founded)}`,
    `landings ${f.landings ?? 0} (won ${f.landingsWon ?? 0}, retreats ${f.retreats ?? 0}, ships lost ${f.shipsLost ?? 0})`,
    `finals ${f.finals ?? 0}`,
    `attacks ${f.beaconAttacks ?? 0} (held ${f.beaconsHeld ?? 0}, guards lost ${f.guardDeaths ?? 0})`,
    `expedition deaths ${f.expeditionDeaths ?? 0}`,
    `wounded ${f.battleWounded ?? 0}`,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  ].join(' | '),
);
