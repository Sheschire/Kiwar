// Writes a lived-in colony (the bot after a few days) as a local save, for `scripts/perf.mjs`.
//   pnpm --filter @kiwar/balance exec tsx src/perfSave.ts <out.json> [hours=72] [seed=perf]
import { writeFileSync } from 'node:fs';
import { serializeSave, type GameState } from '@kiwar/shared';
import { runBot } from './bot';

const [out, hours = '72', seed = 'perf'] = process.argv.slice(2);
if (!out) {
  console.error('usage: tsx src/perfSave.ts <out.json> [hours] [seed]');
  process.exit(1);
}
let last: GameState | null = null;
runBot({
  seed,
  face: 'kiwisu',
  biome: 'classic',
  horizonMs: +hours * 3_600_000,
  fullHorizon: true,
  onStep: (state) => (last = state),
});
const state = last as GameState | null;
if (!state) throw new Error('the bot did not play');
writeFileSync(out, JSON.stringify({ savedAt: state.now, save: serializeSave(state, state.now) }));
console.log(
  `${state.villagers.length} kiwis, ${state.buildings.length} buildings, ${state.paths.length} paths`,
);
