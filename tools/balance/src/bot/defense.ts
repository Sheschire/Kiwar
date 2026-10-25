import {
  ageOf,
  buildCost,
  canAfford,
  faceMapOf,
  nest,
  pendingUpgrade,
  forecastWave,
  waveAhead,
  uncoveredGates,
  rampartSectors,
  hexDistance,
  turretRange,
  siteError,
  buildLock,
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
  // Chantier 36: the practice battles only when the shelter can be taken.
  const ahead = waveAhead(state);
  const f = ahead?.canShelter ? forecastWave(state) : null;
  const out: Command[] = [];
  // Chantier 36: guards charge when a pack comes in where no turret reaches, else they hold
  // near the turrets.
  if (ahead) {
    const open = uncoveredGates(state, ahead.wave).some((g) => g.side === 'ground');
    const posture = open ? 'bold' : 'cautious';
    if (state.threats.posture !== posture) out.push({ type: 'setPosture', posture });
  }
  if (f?.canShelter && !f.expected.victory && (f.expected.deaths > 0 || f.expected.injured >= 2))
    out.push({ type: 'shelter' });
  return out;
}

/** One turret of each model after the Nest 2; more, and better ones, after a lost wave. */
export function turretDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  prepared = true,
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
  // Chantier 46: an occasional player keeps its turrets in step with its Nest (half its level)
  // before decorating: the village and the canals of act III ate the leftovers that used to
  // upgrade them, and the waves of the civilisation outgrew a defense left at level 1.
  if (!prepared) {
    // Rounded up from the Stone age (rounded down before: the Eden saves for the monument).
    const half = nest(state).level / 2;
    const floor = ageOf(state) >= 1 ? Math.ceil(half) : Math.floor(half);
    const behind = turrets
      .filter((b) => b.level < floor && upgradeOk(state, b) && !pendingUpgrade(state, b.id))
      .sort((a, b) => a.level - b.level)[0];
    if (behind) return affordable({ type: 'upgrade', buildingId: behind.id });
    // From the Stone age on, it also fills the places its Nest allows.
    if (ageOf(state) >= 1 && turretCount(state) < turretLimit(state)) {
      const count = (t: BuildingType) => turrets.filter((b) => b.type === t).length;
      return affordable(
        build(count('skyTurret') < count('seedTurret') ? 'skyTurret' : 'seedTurret'),
      );
    }
  }
  // Chantier 36: an announced pack whose gate no turret reaches gets one next to its gate.
  const ahead = prepared ? waveAhead(state) : null;
  if (ahead && turretCount(state) < turretLimit(state)) {
    const map = faceMapOf(state);
    for (const g of uncoveredGates(state, ahead.wave)) {
      const type = g.side === 'air' ? 'skyTurret' : 'seedTurret';
      const gate = ahead.wave.gates?.[g.sector];
      if (!gate) continue;
      const range = turretRange(type, 1);
      const spot = rampartSectors(map)
        .tiles.filter((t) => hexDistance(t, gate) <= range)
        .sort((a, b) => hexDistance(a, gate) - hexDistance(b, gate))
        .find((t) => !buildLock(state, type) && siteError(state, map, type, t) === null);
      if (spot) return affordable({ type: 'build', buildingType: type, q: spot.q, r: spot.r });
    }
  }
  // Chantier 31: then every sector gets a turret of each model before any second one (an
  // uncovered sector always leaks a little, and a leak is a lost wave).
  for (const type of ['skyTurret', 'seedTurret'] as const) {
    if (prepared && sectorWithout(state, type) && turretCount(state) < turretLimit(state))
      return affordable(build(type));
  }
  // Strengthen the side that breaks through (sector by sector, chantier 12): the announced
  // wave at bad luck (turrets only: guards come later), else the last lost one.
  // Chantier 31: an occasional player does not read the forecast, only the last report.
  const f = prepared ? waveAhead(state) : null;
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

/**
 * Chantier 31: an attentive player keeps the seeds the turrets will fire at the announced
 * wave (builds and upgrades that would eat into them wait).
 */
export function keepsAmmo(state: GameState, cmd: Command): boolean {
  if (cmd.type !== 'build' && cmd.type !== 'upgrade') return true;
  const f = waveAhead(state);
  if (!f) return true;
  const cost =
    cmd.type === 'build'
      ? buildCost(state, cmd.buildingType)
      : (() => {
          const b = state.buildings.find((x) => x.id === cmd.buildingId);
          return b ? upgradeCost(b.type, b.level + 1) : {};
        })();
  return state.resources.seeds - (cost.seeds ?? 0) >= f.defense.ammo.need;
}
