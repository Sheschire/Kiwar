import type { Object3D } from 'three';
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
  getTile,
  type Building,
  type FaceMap,
  type GameState,
  type QueueItem,
} from '@kiwar/shared';
import { buildingGeometry, scaffoldGeometry, stakeGeometry } from './buildingModels';
import { worldPosition } from './terrain';
import { WATER_LEVEL } from './water';

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
  private readonly meshes = new Map<string, Mesh>();
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
  }

  /** Ground height for a building on this tile (wells stand in the juice). */
  private baseY(q: number, r: number): number {
    const tile = getTile(this.map, { q, r });
    if (!tile) return 0;
    return tile.type === 'juice' ? tile.height + WATER_LEVEL - 0.08 : tile.height;
  }

  private placeAt(obj: Object3D, q: number, r: number, variant = 0): void {
    const p = worldPosition({ q, r });
    obj.position.set(p.x, this.baseY(q, r), p.z);
    // Buildings face roughly towards the heart, with a little variation.
    obj.rotation.y = Math.atan2(p.x, p.z) + Math.PI + (variant - 0.5) * 0.5;
  }

  /** Synchronises meshes with the game state (cheap when nothing changed). */
  sync(state: GameState): void {
    this.state = state;
    const away = (id: string) =>
      state.expeditions.some((e) => e.launchpadId === id && e.status !== 'done');
    const sig =
      state.buildings.map((b) => `${b.id}:${b.level}:${away(b.id) ? 1 : 0}`).join(',') +
      '|' +
      state.queue.map((i) => `${i.id}:${i.startedAt ?? '-'}`).join(',');
    if (sig === this.signature) return;
    this.signature = sig;

    const seen = new Set<string>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const existing = this.meshes.get(b.id);
      const shipAway = away(b.id);
      if (existing && existing.userData.level === b.level && existing.userData.away === shipAway)
        continue;
      if (existing) {
        existing.geometry = buildingGeometry(b.type, b.level, shipAway);
        existing.userData.level = b.level;
        existing.userData.away = shipAway;
      } else {
        this.addBuildingMesh(b, shipAway);
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.meshes.delete(id);
        this.collapse(mesh);
      }
    }

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

  private addBuildingMesh(b: Building, shipAway: boolean): Mesh {
    const mesh = new Mesh(buildingGeometry(b.type, b.level, shipAway), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { level: b.level, away: shipAway, buildingId: b.id, q: b.q, r: b.r };
    const tile = getTile(this.map, b);
    this.placeAt(mesh, b.q, b.r, tile?.variant ?? 0.5);
    this.meshes.set(b.id, mesh);
    this.group.add(mesh);
    return mesh;
  }

  private createSite(item: QueueItem, started: boolean): Group {
    const g = new Group();
    g.userData = { started, item, q: item.q, r: item.r };
    const tile = getTile(this.map, item);
    this.placeAt(g, item.q, item.r, tile?.variant ?? 0.5);
    if (!started) {
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
    object.userData.buildingId = null; // no longer pickable
    object.castShadow = false;
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
    this.sparks.geometry.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as MeshStandardMaterial).dispose();
    (this.sparks.material as MeshBasicMaterial).dispose();
  }
}
