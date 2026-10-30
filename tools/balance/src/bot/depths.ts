import {
  ageOf,
  availableCrew,
  buildCost,
  buildLock,
  canAfford,
  delveCrewMax,
  delveForecast,
  doorStrength,
  doorFortifyCost,
  fortifyDoorLock,
  forecastWave,
  hasTech,
  kiwiStrength,
  kiwiWeapon,
  LANDING,
  levelDef,
  meteorIronOf,
  rations,
  layerOpen,
  isLocule,
  reachableRooms,
  THREATS,
  tunnelOf,
  WEAPONS,
  type BuildingType,
  type Command,
  type GameState,
  type Villager,
} from '@kiwar/shared';

/**
 * Chantier 48: the bot in the depths — the tunnel entrance once spelunking is known, a delve
 * when the forecast says "likely" with nobody expected dead (the strongest kiwis, one that
 * reaches the fruit flies first), and the door against the upwellings: an attentive player
 * closes it when it holds the announced upwelling back (or fortifies it) and opens it after.
 * Miners are the automation's.
 */

export function tunnelDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (state.colony.index !== 0 || ageOf(state) < 2 || !hasTech(state, 'spelunking')) return null;
  if (has('tunnel')) return null;
  // Every lock first (the Nest's level, its iron): a command that always fails would freeze
  // every later decision.
  if (buildLock(state, 'tunnel') !== null) return null;
  if (!canAfford(state.resources, buildCost(state, 'tunnel'))) return null;
  if (meteorIronOf(state) < (levelDef('tunnel', 1)?.iron ?? 0)) return null;
  return build('tunnel');
}

const reachesAir = (v: Villager, state: GameState) => WEAPONS[kiwiWeapon(v, state)].hitsAir;

/**
 * The crew of a delve: a fruit-fly hitter first, then the strongest (never a Kikiwiwi, nor the
 * researchers, smiths and drilling kiwis: the ages come first).
 */
function delveCrew(state: GameState, size: number): Villager[] {
  const kept = new Set(
    state.buildings
      .filter((b) => b.type === 'library' || b.type === 'forge' || b.type === 'trainingCamp')
      .map((b) => b.id as string),
  );
  const pool = availableCrew(state)
    .filter((v) => !v.kikiwiwi && v.job.kind !== 'build')
    .filter((v) => v.job.kind !== 'work' || !kept.has(v.job.buildingId))
    .sort((a, b) => kiwiStrength(b) - kiwiStrength(a) || a.id.localeCompare(b.id));
  const air = pool.find((v) => reachesAir(v, state));
  const spelunker = pool.find((v) => v.classId === 'spelunker');
  const first = [spelunker, air].filter((v): v is Villager => !!v);
  const rest = pool.filter((v) => !first.includes(v));
  return [...new Set([...first, ...rest])].slice(0, size);
}

/** A delve to a room within reach the forecast calls likely, nobody expected dead. */
export function delveOrder(state: GameState): Command | null {
  const tunnel = tunnelOf(state);
  if (!tunnel || state.depths.door.closed || state.depths.next?.announced) return null;
  if (state.expeditions.some((e) => e.mission === 'delve' && e.status !== 'done')) return null;
  const max = Math.min(delveCrewMax(state), availableCrew(state).length - 3);
  if (max < 2) return null;
  const orders = { ...LANDING.defaultOrders, retreatAt: 0.3 };
  // Shallow rooms first; a room seen weak before a room unknown.
  const rooms = reachableRooms(state)
    .filter((r) => layerOpen(state, r))
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        Number(!!state.depths.views[b.id]?.units) - Number(!!state.depths.views[a.id]?.units) ||
        a.id.localeCompare(b.id),
    );
  for (const room of rooms) {
    for (let size = Math.max(2, max - 2); size <= max; size++) {
      const crew = delveCrew(state, size);
      if (crew.length < size) break;
      // Chantier 50: to a locule, skirt the lakes when only that makes it likely.
      for (const skirt of isLocule(room) ? [false, true] : [false]) {
        const f = delveForecast(state, room.id, crew, orders, 1, skirt);
        if (!f || f.odds !== 'likely' || f.expectedDead > 0) continue;
        const need = rations(state, crew, 2 * f.travelMs);
        const provisions = {
          pulp: Math.ceil(need.pulp * 1.1),
          juice: Math.ceil(need.juice * 1.1),
        };
        if (!canAfford(state.resources, provisions)) return null;
        return {
          type: 'delve',
          roomId: room.id,
          crew: crew.map((v) => v.id),
          provisions,
          orders,
          ...(skirt ? { skirt: true } : {}),
        };
      }
    }
  }
  return null;
}

/**
 * The door against an announced upwelling (attentive): closed when it holds the upwelling back
 * even at bad luck, fortified when that would make it hold (and affordable), opened again once
 * nothing is announced.
 */
export function doorOrder(state: GameState, prepared: boolean): Command | null {
  if (!tunnelOf(state)) return null;
  const up = state.depths.next;
  const door = state.depths.door;
  if (!up?.announced) return door.closed ? { type: 'setTunnelDoor', closed: false } : null;
  if (!prepared) return null;
  const worst = (up.ground + up.air) * (1 + THREATS.luck);
  if (!door.closed && doorStrength(state) >= worst) return { type: 'setTunnelDoor', closed: true };
  if (door.closed || door.fortifying) return null;
  // Only a lost cause is worth the fortification (the guards and turrets hold the rest), and
  // only with twice its price in stock (the ages come first).
  const f = forecastWave(state);
  if (f?.wave.id !== up.id || f.odds !== 'unlikely') return null;
  if (fortifyDoorLock(state)) return null;
  const cost = doorFortifyCost(state);
  const twice = { ...cost.resources };
  for (const r of Object.keys(twice) as (keyof typeof twice)[]) twice[r] *= 2;
  if (!canAfford(state.resources, twice) || meteorIronOf(state) < cost.iron * 2) return null;
  return { type: 'fortifyTunnel' };
}
