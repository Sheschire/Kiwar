import {
  applyCommand,
  CAMPS,
  depotDistance,
  getTile,
  HARVESTS,
  idleVillagers,
  isFlooded,
  logisticsEfficiency,
  meteorAt,
  seasonOf,
  tileDepositState,
  workersOf,
  workerSlots,
  buildingHarvest,
  type Building,
  type Command,
  type FaceMap,
  type GameState,
  type ResourceId,
} from '@kiwar/shared';
import { bottlenecks, NEED, PRODUCERS } from './economy';

/** A crater is worth a camp while it holds at least this much. */
const CRATER_MIN = 60;

const camps = (state: GameState) => state.buildings.filter((b) => b.type === 'camp');

/** Command if it would succeed now. */
function ok(state: GameState, map: FaceMap, cmd: Command): Command | null {
  return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
}

/** Whether a camp is still useful: a crater to empty, or a deposit to pick with spare kiwis. */
function campUseful(state: GameState, camp: Building): boolean {
  const crater = meteorAt(state, camp.q, camp.r);
  if (crater && crater.stock > 1) return true;
  const h = buildingHarvest(state, camp, () => false);
  return !!h && h.status !== 'depleted' && h.status !== 'flooded' && h.stock > 0;
}

/**
 * The worker who matters least for the economy: in a producer of the most plentiful resource,
 * never the Library's (researchers are placed on purpose).
 */
function spareWorker(state: GameState) {
  const { rates } = bottlenecks(state);
  const plenty = (b: Building): number => {
    const res = (Object.keys(PRODUCERS) as ResourceId[]).find((r) => PRODUCERS[r] === b.type);
    return res ? rates[res] / NEED[res] : -Infinity;
  };
  const source = state.buildings
    .filter((b) => b.type !== 'camp' && HARVESTS[b.type] && workersOf(state, b.id).length > 1)
    .sort((a, b) => plenty(b) - plenty(a))[0];
  return source ? workersOf(state, source.id).at(-1) : undefined;
}

/**
 * Chantier 18: camps. A camp on every fresh meteorite crater (staffed by pulling a worker from
 * the most plentiful resource), a camp on the best free deposit of the bottleneck resource when
 * kiwis are left idle, and camps dismantled once their crater and deposit are spent.
 */
export function campOrder(state: GameState, map: FaceMap): Command | null {
  const own = camps(state);
  // Kiwis wanted in a workplace come back from the deposit camps first.
  const wanted =
    idleVillagers(state).length === 0 &&
    state.buildings.some(
      (b) =>
        b.type !== 'camp' && HARVESTS[b.type] && workersOf(state, b.id).length < workerSlots(b),
    );
  for (const c of own) {
    const crater = meteorAt(state, c.q, c.r);
    if (!campUseful(state, c) || (wanted && !(crater && crater.stock > 1)))
      return ok(state, map, { type: 'dismantle', buildingId: c.id });
  }
  // Craters: set up camp and staff it fully while the crater lasts.
  for (const c of own) {
    const crater = meteorAt(state, c.q, c.r);
    if (!crater || crater.stock <= CRATER_MIN) continue;
    if (workersOf(state, c.id).length >= CAMPS.workerSlots) continue;
    const idle = idleVillagers(state).find((v) => !v.kikiwiwi);
    const v = idle ?? spareWorker(state);
    if (v) {
      const cmd = ok(state, map, { type: 'assignKiwi', villagerId: v.id, buildingId: c.id });
      if (cmd) return cmd;
    }
  }
  if (own.length >= CAMPS.max) return null;
  for (const m of state.sky.meteors) {
    if (m.stock <= CRATER_MIN || own.some((c) => c.q === m.q && c.r === m.r)) continue;
    const cmd = ok(state, map, { type: 'gather', q: m.q, r: m.r });
    if (cmd) return cmd;
  }
  // Spare kiwis (every workplace is full, and no workplace on its way): pick the bottleneck
  // resource by hand.
  if (idleVillagers(state).filter((v) => !v.kikiwiwi).length === 0) return null;
  if (state.queue.some((i) => i.buildingType !== 'camp' && HARVESTS[i.buildingType])) return null;
  const { rates, order } = bottlenecks(state);
  const season = seasonOf(state);
  for (const res of order) {
    if (rates[res] === Infinity) continue;
    let best: { q: number; r: number; score: number } | null = null;
    for (const t of map.tiles) {
      if (!CAMPS.tiles.includes(t.type) || t.flood) continue;
      if (isFlooded(getTile(map, t), map.params.biome, season)) continue;
      const dep = tileDepositState(state, map, t);
      if (!dep || dep.resource !== res || dep.owner !== null) continue;
      const score = (dep.stock + 4 * dep.regen) * logisticsEfficiency(depotDistance(state, map, t));
      if (!best || score > best.score) best = { q: t.q, r: t.r, score };
    }
    if (!best) continue;
    const cmd = ok(state, map, { type: 'gather', q: best.q, r: best.r });
    if (cmd) return cmd;
  }
  return null;
}
