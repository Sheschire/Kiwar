import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  BoxGeometry,
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
  attitudeOf,
  raspberryOfState,
  RASPBERRY,
  type GameState,
  type Raspberry,
} from '@kiwar/shared';
import { CLAN_COLORS } from './orchardColors';
import { orchardPlace, WORMHOLE_GAP } from './space';

/**
 * Chantier 54: the raspberry in the map of space — a cluster of drupelets hanging under its
 * calyx at the far end of the Mother Vine, each drupelet tinted by its clan (darker when hostile,
 * paler once pillaged), our trading post's hut on its drupelet, and the wormhole's swirl the
 * ships fly through. Read from the public state; drawn once the wormholes are researched.
 * Nothing moves by itself (no sign of life): the swirl turns only while a voyage is under way.
 */

/** Radius of the fruit (world units) and of a drupelet. */
const FRUIT = 9;
const DRUPE = 1.55;
/** Length of the branch above the fruit. */
const VINE = 420;

const geo = {
  drupe: new SphereGeometry(DRUPE, 14, 10),
  calyx: new ConeGeometry(FRUIT * 0.55, 2.2, 7, 1, true),
  stem: new CylinderGeometry(0.35, 0.5, 6, 7),
  vine: new CylinderGeometry(0.7, 0.9, 1, 7, 1, true),
  hut: new BoxGeometry(1.1, 0.8, 1.1),
  roof: new ConeGeometry(0.95, 0.8, 4),
  swirl: new TorusGeometry(5, 0.55, 8, 40),
  core: new SphereGeometry(3.6, 18, 12),
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
};

export class OrchardView {
  readonly group = new Group();
  /** Where ships fly to (the wormhole's mouth), in world space. */
  readonly mouth = new Vector3();
  private readonly fruit = new Group();
  private readonly swirl = new Group();
  private drupes: InstancedMesh | null = null;
  private hut: Group | null = null;
  private key = '';
  private seed = '';
  private lastMap: Raspberry | null = null;
  private turning = false;
  private readonly color = new Color();

  constructor() {
    const p = orchardPlace();
    this.group.position.set(p.x, p.y, p.z);
    this.group.visible = false;
    this.group.add(this.fruit);
    // The calyx and the stem on top, where the vine holds the fruit.
    const calyx = new Mesh(geo.calyx, mat.leaf);
    calyx.position.y = FRUIT * (1 - RASPBERRY.stemCap) + 0.6;
    calyx.rotation.x = Math.PI;
    this.fruit.add(calyx);
    const stem = new Mesh(geo.stem, mat.leaf);
    stem.position.y = FRUIT + 3.5;
    this.fruit.add(stem);
    // The branch of the Mother Vine it hangs from, rising out of sight.
    const vine = new Mesh(geo.vine, mat.leaf);
    vine.scale.y = VINE;
    vine.position.y = FRUIT + 6 + VINE / 2;
    this.fruit.add(vine);
    // The wormhole: a swirl on the side towards home.
    // Under the fruit, a little towards home (never in front of it).
    const toHome = new Vector3(-p.x, 0, -p.z).normalize();
    this.swirl.position.copy(toHome.multiplyScalar(WORMHOLE_GAP * 0.5)).setY(-WORMHOLE_GAP);
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
    const map = raspberryOfState(state);
    const day = Math.floor(state.now / 3_600_000);
    const key = JSON.stringify([
      map.seed,
      day,
      state.orchard.taken,
      state.orchard.posts.raspberry?.drupelet ?? null,
      state.orchard.posts.raspberry?.ruined ?? false,
      Object.keys(state.orchard.standing).length,
    ]);
    if (key === this.key) return;
    this.key = key;
    if (this.seed !== map.seed) this.build(map);
    this.paint(state, map);
    this.placeHut(state, map);
  }

  private build(map: Raspberry): void {
    this.seed = map.seed;
    this.lastMap = map;
    if (this.drupes) {
      this.fruit.remove(this.drupes);
      this.drupes.dispose();
    }
    const n = map.parcels.length;
    const mesh = new InstancedMesh(geo.drupe, mat.drupe, n);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const s = new Vector3();
    map.parcels.forEach((d, i) => {
      const dir = new Vector3(d.x, d.y, d.z).normalize();
      q.setFromUnitVectors(up, dir);
      const k = 0.92 + 0.08 * d.ring;
      s.set(k, k * 1.08, k);
      m.compose(dir.clone().multiplyScalar(FRUIT), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.drupes = mesh;
    this.fruit.add(mesh);
  }

  private paint(state: GameState, map: Raspberry): void {
    const mesh = this.drupes;
    if (!mesh) return;
    map.parcels.forEach((d, i) => {
      const clan = map.clanById.get(d.clan)!;
      this.color.set(CLAN_COLORS[clan.name % CLAN_COLORS.length]!);
      // Raspberry red, with the clan's tint; darker when hostile, paler once pillaged.
      this.color.lerp(new Color('#d23a55'), 0.68);
      const a = attitudeOf(state, d.clan, state.now);
      if (a === 'hostile') this.color.multiplyScalar(0.55);
      if (a === 'friendly') this.color.lerp(new Color('#ffd0da'), 0.15);
      if (state.orchard.taken[d.id] !== undefined) this.color.lerp(new Color('#9a8a8e'), 0.5);
      mesh.setColorAt(i, this.color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private placeHut(state: GameState, map: Raspberry): void {
    const post = state.orchard.posts.raspberry;
    if (this.hut) {
      this.fruit.remove(this.hut);
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
    const dir = new Vector3(d.x, d.y, d.z).normalize();
    hut.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    hut.position.copy(dir.multiplyScalar(FRUIT + DRUPE * 0.85));
    this.hut = hut;
    this.fruit.add(hut);
  }

  /** The swirl turns while a voyage is under way (a sign of life then). */
  update(dt: number): boolean {
    if (!this.group.visible || !this.turning) return false;
    this.swirl.rotateZ(dt * 0.9);
    return true;
  }

  /**
   * Chantier 54: puts a battle field (a show's group) on the top of a drupelet, standing on its
   * outward normal, scaled to fit. False when that drupelet is not drawn.
   */
  attachField(field: Group, drupeletId: string, scale: number): boolean {
    const map = this.seed ? this.lastMap : null;
    const d = map?.byId.get(drupeletId);
    if (!d) return false;
    const dir = new Vector3(d.x, d.y, d.z).normalize();
    // The fruit turns to show that drupelet to the camera (towards home, a little up).
    const p = this.group.position;
    const face = new Vector3(-p.x, 0, -p.z).normalize().setY(0.55).normalize();
    this.fruit.quaternion.setFromUnitVectors(dir, face);
    field.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    field.position.copy(dir).multiplyScalar(FRUIT + DRUPE * 1.6);
    field.scale.setScalar(scale);
    this.fruit.add(field);
    this.fruit.updateMatrixWorld(true);
    return true;
  }

  /** The field leaves the fruit, which turns back. */
  detachField(field: Group): void {
    this.fruit.remove(field);
    this.fruit.quaternion.identity();
  }

  /** Radius of a drupelet (the size of a battle field on it). */
  get drupeRadius(): number {
    return DRUPE;
  }

  /** Radius of the fruit. */
  get radius(): number {
    return FRUIT;
  }

  /** The fruit under a ray (a tap in the space view). */
  pick(ray: Ray): boolean {
    if (!this.group.visible) return false;
    return ray.distanceToPoint(this.group.position) < FRUIT * 1.25;
  }

  get center(): Vector3 {
    return this.group.position;
  }

  dispose(): void {
    this.drupes?.dispose();
  }
}
