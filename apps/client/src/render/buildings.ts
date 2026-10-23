import type { Object3D } from 'three';
import { withSeasonLook } from './seasonLook';
import {
  AdditiveBlending,
  Color,
  Group,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import {
  ageOf,
  getTile,
  reserveCapOf,
  RESOURCE_IDS,
  type Building,
  type BuildingType,
  type FaceMap,
  type GameState,
  type QueueItem,
  type ResourceId,
} from '@kiwar/shared';
import type { Particles } from './particles';
import {
  buildingGeometry,
  buildingModel,
  reserveHeapGeometry,
  scaffoldGeometry,
  stakeGeometry,
} from './buildingModels';
import { DropLabels } from './dropLabels';
import { activityOf, BuildingLife } from './buildingLife';
import { worldPosition } from './terrain';
import { footprintFrame } from './footprintFrame';
import { WATER_LEVEL } from './water';
import { LevelBadges } from './levelBadges';
import { SignsView, type SignSpot } from './signs';
import { WindowsView, type WindowSpots } from './windows';
import { bedsOf } from '../game/perState';

const SPARKS = 18;
const DUST = 26;
const DEBRIS = 14;
const DUST_COLOR = new Color('#c9b48a');
const DEBRIS_COLOR = new Color('#6e5638');

interface Pop {
  object: Object3D;
  t: number;
}

interface Burst {
  origin: Vector3;
  velocities: Vector3[];
  t: number;
}

/** A demolished building sinking into a cloud of dust and falling debris. */
interface Collapse {
  object: Object3D;
  origin: Vector3;
  dust: Vector3[];
  debris: Vector3[];
  t: number;
}

const COLLAPSE_S = 1.6;

/** Chantier 30: heap size by a warehouse (0 none, 1–3), from how full its reserve is. */
function heapSize(state: GameState, b: Building): 0 | 1 | 2 | 3 {
  if (!b.reserve) return 0;
  const cap = reserveCapOf(state, b) * RESOURCE_IDS.length;
  if (cap <= 0) return 0;
  const fill = RESOURCE_IDS.reduce((sum, id) => sum + b.reserve![id], 0) / cap;
  return fill < 0.02 ? 0 : fill < 0.34 ? 1 : fill < 0.67 ? 2 : 3;
}
const UP = new Vector3(0, 1, 0);

/**
 * Renders buildings, construction sites (scaffolding + rising ghost), planned sites (stakes),
 * and the little "pop + sparkles" celebration when a construction completes.
 */
export class BuildingsView {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
  });
  private readonly ghostMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
    transparent: true,
    opacity: 0.55,
  });
  /** One group per building: static mesh + animated rigs (+ status badge). */
  private readonly meshes = new Map<string, Group>();
  private readonly life = new BuildingLife();
  /** Chantier 11: level badges (and the "upgradable" arrow) above the buildings. */
  readonly badges = new LevelBadges();
  /** Chantier 17: the round sign with its icon by each building (one instanced mesh). */
  readonly signs = new SignsView();
  /** Chantier 23: doorways and windows lit at night where kiwis sleep or work. */
  readonly windows = new WindowsView();
  /** Chantier 30: "+1 250" rising over a warehouse whose reserve is brought back. */
  private readonly collected = new DropLabels();
  /** Buildings with someone home or at work (their windows light up at night). */
  lit: ReadonlySet<string> = new Set();
  private litSig = '';
  private readonly sites = new Map<string, Group>();
  private signature = '';
  private pops: Pop[] = [];
  private bursts: Burst[] = [];
  private collapses: Collapse[] = [];
  private readonly sparks: InstancedMesh;
  private readonly dust: InstancedMesh;
  private state: GameState | null = null;

  constructor(
    private readonly map: FaceMap,
    /** Called when the set of meshes changes (static shadows must be refreshed). */
    private readonly onChanged: () => void,
  ) {
    // Snow settles on roofs in winter.
    withSeasonLook(this.material, { tint: 0, snow: 0.75 });
    this.sparks = new InstancedMesh(
      new IcosahedronGeometry(0.06, 0),
      new MeshBasicMaterial({
        color: new Color('#fff3b0'),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      SPARKS * 4,
    );
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);

    this.dust = new InstancedMesh(
      new DodecahedronGeometry(0.11, 0),
      new MeshStandardMaterial({ roughness: 1, flatShading: true }),
      (DUST + DEBRIS) * 3,
    );
    this.dust.count = 0;
    this.dust.frustumCulled = false;
    for (let i = 0; i < this.dust.instanceMatrix.count; i++) {
      this.dust.setColorAt(i, i % (DUST + DEBRIS) < DUST ? DUST_COLOR : DEBRIS_COLOR);
    }
    this.group.add(this.dust);
    this.group.add(this.life.particles.mesh);
    this.group.add(this.badges.group);
    this.group.add(this.signs.mesh);
    this.group.add(this.windows.group);
    this.group.add(this.collected.group);
  }

  /** Ground height for a building on this tile (wells stand in the juice). */
  private baseY(q: number, r: number): number {
    const tile = getTile(this.map, { q, r });
    if (!tile) return 0;
    return tile.type === 'juice' ? tile.height + WATER_LEVEL - 0.08 : tile.height;
  }

  /**
   * Buildings face roughly towards the heart, with a little variation; chantier 35: a big one
   * stands at the centre of its footprint (`footprintFrame`).
   */
  private placeAt(
    obj: Object3D,
    type: BuildingType,
    at: { q: number; r: number; rot?: number; cramped?: true },
    variant = 0,
  ): void {
    const f = footprintFrame(this.map, type, at, variant);
    obj.position.set(f.x, f.y, f.z);
    obj.rotation.y = f.angle;
  }

  /** Synchronises meshes with the game state (cheap when nothing changed). */
  sync(state: GameState): void {
    this.state = state;
    for (const b of state.buildings) this.life.setActivity(b.id, activityOf(state, b));
    const away = (id: string) =>
      state.expeditions.some((e) => e.launchpadId === id && e.status !== 'done');
    const sig =
      state.buildings
        .map(
          (b) => `${b.id}:${b.level}:${away(b.id) ? 1 : 0}:${b.rot ?? ''}${b.cramped ? 'c' : ''}`,
        )
        .join(',') +
      '|' +
      state.queue.map((i) => `${i.id}:${i.startedAt ?? '-'}`).join(',');
    const lit = litBuildings(state);
    const litSig = [...lit].join(',');
    if (sig !== this.signature) {
      this.signature = sig;
      this.syncMeshes(state, away);
      this.litSig = '';
    }
    if (litSig !== this.litSig) {
      this.litSig = litSig;
      this.lit = lit;
      this.syncWindows();
    }
    this.badges.sync(state, (id) => this.anchorOf(id));
    this.syncHeaps(state);
  }

  /** Chantier 30: the reserve heaped by each warehouse (three sizes). */
  private syncHeaps(state: GameState): void {
    let changed = false;
    for (const b of state.buildings) {
      if (b.type !== 'warehouse') continue;
      const g = this.meshes.get(b.id);
      if (!g) continue;
      const size = heapSize(state, b);
      if (size === ((g.userData.heap as number | undefined) ?? 0)) continue;
      const old = g.getObjectByName('heap');
      if (old) g.remove(old);
      if (size !== 0) {
        const heap = new Mesh(reserveHeapGeometry(size), this.material);
        heap.name = 'heap';
        heap.castShadow = true;
        heap.receiveShadow = true;
        g.add(heap);
      }
      g.userData.heap = size;
      changed = true;
    }
    if (changed) this.onChanged();
  }

  /** Chantier 30: what a tap brought back from a warehouse, rising above it. */
  showCollected(buildingId: string, labels: { resource: ResourceId; text: string }[]): void {
    const a = this.anchorOf(buildingId);
    if (!a) return;
    labels.forEach((l, i) =>
      this.collected.spawn(a.x, a.y - 0.25 + i * 0.22, a.z, l.text, l.resource, '#fff4c2'),
    );
  }

  /** Where a badge floats above a building (level, logistics). */
  anchorOf(id: string): { x: number; y: number; z: number } | null {
    const g = this.meshes.get(id);
    if (!g) return null;
    return {
      x: g.position.x,
      y: g.position.y + (g.userData.height as number) + 0.62,
      z: g.position.z,
    };
  }

  private syncMeshes(state: GameState, away: (id: string) => boolean): void {
    const age = ageOf(state);

    const seen = new Set<string>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const existing = this.meshes.get(b.id);
      const shipAway = away(b.id);
      if (
        existing &&
        existing.userData.level === b.level &&
        existing.userData.away === shipAway &&
        existing.userData.age === age
      )
        continue;
      if (existing) {
        this.group.remove(existing);
        this.life.detach(b.id);
      }
      this.addBuildingMesh(b, shipAway, age);
      this.life.setActivity(b.id, activityOf(state, b));
    }
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.meshes.delete(id);
        this.life.detach(id);
        this.collapse(mesh);
      }
    }
    this.syncSigns();

    const seenSites = new Set<string>();
    for (const item of state.queue) {
      seenSites.add(item.id);
      const site = this.sites.get(item.id);
      const started = item.startedAt !== null;
      if (site && site.userData.started === started) continue;
      if (site) this.group.remove(site);
      this.sites.set(item.id, this.createSite(item, started));
    }
    for (const [id, site] of this.sites) {
      if (!seenSites.has(id)) {
        this.group.remove(site);
        this.sites.delete(id);
      }
    }
    this.onChanged();
  }

  private addBuildingMesh(b: Building, shipAway: boolean, age: number): Group {
    const model = buildingModel(b.type, b.level, shipAway, age);
    const g = new Group();
    g.userData = {
      level: b.level,
      away: shipAway,
      age,
      type: b.type,
      sign: model.sign,
      buildingId: b.id,
      q: b.q,
      r: b.r,
      height: model.height,
      lights: model.lights,
    };
    const mesh = new Mesh(model.geometry, this.material);
    // Shadows are static: only the static part casts one.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    this.life.attach(b.id, g, model, this.material);
    const tile = getTile(this.map, b);
    this.placeAt(g, b.type, b, tile?.variant ?? 0.5);
    this.meshes.set(b.id, g);
    this.group.add(g);
    return g;
  }

  private syncWindows(): void {
    const spots: WindowSpots[] = [];
    for (const [id, g] of this.meshes) {
      const lights = g.userData.lights as WindowSpots | undefined;
      if (!lights) continue;
      g.updateMatrix();
      spots.push({
        world: g.matrix,
        doors: lights.doors,
        windows: lights.windows,
        lit: this.lit.has(id),
      });
    }
    this.windows.sync(spots);
  }

  /** Chantier 17: the signs follow the buildings (rotated with them). */
  private syncSigns(): void {
    const spots: SignSpot[] = [];
    for (const g of this.meshes.values()) {
      const sign = g.userData.sign as Vector3 | null;
      if (!sign) continue;
      const at = sign.clone().applyAxisAngle(UP, g.rotation.y).add(g.position);
      spots.push({ type: g.userData.type as BuildingType, at });
    }
    this.signs.sync(spots);
  }

  /** Low quality presets keep the buildings still. */
  setAnimated(on: boolean, particles: boolean): void {
    this.life.setAnimated(on);
    this.life.setParticles(particles);
  }

  private createSite(item: QueueItem, started: boolean): Group {
    const g = new Group();
    g.userData = { started, item, q: item.q, r: item.r };
    const tile = getTile(this.map, item);
    // A new building's site covers its footprint; other works stand on their building.
    const on =
      item.kind === 'build'
        ? {
            q: item.q,
            r: item.r,
            rot: item.rot,
            ...(item.rot === undefined ? { cramped: true as const } : {}),
          }
        : (this.state?.buildings.find((b) => b.id === item.buildingId) ?? {
            q: item.q,
            r: item.r,
            cramped: true as const,
          });
    this.placeAt(g, item.buildingType, on, tile?.variant ?? 0.5);
    // Clearing a stump: only the stake, the stump itself is the site.
    if (!started || item.kind === 'clear') {
      const stake = new Mesh(stakeGeometry(), this.material);
      stake.position.set(0.25, 0, 0.25);
      stake.castShadow = true;
      g.add(stake);
    } else {
      const scaffold = new Mesh(scaffoldGeometry(), this.material);
      scaffold.castShadow = true;
      g.add(scaffold);
      if (item.kind === 'build') {
        const ghost = new Mesh(buildingGeometry(item.buildingType, 1), this.ghostMaterial);
        ghost.name = 'ghost';
        ghost.scale.set(1, 0.05, 1);
        g.add(ghost);
      }
    }
    this.group.add(g);
    return g;
  }

  /** The particle pool of the living buildings (chantier 16: the waking land uses it too). */
  get particles(): Particles {
    return this.life.particles;
  }

  /** Celebration when a construction completes. */
  celebrate(buildingId: string, q: number, r: number): void {
    const mesh = this.meshes.get(buildingId);
    if (mesh) this.pops.push({ object: mesh, t: 0 });
    this.burst(q, r);
  }

  /** Sparkle burst above a tile (constructions, hatching). */
  burst(q: number, r: number): void {
    const p = worldPosition({ q, r });
    const origin = new Vector3(p.x, this.baseY(q, r) + 0.4, p.z);
    const velocities = Array.from({ length: SPARKS }, (_, i) => {
      const a = (i / SPARKS) * Math.PI * 2;
      return new Vector3(Math.cos(a) * 1.4, 2.4 + (i % 3) * 0.6, Math.sin(a) * 1.4);
    });
    this.bursts.push({ origin, velocities, t: 0 });
    if (this.bursts.length > 4) this.bursts.shift();
  }

  /** Demolition: the building sinks and crumbles in a puff of dust, then disappears. */
  private collapse(object: Object3D): void {
    object.userData.buildingId = null;
    object.traverse((o) => (o.castShadow = false));
    const origin = object.position.clone();
    const dust = Array.from({ length: DUST }, (_, i) => {
      const a = (i / DUST) * Math.PI * 2 + (i % 2) * 0.3;
      const speed = 0.5 + (i % 4) * 0.18;
      return new Vector3(Math.cos(a) * speed, 0.25 + (i % 3) * 0.2, Math.sin(a) * speed);
    });
    const debris = Array.from({ length: DEBRIS }, (_, i) => {
      const a = (i / DEBRIS) * Math.PI * 2 + 0.2;
      return new Vector3(Math.cos(a) * 1.1, 2 + (i % 3) * 0.5, Math.sin(a) * 1.1);
    });
    this.collapses.push({ object, origin, dust, debris, t: 0 });
    if (this.collapses.length > 3) this.endCollapse(this.collapses.shift()!);
  }

  private endCollapse(c: Collapse): void {
    this.group.remove(c.object);
    this.onChanged();
  }

  /** World position of a building or site (for villagers walking to it). */
  anchor(q: number, r: number, out = new Vector3()): Vector3 {
    const p = worldPosition({ q, r });
    return out.set(p.x, this.baseY(q, r), p.z);
  }

  update(dt: number, now: number): void {
    this.life.update(dt);
    this.collected.update(dt);
    // Rising ghost on active construction sites.
    if (this.state) {
      for (const site of this.sites.values()) {
        const item = site.userData.item as QueueItem;
        if (item.startedAt === null) continue;
        const progress = Math.min(1, Math.max(0, (now - item.startedAt) / item.durationMs));
        const ghost = site.getObjectByName('ghost');
        if (ghost) ghost.scale.set(0.9, 0.05 + 0.95 * progress, 0.9);
        site.children[0]!.position.y = Math.sin(now / 160) * 0.004;
      }
    }

    // Bouncy scale pop.
    this.pops = this.pops.filter((p) => {
      p.t += dt;
      const k = Math.min(1, p.t / 0.7);
      const s = 1 + Math.sin(k * Math.PI * 2.5) * 0.18 * (1 - k);
      p.object.scale.set(s, 0.6 + 0.4 * Math.min(1, k * 3) + (s - 1), s);
      if (k >= 1) p.object.scale.set(1, 1, 1);
      return k < 1;
    });

    // Sparkles.
    const tmp = new Matrix4();
    let n = 0;
    this.bursts = this.bursts.filter((b) => {
      b.t += dt;
      if (b.t > 1.2) return false;
      const fade = 1 - b.t / 1.2;
      for (const v of b.velocities) {
        const x = b.origin.x + v.x * b.t;
        const y = b.origin.y + v.y * b.t - 2.8 * b.t * b.t;
        const z = b.origin.z + v.z * b.t;
        tmp.makeScale(fade, fade, fade).setPosition(x, y, z);
        if (n < this.sparks.instanceMatrix.count) this.sparks.setMatrixAt(n++, tmp);
      }
      return true;
    });
    this.sparks.count = n;
    if (n > 0) this.sparks.instanceMatrix.needsUpdate = true;

    // Demolitions: sink + dust cloud + debris.
    let d = 0;
    this.collapses = this.collapses.filter((c) => {
      c.t += dt;
      const k = Math.min(1, c.t / COLLAPSE_S);
      if (k >= 1) {
        this.endCollapse(c);
        return false;
      }
      const sink = Math.min(1, c.t / 0.6);
      c.object.scale.set(1 + sink * 0.12, Math.max(0.02, 1 - sink), 1 + sink * 0.12);
      c.object.position.y = c.origin.y - sink * 0.15;
      c.object.rotation.z = Math.sin(c.t * 30) * 0.03 * (1 - sink);
      for (const v of c.dust) {
        const grow = 0.6 + k * 2.2;
        const s = grow * (1 - k);
        tmp
          .makeScale(s, s * 0.8, s)
          .setPosition(
            c.origin.x + v.x * (1 - Math.exp(-c.t * 2.5)) * 1.1,
            c.origin.y + 0.15 + v.y * c.t,
            c.origin.z + v.z * (1 - Math.exp(-c.t * 2.5)) * 1.1,
          );
        this.dust.setMatrixAt(d++, tmp);
      }
      for (const v of c.debris) {
        const t = Math.min(c.t, 0.9);
        const y = Math.max(0, 0.3 + v.y * t - 6 * t * t);
        const s = 0.55 * (1 - k * 0.6);
        tmp
          .makeScale(s, s, s)
          .setPosition(c.origin.x + v.x * t, c.origin.y + y, c.origin.z + v.z * t);
        this.dust.setMatrixAt(d++, tmp);
      }
      return true;
    });
    this.dust.count = d;
    if (this.dust.count > 0) this.dust.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.material.dispose();
    this.ghostMaterial.dispose();
    this.life.dispose();
    this.badges.dispose();
    this.signs.dispose();
    this.windows.dispose();
    this.collected.dispose();
    this.sparks.geometry.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as MeshStandardMaterial).dispose();
    (this.sparks.material as MeshBasicMaterial).dispose();
  }
}

/** Buildings where kiwis sleep (a bed) or work (a post, a class), in state order. */
function litBuildings(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const bed of bedsOf(state).values()) if (bed.buildingId) ids.add(bed.buildingId);
  for (const v of state.villagers) {
    if (v.job.kind === 'work') ids.add(v.job.buildingId);
    else if (v.job.kind === 'train') ids.add(v.job.schoolId);
  }
  return ids;
}
