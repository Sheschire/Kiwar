import type { BufferGeometry } from 'three';
import {
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  TetrahedronGeometry,
} from 'three';
import {
  getTile,
  hashSeed,
  type FaceMap,
  type GameState,
  type Obstacle,
  type ObstacleKind,
} from '@kiwar/shared';
import { worldPosition } from './terrain';

const SCALE: Record<ObstacleKind, number> = { stump: 1.5, rock: 1.45, wreck: 1.6 };

/** Stable pseudo-random numbers in [0, 1) for a tile (cosmetic variations). */
function noise(o: { q: number; r: number }, salt: number): number {
  return (hashSeed(`${o.q},${o.r}/${salt}`)[0] ?? 0) / 4294967296;
}

/**
 * Obstacles (chantier 08): stumps with their roots, heaps of grey rocks, and the dark cracked
 * wrecks meteorites leave behind (a faint glow still pulses inside). A few meshes each, sharing
 * geometries and materials; rebuilt only when the list changes.
 */
export class ObstaclesView {
  readonly group = new Group();
  private readonly items = new Map<string, Group>();
  private readonly geo = {
    trunk: new CylinderGeometry(0.2, 0.26, 0.28, 9),
    top: new CylinderGeometry(0.17, 0.17, 0.02, 9),
    root: new CylinderGeometry(0.03, 0.06, 0.32, 5),
    rock: new DodecahedronGeometry(0.22, 0),
    wreck: new IcosahedronGeometry(0.24, 0),
    shard: new TetrahedronGeometry(0.11, 0),
  } satisfies Record<string, BufferGeometry>;
  private readonly mat = {
    bark: new MeshStandardMaterial({ color: '#6e4a2c', roughness: 1, flatShading: true }),
    wood: new MeshStandardMaterial({ color: '#d8b27a', roughness: 0.9, flatShading: true }),
    rock: new MeshStandardMaterial({ color: '#8a8580', roughness: 0.95, flatShading: true }),
    moss: new MeshStandardMaterial({ color: '#6f8f3a', roughness: 1, flatShading: true }),
    wreck: new MeshStandardMaterial({
      color: '#2a2630',
      emissive: new Color('#3ad0a0'),
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.6,
      flatShading: true,
    }),
    metal: new MeshStandardMaterial({
      color: '#6d7480',
      metalness: 0.7,
      roughness: 0.4,
      flatShading: true,
    }),
  };
  private signature = '';
  private time = 0;

  constructor(
    private readonly map: FaceMap,
    private readonly onChanged: () => void = () => {},
  ) {}

  sync(state: Pick<GameState, 'obstacles'>): void {
    const sig = state.obstacles.map((o) => o.id).join(';');
    if (sig === this.signature) return;
    this.signature = sig;
    const alive = new Set(state.obstacles.map((o) => o.id));
    for (const [id, g] of this.items) {
      if (alive.has(id)) continue;
      this.group.remove(g);
      this.items.delete(id);
    }
    for (const o of state.obstacles) if (!this.items.has(o.id)) this.add(o);
    this.onChanged();
  }

  private add(o: Pick<Obstacle, 'id' | 'kind' | 'q' | 'r'>): void {
    const g = new Group();
    const p = worldPosition(o);
    g.position.set(p.x, getTile(this.map, o)?.height ?? 0, p.z);
    g.rotation.y = noise(o, 1) * Math.PI * 2;
    g.scale.setScalar(SCALE[o.kind]);
    this.build(g, o.kind, o);
    g.traverse((m) => {
      if (m instanceof Mesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.group.add(g);
    this.items.set(o.id, g);
  }

  private part(g: Group, geo: BufferGeometry, mat: MeshStandardMaterial): Mesh {
    const m = new Mesh(geo, mat);
    g.add(m);
    return m;
  }

  private build(g: Group, kind: ObstacleKind, o: { q: number; r: number }): void {
    if (kind === 'stump') {
      const h = 0.85 + noise(o, 2) * 0.4;
      const trunk = this.part(g, this.geo.trunk, this.mat.bark);
      trunk.scale.set(1, h, 1);
      trunk.position.y = 0.14 * h;
      const top = this.part(g, this.geo.top, this.mat.wood);
      top.position.y = 0.28 * h + 0.005;
      for (let i = 0; i < 4; i++) {
        const root = this.part(g, this.geo.root, this.mat.bark);
        const a = (i / 4) * Math.PI * 2 + noise(o, 10 + i);
        root.position.set(Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24);
        root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      }
      if (noise(o, 3) > 0.5) {
        const moss = this.part(g, this.geo.rock, this.mat.moss);
        moss.scale.set(0.35, 0.18, 0.35);
        moss.position.set(0.12, 0.28 * h, 0.04);
      }
      return;
    }
    if (kind === 'rock') {
      const n = 2 + Math.floor(noise(o, 2) * 2);
      for (let i = 0; i < n; i++) {
        const rock = this.part(g, this.geo.rock, this.mat.rock);
        const s = i === 0 ? 1.25 : 0.55 + noise(o, 20 + i) * 0.35;
        const a = noise(o, 30 + i) * Math.PI * 2;
        const d = i === 0 ? 0 : 0.26;
        rock.scale.set(s, s * (0.75 + noise(o, 40 + i) * 0.3), s);
        rock.position.set(Math.cos(a) * d, 0.16 * s, Math.sin(a) * d);
        rock.rotation.set(noise(o, 50 + i) * 3, noise(o, 60 + i) * 3, 0);
      }
      const moss = this.part(g, this.geo.rock, this.mat.moss);
      moss.scale.set(0.5, 0.12, 0.45);
      moss.position.set(-0.05, 0.38, 0.02);
      return;
    }
    // Wreck: the cracked core, half sunk, with metal shards around it.
    for (const side of [-1, 1]) {
      const half = this.part(g, this.geo.wreck, this.mat.wreck);
      half.scale.set(0.7, 0.85, 1);
      half.position.set(side * 0.1, 0.13, 0);
      half.rotation.z = side * 0.35;
    }
    for (let i = 0; i < 4; i++) {
      const shard = this.part(g, this.geo.shard, this.mat.metal);
      const a = (i / 4) * Math.PI * 2 + noise(o, 70 + i);
      shard.position.set(Math.cos(a) * 0.34, 0.04, Math.sin(a) * 0.34);
      shard.rotation.set(noise(o, 80 + i) * 3, a, noise(o, 90 + i) * 3);
    }
  }

  /** The glow inside the wrecks pulses slowly. */
  update(dt: number): void {
    this.time += dt;
    this.mat.wreck.emissiveIntensity = 0.14 + 0.08 * Math.sin(this.time * 1.6);
  }

  dispose(): void {
    for (const geo of Object.values(this.geo)) geo.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    this.items.clear();
  }
}
