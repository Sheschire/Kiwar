import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_IDS, BIOMES, type BiomeId } from '@kiwar/shared';
import type { Mechanic } from './bot';
import {
  biomeGroups,
  compare,
  faceGroups,
  formatDuration,
  formatGap,
  LABELS,
  BIOME_LABELS,
  toMarkdown,
} from './report';
import { runJobs } from './runner';

interface Args {
  seeds: number;
  threshold: number;
  hours: number;
  out: string;
  biomes: BiomeId[];
  jobs: number;
  /** Mechanics the bot leaves aside (chantier 18). */
  without: Mechanic[];
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
    else continue;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
{
  const started = Date.now();
  const jobs = args.biomes.map((biome) => ({
    biome,
    seeds: args.seeds,
    hours: args.hours,
    without: args.without,
  }));
  const results = (await runJobs(jobs, args.jobs)).flat();
  const biomes = biomeGroups(results, BIOME_LABELS);
  biomes.sort(
    (a, b) => args.biomes.indexOf(a.id as BiomeId) - args.biomes.indexOf(b.id as BiomeId),
  );
  const faces = faceGroups(results);
  const byBiome = compare(biomes, args.threshold);
  const byFace = compare(faces, args.threshold);
  const markdown = toMarkdown(
    { groups: biomes, comparisons: byBiome },
    { groups: faces, comparisons: byFace },
    {
      seeds: args.seeds,
      horizonHours: args.hours,
      threshold: args.threshold,
      elapsedMs: Date.now() - started,
    },
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
