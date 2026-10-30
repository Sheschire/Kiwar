import type { ItemId } from '@kiwar/shared';
import type { Camera } from 'three';
import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  ageOf,
  createRng,
  getTile,
  EV,
  type FaceMap,
  type GameState,
  type AlienUnit,
  type BattleLog,
  type Expedition,
  type Hex,
  type WeaponId,
} from '@kiwar/shared';
import { worldPosition } from '../terrain';
import { Particles } from '../particles';
import { KiwiRig } from '../anim/kiwiRig';
import { ClipPlayer, type ClipId } from '../anim/clips';
import {
  CreatureRig,
  restCreaturePose,
  sampleCreature,
  type CreatureClip,
  type CreaturePose,
} from '../anim/creatures';
import { shinyTint, sizeOf } from '../kiwis';
import {
  buildTimeline,
  hpAt,
  placeAt,
  shownAt,
  strikeAt,
  type Strike,
  type Timeline,
  type Track,
} from './timeline';

/**
 * Chantier 36: the show of a wave, replayed from its journal — ferrets running down from their
 * gate, bats diving, kiwis pecking, warriors swinging swords, mages throwing fireballs, turrets
 * firing seeds; health bars, impacts (stars, feathers), loot snatched, buildings broken. It can
 * start at any instant (live, rewound, a replay), run ×1/×2/×4 and be skipped. It never decides
 * anything: the journal is what happened.
 */

const MAX_KIWIS = 160;
const MAX_CREATURES = 70;
const MAX_SHOTS = 48;
const MAX_BARS = 230;
/** Predators are bigger than kiwis. */
const CREATURE_SIZE = 1.5;
/** Seconds a projectile flies. */
const FLIGHT = 0.3;
/** Seconds an attack pose lasts. */
const SWING = 0.55;
/** A fallen unit stays this long, fading at the end. */
const LINGER = 1.8;

/** Chantier 42: how much bigger the ferret queen is than a soldier. */
export const QUEEN_SIZE = 2.6;

const KIWI_CLIPS: Record<WeaponId, ClipId> = {
  beak: 'peck',
  mace: 'mace',
  sword: 'sword',
  fireball: 'spell',
  sling: 'sling',
  musket: 'sling',
  stomp: 'mace',
  dagger: 'dagger',
  song: 'sing',
  warhammer: 'mace',
  twinDaggers: 'dagger',
  greatsword: 'sword',
  meteor: 'spell',
  thornSling: 'sling',
  bomb: 'sling',
  holyBlade: 'sword',
  thornstorm: 'spell',
  longbow: 'sling',
  maul: 'mace',
  starfall: 'spell',
  claw: 'peck',
  gnaw: 'peck',
  sting: 'peck',
  shellRam: 'peck',
  bite: 'peck',
  slam: 'peck',
  dive: 'peck',
  spit: 'peck',
  royalSlam: 'mace',
  seedShot: 'peck',
  skyShot: 'peck',
};

/** What flies, and its colour and size. */
const SHOTS: Partial<Record<WeaponId, { color: string; size: number; arc: number }>> = {
  seedShot: { color: '#2a1d14', size: 1, arc: 0.8 },
  skyShot: { color: '#3a2a1e', size: 1, arc: 1.2 },
  sling: { color: '#8c8c86', size: 0.8, arc: 0.6 },
  song: { color: '#ffd36b', size: 0.9, arc: 0.4 },
  meteor: { color: '#ff5a2b', size: 3, arc: 0.9 },
  thornSling: { color: '#5d8a3a', size: 0.9, arc: 0.5 },
  bomb: { color: '#2b2522', size: 1.8, arc: 1 },
  thornstorm: { color: '#5d8a3a', size: 2, arc: 0.5 },
  longbow: { color: '#a07a4c', size: 0.7, arc: 0.4 },
  starfall: { color: '#fff1a8', size: 2.4, arc: 1.1 },
  musket: { color: '#1d1d1d', size: 0.6, arc: 0.1 },
  fireball: { color: '#ff8a2b', size: 2.2, arc: 0.5 },
  spit: { color: '#b6f04a', size: 1.2, arc: 0.3 },
};

interface Actor {
  track: Track;
  weapon: WeaponId;
  kind: 'kiwi' | 'creature' | 'turret';
  creature: 'ferret' | 'bat';
  scale: number;
  tint: Color;
  classId: Track['unit'][6];
  /** Chantier 38: the armour it wears (its weapon is the one it strikes with). */
  armor: ItemId | null;
  player: ClipPlayer | null;
  pose: CreaturePose;
  heading: number;
  pos: Vector3;
}

/**
 * What a show plays (chantier 41: a wave at home or a landing on the twin): its journal, and
 * which report it comes from.
 */
export interface ShowSource {
  id: string;
  kind: 'wave' | 'landing';
  log: BattleLog;
}

/** Chantier 41: how a show is played beyond the journal itself. */
export interface ShowOptions {
  /** Our side in the journal (0 at home, 1 for a landing crew). */
  ours?: 0 | 1;
  /** Age of the enemies' look (our age for a wave, the parcel's for a landing). */
  age?: number;
  /** Seconds of show before the battle (the ship coming down). */
  lead?: number;
  /** Seconds of show after the journal's own tail (the beacon, the ship leaving). */
  tail?: number;
  /** Our side vanishes then (show time: the crew boards the ship). */
  boardAt?: number;
  /** The crew as it boarded (looks of the kiwis lost since). */
  roster?: Expedition['roster'];
  /** The aliens met, with their gear (the unit card). */
  seen?: AlienUnit[];
}

export interface UnitInfo {
  index: number;
  ref: string;
  side: 0 | 1;
  /** Chantier 41: a unit of the other side (not ours). */
  enemy: boolean;
  body: string;
  kind: string;
  name: string;
  level: number;
  classId: string | null;
  weapon: WeaponId;
  hp: number;
  maxHp: number;
  fallen: boolean;
  /** Chantier 41: an alien's gear, as the landing saw it (kiwis: read from the colony). */
  gear?: ItemId[];
}

export class BattleShow {
  readonly group = new Group();
  readonly particles = new Particles();
  private readonly kiwiRig = new KiwiRig(MAX_KIWIS);
  private readonly creatures = new CreatureRig(MAX_CREATURES);
  private readonly shots: InstancedMesh;
  private readonly barBack: InstancedMesh;
  private readonly barFill: InstancedMesh;
  private readonly ring: Mesh;
  private timeline: Timeline | null = null;
  private actors: Actor[] = [];
  private buildings: Vector3[] = [];
  private age = 0;
  /** Show time in seconds (negative during the lead). */
  time = 0;
  speed = 1;
  source: ShowSource | null = null;
  private opts: Required<Omit<ShowOptions, 'roster' | 'seen' | 'boardAt'>> & ShowOptions = {
    ours: 0,
    age: 0,
    lead: 0,
    tail: 0,
  };
  selected: number | null = null;
  private eventIndex = 0;
  private impacts: {
    t: number;
    at: Vector3;
    effect: 'hit' | 'feathers' | 'sparks' | 'fireball';
  }[] = [];
  private shown = false;
  private readonly drawnPos: { index: number; pos: Vector3 }[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly s = new Vector3();
  private readonly color = new Color();
  private readonly camQ = new Quaternion();
  /** Called for each turret shot (sounds). */
  onShot: ((x: number, z: number) => void) | null = null;
  /** A building (id) is damaged in the show: its smoke may appear. */
  onDamaged: ((buildingId: string) => void) | null = null;
  /** The show reached its end (or was skipped). */
  onEnd: ((source: ShowSource) => void) | null = null;

  constructor(private readonly map: FaceMap) {
    this.group.add(this.kiwiRig.group, this.creatures.group, this.particles.mesh);
    const shotMat = new MeshBasicMaterial({ color: '#ffffff' });
    this.shots = new InstancedMesh(new SphereGeometry(0.06, 6, 4), shotMat, MAX_SHOTS);
    this.shots.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_SHOTS * 3), 3);
    const back = new MeshBasicMaterial({ color: '#2b1a24', depthTest: false, transparent: true });
    const fill = new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
    this.barBack = new InstancedMesh(new PlaneGeometry(1, 1), back, MAX_BARS);
    this.barFill = new InstancedMesh(new PlaneGeometry(1, 1).translate(0.5, 0, 0), fill, MAX_BARS);
    this.barFill.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
    this.barBack.renderOrder = 20;
    this.barFill.renderOrder = 21;
    for (const mesh of [this.shots, this.barBack, this.barFill]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.ring = new Mesh(
      new RingGeometry(0.32, 0.42, 28).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.85 }),
    );
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** A battle is on screen (or its last particles). */
  get playing(): boolean {
    return this.timeline !== null || this.particles.active;
  }

  /** Seconds the battle lasts in the journal (and its short tail). */
  get duration(): number {
    return this.timeline?.duration ?? 0;
  }

  /** The whole show, lead and tail included (the bar's clock). */
  get length(): number {
    return this.timeline ? this.opts.lead + this.timeline.duration + this.opts.tail : 0;
  }

  /** Show time from its start (the bar's clock). */
  get clock(): number {
    return this.time + this.opts.lead;
  }

  /** Seconds before the battle (negative show times). */
  get lead(): number {
    return this.opts.lead;
  }

  /** When the fight itself ends (journal seconds). */
  get fightEnd(): number {
    return this.timeline?.fight ?? 0;
  }

  setParticles(on: boolean): void {
    this.particles.setEnabled(on);
  }

  /** Villagers drawn by the show (the village view hides them meanwhile). */
  kiwiIds(): string[] {
    return this.actors.filter((a) => a.kind === 'kiwi').map((a) => a.track.unit[0]);
  }

  /** Buildings (ids) damaged during the battle, and when. */
  damagedAt(): Map<string, number> {
    const out = new Map<string, number>();
    const log = this.source?.log;
    if (!log || !this.timeline) return out;
    for (const [b, t] of this.timeline.damagedAt) out.set(log.buildings[b]![0], t);
    return out;
  }

  private ground(h: Hex): number {
    return getTile(this.map, h)?.height ?? 0;
  }

  /** Starts the show of a journal at `from` seconds of battle (negative: in the lead). */
  play(state: GameState, source: ShowSource, from = 0, opts: ShowOptions = {}): boolean {
    const log = source.log;
    this.source = source;
    this.opts = {
      ...opts,
      ours: opts.ours ?? 0,
      age: opts.age ?? ageOf(state),
      lead: opts.lead ?? 0,
      tail: opts.tail ?? 0,
    };
    this.timeline = buildTimeline(log);
    this.age = this.opts.age;
    this.buildings = log.buildings.map((b) => {
      const p = worldPosition({ q: b[2], r: b[3] });
      return new Vector3(p.x, this.ground({ q: b[2], r: b[3] }) + 0.4, p.z);
    });
    const villagers = new Map(state.villagers.map((v) => [v.id as string, v]));
    const roster = new Map((opts.roster ?? []).map((m) => [m.id as string, m]));
    this.actors = this.timeline.tracks.map((track) => {
      const u = track.unit;
      const body = u[2];
      let tint = new Color(1, 1, 1);
      let scale = 1;
      if (body === 'kiwi' || body === 'kikiwiwi') {
        // The same look as in the village (brightness and size drawn from its id).
        const rng = createRng(`kiwi/${u[0]}`);
        const brightness = rng.range(0.82, 1.15);
        const jitter = rng.range(0.96, 1.04);
        const v = villagers.get(u[0]);
        const shiny = v?.shiny ?? roster.get(u[0])?.shiny ?? null;
        tint = shiny ? shinyTint(shiny) : new Color(1, 1, 1).multiplyScalar(brightness);
        scale = (v ? sizeOf(v, jitter) : jitter) * (body === 'kikiwiwi' ? 1.6 : 1);
      } else if (body === 'ferret' || body === 'bat') {
        scale = CREATURE_SIZE * (u[3] === 'brute' ? 1.3 : u[3] === 'scout' ? 0.85 : 1);
      } else if (body === 'queen') {
        // Chantier 42: the ferret queen, a giant.
        scale = CREATURE_SIZE * QUEEN_SIZE;
      }
      return {
        track,
        weapon: u[10],
        kind:
          body === 'turret'
            ? 'turret'
            : body === 'ferret' || body === 'bat' || body === 'queen'
              ? 'creature'
              : 'kiwi',
        creature: body === 'bat' ? 'bat' : 'ferret',
        scale,
        tint,
        classId: u[6],
        armor: villagers.get(u[0])?.gear?.armor ?? null,
        player: body === 'kiwi' || body === 'kikiwiwi' ? new ClipPlayer(track.index * 0.37) : null,
        pose: restCreaturePose(),
        heading: 0,
        pos: new Vector3(),
      } satisfies Actor;
    });
    this.selected = null;
    this.speed = 1;
    this.impacts = [];
    this.seek(from);
    return true;
  }

  /** Jumps to `t` seconds (no impact effects for what is skipped). */
  seek(t: number): void {
    if (!this.timeline) return;
    this.time = Math.max(-this.opts.lead, Math.min(t, this.timeline.duration + this.opts.tail));
    const events = this.timeline.events;
    let i = 0;
    while (i < events.length && events[i]!.t <= this.time) i++;
    this.eventIndex = i;
    this.impacts = [];
  }

  /** Ends the show now (the outcome is told). */
  skip(): void {
    if (!this.timeline) return;
    this.finish();
  }

  stop(): void {
    this.timeline = null;
    this.source = null;
    this.actors = [];
    this.clearDrawn();
  }

  private finish(): void {
    const source = this.source;
    this.stop();
    if (source) this.onEnd?.(source);
  }

  private clearDrawn(): void {
    if (!this.shown) return;
    this.shown = false;
    this.kiwiRig.end();
    this.creatures.end();
    this.shots.count = 0;
    this.barBack.count = 0;
    this.barFill.count = 0;
    this.ring.visible = false;
    this.drawnPos.length = 0;
  }

  /** What the unit card shows about a unit, now. */
  info(index: number): UnitInfo | null {
    const a = this.actors[index];
    if (!a) return null;
    const u = a.track.unit;
    const hp = hpAt(a.track, this.time);
    const enemy = u[1] !== this.opts.ours;
    // An alien's gear: the kind and level the landing met (`seen`).
    const met = enemy
      ? this.opts.seen?.find((s) => s.kind === u[3] && s.level === u[5])
      : undefined;
    return {
      index,
      ref: u[0],
      side: u[1],
      enemy,
      ...(met ? { gear: [met.weapon, met.armor].filter((x): x is ItemId => !!x) } : {}),
      body: u[2],
      kind: u[3],
      name: u[4],
      level: u[5],
      classId: u[6],
      weapon: u[10],
      hp,
      maxHp: a.track.maxHp,
      fallen: a.track.endKind === 'fall' && this.time >= (a.track.end ?? Infinity),
    };
  }

  /** The unit under a screen point (client pixels), or null. */
  pick(
    clientX: number,
    clientY: number,
    camera: Camera,
    rect: DOMRect,
    reach: number,
  ): number | null {
    let best: number | null = null;
    let bestD = reach * reach;
    // Positions are local to the show's group (chantier 41: the twin turns and is scaled).
    this.group.updateWorldMatrix(true, false);
    for (const d of this.drawnPos) {
      this.v.copy(d.pos).applyMatrix4(this.group.matrixWorld).project(camera);
      if (this.v.z > 1) continue;
      const dx = rect.left + ((this.v.x + 1) / 2) * rect.width - clientX;
      const dy = rect.top + ((1 - this.v.y) / 2) * rect.height - clientY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = d.index;
      }
    }
    return best;
  }

  /**
   * Chantier 41: the middle of the fighters on the field now (in the group's frame, in `out`)
   * and how far they spread; null when nobody is drawn.
   */
  fighters(out: Vector3): number | null {
    if (this.drawnPos.length === 0) return null;
    out.set(0, 0, 0);
    for (const d of this.drawnPos) out.add(d.pos);
    out.multiplyScalar(1 / this.drawnPos.length);
    let spread = 0;
    for (const d of this.drawnPos) spread = Math.max(spread, d.pos.distanceTo(out));
    return spread;
  }

  /** World position of a unit at `t` (body height), in `out`. */
  private positionOf(a: Actor, t: number, out: Vector3): Vector3 {
    const place = placeAt(a.track, t);
    const p0 = worldPosition(place.from);
    const p1 = worldPosition(place.to);
    const k = place.k;
    out.set(p0.x + (p1.x - p0.x) * k, 0, p0.z + (p1.z - p0.z) * k);
    out.y = this.ground(place.from) + (this.ground(place.to) - this.ground(place.from)) * k;
    if (a.kind === 'turret') out.y += 0.9;
    return out;
  }

  private targetPos(s: Strike, t: number, out: Vector3): Vector3 {
    if (s.building) return out.copy(this.buildings[s.target] ?? out.set(0, 0, 0));
    const target = this.actors[s.target];
    if (!target) return out.set(0, 0, 0);
    this.positionOf(target, t, out);
    out.y += target.creature === 'bat' && target.kind === 'creature' ? 1.6 : 0.25;
    return out;
  }

  update(dt: number, camera: Camera): void {
    this.particles.update(dt);
    const tl = this.timeline;
    if (!tl) {
      this.clearDrawn();
      return;
    }
    const before = this.time;
    const end = tl.duration + this.opts.tail;
    this.time = Math.min(end, this.time + dt * this.speed);
    const t = this.time;
    if (t >= 0) this.fireEvents(Math.max(0, before), t);
    if (t >= end - 1e-9) {
      this.finish();
      return;
    }
    // The lead (the ship coming down): nobody on the field yet.
    if (t < 0) {
      this.clearDrawn();
      return;
    }
    this.shown = true;
    this.drawnPos.length = 0;
    // Bars face the camera in the group's frame (chantier 41: the twin is turned).
    this.group.getWorldQuaternion(this.camQ).invert().multiply(camera.quaternion);
    const camQ = this.camQ;
    const board = this.opts.boardAt;
    let nb = 0;
    let nc = 0;
    let bars = 0;
    let ns = 0;
    for (const a of this.actors) {
      const tr = a.track;
      if (a.kind !== 'turret' && !shownAt(tr, t, LINGER)) continue;
      // The crew boarded the ship.
      if (board !== undefined && t >= board && tr.side === this.opts.ours) continue;
      const pos = this.positionOf(a, t, a.pos);
      const place = placeAt(tr, t);
      const strike = strikeAt(tr, t, SWING);
      const fallen = tr.endKind === 'fall' && tr.end !== null && t >= tr.end;
      const hurt = tr.hurts.some((h) => h.t <= t && t - h.t < 0.35);
      // Heading: where it walks, or at what it hits.
      if (strike && !fallen) {
        this.targetPos(strike, t, this.w);
        a.heading = Math.atan2(this.w.x - pos.x, this.w.z - pos.z);
      } else if (place.moving) {
        const p0 = worldPosition(place.from);
        const p1 = worldPosition(place.to);
        if (p0.x !== p1.x || p0.z !== p1.z) a.heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      }
      const fade = fallen ? Math.max(0, 1 - Math.max(0, t - tr.end! - (LINGER - 0.6)) / 0.6) : 1;
      if (a.kind === 'kiwi') {
        const clip: ClipId = fallen
          ? 'fall'
          : hurt
            ? 'hurt'
            : strike
              ? KIWI_CLIPS[a.weapon]
              : place.moving
                ? 'walk'
                : 'idle';
        a.player!.play(clip);
        if (nb < MAX_KIWIS) {
          this.kiwiRig.draw({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            heading: a.heading,
            scale: a.scale * (0.6 + 0.4 * fade),
            pose: a.player!.pose(dt * this.speed),
            tint: a.tint,
            classId: a.classId,
            load: null,
            armor: a.armor,
          });
          nb++;
        }
      } else if (a.kind === 'creature') {
        const bat = a.creature === 'bat';
        let clip: CreatureClip;
        let at = t + tr.index * 0.31;
        if (fallen) {
          clip = 'fall';
          at = t - tr.end!;
        } else if (hurt) {
          clip = 'hurt';
          let last = t;
          for (const h of tr.hurts) if (h.t <= t) last = h.t;
          at = t - last;
        } else if (strike) {
          clip = bat
            ? a.weapon === 'spit'
              ? 'spit'
              : 'dive'
            : tr.unit[3] === 'brute'
              ? 'hit'
              : 'bite';
          at = t - strike.t;
        } else clip = bat ? 'flap' : 'run';
        if (bat) {
          // Bats glide high, dive at what they hit, drop when they fall.
          const dive = strike && a.weapon === 'dive' ? 1 - (t - strike.t) / SWING : 0;
          const drop = fallen ? Math.min(1, (t - tr.end!) / 0.7) : 0;
          pos.y += (2.2 - 1.5 * Math.max(0, dive) + Math.sin(t * 3 + tr.index) * 0.15) * (1 - drop);
        }
        if (nc++ >= MAX_CREATURES) continue;
        this.creatures.draw({
          kind: a.creature,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          heading: a.heading,
          scale: a.scale * (0.6 + 0.4 * fade),
          pose: sampleCreature(a.creature, clip, at, a.pose),
          age: this.age,
          fade,
        });
      }
      if (a.kind !== 'turret' && !fallen) this.drawnPos.push({ index: tr.index, pos: pos.clone() });
      // Health bar: once hurt, or selected.
      const hp = hpAt(tr, t);
      if (
        a.kind !== 'turret' &&
        !fallen &&
        (hp < tr.maxHp - 1e-6 || this.selected === tr.index) &&
        bars < MAX_BARS
      ) {
        const i = bars++;
        const lift = (a.kind === 'kiwi' ? 0.75 : 0.7) * a.scale;
        this.v.set(pos.x, pos.y + lift, pos.z);
        const width = 0.42 * Math.max(0.8, Math.min(1.6, a.scale));
        this.m.compose(this.v, camQ, this.s.set(width + 0.04, 0.075, 1));
        this.barBack.setMatrixAt(i, this.m);
        // The fill starts at the left edge of the bar (camera space).
        this.w
          .set(-width / 2, 0, 0)
          .applyQuaternion(camQ)
          .add(this.v);
        this.m.compose(this.w, camQ, this.s.set(width * (hp / tr.maxHp), 0.045, 1));
        this.barFill.setMatrixAt(i, this.m);
        this.color.set(tr.side === this.opts.ours ? '#7ccf5a' : '#e8673c');
        this.barFill.setColorAt(i, this.color);
      }
      // Projectiles in flight.
      const shot = SHOTS[a.weapon];
      if (shot) {
        for (let k = tr.strikes.length - 1; k >= 0; k--) {
          const s = tr.strikes[k]!;
          if (s.t > t) continue;
          if (t - s.t > FLIGHT) break;
          if (s.splash || ns >= MAX_SHOTS) continue;
          const u = (t - s.t) / FLIGHT;
          this.v.copy(pos);
          this.v.y += a.kind === 'turret' ? 0 : 0.35;
          this.targetPos(s, t, this.w);
          this.v.lerp(this.w, u);
          this.v.y += Math.sin(u * Math.PI) * shot.arc;
          const size = shot.size;
          this.m.compose(this.v, this.q.identity(), this.s.set(size, size, size));
          this.shots.setMatrixAt(ns, this.m);
          this.color.set(shot.color);
          this.shots.setColorAt(ns, this.color);
          ns++;
        }
      }
    }
    this.kiwiRig.end();
    this.creatures.end();
    this.barBack.count = bars;
    this.barFill.count = bars;
    this.shots.count = ns;
    for (const mesh of [this.shots, this.barBack, this.barFill]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // Selected unit: a ring at its feet.
    const sel =
      this.selected === null ? undefined : this.drawnPos.find((d) => d.index === this.selected);
    this.ring.visible = !!sel;
    if (sel) {
      const a = this.actors[sel.index]!;
      const bat = a.kind === 'creature' && a.creature === 'bat';
      this.ring.position.set(
        sel.pos.x,
        bat ? this.ground(placeAt(a.track, t).to) + 0.03 : sel.pos.y + 0.03,
        sel.pos.z,
      );
      this.ring.scale.setScalar(Math.max(0.8, a.scale * (a.kind === 'creature' ? 0.7 : 1)));
    }
  }

  /** Impacts, sounds and broken buildings for the events crossed between two instants. */
  private fireEvents(from: number, to: number): void {
    const tl = this.timeline!;
    const events = tl.events;
    // Impacts of projectiles land a little after the shot.
    this.impacts = this.impacts.filter((i) => {
      if (i.t > to) return true;
      this.particles.effect(i.effect, i.at, i.effect === 'fireball' ? 1 : 0.6);
      return false;
    });
    // Seeking back or a long jump: no effects for what is skipped.
    if (to < from || to - from > 1.5) {
      this.seek(to);
      return;
    }
    while (this.eventIndex < events.length && events[this.eventIndex]!.t <= to) {
      const e = events[this.eventIndex++]!;
      const [a, b, c] = e.args;
      const actor = this.actors[a!];
      switch (e.code) {
        case EV.attack: {
          if (!actor) break;
          const building = b! % 2 === 1;
          const s: Strike = {
            t: e.t,
            target: building ? (b! - 1) / 2 : b! / 2,
            building,
            damage: c! / 10,
            splash: false,
          };
          const at = this.targetPos(s, e.t, new Vector3());
          const ranged = !!SHOTS[actor.weapon];
          if (actor.kind === 'turret') this.onShot?.(at.x, at.z);
          if (s.damage <= 0) break;
          const effect =
            actor.weapon === 'fireball' ||
            actor.weapon === 'meteor' ||
            actor.weapon === 'starfall' ||
            actor.weapon === 'bomb'
              ? 'fireball'
              : building
                ? 'sparks'
                : this.actors[s.target]?.track.unit[2] === 'kiwi' ||
                    this.actors[s.target]?.track.unit[2] === 'kikiwiwi'
                  ? 'feathers'
                  : 'hit';
          if (ranged) this.impacts.push({ t: e.t + FLIGHT, at, effect });
          else this.particles.effect(effect, at, 0.6);
          break;
        }
        case EV.fall: {
          if (!actor) break;
          const p = this.positionOf(actor, e.t, new Vector3());
          this.particles.effect('puff', p, 0.7);
          break;
        }
        case EV.loot: {
          const p = this.buildings[b!];
          if (p) this.particles.effect('loot', p, 0.8);
          break;
        }
        case EV.damaged: {
          const p = this.buildings[a!];
          if (p) this.particles.effect('puff', p, 1.5);
          const id = this.source?.log.buildings[a!]?.[0];
          if (id) this.onDamaged?.(id);
          break;
        }
        default:
          break;
      }
    }
  }

  dispose(): void {
    this.stop();
    for (const mesh of [this.shots, this.barBack, this.barFill]) {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    this.particles.dispose();
    this.kiwiRig.dispose();
    this.creatures.dispose();
  }
}
