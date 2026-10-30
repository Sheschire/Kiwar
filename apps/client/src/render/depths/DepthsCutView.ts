import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Plane,
  SRGBColorSpace,
  Vector3,
  type Raycaster,
} from 'three';
import {
  depthsMapOf,
  type DepthRoom,
  type DepthsMap,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { domeShape, type DomeShape } from '../terrain';
import { fleshOf, ROOM_T, roomPoint, type CutPoint } from './cutLayout';
import { cutKnowledge, cutSignature, paintCut, type CutKnowledge } from './cutPaint';

/**
 * Chantier 49: the depths seen in a cut. A quarter of the skin dome opens like a slice of
 * fruit (the dome is clipped between two vertical half-planes through its axis) and its two
 * faces show the section: the layers, the passages dug, the rooms seen, the fog on the rest.
 * Built when the cut opens, freed when it closes: nothing is drawn or kept otherwise.
 */

/** Half-angle of the open quarter (each face turns this far from the camera's side). */
const OPEN_ANGLE = 1.05;
/** Seconds to open or close. */
const OPEN_S = 0.9;
const ARC = 40;

/** A face of the cut: the left half of the section (`-1`) or the right one (`1`). */
interface Face {
  side: -1 | 1;
  group: Group;
  mesh: Mesh;
}

export class DepthsCutView {
  readonly group = new Group();
  readonly shape: DomeShape;
  private readonly faces: Face[];
  private readonly material: MeshStandardMaterial;
  private readonly texture: CanvasTexture;
  private readonly canvas = document.createElement('canvas');
  private readonly clip = [new Plane(), new Plane()];
  private signature = '';
  private seed = '';
  private depths: DepthsMap | null = null;
  knowledge: CutKnowledge | null = null;
  /** 0 closed … 1 open. */
  private openness = 0;
  private opening = true;
  /** Azimuth the quarter opens towards (the camera's side). */
  azimuth = 0;

  constructor(
    readonly map: FaceMap,
    private readonly setClip: (planes: Plane[] | null) => void,
    private holes = false,
  ) {
    this.shape = domeShape(map);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new MeshStandardMaterial({
      map: this.texture,
      emissive: new Color('#ffffff'),
      emissiveMap: this.texture,
      emissiveIntensity: 0.32,
      roughness: 0.92,
      alphaTest: 0.5,
      side: DoubleSide,
    });
    this.faces = ([-1, 1] as const).map((side) => {
      const group = new Group();
      const mesh = new Mesh(quarterGeometry(side), this.material);
      mesh.userData.side = side;
      group.add(mesh);
      group.position.y = this.shape.top;
      this.group.add(group);
      return { side, group, mesh };
    });
  }

  /** Opens the quarter towards `azimuth` (the camera's side, as camera-controls counts it). */
  open(azimuth: number): void {
    this.azimuth = azimuth;
    this.opening = true;
    this.place();
  }

  /** Starts closing; `closed` turns true once the fruit is whole again. */
  close(): void {
    this.opening = false;
  }

  get closed(): boolean {
    return !this.opening && this.openness <= 0;
  }

  /** The quarter is moving (a sign of life for the frame loop). */
  get moving(): boolean {
    return this.opening ? this.openness < 1 : this.openness > 0;
  }

  /** Quality: low paints the rooms as discs; medium and high hollow them out. */
  setHoles(on: boolean): void {
    if (on === this.holes) return;
    this.holes = on;
    this.signature = '';
  }

  /** Repaints the section when what we know of the depths changed (cheap otherwise). */
  sync(state: GameState): void {
    this.depths = fleshOf(depthsMapOf(state));
    this.seed = `${state.seed}/${state.face}`;
    const k = cutKnowledge(this.depths, state.depths);
    this.knowledge = k;
    const sig = cutSignature(k, this.holes);
    if (sig === this.signature) return;
    this.signature = sig;
    paintCut(this.canvas, this.depths, k, {
      aspect: this.aspect(),
      seed: this.seed,
      holes: this.holes,
    });
    this.texture.needsUpdate = true;
  }

  /** The face's half-width over the dome's depth (at the open angle, the right face). */
  aspect(): number {
    return this.halfWidth(this.azimuth + OPEN_ANGLE) / this.shape.ay;
  }

  update(dt: number): void {
    const before = this.openness;
    this.openness = Math.max(0, Math.min(1, this.openness + (this.opening ? dt : -dt) / OPEN_S));
    if (this.openness !== before) this.place();
  }

  /** Half-width of the dome along the horizontal direction at azimuth `a`. */
  private halfWidth(a: number): number {
    const x = Math.sin(a);
    const z = Math.cos(a);
    const { ax, az } = this.shape;
    return 1 / Math.sqrt((x * x) / (ax * ax) + (z * z) / (az * az));
  }

  /** Current half-angle of the quarter (eased). */
  private get angle(): number {
    const u = this.openness;
    return OPEN_ANGLE * u * u * (3 - 2 * u);
  }

  /** Turns the faces and the clipping planes to the current opening. */
  private place(): void {
    const h = this.angle;
    for (const f of this.faces) {
      // Local +x runs along the section towards +s, local +z faces into the open quarter.
      const a = this.azimuth + f.side * h;
      f.group.rotation.y = a - (f.side * Math.PI) / 2;
      f.mesh.scale.set(this.halfWidth(a), this.shape.ay, 1);
      f.group.visible = h > 0.002;
    }
    // The wedge between the faces is removed from the dome: every point on the camera's side
    // of both planes (clipIntersection keeps the rest).
    const nR = new Vector3(0, 0, 1).applyAxisAngle(UP, this.azimuth + h - Math.PI / 2);
    const nL = new Vector3(0, 0, 1).applyAxisAngle(UP, this.azimuth - h + Math.PI / 2);
    this.clip[0]!.set(nR.negate(), 0);
    this.clip[1]!.set(nL.negate(), 0);
    this.setClip(h > 0.002 ? this.clip : null);
  }

  /** World position of a point of the section (on its face), in `out`. */
  worldOf(p: CutPoint, out: Vector3, forward = 0): Vector3 {
    const f = this.faces[p.s < 0 ? 0 : 1]!;
    out.set(p.s * f.mesh.scale.x, -p.t * this.shape.ay, forward);
    f.group.updateMatrixWorld();
    return out.applyMatrix4(f.group.matrixWorld);
  }

  /** The direction a face looks (into the open quarter), for a point of the section. */
  normalOf(p: CutPoint, out: Vector3): Vector3 {
    const f = this.faces[p.s < 0 ? 0 : 1]!;
    return out.set(0, 0, 1).applyAxisAngle(UP, f.group.rotation.y);
  }

  /** Radius of a room in world units. */
  get roomRadius(): number {
    return ROOM_T * this.shape.ay;
  }

  /** The middle of the cut and what must fit on screen (the camera's framing). */
  frame(out: Vector3): number {
    out.set(0, this.shape.top - this.shape.ay * 0.5, 0);
    const w = this.halfWidth(this.azimuth + OPEN_ANGLE);
    return Math.max(w * Math.sin(OPEN_ANGLE) * 1.05, this.shape.ay * 0.75);
  }

  /** The room under a ray (a tap on the cut), or null. */
  pickRoom(ray: Raycaster): DepthRoom | null {
    if (!this.depths || this.openness < 1) return null;
    const hits = ray.intersectObjects(
      this.faces.map((f) => f.mesh),
      false,
    );
    const hit = hits[0];
    if (!hit) return null;
    let best: DepthRoom | null = null;
    let bestD = this.roomRadius * 1.6;
    const p = new Vector3();
    for (const r of this.depths.rooms) {
      const d = this.worldOf(roomPoint(this.depths, r), p).distanceTo(hit.point);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  dispose(): void {
    this.setClip(null);
    for (const f of this.faces) f.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

const UP = new Vector3(0, 1, 0);

/**
 * A quarter of the unit ellipse in the face's frame: x from 0 (the axis) out to `side`, y from
 * 0 (the top of the dome) down to −1. UVs map the section's canvas: x → s, −y → t.
 */
function quarterGeometry(side: -1 | 1): BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 1];
  const index: number[] = [];
  for (let i = 0; i <= ARC; i++) {
    const a = (i / ARC) * (Math.PI / 2);
    const x = side * Math.cos(a);
    const y = -Math.sin(a);
    positions.push(x, y, 0);
    uvs.push((x + 1) / 2, 1 + y);
  }
  for (let i = 1; i <= ARC; i++) index.push(0, i, i + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
