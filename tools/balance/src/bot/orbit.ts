import {
  ageOf,
  buildCost,
  buildLock,
  canAfford,
  canFly,
  comingSwarm,
  crystalUnits,
  dustPoints,
  dustTank,
  hexDistance,
  kiwaiHousing,
  kiwaiMapOf,
  launchLock,
  levelDef,
  meteorIronOf,
  moduleLock,
  moduleSlots,
  MODULES,
  ORBIT,
  orbitCrew,
  orbitPower,
  serviceLock,
  shieldLock,
  shuttleLock,
  upgradeLock,
  wearAnnounced,
  WORK_MODULE,
  yardOf,
  type BuildingType,
  type Command,
  type GameState,
  type Kiwai,
  type KiwaiType,
  type ModuleType,
} from '@kiwar/shared';

/**
 * Chantier 53: the bot in orbit — the orbital yard at the Age of the stars (then its levels),
 * a kiwai launched as soon as the stocks allow (a greenhouse, then a star harvest, then an
 * observatory), its modules (a habitat, the work module, a panel beside it, then more work),
 * the shuttle with the best kiwis for the kind, the stardust brought down when the tank fills.
 * An attentive player also services an announced breakdown and raises the shields against a
 * swarm; an occasional one leaves the repairs to the crew up there.
 */

const KINDS: readonly KiwaiType[] = ['greenhouse', 'harvest', 'observatory'];

/** The yard once the stars are reached, then its levels with the Nest. */
export function yardDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (ageOf(state) < 4) return null;
  if (has('orbitalYard')) {
    const y = yardOf(state);
    if (!y || y.level >= 3 || upgradeLock(state, y) !== null) return null;
    if (state.queue.some((q) => q.buildingId === y.id)) return null;
    const next = levelDef('orbitalYard', y.level + 1);
    if (!next || !canAfford(state.resources, next.cost)) return null;
    if (meteorIronOf(state) < (next.iron ?? 0)) return null;
    if (crystalUnits(state.crystal) < (next.crystal ?? 0)) return null;
    return { type: 'upgrade', buildingId: y.id };
  }
  if (buildLock(state, 'orbitalYard') !== null) return null;
  const first = levelDef('orbitalYard', 1)!;
  if (!canAfford(state.resources, buildCost(state, 'orbitalYard'))) return null;
  if (meteorIronOf(state) < (first.iron ?? 0)) return null;
  if (crystalUnits(state.crystal) < (first.crystal ?? 0)) return null;
  return build('orbitalYard');
}

/** The modules a kiwai of that kind wants, in order. */
function wanted(kiwai: Kiwai): ModuleType[] {
  const work = WORK_MODULE[kiwai.type];
  return ['habitat', work, 'panel', work, 'habitat'];
}

/** The next module to set on a kiwai, on its best free tile (a panel next to work modules). */
function moduleOrder(state: GameState, kiwai: Kiwai): Command | null {
  if (kiwai.readyAt > state.now || kiwai.modules.length >= moduleSlots(state)) return null;
  const counts = new Map<ModuleType, number>();
  for (const m of kiwai.modules) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  const seen = new Map<ModuleType, number>();
  let type: ModuleType | null = null;
  for (const t of wanted(kiwai)) {
    seen.set(t, (seen.get(t) ?? 0) + 1);
    if ((counts.get(t) ?? 0) < seen.get(t)!) {
      type = t;
      break;
    }
  }
  if (!type) return null;
  const work = kiwai.modules.filter((m) => m.type === WORK_MODULE[kiwai.type]);
  const panels = kiwai.modules.filter((m) => m.type === 'panel');
  const spots = kiwaiMapOf(state, kiwai)
    .tiles.filter((t) => moduleLock(state, kiwai, type!, t) === null)
    .map((t) => {
      // Panels next to the work modules, work modules next to the panels.
      const near = (list: readonly { q: number; r: number }[]) =>
        list.filter((m) => hexDistance(m, t) === 1).length;
      const score =
        type === 'panel' ? near(work) : type === WORK_MODULE[kiwai.type] ? near(panels) : 0;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score || a.t.q - b.t.q || a.t.r - b.t.r);
  const spot = spots[0]?.t;
  if (!spot) return null;
  return { type: 'buildModule', kiwaiId: kiwai.id, moduleType: type, q: spot.q, r: spot.r };
}

/** Kiwis up to the room in the habitats and the work modules' places, the best for the kind. */
function shuttleOrder(state: GameState, kiwai: Kiwai): Command | null {
  if (state.orbit.shuttle || kiwai.readyAt > state.now) return null;
  const crew = orbitCrew(state, kiwai.id).length;
  const places = kiwai.modules
    .filter((m) => m.readyAt <= state.now)
    .reduce((n, m) => n + (MODULES[m.type].workSlots ?? 0), 0);
  const room = Math.min(kiwaiHousing(kiwai, state.now), places) - crew;
  const tank = kiwai.type === 'harvest' && kiwai.dust >= dustTank() * 0.6;
  if (room <= 0 && !tank) return null;
  // Never the researchers, the smiths nor the drilling kiwis (the ages come first).
  const kept = new Set(
    state.buildings
      .filter((b) => b.type === 'library' || b.type === 'forge' || b.type === 'trainingCamp')
      .map((b) => b.id),
  );
  const up =
    room > 0
      ? state.villagers
          .filter(
            (v) =>
              canFly(v) &&
              !v.locked &&
              v.job.kind !== 'mine' &&
              !(v.job.kind === 'work' && kept.has(v.job.buildingId)),
          )
          .sort((a, b) => orbitPower(b, kiwai.type) - orbitPower(a, kiwai.type))
          .slice(0, Math.min(room, ORBIT.shuttle.seats))
          .map((v) => v.id)
      : [];
  if (up.length === 0 && !tank) return null;
  const cmd: Command = { type: 'sendShuttle', kiwaiId: kiwai.id, up, down: [] };
  return shuttleLock(state, cmd) === null ? cmd : null;
}

/** Everything the bot does in orbit this round (the first that applies wins, as usual). */
export function orbitOrders(state: GameState, prepared: boolean): Command[] {
  if (!yardOf(state)) return [];
  const out: Command[] = [];
  if (prepared) {
    const swarm = comingSwarm(state);
    for (const k of state.orbit.kiwais) {
      if (swarm && shieldLock(state, k) === null && dustPoints(state.stardust) >= 10)
        out.push({ type: 'raiseShield', kiwaiId: k.id });
      if (wearAnnounced(k, state.now) && serviceLock(state, k) === null)
        out.push({ type: 'serviceKiwai', kiwaiId: k.id });
    }
  }
  if (launchLock(state) === null) {
    const kind = KINDS[state.orbit.kiwais.length % KINDS.length]!;
    out.push({ type: 'launchKiwai', kiwaiType: kind });
  }
  for (const k of state.orbit.kiwais) {
    const m = moduleOrder(state, k);
    if (m) out.push(m);
    const s = shuttleOrder(state, k);
    if (s) out.push(s);
  }
  return out;
}
