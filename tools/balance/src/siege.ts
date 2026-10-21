/**
 * Siege probe (chantier 19): plays the bot until the siege opens (Iron age + a Kikiwiwi), then
 * measures what the colony could field against the twin's holds and queen.
 *   pnpm balance:siege [--seeds 2] [--days 12] [--biomes orchard,tundra]
 */
import {
  BIOME_IDS,
  BIOMES,
  EXPEDITIONS,
  SIEGE,
  assaultSides,
  availableCrew,
  holdStrength,
  kiwiStrength,
  levelDef,
  modifiers,
  queenReduction,
  siegeGrowth,
  siegeLock,
  siegeTruth,
  type BiomeId,
  type GameState,
} from '@kiwar/shared';
import { runBot } from './bot';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = Number(arg('--seeds')) || 2;
const days = Number(arg('--days')) || 12;
const biomes = (arg('--biomes')?.split(',') ??
  BIOME_IDS.filter((id) => BIOMES[id].face !== null)) as BiomeId[];

const f1 = (v: number) => v.toFixed(1);

function measure(s: GameState): string {
  const pad = s.buildings.find((b) => b.type === 'launchpad');
  const cargo = pad ? (levelDef('launchpad', pad.level)?.cargo ?? 0) : 0;
  const crew = availableCrew(s)
    .filter((v) => !v.kikiwiwi)
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
  const titan = s.villagers.find((v) => v.kikiwiwi);
  // Room for kiwis once 15 % of the hold carries the rations.
  const seats = Math.max(0, Math.floor((cargo * 0.85) / EXPEDITIONS.kiwiWeight) - 5);
  const keep = Math.max(0, crew.length - Math.ceil(crew.length / 2));
  const army = crew.slice(0, Math.min(seats, crew.length - keep));
  const assault = army.slice(0, 10).reduce((n, v) => n + kiwiStrength(v) * modifiers(v).fight, 0);
  const g = s.aliens![s.targets[0]!.id]!;
  const t = siegeTruth(g);
  const holds = SIEGE.outerSectors.map((x) => holdStrength(g, x, s.now));
  const sides = assaultSides(s, titan ? [...army, titan] : army, 1);
  const k = siegeGrowth(g, s.now) * (1 - queenReduction([{ sector: 99 }, { sector: 98 }], null));
  return [
    `${((s.now - s.createdAt) / 3_600_000) | 0} h`,
    `${s.villagers.length} kiwis`,
    `cargo ${cargo}`,
    `10 best ${f1(assault)}`,
    `holds ${f1(Math.min(...holds))}–${f1(Math.max(...holds))}`,
    `army ${army.length}: ${f1(sides.ground)} / ${f1(sides.air)}`,
    `queen (2 heads) ${f1(t.queen.ground * k)} / ${f1(t.queen.air * k)}`,
  ].join(' · ');
}

for (const biome of biomes) {
  const face = BIOMES[biome].face ?? 'kiwisu';
  for (let i = 0; i < seeds; i++) {
    let line = 'siege never opened';
    let seen = false;
    runBot({
      seed: `siege-${i}`,
      face,
      biome,
      horizonMs: days * 24 * 3_600_000,
      onStep(state) {
        if (seen || siegeLock(state) !== null) return;
        seen = true;
        line = measure(state);
      },
    });
    console.log(`${biome} #${i}: ${line}`);
  }
}
