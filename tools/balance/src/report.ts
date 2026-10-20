import { FACES, type BiomeId, type Face } from '@kiwar/shared';
import { MILESTONES, type Milestone, type RunResult } from './bot';

export interface MilestoneStats {
  reached: number;
  runs: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
}

/** A group of runs compared with the others: a biome, or a whole face. */
export interface Group {
  id: string;
  label: string;
  runs: RunResult[];
}

export interface Comparison {
  milestone: Milestone;
  stats: Record<string, MilestoneStats>;
  /** Gap of each group's median to the median of all the groups' medians, in %. */
  gaps: Record<string, number | null>;
  /** Largest gap (in absolute value). */
  worst: number | null;
  flagged: boolean;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function statsOf(runs: RunResult[], milestone: Milestone): MilestoneStats {
  const times = runs
    .map((r) => r.times[milestone])
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);
  return {
    reached: times.length,
    runs: runs.length,
    p10: quantile(times, 0.1),
    median: quantile(times, 0.5),
    p90: quantile(times, 0.9),
  };
}

/**
 * Every group against the reference (median of the groups' medians): a milestone is flagged
 * when one group is more than `thresholdPercent` away, or reaches it much less often.
 */
export function compare(groups: Group[], thresholdPercent: number): Comparison[] {
  return MILESTONES.map((milestone) => {
    const stats: Record<string, MilestoneStats> = {};
    for (const g of groups) stats[g.id] = statsOf(g.runs, milestone);
    const medians = groups
      .map((g) => stats[g.id]!.median)
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b);
    const ref = quantile(medians, 0.5);
    const gaps: Record<string, number | null> = {};
    let worst: number | null = null;
    let flagged = false;
    const reachRates = groups.map((g) => stats[g.id]!.reached / Math.max(1, stats[g.id]!.runs));
    if (Math.max(...reachRates) - Math.min(...reachRates) > thresholdPercent / 100) flagged = true;
    for (const g of groups) {
      const m = stats[g.id]!.median;
      const gap = m !== null && ref !== null && ref > 0 ? ((m - ref) / ref) * 100 : null;
      gaps[g.id] = gap;
      if (gap !== null && (worst === null || Math.abs(gap) > Math.abs(worst))) worst = gap;
      if (gap !== null && Math.abs(gap) > thresholdPercent) flagged = true;
    }
    return { milestone, stats, gaps, worst, flagged };
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

export const formatGap = (gap: number | null): string =>
  gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)} %`;

export const LABELS: Record<Milestone, string> = {
  tutorial: 'Tutorial completed (10 objectives)',
  pop10: 'Population 10',
  nest2: 'Nest level 2',
  nest3: 'Nest level 3',
  allLevel3: 'Every economy building at level 3',
  kiwi5: 'First kiwi at level 5',
  kiwi10: 'First kiwi at level 10',
  mayor: 'A mayor elected (School)',
  library: 'A Library (research)',
  stone: 'Stone age',
  iron: 'Iron age',
  industry: 'Industrial age',
  lab: 'Laboratory against nature',
  kikiwiwi: 'First Kikiwiwi',
};

export function biomeGroups(results: RunResult[], labels: Record<BiomeId, string>): Group[] {
  const ids = [...new Set(results.map((r) => r.biome))];
  return ids.map((id) => ({
    id,
    label: labels[id],
    runs: results.filter((r) => r.biome === id),
  }));
}

export function faceGroups(results: RunResult[]): Group[] {
  const name: Record<Face, string> = { kiwisu: 'Kiwisu', kiwino: 'Kiwino' };
  return FACES.map((face) => ({
    id: face,
    label: name[face],
    runs: results.filter((r) => r.face === face),
  }));
}

function table(groups: Group[], comparisons: Comparison[], lines: string[]): void {
  lines.push(`| Milestone | ${groups.map((g) => g.label).join(' | ')} | Worst gap | |`);
  lines.push(`|---|${groups.map(() => '---').join('|')}|---|---|`);
  for (const c of comparisons) {
    const cells = groups.map((g) => {
      const s = c.stats[g.id]!;
      const reach = s.reached < s.runs ? ` [${s.reached}/${s.runs}]` : '';
      return `${formatDuration(s.median)} (${formatGap(c.gaps[g.id] ?? null)})${reach}`;
    });
    lines.push(
      `| ${LABELS[c.milestone]} | ${cells.join(' | ')} | ${formatGap(c.worst)} | ${c.flagged ? '⚠️' : '✅'} |`,
    );
  }
  lines.push('');
}

/** Chantier 06: what the predators did to the bot's colonies (averages per run). */
function threatTable(groups: Group[], lines: string[]): void {
  const avg = (runs: RunResult[], f: (r: RunResult) => number) =>
    runs.length ? runs.reduce((s, r) => s + f(r), 0) / runs.length : 0;
  lines.push('## Predators and gifts from the sky (average per run)', '');
  lines.push('| Biome | Waves | Lost | Kiwis killed | Meteorites | Comets | Stardust picked |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const g of groups) {
    const waves = avg(g.runs, (r) => r.final.waves ?? 0);
    const lost = avg(g.runs, (r) => r.final.wavesLost ?? 0);
    lines.push(
      `| ${g.label} | ${waves.toFixed(1)} | ${lost.toFixed(1)} (${waves > 0 ? Math.round((lost / waves) * 100) : 0} %) | ${avg(g.runs, (r) => r.final.predatorDeaths ?? 0).toFixed(2)} | ${avg(g.runs, (r) => r.final.meteors ?? 0).toFixed(1)} | ${avg(g.runs, (r) => r.final.comets ?? 0).toFixed(1)} | ${avg(g.runs, (r) => r.final.dustPicked ?? 0).toFixed(0)} |`,
    );
  }
  lines.push('');
}

export function toMarkdown(
  biomes: { groups: Group[]; comparisons: Comparison[] },
  faces: { groups: Group[]; comparisons: Comparison[] },
  meta: { seeds: number; horizonHours: number; threshold: number; elapsedMs: number },
): string {
  const lines: string[] = [];
  lines.push('# Kiwar balance report — biomes', '');
  lines.push(
    `${meta.seeds} seeds per biome · horizon ${meta.horizonHours} h of game time · threshold ±${meta.threshold} % · computed in ${(meta.elapsedMs / 1000).toFixed(1)} s`,
    '',
    'Each cell: median time to reach the milestone (gap to the median of all biomes). `[n/N]`: runs that reached it, when not all did.',
    '',
  );
  lines.push('## Every biome', '');
  table(biomes.groups, biomes.comparisons, lines);
  lines.push('## Kiwisu vs Kiwino (all biomes of each face)', '');
  table(faces.groups, faces.comparisons, lines);
  threatTable(biomes.groups, lines);
  const flagged = [...biomes.comparisons, ...faces.comparisons].filter((c) => c.flagged);
  lines.push(
    flagged.length === 0
      ? `**Balanced**: every biome and both faces are within ±${meta.threshold} % on every milestone.`
      : `**${flagged.length} line(s) exceed ±${meta.threshold} %**: ${[...new Set(flagged.map((c) => LABELS[c.milestone]))].join(', ')}. Positive gap = slower.`,
  );
  lines.push(
    '',
    'Bot: follows the tutorial, keeps kiwis busy, hatches eggs, builds one of each building on the site with the most deposits in reach (weighted by logistics), then upgrades the bottleneck producer (or opens a new site when its deposits are exhausted), adds housing/storage when needed and upgrades the Nest as soon as possible. It keeps clear of floodable tiles and uses neither camps nor paths. Chantier 06: one turret of each model after the Nest 2 (more, or upgraded, after a lost wave), guards posted 40 min before a strike to close the forecast gap, shelter when deaths or several injuries are still expected, repairs first. Chantier 08: a Library after the Nest 3 and the School, one researcher per five kiwis, the economy then each passage first, the monument as soon as its passage is known (it saves up for it).',
  );
  return lines.join('\n') + '\n';
}
