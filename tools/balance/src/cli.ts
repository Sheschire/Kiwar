import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACES } from '@kiwar/shared';
import { runBot, type RunResult } from './bot';
import { compare, formatDuration, toMarkdown } from './report';

interface Args {
  seeds: number;
  threshold: number;
  hours: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const here = dirname(fileURLToPath(import.meta.url));
  const args: Args = {
    seeds: 200,
    threshold: 10,
    hours: 72,
    out: resolve(here, '../reports/latest.md'),
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--seeds' && value) args.seeds = Number(value);
    else if (key === '--threshold' && value) args.threshold = Number(value);
    else if (key === '--hours' && value) args.hours = Number(value);
    else if (key === '--out' && value) args.out = resolve(value);
    else continue;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const started = Date.now();
const results: RunResult[] = [];
for (const face of FACES) {
  for (let i = 0; i < args.seeds; i++) {
    results.push(runBot({ seed: `balance-${i}`, face, horizonMs: args.hours * 3_600_000 }));
  }
  process.stdout.write(`  ${face}: ${args.seeds} runs done\n`);
}
const comparisons = compare(results, args.threshold);
const markdown = toMarkdown(comparisons, {
  seeds: args.seeds,
  horizonHours: args.hours,
  threshold: args.threshold,
  elapsedMs: Date.now() - started,
});

console.log('');
console.table(
  comparisons.map((c) => ({
    milestone: c.milestone,
    kiwisu: formatDuration(c.stats.kiwisu.median),
    kiwino: formatDuration(c.stats.kiwino.median),
    gap: c.gapPercent === null ? '—' : `${c.gapPercent.toFixed(1)} %`,
    status: c.flagged ? 'IMBALANCED' : 'ok',
  })),
);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, markdown);
console.log(`Report written to ${args.out}`);
if (comparisons.some((c) => c.flagged)) {
  console.log(
    `⚠️  Some milestones differ by more than ±${args.threshold} % between Kiwisu and Kiwino.`,
  );
}
