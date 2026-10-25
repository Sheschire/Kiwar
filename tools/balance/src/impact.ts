/**
 * Impact report (chantier 18): plays the same seeds with the full bot and with the bot leaving
 * one mechanic aside (paths, camps, expeditions), and prints what each mechanic brings.
 *   pnpm balance:impact [--seeds 30] [--hours 72] [--biomes a,b] [--out file]
 */
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_IDS, BIOMES, type BiomeId } from '@kiwar/shared';
import { MECHANICS, type Mechanic } from './bot';
import { BIOME_LABELS, impactMarkdown } from './report';
import { runJobs, type Job } from './runner';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('--seeds')) || 30;
const hours = Number(arg('--hours')) || 72;
const biomes = (arg('--biomes')?.split(',') ??
  BIOME_IDS.filter((id) => BIOMES[id].face !== null)) as BiomeId[];
const parallel = Number(arg('--jobs')) || Math.max(1, availableParallelism());
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(arg('--out') ?? resolve(here, '../reports/impact.md'));

const NAMES: Record<Mechanic, string> = {
  paths: 'without paths',
  camps: 'without camps',
  expeditions: 'without expeditions',
  classes: 'without the classes of chantier 37',
  forge: 'without the Forge of chantier 38',
  village: 'without the village life of chantiers 43–44',
  canals: 'without the canals of chantier 45',
};
const variants: { label: string; without: Mechanic[] }[] = [
  { label: 'full bot', without: [] },
  ...MECHANICS.map((m) => ({ label: NAMES[m], without: [m] })),
];

const started = Date.now();
const jobs: Job[] = variants.flatMap((v) =>
  biomes.map((biome) => ({ biome, seeds, hours, without: v.without })),
);
const results = await runJobs(jobs, parallel);
const runs = variants.map((v, i) => ({
  label: v.label,
  runs: results.slice(i * biomes.length, (i + 1) * biomes.length).flat(),
}));
const lines = [
  '# Kiwar balance — impact of each mechanic',
  '',
  `${seeds} seeds per biome · horizon ${hours} h · computed in ${((Date.now() - started) / 60_000).toFixed(1)} min`,
  '',
  'Median of the biomes’ medians; gap to the full bot (positive = slower without the mechanic).',
  '',
  ...impactMarkdown(runs, BIOME_LABELS, ['nest3', 'library', 'stone']),
];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
