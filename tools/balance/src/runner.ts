import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BIOMES, type BiomeId } from '@kiwar/shared';
import { runBot, type Mechanic, type RunResult } from './bot';

/** One batch of bot runs, played in its own child process. */
export interface Job {
  biome: BiomeId;
  seeds: number;
  hours: number;
  /** Seeds are `<prefix>-<i>`. */
  prefix?: string;
  without?: Mechanic[];
  profile?: Profile;
}

/**
 * Chantier 18: an attentive player, or an occasional one who plays the first hours attentively
 * then comes back three times a day.
 */
export const PROFILES = {
  active: {},
  casual: { activeMs: 6 * 3_600_000, sessionEveryMs: 8 * 3_600_000 },
} as const;
export type Profile = keyof typeof PROFILES;

export function runJob(job: Job): RunResult[] {
  const face = BIOMES[job.biome].face ?? 'kiwisu';
  const results: RunResult[] = [];
  for (let i = 0; i < job.seeds; i++)
    results.push(
      runBot({
        seed: `${job.prefix ?? 'balance'}-${i}`,
        face,
        biome: job.biome,
        horizonMs: job.hours * 3_600_000,
        without: job.without,
        ...PROFILES[job.profile ?? 'active'],
      }),
    );
  return results;
}

const label = (job: Job) =>
  `${job.biome}${job.profile === 'casual' ? ' casual' : ''}${job.without?.length ? ` without ${job.without.join('+')}` : ''} (${Math.round(job.hours)} h)`;

/**
 * Runs the jobs in child processes, `parallel` at a time (the biggest jobs are best listed
 * first). Results come back in the order of the jobs.
 */
export async function runJobs(jobs: Job[], parallel: number): Promise<RunResult[][]> {
  const script = fileURLToPath(new URL('./worker.ts', import.meta.url));
  const out: RunResult[][] = jobs.map(() => []);
  let next = 0;
  const lanes = Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      const job = jobs[i]!;
      out[i] = await new Promise<RunResult[]>((done, failed) => {
        const child = fork(script, [JSON.stringify(job)]);
        child.on('message', (m) => done(m as RunResult[]));
        child.on('exit', (code) =>
          code ? failed(new Error(`${label(job)} exited with ${code}`)) : null,
        );
      });
      process.stdout.write(`  ${label(job)}: ${job.seeds} runs done\n`);
    }
  });
  await Promise.all(lanes);
  return out;
}
