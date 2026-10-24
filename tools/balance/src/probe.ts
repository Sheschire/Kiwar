/**
 * Landing probe (chantier 40; the expedition probe of chantier 07 before): lands on the edge
 * and in the centre of the twin with a crew typical of each age, against a civilisation of the
 * same age: how often the crew wins, retreats or is lost, how many kiwis die.
 */
import { bestTile } from './bot/economy';
import {
  advance,
  applyCommand,
  generateFace,
  HOUR_MS,
  CIV,
  LANDING,
  newGame,
  rollKiwi,
  createRng,
  newKiwi,
  type Command,
  type FaceMap,
  type GameState,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';

const T0 = 1_700_000_000_000;

function run(state: GameState, cmd: Command, now: number, map: FaceMap): GameState {
  const r = applyCommand(state, cmd, { now, map });
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error}`);
  return r.state;
}

/** Nest 2, a level-`pad` launchpad and 10 fresh kiwis (drawn like hatched ones). */
function colony(seed: string, padLevel: number) {
  let s = newGame({ seed, face: 'kiwisu', now: T0 });
  const map = generateFace(seed, 'kiwisu', s.params);
  const grant: Command = {
    type: 'debugGrant',
    resources: { pulp: 9000, fiber: 9000, seeds: 3000, juice: 3000 },
  };
  let t = T0;
  s = run(s, grant, t, map);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += 3 * HOUR_MS;
  s = advance(s, t).state;
  s = run(s, grant, t, map);
  s = run(
    s,
    { type: 'build', buildingType: 'launchpad', ...bestTile(s, map, 'launchpad')! },
    t,
    map,
  );
  t += 3 * HOUR_MS;
  s = advance(s, t).state;
  const rng = createRng(`${seed}/probe`);
  const extra: Villager[] = Array.from({ length: 10 }, (_, i) => ({
    ...s.villagers[0]!,
    id: `p${i}` as VillagerId,
    name: `P${i}`,
    job: { kind: 'idle' },
    ...newKiwi(rollKiwi(rng)),
  }));
  s = {
    ...s,
    villagers: [...s.villagers, ...extra],
    buildings: s.buildings.map((b) => (b.type === 'launchpad' ? { ...b, level: padLevel } : b)),
    resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 },
    hunger: 0,
  };
  const padId = s.buildings.find((b) => b.type === 'launchpad')!.id;
  return { s, t, map, padId, targetId: s.targets[0]!.id };
}

function fly(
  s: GameState,
  t: number,
  map: FaceMap,
  cmd: Extract<Command, { type: 'launchExpedition' }>,
) {
  const launched = run(s, cmd, t, map);
  const e = launched.expeditions.at(-1)!;
  const back = advance(launched, e.returnAt + 1).state;
  return { back, e: back.expeditions.find((x) => x.id === e.id)!, t: e.returnAt + 1 };
}

const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 100) : 0} %`;

/** A crew typical of an age: levels, classes (one that hits the bats), gear. */
const CREWS = [
  { size: 6, level: 5, classes: ['warrior', 'mage', 'scout', 'warrior', null, null], gear: null },
  {
    size: 8,
    level: 10,
    classes: ['warrior', 'mage', 'scout', 'warrior', 'gatherer', 'mage', 'warrior', 'bard'],
    gear: 'stone',
  },
  {
    size: 10,
    level: 16,
    classes: [
      'champion',
      'archmage',
      'navigator',
      'champion',
      'herbalist',
      'archmage',
      'warrior',
      'minstrel',
      'paladin',
      'mage',
    ],
    gear: 'iron',
  },
] as const;

/** The colony and its twin's civilisation at an age (monument, clock pushed back). */
function atAge(c: ReturnType<typeof colony>, age: number): GameState {
  const s = structuredClone(c.s);
  if (age > 0) {
    const nest = s.buildings[0]!;
    s.buildings.push({ ...nest, id: 'bmon' as never, type: 'monument', q: 99, r: 99, level: age });
  }
  const g = s.aliens![c.targetId]!;
  // The civilisation as old as its age's start plus half a day.
  g.since = c.t - (CIV.ageAtH[age]! + 12) * HOUR_MS;
  // The crew stays home until the launch (no crater, no task borrows it).
  s.automation = Object.fromEntries(
    Object.keys(s.automation).map((k) => [k, false]),
  ) as GameState['automation'];
  const spec = CREWS[age]!;
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  pad.level = Math.max(pad.level, 1 + 3 * age);
  s.villagers = s.villagers.map((v, i) => {
    if (!v.id.startsWith('p') || i >= s.villagers.length) return v;
    const k = Number(v.id.slice(1));
    if (k >= spec.size) return v;
    const classId = spec.classes[k] ?? null;
    const family =
      classId === null
        ? null
        : classId.includes('mage') ||
            classId === 'bard' ||
            classId === 'minstrel' ||
            classId === 'archmage'
          ? 'staff'
          : classId === 'gatherer' || classId === 'herbalist'
            ? 'bow'
            : 'blade';
    return {
      ...v,
      level: spec.level,
      classId,
      ...(spec.gear
        ? {
            gear: {
              ...(family ? { weapon: `${family}-${spec.gear}` as never } : {}),
              armor: `light-${spec.gear}` as never,
            },
          }
        : {}),
    };
  });
  return s;
}

/**
 * Landing probe (a report section): the edge and the centre at each age, as markdown rows.
 */
export function expeditionProbe(seeds: number): string[] {
  const lines = [
    `Probe: ${seeds} seeds per age and ring, a crew typical of the age (6 kiwis level 5, 8 level 10 with stone gear, 10 level 16 with iron gear), cautious, retreat at 50 %, against a civilisation of the same age.`,
    '',
    '| Age | Ring | Won | Retreat | Lost | Dead per crew | Delayed |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const age of [0, 1, 2]) {
    for (const ring of ['edge', 'centre'] as const) {
      const n = { victory: 0, retreat: 0, defeat: 0, dead: 0, crew: 0, delayed: 0 };
      for (let i = 0; i < seeds; i++) {
        const c = colony(`probe-${i}`, 1);
        const s = atAge(c, age);
        const crew = s.villagers.filter((v) => v.id.startsWith('p')).slice(0, CREWS[age]!.size);
        const sector = ring === 'edge' ? 6 + (i % 6) : i % 6;
        const flown = fly(
          { ...s, resources: { pulp: 9000, fiber: 9000, seeds: 3000, juice: 9000 } },
          c.t,
          c.map,
          {
            type: 'launchExpedition',
            launchpadId: c.padId,
            targetId: c.targetId,
            crew: crew.map((v) => v.id),
            provisions: { pulp: 400, juice: 200 },
            mission: 'land',
            sector,
            orders: { ...LANDING.defaultOrders },
          },
        );
        const r = flown.e.result!;
        n[r.outcome ?? 'defeat']++;
        n.dead += r.lostInBattle.length;
        n.crew += crew.length;
        if (flown.e.delayed) n.delayed++;
      }
      lines.push(
        `| ${age} | ${ring} | ${pct(n.victory, seeds)} | ${pct(n.retreat, seeds)} | ${pct(n.defeat, seeds)} | ${pct(n.dead, n.crew)} | ${pct(n.delayed, seeds)} |`,
      );
    }
  }
  return lines;
}
