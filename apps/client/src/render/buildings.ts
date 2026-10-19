import type { Object3D } from 'three';
import {
  AdditiveBlending,
  Color,
  Group,
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

interface Pop {
  object: Object3D;
  t: number;
}

interface Burst {
  origin: Vector3;
  velocities: Vector3[];
  t: number;
}

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
  private readonly sparks: InstancedMesh;
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
    const sig =
      state.buildings.map((b) => `${b.id}:${b.level}`).join(',') +
      '|' +
      state.queue.map((i) => `${i.id}:${i.startedAt ?? '-'}`).join(',');
    if (sig === this.signature) return;
    this.signature = sig;

    const seen = new Set<string>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const existing = this.meshes.get(b.id);
      if (existing && existing.userData.level === b.level) continue;
      if (existing) {
        existing.geometry = buildingGeometry(b.type, b.level);
        existing.userData.level = b.level;
      } else {
        this.addBuildingMesh(b);
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        this.meshes.delete(id);
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

  private addBuildingMesh(b: Building): Mesh {
    const mesh = new Mesh(buildingGeometry(b.type, b.level), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { level: b.level, buildingId: b.id, q: b.q, r: b.r };
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
    const p = worldPosition({ q, r });
    const origin = new Vector3(p.x, this.baseY(q, r) + 0.4, p.z);
    const velocities = Array.from({ length: SPARKS }, (_, i) => {
      const a = (i / SPARKS) * Math.PI * 2;
      return new Vector3(Math.cos(a) * 1.4, 2.4 + (i % 3) * 0.6, Math.sin(a) * 1.4);
    });
    this.bursts.push({ origin, velocities, t: 0 });
    if (this.bursts.length > 4) this.bursts.shift();
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
  }

  dispose(): void {
    this.material.dispose();
    this.ghostMaterial.dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as MeshBasicMaterial).dispose();
  }
}
