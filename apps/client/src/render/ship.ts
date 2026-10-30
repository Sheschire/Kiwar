import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import {
  ageOf,
  getTile,
  shipIdForAge,
  type FaceMap,
  type GameState,
  type ShipId,
} from '@kiwar/shared';
import { shipModel } from './buildingModels';
import { Particles } from './particles';
import { worldPosition } from './terrain';

/** Take-off and landing last this long (simulation ms); the rest of the trip is the cruise. */
const TAKEOFF_MS = 12_000;
/** Wing beats (radians per second) and amplitude per generation: wood pedals slowly. */
const FLAP: Record<ShipId, { speed: number; amount: number }> = {
  wood: { speed: 7, amount: 0.75 },
  logs: { speed: 8, amount: 0.7 },
  iron: { speed: 11, amount: 0.55 },
  jet: { speed: 4, amount: 0.08 },
  sail: { speed: 2.5, amount: 0.12 },
};
/** An ally's bird bringing a gift: seen on its final approach, then resting at the Nest. */
const VISIT_APPROACH_MS = 90_000;
const VISIT_STAY_MS = 45_000;
/** Body centre above the bird's local origin (see `bird` in buildingModels). */
const BODY_Y = 0.46 * 1.3;

interface Flight {
  group: Group;
  wings: Mesh[];
  gen: ShipId;
  pad: Vector3;
  departedAt: number;
  arriveAt: number;
  returnAt: number;
  status: 'outbound' | 'returning';
  broken: boolean;
  /** Our twin half (true) or another kiwi far away. */
  twin: boolean;
  /** A delivery: the ally's planet it flies to (ours) or comes from (a visitor). */
  ally: { kiwiIndex: number | null; owner: string } | null;
  /** An ally's bird landing at our Nest, then flying away. */
  visitor: boolean;
  smokeTimer: number;
}

/** Where an ally's planet floats (null when it is not drawn). */
export type AllyLocator = (ally: { kiwiIndex: number | null; owner: string }) => Vector3 | null;

/**
 * The mechanical kiwi birds in flight (chantier 07): they run up and take off from their
 * launchpad, flap away towards the target face (the twin half floating in the sky when it is
 * our own kiwi, far above otherwise: seen when zooming out), and come back to land. A broken
 * ship limps home trailing smoke. Docked birds are part of the launchpad model.
 */
export class ShipsView {
  readonly group = new Group();
  private readonly flights = new Map<string, Flight>();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    flatShading: true,
  });
  private readonly particles = new Particles();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly dest = new Vector3();

  constructor(private readonly map: FaceMap) {
    this.group.add(this.particles.mesh);
  }

  private hidden: Flight | null = null;

  /** Chantier 41: the bird of an expedition whose landing is on show (drawn by the show). */
  hide(expeditionId: string | null): void {
    this.hidden = expeditionId ? (this.flights.get(expeditionId) ?? null) : null;
  }

  setParticles(on: boolean): void {
    this.particles.setEnabled(on);
  }

  sync(state: GameState): void {
    const live = new Set<string>();
    for (const e of state.expeditions) {
      if (e.status === 'done') continue;
      const pad = state.buildings.find((b) => b.id === e.launchpadId);
      if (!pad) continue;
      live.add(e.id);
      const target = state.targets.find((t) => t.id === e.targetId);
      let f = this.flights.get(e.id);
      const gen = shipIdForAge(ageOf(state));
      if (!f || f.gen !== gen) {
        if (f) this.remove(e.id);
        f = this.create(gen);
        this.flights.set(e.id, f);
      }
      const tile = getTile(this.map, pad);
      const p = worldPosition(pad);
      f.pad.set(p.x, (tile?.height ?? 0) + 0.2, p.z);
      f.departedAt = e.departedAt;
      f.arriveAt = e.arriveAt;
      f.returnAt = e.returnAt;
      f.status = e.status;
      f.broken = !!e.broken;
      f.twin = (target?.distance ?? 0) === 0;
    }
    for (const x of state.shipments) {
      const pad = state.buildings.find((b) => b.id === x.launchpadId);
      if (!pad) continue;
      const id = `ship:${x.id}`;
      live.add(id);
      const f = this.flightFor(id, shipIdForAge(ageOf(state)));
      this.setPad(f, pad);
      f.departedAt = x.departedAt;
      f.arriveAt = x.arriveAt;
      f.returnAt = x.returnAt;
      f.status = x.status;
      f.broken = false;
      f.twin = false;
      f.ally = { kiwiIndex: x.kiwiIndex, owner: x.owner };
    }
    const nest = state.buildings.find((b) => b.type === 'nest');
    for (const d of state.incoming) {
      if (!nest) break;
      const id = `gift:${d.id}`;
      live.add(id);
      // The ally's ship generation is unknown: a wooden bird for everyone.
      const f = this.flightFor(id, 'wood');
      this.setPad(f, nest);
      // It lands beside the Nest, not on it.
      f.pad.x += 1.9;
      f.pad.z += 0.6;
      // Its final approach: from the ally's side of the sky (`arriveAt`) to our Nest (`returnAt`).
      f.departedAt = Math.max(d.departedAt, d.arriveAt - VISIT_APPROACH_MS);
      f.arriveAt = f.departedAt;
      f.returnAt = d.arriveAt;
      f.status = 'returning';
      f.twin = false;
      f.visitor = true;
      f.ally = { kiwiIndex: null, owner: d.from };
    }
    for (const [id, f] of [...this.flights]) {
      // A visitor stays a little after its gift was credited, then flies away by itself.
      if (!live.has(id) && !f.visitor) this.remove(id);
    }
  }

  private flightFor(id: string, gen: ShipId): Flight {
    let f = this.flights.get(id);
    if (!f || f.gen !== gen) {
      if (f) this.remove(id);
      f = this.create(gen);
      this.flights.set(id, f);
    }
    return f;
  }

  private setPad(f: Flight, b: { q: number; r: number }): void {
    const tile = getTile(this.map, b);
    const p = worldPosition(b);
    f.pad.set(p.x, (tile?.height ?? 0) + 0.2, p.z);
  }

  /** `twin`: where our twin half floats right now (null when it is not drawn). */
  update(
    dt: number,
    elapsed: number,
    now: number,
    twin: Vector3 | null,
    allyAt: AllyLocator = () => null,
  ): void {
    for (const [id, f] of this.flights) {
      if (f.visitor && now > f.returnAt + VISIT_STAY_MS + TAKEOFF_MS) {
        this.remove(id);
        continue;
      }
      this.place(f, elapsed, now, twin, dt, allyAt);
    }
    this.particles.update(dt);
  }

  private place(
    f: Flight,
    elapsed: number,
    now: number,
    twin: Vector3 | null,
    dt: number,
    allyAt: AllyLocator,
  ): void {
    // Far point: the twin half for our own kiwi, an ally's planet, high in the sky otherwise.
    const ally = f.ally ? allyAt(f.ally) : null;
    if (ally) this.dest.copy(ally).setY(ally.y + 4);
    else if (f.twin && twin) this.dest.copy(twin);
    else this.dest.set(f.pad.x * 0.3 + 30, 120, f.pad.z * 0.3 - 90);
    if (f.visitor && now >= f.returnAt) {
      // Resting at the Nest, then off again.
      const t = now - f.returnAt - VISIT_STAY_MS;
      f.status = t < 0 ? 'returning' : 'outbound';
      f.departedAt = f.returnAt + VISIT_STAY_MS;
      f.arriveAt = f.departedAt + TAKEOFF_MS * 2;
    }
    // End of the take-off, out of the launchpad towards the destination.
    const start = this.b.copy(this.dest).sub(f.pad).setY(0).normalize();
    const climb = this.a
      .copy(f.pad)
      .addScaledVector(start, 6)
      .setY(f.pad.y + 9);
    const pos = new Vector3();
    let visible = true;
    let flapping = true;
    if (f.status === 'outbound') {
      const t = now - f.departedAt;
      const T = f.arriveAt - f.departedAt;
      if (now >= f.arriveAt) visible = false;
      else if (t < TAKEOFF_MS || T <= TAKEOFF_MS)
        this.takeoff(f, Math.max(0, t) / TAKEOFF_MS, start, pos);
      else pos.lerpVectors(climb, this.dest, (t - TAKEOFF_MS) / (T - TAKEOFF_MS));
      flapping = t > TAKEOFF_MS * 0.25;
    } else {
      const left = f.returnAt - now;
      const T = f.returnAt - f.arriveAt;
      if (left < TAKEOFF_MS || T <= TAKEOFF_MS) {
        this.takeoff(f, Math.max(0, left) / TAKEOFF_MS, start, pos);
        flapping = left > TAKEOFF_MS * 0.25;
      } else pos.lerpVectors(this.dest, climb, 1 - (left - TAKEOFF_MS) / (T - TAKEOFF_MS));
    }
    if (f.visitor && now < f.arriveAt && now < f.returnAt) visible = false;
    if (f === this.hidden) visible = false;
    f.group.visible = visible;
    if (!visible) return;
    // Face the way it flies (towards the destination on the way out, home on the way back).
    const ahead = f.status === 'outbound' ? this.dest : f.pad;
    f.group.position.copy(pos);
    f.group.lookAt(ahead.x, pos.y + (ahead.y - pos.y) * 0.15, ahead.z);
    if (f.broken && f.status === 'returning') {
      f.group.rotateZ(Math.sin(elapsed * 2.3) * 0.35);
      f.smokeTimer -= dt;
      if (f.smokeTimer <= 0) {
        f.smokeTimer = 0.12;
        this.particles.emit('smoke', pos, 1);
      }
    }
    const flap = FLAP[f.gen];
    const beat = flapping ? Math.sin(elapsed * flap.speed) * flap.amount : 0.1;
    f.wings[0]!.rotation.z = beat;
    f.wings[1]!.rotation.z = -beat;
    if (f.gen === 'iron' && flapping) {
      f.smokeTimer -= dt;
      if (f.smokeTimer <= 0) {
        f.smokeTimer = 0.3;
        this.particles.emit('smoke', pos, 1);
      }
    }
  }

  /** Run-up along the pad, then a climb (u from 0 = on the pad to 1 = end of the take-off). */
  private takeoff(f: Flight, u: number, dir: Vector3, out: Vector3): void {
    const run = Math.min(1, u * 3);
    const lift = Math.max(0, (u - 0.25) / 0.75);
    out
      .copy(f.pad)
      .addScaledVector(dir, run * 0.6 + lift * 5.4)
      .setY(f.pad.y + lift * lift * 9 + Math.abs(Math.sin(u * 30)) * 0.05 * (1 - lift));
  }

  private create(gen: ShipId): Flight {
    const model = shipModel(gen);
    const group = new Group();
    const body = new Mesh(model.geometry, this.material);
    body.position.y = -BODY_Y;
    group.add(body);
    const wings = model.rigs.map((r) => {
      const w = new Mesh(r.geometry, this.material);
      w.position.copy(r.pivot).setY(r.pivot.y - BODY_Y);
      group.add(w);
      return w;
    });
    group.scale.setScalar(1.25);
    this.group.add(group);
    return {
      group,
      wings,
      gen,
      pad: new Vector3(),
      departedAt: 0,
      arriveAt: 0,
      returnAt: 0,
      status: 'outbound',
      broken: false,
      twin: true,
      ally: null,
      visitor: false,
      smokeTimer: 0,
    };
  }

  private remove(id: string): void {
    const f = this.flights.get(id);
    if (!f) return;
    // Geometries are cached by `shipModel`: only the group goes.
    this.group.remove(f.group);
    this.flights.delete(id);
  }

  dispose(): void {
    for (const id of [...this.flights.keys()]) this.remove(id);
    this.material.dispose();
    this.particles.dispose();
  }
}
