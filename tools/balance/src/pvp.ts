/**
 * Chantier 57: the PvP probe. Two attentive bot colonies are played on their own; every two
 * days from day 4 the first one lands on the second with its strongest kiwis, under the real
 * rules: the attack is announced to the target, played there (its turrets, its garrison and
 * the automatic garrison, the reserves brought back before the strike as an attentive player
 * would), and its end is told to the attacker. Measures: defences held, loot as a share of
 * what the target had, kiwis lost by each side (never one by the defence).
 *   pnpm balance:pvp [--seeds 6] [--days 12]
 */
import {
  advance,
  applyCommand,
  applyPvpResult,
  availableCrew,
  cloneState,
  faceMapOf,
  HOUR_MS,
  kiwiStrength,
  pvpForecast,
  pvpGuardOf,
  pvpRaidOf,
  pvpTravelMs,
  RESOURCE_IDS,
  type GameState,
} from '@kiwar/shared';
import { runBot } from './bot';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) || fallback : fallback;
};
const seeds = arg('--seeds', 6);
const days = arg('--days', 12);
const DAY = 24 * HOUR_MS;
const AT_DAYS = [4, 6, 8, 10, 12].filter((d) => d <= days);

/** States of a bot colony at the probe's days. */
function snapshots(seed: string): Map<number, GameState> {
  const out = new Map<number, GameState>();
  const start = 1_700_000_000_000;
  runBot({
    seed,
    face: 'kiwisu',
    horizonMs: days * DAY + HOUR_MS,
    fullHorizon: true,
    noSiege: false,
    onStep(state) {
      const d = AT_DAYS.find((x) => !out.has(x) && state.now >= start + x * DAY);
      if (d !== undefined) out.set(d, cloneState(state));
    },
  });
  return out;
}

const stockOf = (s: GameState) =>
  RESOURCE_IDS.reduce(
    (sum, r) => sum + s.resources[r] + s.buildings.reduce((x, b) => x + (b.reserve?.[r] ?? 0), 0),
    0,
  );

interface Row {
  day: number;
  launched: boolean;
  why?: string;
  held?: boolean;
  outcome?: string;
  lootShare?: number;
  attackDead?: number;
  attackHurt?: number;
  defenceDead?: number;
  defenceHurt?: number;
}

function attack(a0: GameState, d0: GameState, day: number): Row {
  const a = cloneState(a0);
  const d = cloneState(d0);
  const now = Math.max(a.now, d.now);
  a.pvp.on = d.pvp.on = true;
  a.pvp.targets = [
    { id: 'ally:def', owner: 'Def', kiwiIndex: 1, distance: 1, travelMs: pvpTravelMs(1) },
  ];
  d.pvp.lastActiveAt = now;
  const guard = pvpGuardOf(d, now);
  if (guard) return { day, launched: false, why: guard.guard };
  const pad = a.buildings.find((b) => b.type === 'launchpad' && !b.damaged);
  if (!pad) return { day, launched: false, why: 'no launchpad' };
  const crew = availableCrew(a)
    .filter((v) => !v.kikiwiwi)
    .sort((x, y) => kiwiStrength(y) - kiwiStrength(x))
    .slice(0, 6)
    .map((v) => v.id);
  const map = faceMapOf(a);
  const plan = {
    launchpadId: pad.id,
    targetId: 'ally:def',
    crew,
    provisions: { pulp: 0, juice: 0 },
    sector: 'front' as const,
    orders: { posture: 'bold' as const, retreatAt: 0.5 },
  };
  // The round trip's rations, with a margin.
  const need = pvpForecast(a, plan)?.needOneWay ?? { pulp: 0, juice: 0 };
  plan.provisions = { pulp: Math.ceil(need.pulp * 2.2), juice: Math.ceil(need.juice * 2.2) };
  const r = applyCommand(a, { type: 'raidPlayer', ...plan }, { now, map });
  if (!r.ok) return { day, launched: false, why: r.error };
  const sa = r.state;
  const e = sa.expeditions.find((x) => x.mission === 'pvp' && x.status === 'outbound')!;
  const raid = pvpRaidOf(sa, e, d, {
    id: `att/${e.id}`,
    from: 'ally:att',
    owner: 'Att',
    seed: `probe/${day}`,
    shift: 0,
  });
  d.pvp.incoming.push(raid);
  // The defender plays it like an attentive player: the reserves brought back first.
  let sd = advance(d, raid.at - HOUR_MS).state;
  const back = applyCommand(sd, { type: 'collectAll' }, { now: sd.now, map: faceMapOf(sd) });
  if (back.ok) sd = back.state;
  const before = stockOf(sd);
  const kiwis = sd.villagers.length;
  const hurtBefore = sd.villagers.filter((v) => v.job.kind === 'injured').length;
  sd = advance(sd, raid.at + 1000).state;
  const end = sd.pvp.defended.find((x) => x.id === raid.id)!;
  const sa2 = advance(sa, e.arriveAt).state;
  const ship = sa2.expeditions.find((x) => x.id === e.id)!;
  applyPvpResult(sa2, ship, end);
  const loot = RESOURCE_IDS.reduce((sum, k) => sum + end.loot[k], 0);
  return {
    day,
    launched: true,
    held: end.held,
    outcome: ship.result?.outcome,
    lootShare: before > 0 ? loot / before : 0,
    attackDead: ship.result?.lostInBattle.length ?? 0,
    attackHurt: ship.result?.injured?.length ?? 0,
    defenceDead: kiwis - sd.villagers.length,
    defenceHurt: sd.villagers.filter((v) => v.job.kind === 'injured').length - hurtBefore,
  };
}

const rows: Row[] = [];
for (let i = 0; i < seeds; i++) {
  const att = snapshots(`pvp-att-${i}`);
  const def = snapshots(`pvp-def-${i}`);
  for (const day of AT_DAYS) {
    const a = att.get(day);
    const d = def.get(day);
    if (a && d) rows.push(attack(a, d, day));
  }
  process.stderr.write('.');
}
process.stderr.write('\n');

const pct = (x: number) => `${Math.round(x * 100)} %`;
const lines = ['## PvP probe (chantier 57)', ''];
lines.push(
  `${seeds} pairs of attentive bots; the attacker lands with its 6 strongest kiwis (bold, retreat at 50 %) on the front; the defender brings its reserves back an hour before.`,
  '',
  '| Day | Attacks | Not launched | Held | Loot (share of stock + reserves) | Attack dead / hurt | Defence dead / hurt |',
  '| --- | --- | --- | --- | --- | --- | --- |',
);
for (const day of AT_DAYS) {
  const all = rows.filter((r) => r.day === day);
  const done = all.filter((r) => r.launched);
  const why = [...new Set(all.filter((r) => !r.launched).map((r) => r.why))].join(', ');
  const avg = (f: (r: Row) => number) =>
    done.length ? done.reduce((s, r) => s + f(r), 0) / done.length : 0;
  lines.push(
    `| ${day} | ${done.length} | ${all.length - done.length}${why ? ` (${why})` : ''} | ${done.filter((r) => r.held).length} | ${pct(avg((r) => r.lootShare ?? 0))} | ${avg((r) => r.attackDead ?? 0).toFixed(1)} / ${avg((r) => r.attackHurt ?? 0).toFixed(1)} | ${avg((r) => r.defenceDead ?? 0).toFixed(1)} / ${avg((r) => r.defenceHurt ?? 0).toFixed(1)} |`,
  );
}
console.log(lines.join('\n'));
