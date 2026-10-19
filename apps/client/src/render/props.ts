import type { BufferGeometry } from 'three';
import {
  Color,
  ConeGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { withSeasonLook } from './seasonLook';
import { createRng, hexKey, type FaceMap, type HexKey, type Rng, type Tile } from '@kiwar/shared';
import { DOME_TOP, worldPosition } from './terrain';

interface PropInstance {
  matrix: Matrix4;
  color: Color;
}

/** A batch of instances sharing one geometry and material (one draw call). */
class PropBatch {
  readonly items: { tile: HexKey | null; inst: PropInstance }[] = [];
  mesh: InstancedMesh | null = null;
  constructor(
    readonly geometry: BufferGeometry,
    readonly material: MeshStandardMaterial,
    readonly castShadow = true,
  ) {}

  add(tile: HexKey | null, matrix: Matrix4, color: Color): void {
    this.items.push({ tile, inst: { matrix, color } });
  }

  build(): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, Math.max(1, this.items.length));
    mesh.count = this.items.length;
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.inst.matrix);
      mesh.setColorAt(i, it.inst.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    return mesh;
  }

  /** Hides (scale 0) or restores the instances belonging to a tile. */
  setTileVisible(tile: HexKey, visible: boolean): void {
    if (!this.mesh) return;
    const zero = new Matrix4().makeScale(0, 0, 0);
    let changed = false;
    this.items.forEach((it, i) => {
      if (it.tile !== tile) return;
      this.mesh!.setMatrixAt(i, visible ? it.inst.matrix : zero);
      changed = true;
    });
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const up = new Vector3(0, 1, 0);
const tmpQ = new Quaternion();
const tmpE = new Euler();

function compose(pos: Vector3, rot: Euler, scale: Vector3): Matrix4 {
  return new Matrix4().compose(pos, tmpQ.setFromEuler(rot), scale);
}

/** Random point inside the hex top, away from the edges. */
function scatter(rng: Rng, tile: Tile, spread = 0.62): Vector3 {
  const p = worldPosition(tile);
  const a = rng.range(0, Math.PI * 2);
  const d = Math.sqrt(rng.next()) * spread;
  return new Vector3(p.x + Math.cos(a) * d, tile.height, p.z + Math.sin(a) * d);
}

function tint(base: string, rng: Rng, amount: number): Color {
  const c = new Color(base);
  c.offsetHSL(
    rng.range(-amount, amount) * 0.25,
    rng.range(-amount, amount) * 0.5,
    rng.range(-amount, amount),
  );
  return c;
}

/**
 * Decorative props that make each tile type readable at a glance: fluffy down tufts on
 * groves, glossy black seeds, pulp drops on the flesh, pebbles on rays and fur on the skin.
 * Everything is GPU instanced (a handful of draw calls for thousands of props).
 */
export class PropsView {
  readonly group = new Group();
  private readonly batches: PropBatch[] = [];

  constructor(map: FaceMap, density: number) {
    const rng = createRng(`${map.seed}/${map.face}/props`);
    const mat = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
      new MeshStandardMaterial({ flatShading: true, ...o });

    // Geometries are created once and shared by every instance.
    const tuftStem = new PropBatch(
      new ConeGeometry(0.09, 1, 5, 1).translate(0, 0.5, 0),
      mat({ roughness: 0.9 }),
    );
    const tuftPuff = new PropBatch(new IcosahedronGeometry(0.3, 0), mat({ roughness: 1 }));
    const seed = new PropBatch(
      new SphereGeometry(0.5, 7, 5),
      mat({ roughness: 0.18, metalness: 0.25, flatShading: false }),
    );
    const pulp = new PropBatch(
      new SphereGeometry(0.5, 6, 4),
      mat({ roughness: 0.55, flatShading: false }),
    );
    const blade = new PropBatch(
      new ConeGeometry(0.05, 1, 3, 1).translate(0, 0.5, 0),
      mat({ roughness: 0.8 }),
      false,
    );
    const pebble = new PropBatch(new IcosahedronGeometry(0.5, 0), mat({ roughness: 0.7 }));
    const fur = new PropBatch(
      new ConeGeometry(0.07, 1, 4, 1).translate(0, 0.5, 0),
      mat({ roughness: 1 }),
    );
    const domeFur = new PropBatch(
      new ConeGeometry(0.16, 1, 4, 1).translate(0, 0.5, 0),
      mat({ roughness: 1 }),
      false,
    );
    this.batches.push(tuftStem, tuftPuff, seed, pulp, blade, pebble, fur, domeFur);
    // Down puffs and grass turn with the seasons; everything gets snow in winter.
    withSeasonLook(tuftPuff.material, { tint: 0.8, snow: 1 });
    withSeasonLook(blade.material, { tint: 1, snow: 0.6 });
    for (const b of [tuftStem, seed, pulp, pebble, fur])
      withSeasonLook(b.material, { tint: 0.3, snow: 0.8 });

    const count = (n: number) => {
      const scaled = n * density;
      const whole = Math.floor(scaled);
      return whole + (rng.next() < scaled - whole ? 1 : 0);
    };

    for (const tile of map.tiles) {
      const key = hexKey(tile);
      switch (tile.type) {
        case 'grove': {
          const n = count(3 + Math.floor(tile.variant * 3));
          for (let i = 0; i < n; i++) {
            const pos = scatter(rng, tile, 0.55);
            const h = rng.range(0.7, 1.35);
            const lean = new Euler(
              rng.range(-0.18, 0.18),
              rng.range(0, Math.PI * 2),
              rng.range(-0.18, 0.18),
            );
            tuftStem.add(key, compose(pos, lean, new Vector3(1, h, 1)), tint('#8b6a45', rng, 0.08));
            const top = new Vector3(0, h, 0).applyEuler(lean).add(pos);
            const s = rng.range(0.85, 1.35);
            tuftPuff.add(
              key,
              compose(
                top,
                new Euler(rng.next() * 3, rng.next() * 3, 0),
                new Vector3(s, s * 1.15, s),
              ),
              tint(rng.chance(0.5) ? '#d9c08f' : '#c6a774', rng, 0.08),
            );
          }
          break;
        }
        case 'seedRing': {
          const n = count(2 + Math.floor(tile.variant * 3));
          for (let i = 0; i < n; i++) {
            const pos = scatter(rng, tile, 0.5);
            pos.y += 0.04;
            // Kiwi seeds point outwards from the heart.
            const angle = Math.atan2(pos.z, pos.x);
            const rot = new Euler(0, -angle, rng.range(-0.25, 0.25), 'YXZ');
            const s = rng.range(0.85, 1.15);
            seed.add(
              key,
              compose(pos, rot, new Vector3(0.36 * s, 0.16 * s, 0.2 * s)),
              tint('#1f1612', rng, 0.03),
            );
          }
          break;
        }
        case 'flesh': {
          const n = count(tile.variant > 0.55 ? 2 : 1);
          for (let i = 0; i < n; i++) {
            const pos = scatter(rng, tile, 0.6);
            const angle = Math.atan2(pos.z, pos.x);
            const s = rng.range(0.7, 1.1);
            pulp.add(
              key,
              compose(pos, new Euler(0, -angle, 0), new Vector3(0.42 * s, 0.14 * s, 0.2 * s)),
              tint('#c8e57a', rng, 0.06),
            );
          }
          const blades = count(2);
          for (let i = 0; i < blades; i++) {
            const pos = scatter(rng, tile, 0.7);
            tmpE.set(rng.range(-0.3, 0.3), rng.next() * 6, rng.range(-0.3, 0.3));
            blade.add(
              key,
              compose(pos, tmpE.clone(), new Vector3(1, rng.range(0.18, 0.34), 1)),
              tint('#78b42c', rng, 0.08),
            );
          }
          break;
        }
        case 'ray': {
          if (rng.chance(0.55 * density)) {
            const pos = scatter(rng, tile, 0.55);
            const s = rng.range(0.1, 0.18);
            pebble.add(
              key,
              compose(pos, new Euler(rng.next(), rng.next(), 0), new Vector3(s, s * 0.6, s)),
              tint('#f8f4e2', rng, 0.04),
            );
          }
          break;
        }
        case 'skin': {
          const n = count(7);
          for (let i = 0; i < n; i++) {
            const pos = scatter(rng, tile, 0.75);
            // Fur leans outwards, away from the heart.
            const out = Math.atan2(pos.z, pos.x);
            const lean = rng.range(0.25, 0.7);
            const q = new Quaternion().setFromAxisAngle(
              new Vector3(-Math.sin(out), 0, Math.cos(out)),
              -lean,
            );
            const m = new Matrix4().compose(pos, q, new Vector3(1, rng.range(0.4, 0.9), 1));
            fur.add(key, m, tint('#6b4630', rng, 0.1));
          }
          break;
        }
        default:
          break;
      }
    }

    // Fur on the dome below the disc: strands pointing along the surface normal.
    const domeRadius = map.params.radius * Math.sqrt(3) + 0.9;
    const domeCount = Math.round(380 * density);
    for (let i = 0; i < domeCount; i++) {
      const theta = rng.range(0, Math.PI * 2);
      const phi = rng.range(0.08, Math.PI / 2 - 0.05); // from the rim (0) downwards
      const nx = Math.cos(theta) * Math.cos(phi);
      const ny = -Math.sin(phi);
      const nz = Math.sin(theta) * Math.cos(phi);
      const pos = new Vector3(
        nx * domeRadius * map.ellipse,
        DOME_TOP + ny * domeRadius * 0.55,
        (nz * domeRadius) / Math.sqrt(map.ellipse),
      );
      const normal = new Vector3(nx, ny * 1.4, nz).normalize();
      const q = new Quaternion().setFromUnitVectors(up, normal);
      domeFur.add(
        null,
        new Matrix4().compose(pos, q, new Vector3(1, rng.range(0.6, 1.3), 1)),
        tint('#5e3d27', rng, 0.1),
      );
    }

    for (const b of this.batches) if (b.items.length > 0) this.group.add(b.build());
  }

  /** Clears decorative props from a tile (e.g. when a building is placed on it). */
  setTileCleared(tile: { q: number; r: number }, cleared: boolean): void {
    const key = hexKey(tile);
    for (const b of this.batches) b.setTileVisible(key, !cleared);
  }

  dispose(): void {
    for (const b of this.batches) {
      b.geometry.dispose();
      b.material.dispose();
    }
  }
}
