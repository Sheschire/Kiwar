import { FACES, type Face } from '@kiwar/shared';
import { MILESTONES, type Milestone, type RunResult } from './bot';

export interface MilestoneStats {
  reached: number;
  runs: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
}

export interface Comparison {
  milestone: Milestone;
  stats: Record<Face, MilestoneStats>;
  /** Relative gap between the medians, in % of their mean (positive = Kiwino slower). */
  gapPercent: number | null;
  flagged: boolean;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function compare(results: RunResult[], thresholdPercent: number): Comparison[] {
  return MILESTONES.map((milestone) => {
    const stats = {} as Record<Face, MilestoneStats>;
    for (const face of FACES) {
      const runs = results.filter((r) => r.face === face);
      const times = runs
        .map((r) => r.times[milestone])
        .filter((t): t is number => t !== null)
        .sort((a, b) => a - b);
      stats[face] = {
        reached: times.length,
        runs: runs.length,
        p10: quantile(times, 0.1),
        median: quantile(times, 0.5),
        p90: quantile(times, 0.9),
      };
    }
    const a = stats.kiwisu.median;
    const b = stats.kiwino.median;
    const gapPercent = a !== null && b !== null ? ((b - a) / ((a + b) / 2)) * 100 : null;
    const reachGap =
      Math.abs(stats.kiwisu.reached - stats.kiwino.reached) / Math.max(1, stats.kiwisu.runs);
    const flagged =
      (gapPercent !== null && Math.abs(gapPercent) > thresholdPercent) ||
      reachGap * 100 > thresholdPercent;
    return { milestone, stats, gapPercent, flagged };
  });
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const min = ms / 60_000;
  if (min < 60) return `${min.toFixed(1)} min`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

const LABELS: Record<Milestone, string> = {
  tutorial: 'Tutorial completed (10 objectives)',
  pop10: 'Population 10',
  nest2: 'Nest level 2',
  nest3: 'Nest level 3',
  allLevel3: 'Every building type at level 3',
};

export function toMarkdown(
  comparisons: Comparison[],
  meta: { seeds: number; horizonHours: number; threshold: number; elapsedMs: number },
): string {
  const lines: string[] = [];
  lines.push('# Kiwar balance report — Kiwisu vs Kiwino', '');
  lines.push(
    `${meta.seeds} seeds per face · horizon ${meta.horizonHours} h of game time · threshold ±${meta.threshold} % · computed in ${(meta.elapsedMs / 1000).toFixed(1)} s`,
    '',
  );
  lines.push(
    '| Milestone | Kiwisu median (p10–p90) | Kiwino median (p10–p90) | Reached (su / no) | Gap | |',
  );
  lines.push('|---|---|---|---|---|---|');
  for (const c of comparisons) {
    const fmt = (s: MilestoneStats) =>
      `${formatDuration(s.median)} (${formatDuration(s.p10)}–${formatDuration(s.p90)})`;
    const gap =
      c.gapPercent === null ? '—' : `${c.gapPercent > 0 ? '+' : ''}${c.gapPercent.toFixed(1)} %`;
    lines.push(
      `| ${LABELS[c.milestone]} | ${fmt(c.stats.kiwisu)} | ${fmt(c.stats.kiwino)} | ${c.stats.kiwisu.reached}/${c.stats.kiwisu.runs} · ${c.stats.kiwino.reached}/${c.stats.kiwino.runs} | ${gap} | ${c.flagged ? '⚠️' : '✅'} |`,
    );
  }
  lines.push('');
  const flagged = comparisons.filter((c) => c.flagged);
  lines.push(
    flagged.length === 0
      ? `**Balanced**: every milestone is within ±${meta.threshold} %.`
      : `**${flagged.length} milestone(s) exceed ±${meta.threshold} %**: ${flagged.map((c) => LABELS[c.milestone]).join(', ')}. Positive gap = Kiwino is slower.`,
  );
  lines.push(
    '',
    'Bot: follows the tutorial, keeps kiwis busy, hatches eggs, builds one of each building, then upgrades the bottleneck producer, adds housing/storage when needed and upgrades the Nest as soon as possible.',
  );
  return lines.join('\n') + '\n';
}
