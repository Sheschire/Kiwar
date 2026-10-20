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
  isTurret,
  turretCount,
  turretLimit,
  upgradeCost,
  type BuildingType,
  type Command,
  type GameState,
} from '@kiwar/shared';
import { upgradeOk } from './economy';

/** How long before a strike the bot posts its guards (they stop harvesting meanwhile). */
export const GUARD_LEAD_MS = 40 * 60_000;

/**
 * Shelter: take it when the forecast still expects deaths or several kiwis hurt. Since
 * chantier 15 the automation posts the garrison (the kiwis that stop the most of what breaks
 * through) shortly before the strike and relieves it afterwards.
 */
export function defenseOrders(state: GameState): Command[] {
  const f = forecastWave(state);
  const out: Command[] = [];
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
