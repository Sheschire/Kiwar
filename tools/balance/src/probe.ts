/**
 * Expedition probe (chantier 07): plays reconnaissance and raids on many seeds with average
 * kiwis: how often ships break down, scouts are spotted or fall, how much of the map a report
 * reveals, and how raids fare blind versus informed.
 */
import { bestTile } from './bot/economy';
import {
  advance,
  applyCommand,
  generateFace,
  HOUR_MS,
  intelView,
  maxCrew,
  shipCargo,
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

/**
 * Expedition probe (chantier 07, a report section since chantier 18): the mechanics in
 * isolation, as markdown table rows.
 */
export function expeditionProbe(seeds: number): string[] {
  const lines = [
    `Probe: ${seeds} seeds per launchpad level, 10 average kiwis, a fresh colony.`,
    '',
    '| Launchpad | Breakdowns | Recon spotted | Scouts fallen | Scouts wounded | Sectors seen | Defense range | Blind ×6 raids won | Informed raids won | Informed: fallen | Informed: wounded |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const padLevel of [1, 2, 3]) {
    let broken = 0;
    let spotted = 0;
    let fell = 0;
    let hurt = 0;
    let recons = 0;
    let sectors = 0;
    let width = 0;
    let blindWins = 0;
    let blind = 0;
    let informedWins = 0;
    let informed = 0;
    let informedLosses = 0;
    let informedWounds = 0;
    let crewSent = 0;
    for (let i = 0; i < seeds; i++) {
      const c = colony(`probe-${i}`, padLevel);
      const recon = fly(c.s, c.t, c.map, {
        type: 'launchExpedition',
        launchpadId: c.padId,
        targetId: c.targetId,
        crew: 1,
        provisions: { pulp: 40, juice: 20 },
        mission: 'recon',
      });
      const r = recon.e.result!;
      if (r.broken) broken++;
      else {
        recons++;
        if (r.spotted) spotted++;
        fell += r.lostInBattle.length;
        hurt += r.injured?.length ?? 0;
        sectors += r.sectors?.length ?? 0;
        const intel = recon.back.intel[c.targetId]!;
        width += (intel.defense.max - intel.defense.min) / Math.max(1, intel.defense.max);
      }
      // A raid with 6 kiwis: blind on a fresh colony, informed after the reconnaissance.
      const raid = (s: GameState, t: number, crew = 6) =>
        fly(s, t, c.map, {
          type: 'launchExpedition',
          launchpadId: c.padId,
          targetId: c.targetId,
          crew,
          provisions: { pulp: 30 * crew, juice: 15 * crew },
        });
      const b = raid(c.s, c.t);
      if (!b.e.result!.broken) {
        blind++;
        if (b.e.result!.victory) blindWins++;
      }
      const known = recon.back;
      const view = intelView(known, c.targetId, recon.t);
      if (view && !known.buildings.find((x) => x.id === c.padId)!.damaged) {
        const back = { ...known, resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 } };
        // Informed: enough kiwis to beat the top of the estimate (about 1 strength each).
        const pad = back.buildings.find((x) => x.id === c.padId)!;
        const room = Math.floor(shipCargo(pad) / 14.5);
        const n = Math.max(
          2,
          Math.min(maxCrew(back, pad), room, Math.ceil(view.defense.max * 1.15)),
        );
        const f = raid(back, recon.t, n);
        if (!f.e.result!.broken) {
          informed++;
          crewSent += n;
          if (f.e.result!.victory) informedWins++;
          informedLosses += f.e.result!.lostInBattle.length;
          informedWounds += f.e.result!.injured?.length ?? 0;
        }
      }
    }
    lines.push(
      `| ${padLevel} | ${pct(broken, seeds)} | ${pct(spotted, recons)} | ${pct(fell, recons)} | ${pct(hurt, recons)} | ${(sectors / Math.max(1, recons)).toFixed(1)} | ±${Math.round((width / Math.max(1, recons)) * 50)} % | ${pct(blindWins, blind)} | ${pct(informedWins, informed)} | ${pct(informedLosses, crewSent)} | ${pct(informedWounds, crewSent)} |`,
    );
  }
  lines.push('');
  return lines;
}
