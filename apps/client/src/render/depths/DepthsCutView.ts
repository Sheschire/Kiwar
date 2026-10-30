import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Raycaster,
} from 'three';
import {
  ageOf,
  DEPTHS,
  isLocule,
  depthsMapOf,
  type DepthRoom,
  type DepthsMap,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { domeShape, type DomeShape } from '../terrain';
import { CUT_ASPECT, ROOM_T, roomPoint, roomRadius, type CutPoint } from './cutLayout';
import { cutKnowledge, cutSignature, KIND_TINTS, paintCut, type CutKnowledge } from './cutPaint';
import { CutLife } from './cutLife';

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
/** Most hollows (flesh rooms) and lanterns drawn. */
const MAX_HOLLOWS = 24;
const MAX_LANTERNS = 96;
/** Lanterns along a lit passage, one every this much of the section. */
const LANTERN_STEP = 0.07;
const HOLLOW = new Color('#3c2a19');
const GALLERY = new Color('#7a5530');

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
  private readonly maskCanvas = document.createElement('canvas');
  private readonly mask: CanvasTexture;
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
  /** Chantier 49 (part 2): the rooms hollowed out in 3D, their floors, the lanterns. */
  private readonly hollows: InstancedMesh;
  private readonly floors: InstancedMesh;
  private readonly lanterns: InstancedMesh;
  private hollowRooms: DepthRoom[] = [];
  private lanternSpots: CutPoint[] = [];
  private elapsed = 0;
  /** The kiwis down there: miners, carts, delves on their way. */
  readonly life: CutLife;
  private state: GameState | null = null;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();

  constructor(
    readonly map: FaceMap,
    private readonly setClip: (planes: Plane[] | null) => void,
    private holes = false,
  ) {
    this.shape = domeShape(map);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mask = new CanvasTexture(this.maskCanvas);
    this.material = new MeshStandardMaterial({
      map: this.texture,
      emissive: new Color('#ffffff'),
      emissiveMap: this.texture,
      emissiveIntensity: 0.32,
      roughness: 0.92,
      alphaMap: this.mask,
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
    // A warm glow of their own: the rooms read at night too (lanterns, the miners' lamps).
    const hollowMat = new MeshStandardMaterial({
      roughness: 1,
      side: BackSide,
      emissive: new Color('#3a2410'),
      emissiveIntensity: 0.6,
    });
    this.hollows = new InstancedMesh(
      new SphereGeometry(1, 20, 12, Math.PI, Math.PI),
      hollowMat,
      MAX_HOLLOWS,
    );
    this.hollows.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_HOLLOWS * 3), 3);
    this.floors = new InstancedMesh(
      new CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({
        color: '#6b4c2c',
        roughness: 1,
        emissive: new Color('#4a2e14'),
        emissiveIntensity: 0.6,
      }),
      MAX_HOLLOWS,
    );
    this.lanterns = new InstancedMesh(
      new SphereGeometry(1, 8, 6),
      new MeshBasicMaterial({
        color: '#ffc861',
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      MAX_LANTERNS,
    );
    for (const mesh of [this.hollows, this.floors, this.lanterns]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.life = new CutLife(this);
    this.group.add(this.life.group);
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
    this.state = state;
    this.depths = depthsMapOf(state);
    this.seed = `${state.seed}/${state.face}`;
    const k = cutKnowledge(this.depths, state.depths, ageOf(state) >= DEPTHS.locules.age);
    this.knowledge = k;
    const sig = cutSignature(k, this.holes);
    if (sig === this.signature) return;
    this.signature = sig;
    paintCut(this.canvas, this.depths, k, {
      seed: this.seed,
      holes: this.holes,
      mask: this.maskCanvas,
      resolution: this.holes ? 2 : 1,
    });
    this.texture.needsUpdate = true;
    this.mask.needsUpdate = true;
    this.listObjects(k);
    this.placeObjects();
  }

  /** The rooms to hollow out (known flesh rooms) and the lanterns of the lit passages. */
  private listObjects(k: CutKnowledge): void {
    const map = this.depths!;
    this.hollowRooms = this.holes
      ? map.rooms.filter((r) => !isLocule(r) && k.looks.get(r.id) !== 'fog').slice(0, MAX_HOLLOWS)
      : [];
    const spots: CutPoint[] = [];
    for (const l of k.lit) {
      let since = LANTERN_STEP / 2;
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1]!;
        const b = l.points[i]!;
        const d = Math.hypot((a.s - b.s) * CUT_ASPECT, a.t - b.t);
        since += d;
        if (since < LANTERN_STEP) continue;
        // Not inside a room (its own lantern hangs over its door).
        const inside = map.rooms.some((r) => {
          const q = roomPoint(map, r);
          return Math.hypot((q.s - b.s) * CUT_ASPECT, q.t - b.t) < roomRadius(r) * 1.4;
        });
        if (inside) continue;
        since = 0;
        // Hung a little above the floor of the passage.
        spots.push({ s: b.s, t: b.t - 0.012 });
      }
    }
    // One over each gallery's door.
    for (const r of map.rooms)
      if (k.looks.get(r.id) === 'gallery') {
        const p = roomPoint(map, r);
        spots.push({ s: p.s, t: p.t - roomRadius(r) * 1.25 });
      }
    this.lanternSpots = spots.slice(0, MAX_LANTERNS);
  }

  /** Instance matrices of the hollows, floors and lanterns at the current opening. */
  private placeObjects(): void {
    const map = this.depths;
    const k = this.knowledge;
    if (!map || !k) return;
    const c = new Color();
    this.hollowRooms.forEach((r, i) => {
      const p = roomPoint(map, r);
      const rr = ROOM_T * this.shape.ay;
      const f = this.faceOf(p);
      // As wide as the painted hole (painted round at the mean aspect of the dome).
      const rx = rr * (f.mesh.scale.x / this.shape.ay / CUT_ASPECT);
      const x = p.s * f.mesh.scale.x;
      const y = -p.t * this.shape.ay;
      f.group.updateMatrixWorld();
      this.m
        .makeScale(rx, rr, rr * 0.9)
        .setPosition(x, y, 0)
        .premultiply(f.group.matrixWorld);
      this.hollows.setMatrixAt(i, this.m);
      const kind = k.kinds.get(r.id);
      c.copy(k.looks.get(r.id) === 'gallery' ? GALLERY : HOLLOW);
      if (kind) c.lerp(new Color(KIND_TINTS[kind]), 0.1);
      this.hollows.setColorAt(i, c);
      this.m
        .makeScale(rx * 0.86, 1, rr * 0.75)
        .setPosition(x, y - rr * 0.5, -rr * 0.25)
        .premultiply(f.group.matrixWorld);
      this.floors.setMatrixAt(i, this.m);
    });
    this.hollows.count = this.hollowRooms.length;
    this.floors.count = this.hollowRooms.length;
    this.hollows.instanceMatrix.needsUpdate = true;
    this.floors.instanceMatrix.needsUpdate = true;
    if (this.hollows.instanceColor) this.hollows.instanceColor.needsUpdate = true;
    this.placeLanterns();
  }

  /** Lanterns flicker a little (and follow the faces while the quarter opens). */
  private placeLanterns(): void {
    const size = this.shape.ay * 0.0065;
    this.lanternSpots.forEach((p, i) => {
      const flicker =
        1 + 0.18 * Math.sin(this.elapsed * 7.3 + i * 2.1) * Math.sin(this.elapsed * 3.1 + i);
      this.worldOf(p, this.v, size * 1.5);
      this.m.makeScale(size * flicker, size * flicker * 1.3, size * flicker).setPosition(this.v);
      this.lanterns.setMatrixAt(i, this.m);
    });
    this.lanterns.count = this.openness > 0.6 ? this.lanternSpots.length : 0;
    this.lanterns.instanceMatrix.needsUpdate = true;
  }

  /** The face a point of the section is on. */
  private faceOf(p: CutPoint): Face {
    return this.faces[p.s < 0 ? 0 : 1]!;
  }

  /** The face's half-width over the dome's depth (at the open angle, the right face). */
  aspect(): number {
    return this.halfWidth(this.azimuth + OPEN_ANGLE) / this.shape.ay;
  }

  update(dt: number, now: number): void {
    this.elapsed += dt;
    const before = this.openness;
    this.openness = Math.max(0, Math.min(1, this.openness + (this.opening ? dt : -dt) / OPEN_S));
    if (this.openness !== before) {
      this.place();
      this.placeObjects();
    } else this.placeLanterns();
    const shown = this.openness >= 1;
    this.hollows.visible = this.floors.visible = this.openness > 0.5;
    this.life.group.visible = shown;
    if (shown && this.state && this.depths)
      this.life.update(dt, this.elapsed, now, this.state, this.depths);
  }

  /** A room's place in the section. */
  pointOf(room: DepthRoom): CutPoint {
    return roomPoint(this.depths!, room);
  }

  /** The network on show (null before the first sync). */
  get network(): DepthsMap | null {
    return this.depths;
  }

  /** Seconds since the cut opened (animations). */
  get time(): number {
    return this.elapsed;
  }

  /** The cut is fully open (the kiwis show). */
  get isOpen(): boolean {
    return this.opening && this.openness >= 1;
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
  worldOf(p: CutPoint, out: Vector3, forward = 0, down = 0): Vector3 {
    const f = this.faceOf(p);
    out.set(p.s * f.mesh.scale.x, -p.t * this.shape.ay - down, forward);
    f.group.updateMatrixWorld();
    return out.applyMatrix4(f.group.matrixWorld);
  }

  /**
   * A spot on a room's floor, in world space: `across` (−1…1 of the floor's width) and `deep`
   * (−1 at the back wall … 1 at the lip of the floor), in `out`.
   */
  floorSpot(room: DepthRoom, across: number, deep: number, out: Vector3): Vector3 {
    const map = this.depths!;
    const p = roomPoint(map, room);
    const rr = roomRadius(room) * this.shape.ay;
    const f = this.faceOf(p);
    // Low quality paints the rooms: the kiwis stand on a ledge just in front of the disc.
    const z = this.holes ? -rr * 0.25 + deep * rr * 0.55 : rr * (0.2 + deep * 0.08);
    out.set(p.s * f.mesh.scale.x + across * rr * 0.7, -p.t * this.shape.ay - rr * 0.5, z);
    f.group.updateMatrixWorld();
    return out.applyMatrix4(f.group.matrixWorld);
  }

  /** The direction a face looks (into the open quarter), for a point of the section. */
  normalOf(p: CutPoint, out: Vector3): Vector3 {
    const f = this.faceOf(p);
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
    let bestD = Infinity;
    const p = new Vector3();
    for (const r of this.depths.rooms) {
      const d = this.worldOf(roomPoint(this.depths, r), p).distanceTo(hit.point);
      // Locules are small: a finger needs a wider reach.
      const reach = Math.max(roomRadius(r) * 1.6, ROOM_T * 0.7) * this.shape.ay;
      if (d < reach && d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  dispose(): void {
    this.setClip(null);
    this.life.dispose();
    for (const mesh of [this.hollows, this.floors, this.lanterns]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    for (const f of this.faces) f.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mask.dispose();
    this.maskCanvas.width = 0;
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
