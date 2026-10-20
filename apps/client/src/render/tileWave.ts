import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { hexDistance, type Hex, type Tile } from '@kiwar/shared';
import { HEX_VISUAL_RADIUS, worldPosition } from './terrain';
import { WATER_LEVEL } from './water';
import type { Particles } from './particles';

/** Instances shared by every running wave (a level-6 catchment is 37 tiles). */
const MAX_TILES = 96;
const MAX_WAVES = 3;
/** Seconds between two rings of tiles, and how long a tile glows. */
const STEP_S = 0.22;
const GLOW_S = 1.1;
/** World units per second of the expanding ring. */
const RING_SPEED = HEX_VISUAL_RADIUS * 2 * (1 / STEP_S);

interface WaveTile {
  x: number;
  y: number;
  z: number;
  delay: number;
  color: Color;
  sprouted: boolean;
}

interface Wave {
  t: number;
  tiles: WaveTile[];
  ring: Mesh;
  reach: number;
}

function filledHex(radius: number): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const b = (Math.PI / 180) * (60 * (i + 1) - 30);
    positions.push(0, 0, 0, Math.cos(b) * radius, 0, Math.sin(b) * radius);
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return g;
}

/**
 * Chantier 16: when a construction ends, a ring runs out of the building and the tiles of its
 * catchment (or its range) light up one ring after the other, with a few sprouts: the building
 * acts on the land around it. One instanced mesh for the tiles, a ring mesh per running wave.
 */
export class TileWaves {
  readonly group = new Group();
  private readonly tiles: InstancedMesh;
  private readonly waves: Wave[] = [];
  private readonly ringMaterial = new MeshBasicMaterial({
    color: '#fff3c4',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  private readonly ringGeometry = new RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  private readonly m = new Matrix4();
  private readonly c = new Color();
  private readonly sprout = new Vector3();

  constructor(private readonly particles: Particles | null) {
    this.tiles = new InstancedMesh(
      filledHex(HEX_VISUAL_RADIUS * 0.9),
      new MeshBasicMaterial({
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
      MAX_TILES,
    );
    this.tiles.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_TILES * 3), 3);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 5;
    this.group.add(this.tiles);
  }

  /** Starts a wave from `origin` over `tiles` (each with its colour). */
  start(origin: Tile, tiles: readonly Tile[], colors: readonly string[]): void {
    if (tiles.length === 0) return;
    if (this.waves.length >= MAX_WAVES) this.end(this.waves.shift()!);
    const o = worldPosition(origin);
    const ring = new Mesh(this.ringGeometry, this.ringMaterial.clone());
    ring.position.set(o.x, origin.height + 0.06, o.z);
    ring.renderOrder = 5;
    this.group.add(ring);
    let reach = 0;
    const list = tiles.map((t, i) => {
      const p = worldPosition(t);
      const d = hexDistance(origin as Hex, t);
      reach = Math.max(reach, d);
      return {
        x: p.x,
        y: t.height + (t.type === 'juice' ? WATER_LEVEL : 0) + 0.05,
        z: p.z,
        delay: 0.15 + d * STEP_S,
        color: new Color(colors[i] ?? '#5fd83e'),
        sprouted: false,
      };
    });
    this.waves.push({ t: 0, tiles: list, ring, reach });
  }

  private end(w: Wave): void {
    this.group.remove(w.ring);
    (w.ring.material as MeshBasicMaterial).dispose();
  }

  get active(): boolean {
    return this.waves.length > 0;
  }

  update(dt: number): void {
    if (this.waves.length === 0) return;
    let n = 0;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.t += dt;
      const ringLife = 0.15 + (w.reach + 0.6) * STEP_S;
      const k = Math.min(1, w.t / ringLife);
      const radius = 0.3 + w.t * RING_SPEED;
      w.ring.scale.set(radius, 1, radius);
      (w.ring.material as MeshBasicMaterial).opacity = 0.9 * (1 - k);
      w.ring.visible = k < 1;
      let alive = k < 1;
      for (const tile of w.tiles) {
        const local = (w.t - tile.delay) / GLOW_S;
        if (local < 1) alive = true;
        if (local <= 0 || local >= 1 || n >= MAX_TILES) continue;
        // Quick rise, slow fade; the tile swells a little as the wave passes.
        const glow = local < 0.15 ? local / 0.15 : (1 - local) / 0.85;
        const s = 0.85 + 0.2 * Math.sin(Math.min(1, local * 2) * Math.PI);
        this.m.makeScale(s, 1, s).setPosition(tile.x, tile.y, tile.z);
        this.tiles.setMatrixAt(n, this.m);
        this.tiles.setColorAt(n, this.c.copy(tile.color).multiplyScalar(glow * 0.42));
        n++;
        if (!tile.sprouted) {
          tile.sprouted = true;
          this.particles?.emit('pulp', this.sprout.set(tile.x, tile.y + 0.05, tile.z), 3);
          this.particles?.emit('gold', this.sprout.set(tile.x, tile.y + 0.1, tile.z), 2);
        }
      }
      if (!alive) {
        this.end(w);
        this.waves.splice(i, 1);
      }
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const w of this.waves) this.end(w);
    this.waves.length = 0;
    this.tiles.geometry.dispose();
    (this.tiles.material as MeshBasicMaterial).dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
