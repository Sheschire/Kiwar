import { advance, kiwaiMapOf, type GameState, type KiwaiType, type ModuleType } from '../src';
import { run, yardColony } from './helpers';

const HOUR = 3_600_000;
type Map = Parameters<typeof run>[3];

/** Ground tiles of a kiwai's map, ring first, sorted for stable tests. */
export function ground(s: GameState, kiwaiId: string) {
  return kiwaiMapOf(s, { id: kiwaiId })
    .tiles.filter((t) => t.kind === 'ground')
    .sort((a, b) => a.q - b.q || a.r - b.r);
}

/** A kiwai of that type in orbit, with a habitat, its work module and a panel next to it. */
export function kiwaiReady(type: KiwaiType, extra: ModuleType[] = []) {
  const { map, s: s0 } = yardColony(3);
  let s = run(s0, { type: 'launchKiwai', kiwaiType: type }, s0.now, map);
  const k = s.orbit.kiwais[0]!;
  s = advance(s, k.readyAt).state;
  const tiles = ground(s, k.id);
  // The work module at (1, 0) or the first ground tile, a panel and a habitat around it.
  const work = {
    habitat: 'habitat',
    harvest: 'sensor',
    greenhouse: 'dome',
    observatory: 'sensor',
    dock: 'berth',
  } as const;
  const wanted: ModuleType[] = ['habitat', work[type], 'panel', ...extra];
  for (let i = 0; i < wanted.length; i++) {
    const at = tiles[i]!;
    s = run(
      s,
      { type: 'buildModule', kiwaiId: k.id, moduleType: wanted[i]!, q: at.q, r: at.r },
      s.now,
      map,
    );
  }
  s = advance(s, s.now + 4 * HOUR).state;
  // Comets far away: the tests that want a swarm bring one.
  s = structuredClone(s);
  s.comets.next = {
    id: 'cfar',
    announceAt: s.now + 5000 * HOUR,
    at: s.now + 5001 * HOUR,
    announced: false,
  };
  return { map, s, kiwaiId: k.id };
}

/** Sends the best `n` kiwis at home up, and waits for the shuttle to come back. */
export function sendUp(s: GameState, map: Map, kiwaiId: string, n: number) {
  const up = s.villagers
    .filter((v) => !v.kikiwiwi && (v.job.kind === 'work' || v.job.kind === 'idle'))
    .slice(0, n)
    .map((v) => v.id);
  const t = run(s, { type: 'sendShuttle', kiwaiId, up, down: [] }, s.now, map);
  return { t, up };
}
