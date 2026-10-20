import {
  buildCost,
  canAfford,
  faceMapOf,
  nest,
  pendingUpgrade,
  forecastWave,
  defenseOf,
  sectorClash,
  SECTOR_IDS,
  turretCoverage,
  garrisonOf,
  guardPower,
  isTurret,
  turretCount,
  turretLimit,
  upgradeCost,
  type BuildingType,
  type Command,
  type GameState,
  type VillagerId,
} from '@kiwar/shared';
import { upgradeOk } from './economy';

/** How long before a strike the bot posts its guards (they stop harvesting meanwhile). */
export const GUARD_LEAD_MS = 40 * 60_000;

/**
 * Garrison and shelter: just before a wave, post the kiwis that close the gap on each side
 * (bats first: only mages and scouts reach them), relieve them afterwards; take shelter when
 * the forecast still expects deaths or several kiwis hurt.
 */
export function defenseOrders(state: GameState): Command[] {
  const f = forecastWave(state);
  const posted = garrisonOf(state).map((v) => v.id);
  const want: VillagerId[] = [];
  if (f && f.wave.at - state.now <= GUARD_LEAD_MS) {
    // Chantier 12: post kiwis one by one, each time the one that stops the most of what still
    // breaks through somewhere (the garrison goes to the sector that needs it).
    const threat = { ground: f.threat.ground * 1.15, air: f.threat.air * 1.15 };
    const through = (ids: readonly VillagerId[]) => {
      const set = new Set<string>(ids);
      const s: GameState = {
        ...state,
        villagers: state.villagers.map((v) =>
          set.has(v.id)
            ? { ...v, job: { kind: 'guard' as const } }
            : v.job.kind === 'guard'
              ? { ...v, job: { kind: 'idle' as const } }
              : v,
        ),
      };
      const t = sectorClash(threat, defenseOf(s, f.threat).sectors).through;
      return t.ground + t.air;
    };
    const pool = state.villagers
      .filter((v) => v.job.kind === 'work' || v.job.kind === 'idle' || v.job.kind === 'guard')
      .filter((v) => {
        const p = guardPower(v, state);
        return p.ground + p.air > 0;
      })
      .map((v) => v.id as VillagerId);
    const max = Math.floor(state.villagers.length / 2);
    let left = through(want);
    while (left > 1e-9 && want.length < max) {
      let best: VillagerId | null = null;
      let bestLeft = left;
      for (const id of pool) {
        if (want.includes(id)) continue;
        const l = through([...want, id]);
        if (l < bestLeft - 1e-9) {
          bestLeft = l;
          best = id;
        }
      }
      if (!best) break;
      want.push(best);
      left = bestLeft;
    }
  }
  const out: Command[] = [];
  const same = want.length === posted.length && want.every((id) => posted.includes(id));
  if (!same) out.push({ type: 'setGarrison', villagerIds: want });
  if (f?.canShelter && !f.expected.victory && (f.expected.deaths > 0 || f.expected.injured >= 2))
    out.push({ type: 'shelter' });
  return out;
}

/** One turret of each model after the Nest 2; more, and better ones, after a lost wave. */
export function turretDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
): Command | null {
  if (nest(state).level < 2) return null;
  const turrets = state.buildings.filter((b) => isTurret(b.type));
  const queued = state.queue.some((i) => isTurret(i.buildingType));
  if (queued) return null;
  const affordable = (c: Command | null): Command | null => {
    if (!c) return null;
    if (c.type === 'build')
      return canAfford(state.resources, buildCost(state, c.buildingType)) ? c : null;
    if (c.type === 'upgrade') {
      const b = state.buildings.find((x) => x.id === c.buildingId)!;
      return canAfford(state.resources, upgradeCost(b.type, b.level + 1)) ? c : null;
    }
    return c;
  };
  for (const type of ['seedTurret', 'skyTurret'] as const) {
    if (!turrets.some((b) => b.type === type) && turretCount(state) < turretLimit(state))
      return affordable(build(type));
  }
  // Strengthen the side that breaks through (sector by sector, chantier 12): the announced
  // wave at bad luck (turrets only: guards come later), else the last lost one.
  const f = forecastWave(state);
  const last = state.threats.reports.at(-1);
  const threat = f
    ? { ground: f.threat.ground * 1.15, air: f.threat.air * 1.15 }
    : last && !last.victory
      ? last.threat
      : null;
  if (!threat) return null;
  const through = sectorClash(threat, defenseOf(state, threat).sectors).through;
  if (through.ground + through.air <= 1e-9) return null;
  const type = through.air > through.ground ? 'skyTurret' : 'seedTurret';
  // A sector without any turret of that model needs a new one more than an upgrade.
  if (turretCount(state) < turretLimit(state) && sectorWithout(state, type))
    return affordable(build(type));
  const weakest = turrets
    .filter((b) => b.type === type && upgradeOk(state, b) && !pendingUpgrade(state, b.id))
    .sort((a, b) => a.level - b.level)[0];
  if (weakest && weakest.level < nest(state).level)
    return affordable({ type: 'upgrade', buildingId: weakest.id });
  if (turretCount(state) < turretLimit(state)) return affordable(build(type));
  return null;
}

/** Whether a sector gets no fire at all from turrets of this model (chantier 12). */
export function sectorWithout(state: GameState, type: 'seedTurret' | 'skyTurret'): boolean {
  const map = faceMapOf(state);
  const cover = { front: 0, left: 0, right: 0 };
  for (const b of state.buildings) {
    if (b.type !== type) continue;
    const c = turretCoverage(map, b.type, b.level, b);
    for (const sec of SECTOR_IDS) cover[sec] += c[sec];
  }
  return SECTOR_IDS.some((sec) => cover[sec] < 0.05);
}
