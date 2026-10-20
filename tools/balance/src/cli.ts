import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_IDS, BIOMES, type BiomeId } from '@kiwar/shared';
import { runBot, type RunResult } from './bot';
import {
  biomeGroups,
  compare,
  faceGroups,
  formatDuration,
  formatGap,
  LABELS,
  toMarkdown,
} from './report';

interface Args {
  seeds: number;
  threshold: number;
  hours: number;
  out: string;
  biomes: BiomeId[];
  jobs: number;
  /** Internal: this process only runs one biome and sends its results to the parent. */
  worker: BiomeId | null;
}

const DRAWN = BIOME_IDS.filter((id) => BIOMES[id].face !== null);

const LABEL: Record<BiomeId, string> = {
  classic: 'Classic',
  orchard: 'Orchard',
  highlands: 'Highlands',
  delta: 'Delta',
  seedCrown: 'Seed crown',
  lagoons: 'Lagoons',
  tundra: 'Tundra',
};

function parseArgs(argv: string[]): Args {
  const here = dirname(fileURLToPath(import.meta.url));
  const args: Args = {
    seeds: 200,
    threshold: 10,
    hours: 72,
    out: resolve(here, '../reports/latest.md'),
    biomes: DRAWN,
    jobs: Math.max(1, availableParallelism()),
    worker: null,
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
    else if (key === '--worker' && value) args.worker = value as BiomeId;
    else continue;
    i++;
  }
  return args;
}

function runBiome(biome: BiomeId, args: Args): RunResult[] {
  const face = BIOMES[biome].face ?? 'kiwisu';
  const results: RunResult[] = [];
  for (let i = 0; i < args.seeds; i++)
    results.push(runBot({ seed: `balance-${i}`, face, biome, horizonMs: args.hours * 3_600_000 }));
  return results;
}

/** Runs the biomes in child processes, `jobs` at a time. */
async function runAll(args: Args): Promise<RunResult[]> {
  const script = fileURLToPath(import.meta.url);
  const queue = [...args.biomes];
  const results: RunResult[] = [];
  const workers = Array.from({ length: Math.min(args.jobs, queue.length) }, async () => {
    for (let biome = queue.shift(); biome; biome = queue.shift()) {
      const b = biome;
      const out = await new Promise<RunResult[]>((done, failed) => {
        const child = fork(script, [
          '--worker',
          b,
          '--seeds',
          String(args.seeds),
          '--hours',
          String(args.hours),
        ]);
        child.on('message', (m) => done(m as RunResult[]));
        child.on('exit', (code) => (code ? failed(new Error(`${b} exited with ${code}`)) : null));
      });
      results.push(...out);
      process.stdout.write(`  ${b}: ${args.seeds} runs done\n`);
    }
  });
  await Promise.all(workers);
  return results;
}

const args = parseArgs(process.argv.slice(2));
if (args.worker) {
  process.send!(runBiome(args.worker, args), () => process.exit(0));
} else {
  const started = Date.now();
  const results = await runAll(args);
  const biomes = biomeGroups(results, LABEL);
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
