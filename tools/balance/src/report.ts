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
/** Milestones shown for information only: they depend on choices more than on the land. */
export const INFORMATIVE: ReadonlySet<Milestone> = new Set([
  'glimpse',
  'landingWon',
  'centreWon',
  // Chantier 42: the queen and the conquest; chantier 19: the second colony.
  'queenOut',
  'conquest',
  'founded',
  'sisterNest3',
  'sisterWave',
]);

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
    return { milestone, stats, gaps, worst, flagged: flagged && !INFORMATIVE.has(milestone) };
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
  glimpse: 'First landing back (a glimpse)',
  landingWon: 'First landing won (a beacon)',
  centreWon: 'First beacon in the centre',
  queenOut: 'The queen out (12 beacons)',
  conquest: 'Twin face conquered',
  founded: 'Second colony founded',
  sisterNest3: 'Second colony: Nest level 3',
  sisterWave: 'Second colony: first wave',
};

export const BIOME_LABELS: Record<BiomeId, string> = {
  classic: 'Classic',
  orchard: 'Orchard',
  highlands: 'Highlands',
  delta: 'Delta',
  seedCrown: 'Seed crown',
  lagoons: 'Lagoons',
  tundra: 'Tundra',
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
  lines.push(
    '| Biome | Waves | Lost | With losses | Loot per wave | Kiwis killed | Meteorites | Comets | Stardust picked |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const g of groups) {
    const waves = avg(g.runs, (r) => r.final.waves ?? 0);
    const lost = avg(g.runs, (r) => r.final.wavesLost ?? 0);
    const hurt = avg(g.runs, (r) => r.final.wavesHurt ?? 0);
    const loot = avg(g.runs, (r) => r.final.waveLoot ?? 0);
    const pct = (x: number) => (waves > 0 ? Math.round((x / waves) * 100) : 0);
    lines.push(
      `| ${g.label} | ${waves.toFixed(1)} | ${lost.toFixed(1)} (${pct(lost)} %) | ${pct(hurt)} % | ${waves > 0 ? Math.round(loot / waves) : 0} | ${avg(g.runs, (r) => r.final.predatorDeaths ?? 0).toFixed(2)} | ${avg(g.runs, (r) => r.final.meteors ?? 0).toFixed(1)} | ${avg(g.runs, (r) => r.final.comets ?? 0).toFixed(1)} | ${avg(g.runs, (r) => r.final.dustPicked ?? 0).toFixed(0)} |`,
    );
  }
  lines.push('');
}

/** Chantier 30: rhythm measures (medians of the runs; dead time over the first 24 h). */
function rhythmTable(groups: Group[], lines: string[]): void {
  const med = (runs: RunResult[], f: (r: RunResult) => number) => {
    const v = runs.map(f).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : 0;
  };
  lines.push('## Rhythm (median per run)', '');
  lines.push(
    `Dead time: the longest stretch of the first 24 h without a useful decision (target ≤ ${DEAD_TARGET_MIN} min). At the cap: share of the run the most capped resource spent with its stock and reserves full (target < ${CAP_TARGET} %). Lost: production lost meanwhile, share of what was produced.`,
    '',
  );
  lines.push('| Biome | Dead time | Starting at | At the cap | Lost |');
  lines.push('|---|---|---|---|---|');
  for (const g of groups) {
    const dead = med(g.runs, (r) => r.final.deadMaxMin ?? 0);
    const cap = med(g.runs, (r) => r.final.capShare ?? 0) * 100;
    const lost = med(g.runs, (r) => r.final.lostShare ?? 0) * 100;
    lines.push(
      `| ${g.label} | ${dead} min${dead > DEAD_TARGET_MIN ? ' ⚠️' : ''} | ${med(g.runs, (r) => r.final.deadAtH ?? 0).toFixed(1)} h | ${cap.toFixed(0)} %${cap >= CAP_TARGET ? ' ⚠️' : ''} | ${lost.toFixed(1)} % |`,
    );
  }
  lines.push('');
}

/** Chantier 30 working hypotheses (`kiwar-design`): not laws, but flagged in the report. */
export const DEAD_TARGET_MIN = 45;
export const CAP_TARGET = 20;

/** Chantier 18: paths, camps and expeditions played by the bot (averages per run). */
function mechanicsTable(groups: Group[], horizonHours: number, lines: string[]): void {
  const avg = (runs: RunResult[], f: (r: RunResult) => number) =>
    runs.length ? runs.reduce((s, r) => s + f(r), 0) / runs.length : 0;
  const days = horizonHours / 24;
  lines.push('## Paths, camps and expeditions (average per run)', '');
  lines.push(
    '| Biome | Path tiles | Camps set up | Landings | Won | Retreats | Ships lost | Loot per day | Kiwis lost on expeditions |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const g of groups) {
    const landings = avg(g.runs, (r) => r.final.landings ?? 0);
    const won = avg(g.runs, (r) => r.final.landingsWon ?? 0);
    lines.push(
      `| ${g.label} | ${avg(g.runs, (r) => r.final.paths ?? 0).toFixed(0)} | ${avg(g.runs, (r) => r.final.camps ?? 0).toFixed(1)} | ${landings.toFixed(1)} | ${landings > 0 ? Math.round((won / landings) * 100) : 0} % | ${avg(g.runs, (r) => r.final.retreats ?? 0).toFixed(1)} | ${avg(g.runs, (r) => r.final.shipsLost ?? 0).toFixed(1)} | ${(avg(g.runs, (r) => r.final.loot ?? 0) / days).toFixed(0)} | ${avg(g.runs, (r) => r.final.expeditionDeaths ?? 0).toFixed(2)} |`,
    );
  }
  lines.push('');
}

export function toMarkdown(
  biomes: { groups: Group[]; comparisons: Comparison[] },
  faces: { groups: Group[]; comparisons: Comparison[] },
  meta: { seeds: number; horizonHours: number; threshold: number; elapsedMs: number },
  /** Chantier 18: more sections (ages, impact, expedition probe), already in markdown. */
  extra: string[] = [],
): string {
  const lines: string[] = [];
  lines.push('# Kiwar balance report — biomes', '');
  lines.push(
    `${meta.seeds} seeds per biome · horizon ${meta.horizonHours} h of game time · threshold ±${meta.threshold} % · computed in ${(meta.elapsedMs / 60_000).toFixed(1)} min`,
    '',
    'Each cell: median time to reach the milestone (gap to the median of all biomes). `[n/N]`: runs that reached it, when not all did.',
    '',
  );
  lines.push('## Every biome', '');
  table(biomes.groups, biomes.comparisons, lines);
  lines.push('## Kiwisu vs Kiwino (all biomes of each face)', '');
  table(faces.groups, faces.comparisons, lines);
  threatTable(biomes.groups, lines);
  mechanicsTable(biomes.groups, meta.horizonHours, lines);
  rhythmTable(biomes.groups, lines);
  const flagged = [...biomes.comparisons, ...faces.comparisons].filter((c) => c.flagged);
  lines.push(
    flagged.length === 0
      ? `**Balanced**: every biome and both faces are within ±${meta.threshold} % on every milestone.`
      : `**${flagged.length} line(s) exceed ±${meta.threshold} %**: ${[...new Set(flagged.map((c) => LABELS[c.milestone]))].join(', ')}. Positive gap = slower.`,
  );
  lines.push('', ...extra);
  lines.push(
    '',
    'Bot: follows the tutorial, keeps kiwis busy, hatches eggs, builds one of each building on the site with the most deposits in reach (weighted by logistics), then upgrades the bottleneck producer (or opens a new site when its deposits are exhausted), adds housing/storage when needed and upgrades the Nest as soon as possible. It keeps clear of floodable tiles. Chantier 18: it paves the walk from a producer to its depot when the extra harvest pays the fiber back within 6 h (checked once per game hour), which also retraces trampled paths; it sets up a camp on every meteorite crater (pulling a worker from the most plentiful resource) and, when kiwis are left idle, on the richest free deposit of the bottleneck resource. Chantier 06: one turret of each model after the Nest 2 (more, or upgraded, after a lost wave), guards posted 40 min before a strike to close the forecast gap, shelter when deaths or several injuries are still expected, repairs first. Chantier 08: a Library after the Nest 3 and the School, one researcher per five kiwis, the economy then each passage first, the monument as soon as its passage is known (it saves up for it). Chantier 40: a launchpad once the Library stands, two warriors and a scout; landings on the twin from the edge (weakest known parcel first), the centre once a beacon lights its edge, with the crew that wins all three practice battles with the fewest dead expected (one at most), a bat-hitter aboard, cautious, back to the ship at half the crew, burning; the mayor, the builders and the best researcher stay home; a day off after a landing that cost two kiwis.',
  );
  return lines.join('\n') + '\n';
}

/** Median of the biomes' medians for one milestone (null when no biome reaches it). */
function medianOfBiomes(runs: RunResult[], milestone: Milestone): number | null {
  const medians = [...new Set(runs.map((r) => r.biome))]
    .map(
      (b) =>
        statsOf(
          runs.filter((r) => r.biome === b),
          milestone,
        ).median,
    )
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  return quantile(medians, 0.5);
}

/** One variant of the impact report: the same seeds, with some mechanics left aside. */
export interface Variant {
  label: string;
  runs: RunResult[];
}

/**
 * Chantier 18: what each mechanic brings. The first variant is the full bot; the others leave
 * one mechanic aside, on the same seeds. Positive gap = slower without the mechanic.
 */
export function impactMarkdown(
  variants: Variant[],
  biomeLabels: Record<BiomeId, string>,
  focus: Milestone[],
): string[] {
  const [full, ...others] = variants;
  if (!full) return [];
  const lines: string[] = [];
  const gap = (ref: number | null, m: number | null) =>
    ref !== null && m !== null && ref > 0 ? ((m - ref) / ref) * 100 : null;
  lines.push(`| Milestone | ${variants.map((v) => v.label).join(' | ')} |`);
  lines.push(`|---|${variants.map(() => '---').join('|')}|`);
  for (const milestone of MILESTONES) {
    const ref = medianOfBiomes(full.runs, milestone);
    if (ref === null && others.every((v) => medianOfBiomes(v.runs, milestone) === null)) continue;
    const cells = others.map((v) => {
      const m = medianOfBiomes(v.runs, milestone);
      return `${formatDuration(m)} (${formatGap(gap(ref, m))})`;
    });
    lines.push(`| ${LABELS[milestone]} | ${formatDuration(ref)} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  // Biome by biome on a few milestones: where a mechanic matters most.
  const biomes = [...new Set(full.runs.map((r) => r.biome))];
  const median = (runs: RunResult[], b: BiomeId, m: Milestone) =>
    statsOf(
      runs.filter((r) => r.biome === b),
      m,
    ).median;
  for (const m of focus) {
    lines.push(`**${LABELS[m]}** by biome`, '');
    lines.push(`| Biome | ${variants.map((v) => v.label).join(' | ')} |`);
    lines.push(`|---|${variants.map(() => '---').join('|')}|`);
    for (const b of biomes) {
      const ref = median(full.runs, b, m);
      const cells = others.map((v) => formatGap(gap(ref, median(v.runs, b, m))));
      lines.push(`| ${biomeLabels[b]} | ${formatDuration(ref)} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines;
}

/** Chantier 30: age targets of the attentive player (the occasional one: × `CASUAL_PACE`). */
export const AGE_TARGETS_H = { stone: 12, iron: 72, industry: 240 } as const;
/**
 * Occasional player: about 2/3 of the attentive pace (owner), the late game more lenient: the
 * research that paces it runs offline (owner: accepted, Industry × 1.25).
 */
export const CASUAL_PACE: Record<keyof typeof AGE_TARGETS_H, number> = {
  stone: 1.5,
  iron: 1.5,
  industry: 1.25,
};
/** The attentive player's pace (× 1 everywhere). */
export const ACTIVE_PACE: Record<keyof typeof AGE_TARGETS_H, number> = {
  stone: 1,
  iron: 1,
  industry: 1,
};
/** Tolerance on the age targets. */
export const AGE_TOLERANCE = 15;

/**
 * The ages section: median time to each age per biome, for each profile, against the targets
 * (±`AGE_TOLERANCE` %) and between biomes (±`threshold` %).
 */
export function agesMarkdown(
  profiles: {
    label: string;
    pace: Record<keyof typeof AGE_TARGETS_H, number>;
    runs: RunResult[];
    hours: number;
  }[],
  biomeLabels: Record<BiomeId, string>,
  threshold: number,
): string[] {
  const lines: string[] = [];
  const steps = ['nest3', 'library', 'stone', 'iron', 'lab', 'kikiwiwi', 'industry'] as const;
  for (const p of profiles) {
    const seeds = p.runs.filter((r) => r.biome === p.runs[0]?.biome).length;
    lines.push(`### ${p.label} — ${seeds} seeds per biome × ${Math.round(p.hours / 24)} days`, '');
    lines.push(`| Biome | ${steps.map((m) => LABELS[m]).join(' | ')} |`);
    lines.push(`|---|${steps.map(() => '---').join('|')}|`);
    const biomes = [...new Set(p.runs.map((r) => r.biome))];
    const comparisons = compare(
      biomes.map((b) => ({
        id: b,
        label: biomeLabels[b],
        runs: p.runs.filter((r) => r.biome === b),
      })),
      threshold,
    );
    const byMilestone = new Map(comparisons.map((c) => [c.milestone, c]));
    for (const b of biomes) {
      const cells = steps.map((m) => {
        const c = byMilestone.get(m)!;
        const s = c.stats[b]!;
        const reach = s.reached < s.runs ? ` [${s.reached}/${s.runs}]` : '';
        return `${formatDuration(s.median)} (${formatGap(c.gaps[b] ?? null)})${reach}`;
      });
      lines.push(`| ${biomeLabels[b]} | ${cells.join(' | ')} |`);
    }
    // Targets: the median of the biomes' medians against the pace wanted.
    const targetCells = steps.map((m) => {
      const target = (AGE_TARGETS_H as Record<string, number>)[m];
      const c = byMilestone.get(m)!;
      const medians = biomes
        .map((b) => c.stats[b]!.median)
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      const all = medians.length === biomes.length ? quantile(medians, 0.5) : null;
      if (target === undefined) return `${formatDuration(all)} ${c.flagged ? '⚠️' : '✅'}`;
      const wanted = target * p.pace[m as keyof typeof AGE_TARGETS_H] * 3_600_000;
      const gap = all === null ? null : ((all - wanted) / wanted) * 100;
      const ok = gap !== null && Math.abs(gap) <= AGE_TOLERANCE && !c.flagged;
      return `${formatDuration(all)} for ${formatDuration(wanted)} (${formatGap(gap)}) ${ok ? '✅' : '⚠️'}`;
    });
    lines.push(`| **All biomes vs target** | ${targetCells.join(' | ')} |`, '');
  }
  lines.push(
    `Targets: Stone ≈ ${AGE_TARGETS_H.stone} h, Iron ≈ ${AGE_TARGETS_H.iron} h, Industry ≈ ${AGE_TARGETS_H.industry} h for the attentive player, × ${CASUAL_PACE.stone} / ${CASUAL_PACE.iron} / ${CASUAL_PACE.industry} for the occasional one (the late game runs on research, which goes on offline) (±${AGE_TOLERANCE} %); biomes within ±${threshold} % of each other. \`[n/N]\`: runs that reached it.`,
    '',
  );
  return lines;
}

/**
 * Chantier 31: what the waves cost each profile (averages per run over the long horizon):
 * an occasional player who never prepares should lose something on most waves, an attentive
 * one little; nobody dies without a real defeat.
 */
export function wavesMarkdown(profiles: { label: string; runs: RunResult[] }[]): string[] {
  const avg = (runs: RunResult[], f: (r: RunResult) => number) =>
    runs.length ? runs.reduce((s, r) => s + f(r), 0) / runs.length : 0;
  const lines = [
    '| Profile | Waves | Lost | With losses | Loot per wave | Kiwis killed |',
    '|---|---|---|---|---|---|',
  ];
  for (const p of profiles) {
    const waves = avg(p.runs, (r) => r.final.waves ?? 0);
    const pct = (x: number) => (waves > 0 ? Math.round((x / waves) * 100) : 0);
    const lost = avg(p.runs, (r) => r.final.wavesLost ?? 0);
    const hurt = avg(p.runs, (r) => r.final.wavesHurt ?? 0);
    const loot = avg(p.runs, (r) => r.final.waveLoot ?? 0);
    lines.push(
      `| ${p.label} | ${waves.toFixed(1)} | ${pct(lost)} % | ${pct(hurt)} % | ${waves > 0 ? Math.round(loot / waves) : 0} | ${avg(p.runs, (r) => r.final.predatorDeaths ?? 0).toFixed(2)} |`,
    );
  }
  lines.push('');
  // Chantier 39: the alien civilisation runs on its own clock; a slow colony meets it older.
  lines.push(
    '| Profile | Civ. age at our Stone | at our Iron | at our Industry | Civ. age at the end | Wave factor at the end |',
    '|---|---|---|---|---|---|',
  );
  const mean = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
  };
  for (const p of profiles) {
    const at = (i: number) => mean(p.runs.map((r) => r.final.civAtAges?.[i]));
    lines.push(
      `| ${p.label} | ${at(0)} | ${at(1)} | ${at(2)} | ${mean(p.runs.map((r) => r.final.civAge))} | ${mean(p.runs.map((r) => r.final.civWave))} |`,
    );
  }
  lines.push('');
  return lines;
}
