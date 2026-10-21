/**
 * Siege probe (chantier 19): the bot plays until the twin is besieged, conquered and its
 * second colony founded, and the probe tells when each step came and how the fights went.
 *   pnpm balance:siege [--seeds 2] [--days 12] [--biomes orchard,tundra] [--trace]
 */
import { BIOME_IDS, BIOMES, ageOf, nest, type BiomeId, type GameState } from '@kiwar/shared';
import { runBot, type Milestone } from './bot';
import { siegeDebug } from './bot/siege';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('--seeds')) || 2;
const days = Number(arg('--days')) || 12;
const trace = process.argv.includes('--trace');
const biomes = (arg('--biomes')?.split(',') ??
  BIOME_IDS.filter((id) => BIOMES[id].face !== null)) as BiomeId[];

const STEPS: Milestone[] = [
  'iron',
  'kikiwiwi',
  'siegeOpen',
  'bridgehead',
  'conquest',
  'founded',
  'sisterNest3',
  'industry',
];
const h = (ms: number | null) => (ms === null ? '—' : `${(ms / 3_600_000).toFixed(0)} h`);

/** A line every 12 game hours once the siege is open (with `--trace`). */
function traceStep(state: GameState, start: number, last: { at: number }): void {
  if (state.now - last.at < 12 * 3_600_000) return;
  last.at = state.now;
  const s = state.siege;
  const posted = state.villagers.filter((v) => v.job.kind === 'outpost').length;
  const flying = state.expeditions
    .filter((e) => e.status !== 'done')
    .map((e) => `${e.mission}/${e.status}`)
    .join(',');
  console.log(
    `  ${((state.now - start) / 3_600_000).toFixed(0)} h · ${siegeDebug(state)} · age ${ageOf(state)} · nest ${nest(state).level} · ${state.villagers.length} kiwis · heads ${s.bridgeheads.map((b) => `${b.sector}${b.fortified ? '+' : ''}:${b.holders.length}`).join(' ') || '-'} · posted ${posted} · counters ${s.counters} · ${flying || 'pad free'}`,
  );
}

for (const biome of biomes) {
  const face = BIOMES[biome].face ?? 'kiwisu';
  for (let i = 0; i < seeds; i++) {
    const last = { at: 0 };
    const r = runBot({
      seed: `siege-${i}`,
      face,
      biome,
      horizonMs: days * 24 * 3_600_000,
      onStep: trace ? (s) => traceStep(s, s.createdAt, last) : undefined,
    });
    const t = r.times;
    const f = r.final;
    console.log(
      `${biome} #${i}: ${STEPS.map((m) => `${m} ${h(t[m])}`).join(' · ')} | assaults ${f.assaults}/${f.assaultsWon} won · counters ${f.counters} (${f.countersHeld} held, last 5) · finals ${f.finals} · sister ${f.sisterKiwis ?? '—'} kiwis · lost in battle ${f.expeditionDeaths}`,
    );
  }
}
