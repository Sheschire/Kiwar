import { readFileSync } from 'node:fs';
import {
  LANDING,
  maxCrew,
  availableCrew,
  kiwiStrength,
  queenSetup,
  simulateBattle,
  landingOutcome,
  SIEGE,
  type GameState,
} from '@kiwar/shared';
const F = SIEGE.final as unknown as Record<string, number>;
const variants = JSON.parse(process.argv[2] ?? '[{}]') as Record<string, number>[];
for (const day of [10, 14, 18]) {
  try {
    readFileSync(
      `/tmp/claude-0/-home-user-Kiwar/b1f003db-ada9-52fe-b9e5-173155b85519/scratchpad/day${day}.json`,
    );
  } catch {
    continue;
  }
  const s = JSON.parse(
    readFileSync(
      `/tmp/claude-0/-home-user-Kiwar/b1f003db-ada9-52fe-b9e5-173155b85519/scratchpad/day${day}.json`,
      'utf8',
    ),
  ) as GameState;
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  let titans = 0;
  const pool = availableCrew(s)
    .filter((v) => !v.kikiwiwi || titans++ < 1)
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a));
  const crew = pool.slice(0, Math.min(maxCrew(s, pad, 'final'), pool.length));
  const ground = Number(process.env.G ?? 0) || [70, 100, 140][[10, 14, 18].indexOf(day)]!;
  console.log(
    `day ${day} crew ${crew.length} lv ${crew.map((v) => v.level).join(',')} ground ${ground}`,
  );
  for (const v of variants) {
    const keep = {
      ...F,
      swarm: { ...(F.swarm as never as object) },
      tunnels: { ...(F.tunnels as never as object) },
    };
    Object.assign(F, v);
    if (v.swarmShare !== undefined) (F.swarm as never as { share: number }).share = v.swarmShare;
    if (v.tunnelShare !== undefined)
      (F.tunnels as never as { share: number }).share = v.tunnelShare;
    const input = {
      sector: 2,
      age: 3,
      ground,
      air: ground * 0.6,
      escort: [
        { kind: 'soldier' as const, count: 24, level: 15 },
        { kind: 'scout' as const, count: 10, level: 15 },
        { kind: 'brute' as const, count: 4, level: 15 },
        { kind: 'diver' as const, count: 14, level: 15 },
        { kind: 'spitter' as const, count: 4, level: 15 },
      ],
      wounds: 0,
      orders: { ...LANDING.defaultOrders, posture: 'bold' as const, retreatAt: 0.6 },
      fed: 1,
    };
    const res = [0, 1, 2, 3].map((i) => {
      const log = simulateBattle(queenSetup(s, crew, input), 'x' + i);
      return `${landingOutcome(log)[0]}${log.result.lost?.length}q${log.result.leaderLeft}/${log.result.duration}s`;
    });
    Object.assign(F, keep);
    console.log(`  ${JSON.stringify(v)}: ${res.join(' ')}`);
  }
}
