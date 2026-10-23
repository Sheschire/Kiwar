import { hexDistance, hexNeighbors, type Hex } from '../hex/hex';
import { createRng, type Rng } from '../rng/rng';
import { BATTLE, KIWI_UNIT, type Weapon } from '../data/units';
import { encodeInts } from './codec';
import {
  EV,
  tileCode,
  type BattleBuilding,
  type BattleLog,
  type BattleResult,
  type BattleSetup,
  type BattleUnitSetup,
  type LogBuilding,
  type LogUnit,
} from './types';

/**
 * Chantier 36: the battle engine. Pure and deterministic: a setup and a seed give one journal,
 * whoever computes it. Fixed steps of `BATTLE.dt`; ground units walk on the hex grid by
 * distance fields (around the buildings, at most `BATTLE.tileCap` places a tile), bats fly
 * straight; every unit follows the priorities of its role (raider, guard, militia, turret).
 */

type Loot = [number, number, number, number];

const State = { Waiting: 0, Active: 1, Fallen: 2, Gone: 3 } as const;
type State = (typeof State)[keyof typeof State];

type Target = { unit: Unit; building?: undefined } | { building: Building; unit?: undefined };

interface Unit {
  i: number;
  s: BattleUnitSetup;
  side: 0 | 1;
  hp: number;
  tile: number;
  home: number;
  state: State;
  /** Busy walking until then. */
  busyUntil: number;
  /** Next attack possible at. */
  readyAt: number;
  target: Target | null;
  retargetAt: number;
  ammo: number | null;
  /** Loot carried, by building index. */
  carrying: Map<number, Loot> | null;
  carried: number;
  fleeing: boolean;
  reached: boolean;
  leash: number;
  /** Waiting for a free tile since then (a long wait lets it squeeze through). */
  stuckSince: number;
}

interface Building {
  i: number;
  b: BattleBuilding;
  hp: number;
  loot: Loot;
  field: Float64Array | null;
  damaged: boolean;
}

class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length > 0) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r]! < k[l]! ? r : l;
        if (k[c]! >= lk) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

const canHit = (w: Weapon, target: Unit) => (target.s.flying ? w.hitsAir : w.hitsGround);

export function simulateBattle(setup: BattleSetup, seed: string): BattleLog {
  const rng: Rng = createRng(`battle/${seed}`);
  const dt = BATTLE.dt;
  const maxS = setup.maxS ?? BATTLE.maxS;
  const maxSteps = Math.ceil(maxS / dt);

  // --- Grid -----------------------------------------------------------------------------------
  const tiles = setup.tiles;
  const n = tiles.length;
  const index = new Map<number, number>();
  tiles.forEach((t, i) => index.set(tileCode(t), i));
  const idx = (h: Hex) => index.get(tileCode(h)) ?? -1;
  const cost = new Float64Array(n);
  for (let i = 0; i < n; i++) cost[i] = tiles[i]!.cost;
  for (const b of setup.buildings)
    for (const h of b.tiles) {
      const i = idx(h);
      if (i >= 0) cost[i] = Infinity;
    }
  const neighbors: number[][] = tiles.map((t) =>
    hexNeighbors(t)
      .map(idx)
      .filter((i) => i >= 0),
  );
  const occupied = new Float64Array(n);
  const exits = new Set(setup.exits);

  const dijkstra = (sources: number[]): Float64Array => {
    const dist = new Float64Array(n).fill(Infinity);
    const heap = new Heap();
    for (const s of sources) {
      dist[s] = 0;
      heap.push(0, s);
    }
    while (heap.size > 0) {
      const [d, i] = heap.pop();
      if (d > dist[i]!) continue;
      for (const j of neighbors[i]!) {
        const c = cost[j]!;
        if (!Number.isFinite(c)) continue;
        const nd = d + c;
        if (nd < dist[j]!) {
          dist[j] = nd;
          heap.push(nd, j);
        }
      }
    }
    return dist;
  };

  const buildings: Building[] = setup.buildings.map((b, i) => ({
    i,
    b,
    hp: b.hp,
    loot: [...b.loot] as Loot,
    field: null,
    damaged: false,
  }));
  /** Walk distance to the foot of a building (lazily, the first time a raider weighs it). */
  const fieldOf = (b: Building): Float64Array => {
    if (!b.field) {
      const sources = new Set<number>();
      for (const h of b.b.tiles)
        for (const nb of hexNeighbors(h)) {
          const j = idx(nb);
          if (j >= 0 && Number.isFinite(cost[j]!)) sources.add(j);
        }
      b.field = dijkstra([...sources]);
    }
    return b.field;
  };
  let exitFieldCache: Float64Array | null = null;
  const exitField = () => (exitFieldCache ??= dijkstra([...exits]));
  const buildingDistance = (b: Building, h: Hex) => {
    let d = Infinity;
    for (const t of b.b.tiles) d = Math.min(d, hexDistance(t, h));
    return d;
  };

  // --- Units ----------------------------------------------------------------------------------
  const units: Unit[] = setup.units.map((s, i) => {
    let tile = idx(s.at);
    if (tile < 0) tile = 0;
    return {
      i,
      s,
      side: s.side,
      hp: s.hp,
      tile,
      home: tile,
      state: State.Waiting,
      busyUntil: 0,
      readyAt: 0,
      target: null,
      retargetAt: 0,
      ammo: s.ammo,
      carrying: s.role === 'raider' ? new Map() : null,
      carried: 0,
      fleeing: false,
      reached: false,
      stuckSince: -1,
      leash:
        s.role === 'militia'
          ? KIWI_UNIT.militiaLeash
          : s.role === 'guard'
            ? BATTLE.leash[setup.orders[s.side].posture]
            : 0,
    };
  });
  const attackers = units.filter((u) => u.side === 1);
  // Chantier 37: the bards singing on the field.
  const singers = units.filter((u) => u.s.aura);
  /** Damage multiplier of a unit's blows: the best aura of a bard of its side close enough. */
  const auraOf = (u: Unit): number => {
    let best = 0;
    for (const b of singers) {
      if (b === u || b.side !== u.side || b.state !== State.Active) continue;
      const a = b.s.aura!;
      if (a.boost > best && hexDistance(tiles[b.tile]!, tiles[u.tile]!) <= a.range) best = a.boost;
    }
    return 1 + best;
  };
  const lootLeft0 = (b: Building) => b.loot[0] + b.loot[1] + b.loot[2] + b.loot[3];
  const totalPower = attackers.reduce((sum, u) => sum + u.s.power, 0);

  // --- Journal --------------------------------------------------------------------------------
  const ints: number[] = [];
  let step = 0;
  let loggedStep = 0;
  const log = (code: number, ...args: number[]) => {
    if (step > loggedStep) {
      ints.push(EV.step, step - loggedStep);
      loggedStep = step;
    }
    ints.push(code, ...args);
  };
  const tenths = (x: number) => Math.max(0, Math.round(x * 10));

  const result: BattleResult = {
    duration: 0,
    held: true,
    lootable: buildings.reduce((sum, b) => sum + (b.b.side === 0 ? lootLeft0(b) : 0), 0),
    loot: [],
    damaged: [],
    fallen: [],
    fled: [],
    attackers: { total: attackers.length, fallen: 0, escaped: 0 },
    reached: 0,
    struck: [],
    shots: {},
  };
  const taken = new Map<number, Loot>();
  const struck = new Set<number>();

  // --- Actions --------------------------------------------------------------------------------
  const place = (u: Unit, to: number) => {
    if (!u.s.flying) {
      occupied[u.tile] = (occupied[u.tile] ?? 0) - u.s.size;
      occupied[to] = (occupied[to] ?? 0) + u.s.size;
    }
    u.tile = to;
  };
  /** A tile a unit may step on (squeezing past the others after a long wait). */
  const free = (u: Unit, j: number, t: number) => {
    if (u.s.flying) return true;
    if (!Number.isFinite(cost[j]!)) return false;
    const squeeze = u.stuckSince >= 0 && t - u.stuckSince >= BATTLE.unstick - 1e-9;
    return (occupied[j] ?? 0) + u.s.size <= BATTLE.tileCap + (squeeze ? 2 : 0) + 1e-9;
  };

  const moveTo = (u: Unit, j: number, t: number) => {
    const c = u.s.flying ? 1 : Math.max(0.3, cost[j]!);
    const dur = c / Math.max(0.1, u.s.speed);
    place(u, j);
    u.busyUntil = t + dur;
    u.stuckSince = -1;
    log(EV.move, u.i, tileCode(tiles[j]!), tenths(dur));
  };

  /**
   * One step down a distance field (ground) — false when nothing is free and closer. After a
   * long wait, a step aside (same distance) or squeezing past is allowed.
   */
  const stepDown = (u: Unit, field: Float64Array, t: number): boolean => {
    const here = field[u.tile]!;
    let best = -1;
    let bestD = here;
    for (const j of neighbors[u.tile]!) {
      const d = field[j]!;
      if (d < bestD - 1e-9 && free(u, j, t)) {
        best = j;
        bestD = d;
      }
    }
    if (best < 0 && u.stuckSince >= 0 && t - u.stuckSince >= BATTLE.unstick - 1e-9) {
      bestD = Infinity;
      for (const j of neighbors[u.tile]!) {
        const d = field[j]!;
        if (d <= here + 1e-9 && d < bestD - 1e-9 && free(u, j, t)) {
          best = j;
          bestD = d;
        }
      }
    }
    if (best < 0) {
      if (u.stuckSince < 0) u.stuckSince = t;
      return false;
    }
    moveTo(u, best, t);
    return true;
  };

  /** One step closer to a tile (flying, or chasing a unit on foot), within the leash. */
  const stepToward = (u: Unit, goal: Hex, t: number): boolean => {
    const here = tiles[u.tile]!;
    let best = -1;
    let bestD = hexDistance(here, goal);
    const home = tiles[u.home]!;
    for (const j of neighbors[u.tile]!) {
      const h = tiles[j]!;
      const d = hexDistance(h, goal);
      if (d >= bestD || !free(u, j, t)) continue;
      if (u.leash > 0 && hexDistance(h, home) > u.leash) continue;
      best = j;
      bestD = d;
    }
    if (best < 0) {
      if (u.stuckSince < 0) u.stuckSince = t;
      return false;
    }
    moveTo(u, best, t);
    return true;
  };

  const lootLeft = (b: Building) => b.loot[0] + b.loot[1] + b.loot[2] + b.loot[3];

  const fall = (u: Unit) => {
    u.state = State.Fallen;
    if (!u.s.flying) occupied[u.tile] = (occupied[u.tile] ?? 0) - u.s.size;
    log(EV.fall, u.i);
    if (u.side === 0) result.fallen.push(u.s.ref);
    else result.attackers.fallen++;
    // What a fallen raider carried stays at home.
    if (u.carrying)
      for (const [bi, l] of u.carrying) {
        const b = buildings[bi]!;
        for (let k = 0; k < 4; k++) b.loot[k]! += l[k]!;
      }
    u.carrying?.clear();
    u.carried = 0;
  };

  const leave = (u: Unit) => {
    u.state = State.Gone;
    if (!u.s.flying) occupied[u.tile] = (occupied[u.tile] ?? 0) - u.s.size;
    log(EV.gone, u.i);
    if (u.side === 1) {
      result.attackers.escaped++;
      if (u.carrying)
        for (const [bi, l] of u.carrying) {
          const sum = taken.get(bi) ?? ([0, 0, 0, 0] as Loot);
          for (let k = 0; k < 4; k++) sum[k]! += l[k]!;
          taken.set(bi, sum);
        }
    } else result.fled.push(u.s.ref);
  };

  const hurt = (target: Unit, dmg: number) => {
    target.hp -= dmg;
    if (target.hp <= 1e-9) fall(target);
  };

  const strike = (u: Unit, target: Target, t: number) => {
    const w = u.s.weapon;
    const slow = u.s.building !== null && buildings[u.s.building]?.damaged ? 2 : 1;
    u.readyAt = t + w.reload * slow;
    if (u.ammo !== null) {
      u.ammo--;
      result.shots[u.s.ref] = (result.shots[u.s.ref] ?? 0) + 1;
    }
    const roll = rng.next();
    const swing =
      (1 + rng.range(-BATTLE.spread, BATTLE.spread)) * (singers.length > 0 ? auraOf(u) : 1);
    if (target.building) {
      const b = target.building;
      const hit = roll < w.accuracy;
      const dmg = hit ? w.damage * swing : 0;
      log(EV.attack, u.i, b.i * 2 + 1, tenths(dmg));
      if (!hit) return;
      if (!u.reached && u.side === 1) {
        u.reached = true;
        result.reached += u.s.power;
      }
      if (!u.s.flying && u.side === 1 && struck.size < BATTLE.struckTiles) struck.add(u.tile);
      // Raiders grab what they can carry, and break what they hit.
      if (u.carrying && lootLeft(b) > 1e-6 && u.carried < u.s.carry - 1e-9) {
        const want = Math.min(u.s.carry - u.carried, u.s.carry * BATTLE.grab);
        const share = Math.min(1, want / lootLeft(b));
        const got = (u.carrying.get(b.i) ?? [0, 0, 0, 0]) as Loot;
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const x = b.loot[k]! * share;
          b.loot[k]! -= x;
          got[k]! += x;
          sum += x;
        }
        u.carrying.set(b.i, got);
        u.carried += sum;
        log(EV.loot, u.i, b.i, Math.round(sum));
      }
      if (b.hp > 0 && !b.damaged) {
        b.hp -= dmg;
        if (b.hp <= 1e-9) {
          b.damaged = true;
          result.damaged.push(b.i);
          log(EV.damaged, b.i);
          // Never razed: past the limit, the other buildings are spared.
          if (result.damaged.length >= (setup.maxDamaged ?? Infinity))
            for (const o of buildings) if (!o.damaged) o.hp = 0;
        }
      }
      return;
    }
    const e = target.unit;
    const hit = roll < w.accuracy * (1 - e.s.dodge);
    const dmg = hit ? w.damage * swing * (1 - e.s.armor) : 0;
    log(EV.attack, u.i, e.i * 2, tenths(dmg));
    if (hit) hurt(e, dmg);
    if (w.style === 'area' && hit) {
      const at = tiles[e.tile]!;
      for (const o of units) {
        if (o === e || o.side === u.side || o.state !== State.Active || !canHit(w, o)) continue;
        if (hexDistance(tiles[o.tile]!, at) > 1) continue;
        const d = w.damage * BATTLE.splash * swing * (1 - o.s.armor);
        log(EV.splash, u.i, o.i, tenths(d));
        hurt(o, d);
      }
    }
  };

  const inRange = (u: Unit, target: Target) => {
    const here = tiles[u.tile]!;
    if (target.building) return buildingDistance(target.building, here) <= u.s.weapon.range;
    return hexDistance(here, tiles[target.unit.tile]!) <= u.s.weapon.range;
  };

  const valid = (u: Unit, target: Target | null): target is Target => {
    if (!target) return false;
    if (target.unit) return target.unit.state === State.Active;
    const b = target.building;
    const room = !!u.carrying && u.carried < u.s.carry - 1e-9 && lootLeft(b) > 1e-6;
    return room || (b.hp > 0 && !b.damaged);
  };

  // --- AI -------------------------------------------------------------------------------------
  const raiderTarget = (u: Unit): Target | null => {
    const here = tiles[u.tile]!;
    // A fighter answers the defenders who attack it; a spitter hunts kiwis.
    if (u.s.fightsBack) {
      let best: Unit | null = null;
      for (const e of units) {
        if (e.side === u.side || e.state !== State.Active || e.s.role === 'turret') continue;
        if (e.target?.unit !== u || !canHit(u.s.weapon, e)) continue;
        if (hexDistance(here, tiles[e.tile]!) > u.s.weapon.range) continue;
        if (!best || e.i < best.i) best = e;
      }
      if (best) return { unit: best };
    }
    if (u.s.huntsKiwis) {
      let best: Unit | null = null;
      let bestD = BATTLE.huntRange + 1;
      for (const e of units) {
        if (e.side === u.side || e.state !== State.Active || e.s.role === 'turret') continue;
        if (!canHit(u.s.weapon, e)) continue;
        const d = hexDistance(here, tiles[e.tile]!);
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
      if (best) return { unit: best };
    }
    let best: Building | null = null;
    let bestScore = 0;
    const room = u.carried < u.s.carry - 1e-9;
    for (const b of buildings) {
      if (b.b.side === u.side) continue;
      const canLoot = room && lootLeft(b) > 1e-6;
      const canBreak = b.hp > 0 && !b.damaged;
      if (!canLoot && !canBreak) continue;
      const d = u.s.flying ? buildingDistance(b, here) : fieldOf(b)[u.tile]!;
      if (!Number.isFinite(d)) continue;
      const want = (canLoot ? 3 + b.b.priority : 0) + (canBreak ? b.b.priority : 0);
      const score = want / (1 + d / 4);
      if (score > bestScore + 1e-9) {
        best = b;
        bestScore = score;
      }
    }
    return best ? { building: best } : null;
  };

  const defenderTarget = (u: Unit): Target | null => {
    const here = tiles[u.tile]!;
    const home = tiles[u.home]!;
    const w = u.s.weapon;
    const shoots = w.style !== 'melee';
    const hunter = !!w.hunts;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const e of units) {
      if (e.side === u.side || e.state !== State.Active || !canHit(w, e)) continue;
      const at = tiles[e.tile]!;
      const d = hexDistance(here, at);
      if (u.s.fixed) {
        if (d > w.range) continue;
      } else if (hexDistance(home, at) > u.leash + w.range) continue;
      // Shooters take down the bats first; daggers go for the thieves and the spitters.
      const prey = hunter && (!e.s.fightsBack || e.s.huntsKiwis);
      const score = d - (shoots && e.s.flying ? 3 : 0) - (prey ? 3 : 0);
      if (score < bestScore - 1e-9) {
        best = e;
        bestScore = score;
      }
    }
    return best ? { unit: best } : null;
  };

  const goHome = (u: Unit, t: number) => {
    if (u.s.flying || exits.has(u.tile)) {
      if (exits.has(u.tile)) return leave(u);
      let goal = -1;
      let d = Infinity;
      for (const x of exits) {
        const dx = hexDistance(tiles[x]!, tiles[u.tile]!);
        if (dx < d) {
          d = dx;
          goal = x;
        }
      }
      if (goal < 0 || !stepToward(u, tiles[goal]!, t)) leave(u);
      return;
    }
    stepDown(u, exitField(), t);
  };

  const act = (u: Unit, t: number) => {
    const s = u.s;
    if (s.role === 'raider') {
      if (u.fleeing || u.carried >= s.carry - 1e-9) return goHome(u, t);
      // The pack gathers at its gate; it only answers blows meanwhile.
      if (t < (s.hold ?? 0) - 1e-9) {
        const blow = s.fightsBack ? raiderTarget(u) : null;
        if (blow?.unit && inRange(u, blow) && t >= u.readyAt - 1e-9) strike(u, blow, t);
        return;
      }
      if (!valid(u, u.target) || t >= u.retargetAt) {
        u.target = raiderTarget(u);
        u.retargetAt = t + BATTLE.retarget;
      }
      const target = u.target;
      if (!target) return goHome(u, t);
      if (inRange(u, target)) {
        if (t >= u.readyAt - 1e-9) strike(u, target, t);
        return;
      }
      if (target.building && !s.flying) {
        if (!stepDown(u, fieldOf(target.building), t)) u.retargetAt = t;
      } else {
        const goal = target.building ? target.building.b.tiles[0]! : tiles[target.unit!.tile]!;
        stepToward(u, goal, t);
      }
      return;
    }
    if (s.role === 'militia' && u.hp < s.hp * KIWI_UNIT.militiaFlee) {
      log(EV.flee, u.i);
      return leave(u);
    }
    if (u.ammo !== null && u.ammo <= 0) return;
    if (!valid(u, u.target) || t >= u.retargetAt) {
      u.target = defenderTarget(u);
      u.retargetAt = t + BATTLE.retarget;
    }
    const target = u.target;
    if (target && inRange(u, target)) {
      if (t >= u.readyAt - 1e-9) strike(u, target, t);
      return;
    }
    if (s.fixed) return;
    if (target?.unit) {
      if (!stepToward(u, tiles[target.unit.tile]!, t)) u.retargetAt = t;
      return;
    }
    if (u.tile !== u.home) stepToward(u, tiles[u.home]!, t);
  };

  // --- Loop -----------------------------------------------------------------------------------
  let retreating = false;
  for (step = 0; step < maxSteps; step++) {
    const t = step * dt;
    for (const u of units) {
      if (u.state !== State.Waiting || u.s.delay > t + 1e-9) continue;
      u.state = State.Active;
      if (!u.s.flying) occupied[u.tile] = (occupied[u.tile] ?? 0) + u.s.size;
      if (u.s.delay > 0 || u.side === 1) log(EV.enter, u.i);
    }
    for (const u of units) {
      if (u.state !== State.Active || t < u.busyUntil - 1e-9) continue;
      act(u, t);
    }
    let alive = 0;
    let left = 0;
    for (const u of attackers)
      if (u.state === State.Active || u.state === State.Waiting) {
        left++;
        alive += u.s.power;
      }
    if (left === 0) break;
    if (!retreating && totalPower > 0 && alive / totalPower < setup.orders[1].retreatBelow) {
      retreating = true;
      for (const u of attackers)
        if (u.state === State.Active && !u.fleeing) {
          u.fleeing = true;
          log(EV.flee, u.i);
        }
    }
  }
  step = Math.min(step + 1, maxSteps);
  // Time is up: whoever is still there runs away with what it carries.
  for (const u of attackers) if (u.state === State.Active) leave(u);
  for (const u of attackers) if (u.state === State.Waiting) u.state = State.Gone;

  result.duration = step * dt;
  for (const [building, amounts] of [...taken].sort((a, b) => a[0] - b[0]))
    if (amounts.some((x) => x > 1e-9)) result.loot.push({ building, amounts });
  result.reached = totalPower > 0 ? result.reached / totalPower : 0;
  result.struck = [...struck].map((i) => ({ q: tiles[i]!.q, r: tiles[i]!.r }));
  result.held = result.loot.length === 0 && result.damaged.length === 0;

  const logUnits: LogUnit[] = setup.units.map((s) => [
    s.ref,
    s.side,
    s.body,
    s.kind,
    s.name,
    s.level,
    s.classId,
    tenths(s.hp),
    s.at.q,
    s.at.r,
    s.weaponId,
  ]);
  const logBuildings: LogBuilding[] = setup.buildings.map((b) => [
    b.ref,
    b.type,
    b.tiles[0]!.q,
    b.tiles[0]!.r,
    tenths(b.hp),
  ]);
  return {
    v: 1,
    dt,
    steps: step,
    units: logUnits,
    buildings: logBuildings,
    events: encodeInts(ints),
    result,
  };
}
