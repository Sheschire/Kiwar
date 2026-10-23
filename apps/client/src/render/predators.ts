import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  createRng,
  getTile,
  FRONT_AZIMUTH,
  rampartSectors,
  SECTOR_IDS,
  SECTORS,
  type SectorId,
  isTurret,
  levelDef,
  pixelToHex,
  type FaceMap,
  type GameState,
  type Rng,
  type WaveReport,
  ageOf,
} from '@kiwar/shared';
import { worldPosition } from './terrain';
import {
  CreatureRig,
  restCreaturePose,
  sampleCreature,
  type CreatureClip,
  type CreatureKind,
  type CreaturePose,
} from './anim/creatures';

const MAX = 14;
const MAX_SHOTS = 24;
/** Length of the show, in seconds. */
const SHOW_S = 9;
/** Predators are bigger than kiwis. */
const SIZE = 1.5;
/** Seconds of the approach, then of mischief at the building for those who got through. */
const RUN = 4.2;
const LINGER = 1.6;

interface Actor {
  kind: CreatureKind;
  from: Vector3;
  to: Vector3;
  /** Start delay (s). */
  delay: number;
  /** Driven off by the defenders at this time (s), or never. */
  hitAt: number;
  phase: number;
  pose: CreaturePose;
}

interface Shot {
  from: Vector3;
  actor: number;
  t: number;
}

/** Middle of each sector, as an azimuth from the front. */
const SECTOR_AZIMUTH: Record<SectorId, number> = {
  front: 0,
  left: (2 * Math.PI) / 3,
  right: (-2 * Math.PI) / 3,
};

/**
 * Chantier 06: when the player is there at the strike, a short show of the wave — ferrets
 * running down from the rampart, bats diving from the sky, seeds fired by the turrets. Purely
 * cosmetic: the outcome (the report) was already decided by the simulation.
 */
export class PredatorShow {
  readonly group = new Group();
  /** Chantier 34: the predators, posed by their clips. */
  private readonly creatures = new CreatureRig(MAX * 2);
  private readonly shots: InstancedMesh;
  /** Look of the predators: the colony's age. */
  private age = 0;
  private actors: Actor[] = [];
  private shotsLive: Shot[] = [];
  private turrets: { pos: Vector3; air: boolean }[] = [];
  private time = Infinity;
  private shotTimer = 0;
  /** Creatures were drawn last frame (to clear them once the show ends). */
  private shown = false;
  private rng: Rng = createRng('show');
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  /** Called for each seed fired (sounds). */
  onShot: ((x: number, z: number) => void) | null = null;

  constructor(private readonly map: FaceMap) {
    this.group.add(this.creatures.group);
    this.shots = new InstancedMesh(
      new SphereGeometry(0.06, 6, 4),
      new MeshStandardMaterial({
        color: '#1f1612',
        emissive: new Color('#f2b84e'),
        emissiveIntensity: 0.4,
      }),
      MAX_SHOTS,
    );
    for (const mesh of [this.shots]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  get playing(): boolean {
    return this.time < SHOW_S;
  }

  private top(x: number, z: number): number {
    return getTile(this.map, pixelToHex(x, z))?.height ?? 0;
  }

  /** Starts the show of a wave that has just struck. */
  play(state: GameState, report: WaveReport): void {
    this.rng = createRng(`show/${report.id}`);
    this.age = ageOf(state);
    const rng = this.rng;
    // Chantier 12: they come by sector, mostly from the alien planet (the front).
    const ramparts = rampartSectors(this.map);
    const bySector = (s: SectorId) => ramparts.tiles.filter((_, i) => ramparts.sectors[i] === s);
    const sectorTiles = {
      front: bySector('front'),
      left: bySector('left'),
      right: bySector('right'),
    };
    const pickSector = (side: 'ground' | 'air'): SectorId => {
      let roll = rng.next();
      for (const s of SECTOR_IDS) {
        roll -= SECTORS.share[side][s];
        if (roll < 0) return s;
      }
      return 'front';
    };
    const targets = state.buildings.map((b) => worldPosition(b));
    if (targets.length === 0) targets.push({ x: 0, z: 0 });
    this.turrets = state.buildings
      .filter((b) => isTurret(b.type))
      .map((b) => {
        const p = worldPosition(b);
        return {
          pos: new Vector3(p.x, this.top(p.x, p.z) + 0.9, p.z),
          air: (levelDef(b.type, b.level)?.defense?.air ?? 0) > 0,
        };
      });
    const count = (x: number) => Math.min(MAX, Math.max(x > 0 ? 2 : 0, Math.round(x * 1.2)));
    // How many make it through: the share of the threat the defense could not stop.
    const through = report.victory ? 0 : report.severity;
    this.actors = [];
    const add = (kind: Actor['kind'], n: number) => {
      for (let i = 0; i < n; i++) {
        const target = rng.pick(targets);
        const to = new Vector3(target.x + rng.range(-0.4, 0.4), 0, target.z + rng.range(-0.4, 0.4));
        let from: Vector3;
        const sector = pickSector(kind === 'ferret' ? 'ground' : 'air');
        const tiles = sectorTiles[sector];
        if (kind === 'ferret' && tiles.length) {
          const p = worldPosition(rng.pick(tiles));
          from = new Vector3(p.x, 0, p.z);
        } else {
          // Bats fly in from the sky above their sector, more scattered.
          const centre = FRONT_AZIMUTH + SECTOR_AZIMUTH[sector];
          const a = centre + rng.range(-1, 1) * SECTORS.frontHalfAngle * 1.3;
          from = new Vector3(Math.sin(a) * 14, 0, Math.cos(a) * 14);
        }
        const stopped = rng.next() >= through;
        this.actors.push({
          kind,
          from,
          to,
          delay: rng.range(0, 1.6),
          hitAt: stopped ? rng.range(2.2, 4.6) : Infinity,
          phase: rng.range(0, Math.PI * 2),
          pose: restCreaturePose(),
        });
      }
    };
    add('ferret', count(report.threat.ground));
    add('bat', count(report.threat.air));
    this.shotsLive = [];
    this.time = 0;
    this.shotTimer = 0;
  }

  /**
   * Where an actor is at time `t` (s since the start), which way it faces and what it does;
   * returns its visibility (0–1).
   */
  private place(
    a: Actor,
    t: number,
    out: Vector3,
    act: { clip: CreatureClip; at: number; back: boolean },
  ): number {
    const local = t - a.delay;
    if (local < 0) return 0;
    const approach = (x: number) => Math.min(1, Math.max(0, x / RUN));
    const run: CreatureClip = a.kind === 'ferret' ? 'run' : 'flap';
    let u: number;
    let fade = 1;
    let lift = 1;
    act.back = false;
    act.at = local + a.phase;
    if (t < a.hitAt) {
      u = approach(local);
      act.clip = run;
      if (a.kind === 'bat' && u > 0.45) act.clip = 'dive';
      if (local > RUN) {
        // Got through: a moment of mischief at the building, then off with the loot.
        const since = local - RUN;
        act.clip = a.kind === 'ferret' ? (a.phase > Math.PI ? 'bite' : 'hit') : 'spit';
        act.at = since;
        if (since > LINGER) {
          u = Math.max(0, 1 - (since - LINGER) / 2.5);
          act.clip = run;
          act.back = true;
          act.at = local + a.phase;
        }
      }
    } else {
      // Hit by the defenders: flinches, falls and fades where it stands.
      const since = t - a.hitAt;
      u = approach(a.hitAt - a.delay);
      act.clip = since < 0.45 ? 'hurt' : 'fall';
      act.at = since < 0.45 ? since : since - 0.45;
      fade = 1 - Math.min(1, Math.max(0, since - 0.9) / 1);
      // Bats drop to the ground.
      lift = 1 - Math.min(1, Math.max(0, since - 0.3) / 0.7);
    }
    out.lerpVectors(a.from, a.to, u);
    const ground = this.top(out.x, out.z);
    if (a.kind === 'ferret') {
      out.y = ground;
    } else {
      // Bats glide high, then dive at the target, then hover over it.
      const dive = Math.sin(Math.min(1, u) * Math.PI * 0.5);
      const hover = 4.5 - dive * 3.6 + Math.sin(t * 3 + a.phase) * 0.2;
      out.y = ground + 0.15 + (hover - 0.15) * lift;
    }
    const end = Math.min(1, Math.max(0, SHOW_S - t));
    return Math.max(0, Math.min(fade, end));
  }

  update(dt: number): void {
    if (!this.playing) {
      if (this.shown) {
        this.shown = false;
        this.creatures.end();
        this.shots.count = 0;
      }
      return;
    }
    this.shown = true;
    this.time += dt;
    const t = this.time;
    const positions: (Vector3 | null)[] = [];
    const act = { clip: 'run' as CreatureClip, at: 0, back: false };
    for (const a of this.actors) {
      const p = new Vector3();
      const k = this.place(a, t, p, act);
      positions.push(k > 0.02 && t < a.hitAt ? p : null);
      if (k <= 0.02) continue;
      // Face the direction of travel (back home when leaving).
      let heading = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
      if (act.back) heading += Math.PI;
      this.creatures.draw({
        kind: a.kind,
        x: p.x,
        y: p.y,
        z: p.z,
        heading,
        scale: SIZE * (0.6 + 0.4 * k),
        pose: sampleCreature(a.kind, act.clip, act.at, a.pose),
        age: this.age,
        fade: k,
      });
    }
    this.creatures.end();

    // The turrets fire at the predators they can reach.
    this.shotTimer -= dt;
    if (this.shotTimer <= 0 && this.turrets.length > 0 && t < SHOW_S - 2) {
      this.shotTimer = 0.35;
      for (const tur of this.turrets) {
        const i = this.actors.findIndex(
          (a, idx) => positions[idx] && (a.kind === 'bat') === tur.air && this.rng.chance(0.5),
        );
        if (i >= 0 && this.shotsLive.length < MAX_SHOTS) {
          this.shotsLive.push({ from: tur.pos.clone(), actor: i, t: 0 });
          this.onShot?.(tur.pos.x, tur.pos.z);
        }
      }
    }
    let ns = 0;
    this.shotsLive = this.shotsLive.filter((s) => {
      s.t += dt / 0.6;
      const target = positions[s.actor];
      if (!target || s.t >= 1) return false;
      // Aim at the body, not the feet.
      this.v.copy(target);
      this.v.y += 0.25;
      this.v.lerpVectors(s.from, this.v, s.t);
      this.v.y += Math.sin(s.t * Math.PI) * 0.8;
      this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
      this.shots.setMatrixAt(ns++, this.m);
      return true;
    });
    this.shots.count = ns;
    this.shots.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.shots]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
  }
}
