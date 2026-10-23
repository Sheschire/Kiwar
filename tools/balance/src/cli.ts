import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_IDS, BIOMES, type BiomeId } from '@kiwar/shared';
import { MECHANICS, type Mechanic, type RunResult } from './bot';
import { expeditionProbe } from './probe';
import {
  biomeGroups,
  compare,
  faceGroups,
  formatDuration,
  formatGap,
  LABELS,
  BIOME_LABELS,
  toMarkdown,
  agesMarkdown,
  ACTIVE_PACE,
  CASUAL_PACE,
  impactMarkdown,
} from './report';
import { runJobs, type Job, type Profile } from './runner';

interface Args {
  seeds: number;
  threshold: number;
  hours: number;
  out: string;
  biomes: BiomeId[];
  jobs: number;
  /** Mechanics the bot leaves aside (chantier 18). */
  without: Mechanic[];
  profile: Profile;
  /** Chantier 18 sections (0 = skipped): long ages runs, impact runs, expedition probe. */
  ages: number;
  agesDays: number;
  impact: number;
  probe: number;
}

const DRAWN = BIOME_IDS.filter((id) => BIOMES[id].face !== null);

function parseArgs(argv: string[]): Args {
  const here = dirname(fileURLToPath(import.meta.url));
  const args: Args = {
    seeds: 200,
    threshold: 10,
    hours: 72,
    out: resolve(here, '../reports/latest.md'),
    biomes: DRAWN,
    jobs: Math.max(1, availableParallelism()),
    without: [],
    profile: 'active',
    ages: 0,
    agesDays: 12,
    impact: 0,
    probe: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--seeds' && value) args.seeds = Number(value);
    else if (key === '--threshold' && value) args.threshold = Number(value);
    else if (key === '--hours' && value) args.hours = Number(value);
    else if (key === '--out' && value) args.out = resolve(value);
    else if (key === '--jobs' && value) args.jobs = Math.max(1, Number(value));
    else if (key === '--biomes' && value) args.biomes = value.split(',') as BiomeId[];
    else if (key === '--without' && value) args.without = value.split(',') as Mechanic[];
    else if (key === '--profile' && value) args.profile = value as Profile;
    else if (key === '--ages' && value) args.ages = Number(value);
    else if (key === '--ages-days' && value) args.agesDays = Number(value);
    else if (key === '--impact' && value) args.impact = Number(value);
    else if (key === '--probe' && value) args.probe = Number(value);
    else continue;
    i++;
  }
  return args;
}

/** The occasional player gets a longer horizon: its ages come later. */
const CASUAL_HORIZON = 1.4;

const args = parseArgs(process.argv.slice(2));
{
  const started = Date.now();
  const main: Job[] = args.biomes.map((biome) => ({
    biome,
    seeds: args.seeds,
    hours: args.hours,
    without: args.without,
    profile: args.profile,
  }));
  const ages: Job[] = args.ages
    ? (['active', 'casual'] as const).flatMap((profile) =>
        args.biomes.map((biome) => ({
          biome,
          seeds: args.ages,
          hours: args.agesDays * 24 * (profile === 'casual' ? CASUAL_HORIZON : 1),
          prefix: 'ages',
          profile,
        })),
      )
    : [];
  // The impact runs reuse the main runs' seeds (the first `impact` of them) as the full bot.
  const impactSeeds = Math.min(args.impact, args.seeds);
  const impact: Job[] = impactSeeds
    ? MECHANICS.flatMap((m) =>
        args.biomes.map((biome) => ({
          biome,
          seeds: impactSeeds,
          hours: args.hours,
          without: [...new Set([...args.without, m])],
          profile: args.profile,
        })),
      )
    : [];
  // The longest jobs first.
  const all = [...ages, ...main, ...impact];
  const order = all
    .map((job, i) => ({ i, cost: job.seeds * job.hours * (job.profile === 'casual' ? 0.2 : 1) }))
    .sort((a, b) => b.cost - a.cost)
    .map((x) => x.i);
  const done = await runJobs(
    order.map((i) => all[i]!),
    args.jobs,
  );
  const out: RunResult[][] = [];
  order.forEach((i, k) => (out[i] = done[k]!));
  const agesOut = out.slice(0, ages.length);
  const results = out.slice(ages.length, ages.length + main.length).flat();
  const impactOut = out.slice(ages.length + main.length);

  const biomes = biomeGroups(results, BIOME_LABELS);
  biomes.sort(
    (a, b) => args.biomes.indexOf(a.id as BiomeId) - args.biomes.indexOf(b.id as BiomeId),
  );
  const faces = faceGroups(results);
  const byBiome = compare(biomes, args.threshold);
  const byFace = compare(faces, args.threshold);
  const extra: string[] = [];
  if (ages.length) {
    const n = args.biomes.length;
    extra.push('## Ages over a long horizon (chantier 18)', '');
    extra.push(
      ...agesMarkdown(
        [
          {
            label: 'Attentive player',
            pace: ACTIVE_PACE,
            runs: agesOut.slice(0, n).flat(),
            hours: args.agesDays * 24,
          },
          {
            label: 'Occasional player (attentive 6 h, then a visit every 8 h)',
            pace: CASUAL_PACE,
            runs: agesOut.slice(n).flat(),
            hours: args.agesDays * 24 * CASUAL_HORIZON,
          },
        ],
        BIOME_LABELS,
        args.threshold,
      ),
    );
  }
  if (impact.length) {
    const n = args.biomes.length;
    const full = results.filter((r) => Number(r.seed.split('-').at(-1)) < impactSeeds);
    extra.push(
      '## Impact of each mechanic (chantier 18)',
      '',
      `Same ${impactSeeds} seeds per biome × ${args.hours} h, with the full bot and without one mechanic. Median of the biomes’ medians; positive gap = slower without it.`,
      '',
      ...impactMarkdown(
        [
          { label: 'full bot', runs: full },
          ...MECHANICS.map((m, k) => ({
            label: `without ${m}`,
            runs: impactOut.slice(k * n, (k + 1) * n).flat(),
          })),
        ],
        BIOME_LABELS,
        ['nest3', 'library', 'stone'],
      ),
    );
  }
  if (args.probe) {
    extra.push('## Expedition probe (mechanics in isolation)', '', ...expeditionProbe(args.probe));
  }
  const markdown = toMarkdown(
    { groups: biomes, comparisons: byBiome },
    { groups: faces, comparisons: byFace },
    {
      seeds: args.seeds,
      horizonHours: args.hours,
      threshold: args.threshold,
      elapsedMs: Date.now() - started,
    },
    extra,
  );

  console.log('');
  console.table(
    byBiome.map((c) => ({
      milestone: c.milestone,
      ...Object.fromEntries(
        biomes.map((g) => [
          g.label,
          `${formatDuration(c.stats[g.id]!.median)} ${formatGap(c.gaps[g.id] ?? null)}`,
        ]),
      ),
      status: c.flagged ? 'IMBALANCED' : 'ok',
    })),
  );
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, markdown);
  console.log(`Report written to ${args.out}`);
  const flagged = [...byBiome, ...byFace].filter((c) => c.flagged);
  if (flagged.length > 0)
    console.log(
      `⚠️  Beyond ±${args.threshold} %: ${[...new Set(flagged.map((c) => LABELS[c.milestone]))].join(', ')}.`,
    );
}
