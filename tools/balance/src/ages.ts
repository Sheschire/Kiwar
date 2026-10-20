/**
 * Ages probe (chantier 08): plays the bot on a few seeds per biome over a long horizon and
 * prints when it opens a Library and reaches each age (median, min, max).
 *   pnpm balance:ages [--seeds 3] [--days 14] [--biomes orchard,tundra]
 */
import { BIOME_IDS, BIOMES, type BiomeId } from '@kiwar/shared';
import { runBot, type Milestone } from './bot';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('--seeds')) || 3;
const days = Number(arg('--days')) || 14;
const biomes = (arg('--biomes')?.split(',') ??
  BIOME_IDS.filter((id) => BIOMES[id].face !== null)) as BiomeId[];
const STEPS: Milestone[] = ['nest3', 'library', 'stone', 'iron', 'lab', 'kikiwiwi', 'industry'];

const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)} h`;
const all: Record<string, number[]> = {};
console.log(`| Biome | ${STEPS.join(' | ')} |`);
console.log(`| --- | ${STEPS.map(() => '---').join(' | ')} |`);
for (const biome of biomes) {
  const face = BIOMES[biome].face ?? 'kiwisu';
  const times: Record<string, number[]> = {};
  for (let i = 0; i < seeds; i++) {
    const r = runBot({ seed: `ages-${i}`, face, biome, horizonMs: days * 24 * 3_600_000 });
    for (const m of STEPS) {
      const t = r.times[m];
      if (t === null) continue;
      (times[m] ??= []).push(t);
      (all[m] ??= []).push(t);
    }
  }
  const cell = (list: number[] | undefined) => {
    if (!list?.length) return '—';
    const sorted = [...list].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const n = list.length < seeds ? ` [${list.length}/${seeds}]` : '';
    return `${hours(median)}${n}`;
  };
  console.log(`| ${biome} | ${STEPS.map((m) => cell(times[m])).join(' | ')} |`);
}
