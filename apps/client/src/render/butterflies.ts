import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { createRng, isBank, type FaceMap } from '@kiwar/shared';
import { seasonUniforms } from './seasonLook';
import { worldPosition } from './terrain';

/** At most this many butterflies on a face (one per few banks). */
const MAX = 36;
const COLORS = ['#ffd95a', '#f5a3c7', '#fff3d6', '#c9a6f0', '#ff9a5a'];

/** Two triangles hinged on the body (+x and −x wings), flapped by scaling x. */
function wingsGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  // prettier-ignore
  g.setAttribute('position', new Float32BufferAttribute([
    0, 0, -0.03, 0.11, 0, -0.07, 0.09, 0, 0.06,
    0, 0, -0.03, -0.09, 0, 0.06, -0.11, 0, -0.07,
  ], 3));
  g.computeVertexNormals();
  return g;
}

interface Flyer {
  x: number;
  z: number;
  y: number;
  radius: number;
  speed: number;
  phase: number;
}

/**
 * Chantier 45: butterflies fluttering over the fertile banks of the juice, by day and out of
 * winter. Cosmetic: they move only when frames are drawn and never wake the loop.
 */
export class ButterfliesView {
  readonly mesh: InstancedMesh;
  private readonly flyers: Flyer[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(map: FaceMap) {
    const rng = createRng(`${map.seed}/${map.face}/butterflies`);
    const banks = map.tiles.filter((t) => isBank(map, t));
    const count = Math.min(MAX, Math.round(banks.length / 4));
    const material = new MeshBasicMaterial({ side: DoubleSide, fog: true });
    this.mesh = new InstancedMesh(wingsGeometry(), material, Math.max(1, count));
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < count; i++) {
      const tile = banks[Math.floor(rng.next() * banks.length)]!;
      const p = worldPosition(tile);
      this.flyers.push({
        x: p.x,
        z: p.z,
        y: tile.height + rng.range(0.35, 0.7),
        radius: rng.range(0.25, 0.6),
        speed: rng.range(0.35, 0.7) * (rng.chance(0.5) ? 1 : -1),
        phase: rng.range(0, Math.PI * 2),
      });
      this.mesh.setColorAt(i, new Color(COLORS[i % COLORS.length]!));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = count > 0;
  }

  update(time: number, daylight: number): void {
    const out = daylight < 0.45 || seasonUniforms.uSnow.value > 0.3;
    this.mesh.visible = !out && this.flyers.length > 0;
    if (!this.mesh.visible) return;
    this.flyers.forEach((f, i) => {
      const a = f.phase + time * f.speed;
      // A loop with a wobble, heading along its path.
      this.pos.set(
        f.x + Math.cos(a) * f.radius + Math.sin(a * 2.3) * 0.08,
        f.y + Math.sin(time * 1.7 + f.phase) * 0.12,
        f.z + Math.sin(a) * f.radius * 0.8,
      );
      this.q.setFromAxisAngle(this.up, -a - (f.speed > 0 ? 0 : Math.PI));
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(time * 14 + f.phase));
      this.scale.set(flap, 1, 1);
      this.m.compose(this.pos, this.q, this.scale);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
