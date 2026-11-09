import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Ray,
} from 'three';
import {
  appleStage,
  attitudeOf,
  fruitOfId,
  fruitOfState,
  FRUIT_IDS,
  RASPBERRY,
  type AppleStage,
  type FruitId,
  type FruitMap,
  type GameState,
  type Parcel,
} from '@kiwar/shared';
import { CLAN_COLORS } from './orchardColors';
import { orchardPlace, WORMHOLE_GAP } from './space';

/**
 * Chantier 54 (55: three fruits): the cosmic orchard in the map of space — the raspberry (a
 * cluster of drupelets under its calyx), the apple (a big sphere whose skin follows its
 * ripeness, its galleries dug in it) and the pineapple (scales in spirals under its crown), each
 * hanging at the end of a branch of the Mother Vine; parcels tinted by clan (darker when hostile,
 * paler once pillaged), our trading posts' huts, and the wormhole's swirl the ships fly through.
 * Read from the public state; drawn once the wormholes are researched. Nothing moves by itself:
 * the swirl turns only while a voyage is under way.
 */

/** Radius of the raspberry (world units) and of a drupelet. */
const FRUIT = 9;
const DRUPE = 1.55;
/** The apple's radius, the pineapple's barrel (radius scale and half height). */
const APPLE_R = 11;
const PINE_R = 9;
const PINE_H = 10;
/** A parcel's radius on the apple and the pineapple (the size of a battle field on it). */
const PARCEL: Record<FruitId, number> = { raspberry: DRUPE, apple: 1.7, pineapple: 1.45 };
/** Length of the branches above the fruits. */
const VINE = 420;
/** The apple and the pineapple hang on each side of the raspberry. */
const SIDE = 34;

const geo = {
  drupe: new SphereGeometry(DRUPE, 14, 10),
  calyx: new ConeGeometry(FRUIT * 0.55, 2.2, 7, 1, true),
  stem: new CylinderGeometry(0.35, 0.5, 6, 7),
  vine: new CylinderGeometry(0.7, 0.9, 1, 7, 1, true),
  hut: new BoxGeometry(1.1, 0.8, 1.1),
  roof: new ConeGeometry(0.95, 0.8, 4),
  swirl: new TorusGeometry(5, 0.55, 8, 40),
  core: new SphereGeometry(3.6, 18, 12),
  apple: new SphereGeometry(APPLE_R, 32, 22),
  hole: new CylinderGeometry(1.15, 0.8, 0.35, 12),
  leaf: new SphereGeometry(1, 8, 5),
  scale: new SphereGeometry(1, 7, 5),
  crownLeaf: new ConeGeometry(0.55, 7, 5),
};

const mat = {
  drupe: new MeshStandardMaterial({ roughness: 0.38, metalness: 0.02, fog: false }),
  leaf: new MeshStandardMaterial({
    color: '#4f7f25',
    roughness: 0.8,
    flatShading: true,
    fog: false,
  }),
  hut: new MeshStandardMaterial({ color: '#c9a36a', roughness: 0.9, fog: false }),
  roof: new MeshStandardMaterial({
    color: '#7b4a2a',
    roughness: 0.9,
    flatShading: true,
    fog: false,
  }),
  swirl: new MeshBasicMaterial({
    color: '#b88cff',
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  }),
  core: new MeshBasicMaterial({
    color: '#3b1d6e',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  }),
  apple: new MeshStandardMaterial({ roughness: 0.42, metalness: 0.02, fog: false }),
  hole: new MeshStandardMaterial({ roughness: 1, fog: false }),
  scale: new MeshStandardMaterial({ roughness: 0.6, flatShading: true, fog: false }),
  pineFlesh: new MeshStandardMaterial({ color: '#9a6a1e', roughness: 0.8, fog: false }),
  crown: new MeshStandardMaterial({
    color: '#5f8a36',
    roughness: 0.75,
    flatShading: true,
    fog: false,
  }),
};

/** The apple's skin by stage: green, red, then a bruised brown. */
const SKIN: Record<AppleStage, string> = {
  green: '#8dbb3a',
  ripe: '#d2392b',
  overripe: '#8a5a2e',
};

const UP = new Vector3(0, 1, 0);

/** One fruit hanging in the orchard: its parcels drawn, tinted, our hut, a field attached. */
abstract class FruitBody {
  readonly group = new Group();
  /** The part that turns to show a parcel (everything but the branch). */
  readonly body = new Group();
  protected parcels: InstancedMesh | null = null;
  protected hut: Group | null = null;
  map: FruitMap | null = null;
  protected readonly color = new Color();

  constructor(
    readonly fruit: FruitId,
    readonly radius: number,
    top: number,
  ) {
    this.group.add(this.body);
    const vine = new Mesh(geo.vine, mat.leaf);
    vine.scale.y = VINE;
    vine.position.y = top + VINE / 2;
    this.group.add(vine);
  }

  /** A parcel's outward normal and the point on the fruit's surface above it (fruit frame). */
  abstract spot(d: Parcel): { dir: Vector3; at: Vector3 };
  protected abstract build(map: FruitMap): void;
  protected abstract tint(state: GameState, d: Parcel): void;

  sync(state: GameState, map: FruitMap): void {
    if (this.map?.seed !== map.seed) {
      this.map = map;
      this.build(map);
    }
    this.paint(state, map);
    this.placeHut(state, map);
  }

  protected paint(state: GameState, map: FruitMap): void {
    const mesh = this.parcels;
    if (!mesh) return;
    let i = 0;
    for (const d of map.parcels) {
      if (!this.drawn(d)) continue;
      this.tint(state, d);
      const a = attitudeOf(state, d.clan, state.now);
      if (a === 'hostile') this.color.multiplyScalar(0.55);
      if (a === 'friendly') this.color.lerp(new Color('#fff1d8'), 0.15);
      if (state.orchard.taken[d.id] !== undefined) this.color.lerp(new Color('#9a8a8e'), 0.5);
      mesh.setColorAt(i++, this.color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Parcels drawn as instances (the apple shows only its skin's galleries). */
  protected drawn(d: Parcel): boolean {
    void d;
    return true;
  }

  protected clanTint(d: Parcel, base: string, share: number): void {
    const clan = this.map!.clanById.get(d.clan)!;
    this.color.set(CLAN_COLORS[clan.name % CLAN_COLORS.length]!);
    this.color.lerp(new Color(base), share);
  }

  private placeHut(state: GameState, map: FruitMap): void {
    const post = state.orchard.posts[this.fruit];
    if (this.hut) {
      this.body.remove(this.hut);
      this.hut = null;
    }
    const d = post ? map.byId.get(post.drupelet) : undefined;
    if (!post || !d) return;
    const hut = new Group();
    const box = new Mesh(geo.hut, mat.hut);
    box.position.y = 0.4;
    hut.add(box);
    const roof = new Mesh(geo.roof, mat.roof);
    roof.position.y = 1.2;
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    if (post.ruined) {
      roof.rotation.z = 0.7;
      roof.position.set(0.5, 0.6, 0);
    }
    const { dir, at } = this.spot(d);
    hut.quaternion.setFromUnitVectors(UP, dir);
    hut.position.copy(at);
    this.hut = hut;
    this.body.add(hut);
  }

  /** Puts a field on a parcel, the fruit turned to show it towards `face`. */
  attach(field: Group, id: string, scale: number, face: Vector3): boolean {
    const d = this.map?.byId.get(id);
    if (!d) return false;
    const { dir, at } = this.spot(d);
    this.body.quaternion.setFromUnitVectors(dir, face);
    field.quaternion.setFromUnitVectors(UP, dir);
    field.position.copy(at).addScaledVector(dir, PARCEL[this.fruit] * 0.6);
    field.scale.setScalar(scale);
    this.body.add(field);
    this.body.updateMatrixWorld(true);
    return true;
  }

  detach(field: Group): void {
    this.body.remove(field);
    this.body.quaternion.identity();
  }

  dispose(): void {
    this.parcels?.dispose();
  }
}

class RaspberryBody extends FruitBody {
  constructor() {
    super('raspberry', FRUIT, FRUIT + 6);
    // The calyx and the stem on top, where the vine holds the fruit.
    const calyx = new Mesh(geo.calyx, mat.leaf);
    calyx.position.y = FRUIT * (1 - RASPBERRY.stemCap) + 0.6;
    calyx.rotation.x = Math.PI;
    this.body.add(calyx);
    const stem = new Mesh(geo.stem, mat.leaf);
    stem.position.y = FRUIT + 3.5;
    this.body.add(stem);
  }

  spot(d: Parcel) {
    const dir = new Vector3(d.x, d.y, d.z).normalize();
    return { dir, at: dir.clone().multiplyScalar(FRUIT + DRUPE * 0.85) };
  }

  protected build(map: FruitMap): void {
    if (this.parcels) {
      this.body.remove(this.parcels);
      this.parcels.dispose();
    }
    const mesh = new InstancedMesh(geo.drupe, mat.drupe, map.parcels.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    map.parcels.forEach((d, i) => {
      const dir = new Vector3(d.x, d.y, d.z).normalize();
      q.setFromUnitVectors(UP, dir);
      const k = 0.92 + 0.08 * d.ring;
      s.set(k, k * 1.08, k);
      m.compose(dir.clone().multiplyScalar(FRUIT), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.parcels = mesh;
    this.body.add(mesh);
  }

  protected tint(_state: GameState, d: Parcel): void {
    // Raspberry red, with the clan's tint.
    this.clanTint(d, '#d23a55', 0.68);
  }
}

class AppleBody extends FruitBody {
  private readonly skin = new Mesh(geo.apple, mat.apple.clone());
  private stage: AppleStage | null = null;

  constructor() {
    super('apple', APPLE_R, APPLE_R + 5);
    this.skin.scale.set(1, 0.92, 1);
    this.body.add(this.skin);
    const stem = new Mesh(geo.stem, mat.roof);
    stem.position.y = APPLE_R * 0.92 + 2.2;
    this.body.add(stem);
    const leaf = new Mesh(geo.leaf, mat.leaf);
    leaf.scale.set(2.6, 0.25, 1.1);
    leaf.position.set(1.8, APPLE_R * 0.92 + 2.6, 0);
    leaf.rotation.z = 0.35;
    this.body.add(leaf);
  }

  spot(d: Parcel) {
    const dir = new Vector3(d.x, d.y * 0.92, d.z).normalize();
    return { dir, at: dir.clone().multiplyScalar(APPLE_R * 0.97) };
  }

  /** Only the skin's galleries open on the surface; the others are inside. */
  protected override drawn(d: Parcel): boolean {
    return d.ring === 0;
  }

  protected build(map: FruitMap): void {
    if (this.parcels) {
      this.body.remove(this.parcels);
      this.parcels.dispose();
    }
    const skin = map.parcels.filter((d) => this.drawn(d));
    const mesh = new InstancedMesh(geo.hole, mat.hole, skin.length);
    const m = new Matrix4();
    const q = new Quaternion();
    skin.forEach((d, i) => {
      const { dir, at } = this.spot(d);
      q.setFromUnitVectors(UP, dir);
      m.compose(at, q, new Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.parcels = mesh;
    this.body.add(mesh);
  }

  protected tint(_state: GameState, d: Parcel): void {
    // A dark gallery mouth, its colony's tint round it.
    this.clanTint(d, '#3a2416', 0.75);
  }

  /** The skin follows the ripeness (public calendar). */
  ripen(state: GameState): void {
    const stage = appleStage(state.orchard.seed, state.now).stage;
    if (stage === this.stage) return;
    this.stage = stage;
    (this.skin.material as MeshStandardMaterial).color.set(SKIN[stage]);
  }
}

class PineappleBody extends FruitBody {
  constructor() {
    super('pineapple', PINE_R * 1.1, PINE_H * 1.12 + 7);
    // The flesh under the scales (nothing seen through them).
    const flesh = new Mesh(geo.leaf, mat.pineFlesh);
    flesh.scale.set(PINE_R * 0.72, PINE_H * 0.98, PINE_R * 0.72);
    this.body.add(flesh);
  }

  private crownAt(map: FruitMap): Parcel {
    return map.parcels[map.parcels.length - 1]!;
  }

  spot(d: Parcel) {
    if (d.crown) return { dir: UP.clone(), at: new Vector3(0, PINE_H * 1.12, 0) };
    const dir = new Vector3(d.x, d.y * 0.35, d.z).normalize();
    return { dir, at: new Vector3(d.x * PINE_R, d.y * PINE_H, d.z * PINE_R) };
  }

  protected override drawn(d: Parcel): boolean {
    return !d.crown;
  }

  protected build(map: FruitMap): void {
    if (this.parcels) {
      this.body.remove(this.parcels);
      this.parcels.dispose();
    }
    for (const c of [...this.body.children]) if (c.userData.crown) this.body.remove(c);
    const scales = map.parcels.filter((d) => this.drawn(d));
    const mesh = new InstancedMesh(geo.scale, mat.scale, scales.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3(1.05, 1.15, 0.45);
    scales.forEach((d, i) => {
      const { dir, at } = this.spot(d);
      q.setFromUnitVectors(new Vector3(0, 0, 1), dir);
      m.compose(at, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.parcels = mesh;
    this.body.add(mesh);
    // The crown: a tuft of leaves on top (the royal parcel).
    const crown = new Group();
    crown.userData.crown = true;
    const top = this.spot(this.crownAt(map)).at;
    crown.position.copy(top);
    for (let i = 0; i < 9; i++) {
      const leaf = new Mesh(geo.crownLeaf, mat.crown);
      const a = (i / 9) * Math.PI * 2;
      const tilt = i % 2 ? 0.55 : 0.3;
      leaf.position.set(Math.cos(a) * 0.9, 3, Math.sin(a) * 0.9);
      leaf.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      crown.add(leaf);
    }
    this.body.add(crown);
  }

  protected tint(_state: GameState, d: Parcel): void {
    // Golden scales, the colony's tint.
    this.clanTint(d, '#d9a640', 0.7);
  }
}

export class OrchardView {
  readonly group = new Group();
  /** Where ships fly to (the wormhole's mouth), in world space. */
  readonly mouth = new Vector3();
  private readonly swirl = new Group();
  private readonly bodies: Record<FruitId, FruitBody>;
  private readonly apple: AppleBody;
  private key = '';
  private turning = false;

  constructor() {
    const p = orchardPlace();
    this.group.position.set(p.x, p.y, p.z);
    this.group.visible = false;
    const toHome = new Vector3(-p.x, 0, -p.z).normalize();
    const side = new Vector3().crossVectors(toHome, UP).normalize();
    this.apple = new AppleBody();
    this.bodies = {
      raspberry: new RaspberryBody(),
      apple: this.apple,
      pineapple: new PineappleBody(),
    };
    this.bodies.apple.group.position.copy(side).multiplyScalar(-SIDE).setY(-3);
    this.bodies.pineapple.group.position.copy(side).multiplyScalar(SIDE).setY(-5);
    for (const f of FRUIT_IDS) this.group.add(this.bodies[f].group);
    // The wormhole: a swirl under the raspberry, a little towards home (never in front of it).
    this.swirl.position.copy(toHome.clone().multiplyScalar(WORMHOLE_GAP * 0.5)).setY(-WORMHOLE_GAP);
    this.swirl.lookAt(new Vector3(-p.x, -p.y, -p.z).add(this.group.position));
    this.swirl.add(new Mesh(geo.core, mat.core));
    const ring = new Mesh(geo.swirl, mat.swirl);
    this.swirl.add(ring);
    const ring2 = new Mesh(geo.swirl, mat.swirl);
    ring2.scale.setScalar(0.62);
    this.swirl.add(ring2);
    this.group.add(this.swirl);
    this.group.updateMatrixWorld(true);
    this.swirl.getWorldPosition(this.mouth);
  }

  sync(state: GameState): void {
    const open = state.colony.index === 0 && state.research.done.includes('wormholes');
    this.group.visible = open;
    this.turning = state.expeditions.some(
      (e) => (e.mission === 'visit' || e.mission === 'pillage') && e.status !== 'done',
    );
    if (!open) return;
    this.apple.ripen(state);
    const hour = Math.floor(state.now / 3_600_000);
    const key = JSON.stringify([
      state.orchard.seed,
      hour,
      state.orchard.taken,
      FRUIT_IDS.map((f) => [state.orchard.posts[f]?.drupelet, state.orchard.posts[f]?.ruined]),
      Object.keys(state.orchard.standing).length,
    ]);
    if (key === this.key) return;
    this.key = key;
    for (const f of FRUIT_IDS) this.bodies[f].sync(state, fruitOfState(state, f));
  }

  /** The swirl turns while a voyage is under way (a sign of life then). */
  update(dt: number): boolean {
    if (!this.group.visible || !this.turning) return false;
    this.swirl.rotateZ(dt * 0.9);
    return true;
  }

  /**
   * Puts a battle field (a show's group) on a parcel of its fruit, standing on its outward
   * normal, scaled to fit; the fruit turns to show it (towards home, a little up). False when
   * that parcel is not drawn.
   */
  attachField(field: Group, parcelId: string, scale: number): boolean {
    const fruit = fruitOfId(parcelId);
    if (!fruit) return false;
    const p = this.group.position;
    const face = new Vector3(-p.x, 0, -p.z).normalize().setY(0.55).normalize();
    return this.bodies[fruit].attach(field, parcelId, scale, face);
  }

  /** The field leaves its fruit, which turns back. */
  detachField(field: Group): void {
    for (const f of FRUIT_IDS)
      if (field.parent === this.bodies[f].body) this.bodies[f].detach(field);
  }

  /** Radius of a parcel of a fruit (the size of a battle field on it). */
  parcelRadius(fruit: FruitId = 'raspberry'): number {
    return PARCEL[fruit];
  }

  /** Radius of the raspberry. */
  get radius(): number {
    return FRUIT;
  }

  /** Radius of a fruit. */
  radiusOf(fruit: FruitId): number {
    return this.bodies[fruit].radius;
  }

  /** The middle of a fruit in the world. */
  centerOf(fruit: FruitId, out = new Vector3()): Vector3 {
    return this.bodies[fruit].group.getWorldPosition(out);
  }

  /** The fruit under a ray (a tap in the space view), or null. */
  pick(ray: Ray): FruitId | null {
    if (!this.group.visible) return null;
    const at = new Vector3();
    for (const f of FRUIT_IDS)
      if (ray.distanceToPoint(this.centerOf(f, at)) < this.bodies[f].radius * 1.25) return f;
    return null;
  }

  /** The raspberry's middle (the orchard's place). */
  get center(): Vector3 {
    return this.group.position;
  }

  dispose(): void {
    for (const f of FRUIT_IDS) this.bodies[f].dispose();
  }
}

/** The apple's stage colour (for the screen's calendar). */
export function appleSkin(stage: AppleStage): string {
  return SKIN[stage];
}
