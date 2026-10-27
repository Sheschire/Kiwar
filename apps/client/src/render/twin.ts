import { footprintFrame } from './footprintFrame';
import { ObstaclesView } from './obstacles';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BufferGeometry } from 'three';
import {
  Color,
  Matrix4,
  type Object3D,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  AdditiveBlending,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Group,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Ray,
} from 'three';
import {
  getTile,
  hexToPixel,
  INTEL,
  hexKey,
  landingTile,
  parcelTiles,
  sectorOf,
  type FaceMap,
  type Tile,
  type TwinSnapshot,
  type AlienBuildingKind,
} from '@kiwar/shared';
import { alienGeometry } from './models/alien';
import { CreatureRig, restCreaturePose } from './anim/creatures';
import { buildingGeometry } from './buildingModels';
import { WaterView } from './water';
import { PALETTE } from './palette';
import { GLSL_NOISE } from './shaderChunks';
import type { VillageLife } from './village';
import { TerrainView, tileTopColor, worldPosition } from './terrain';
import { planetOrientation, type SpacePoint } from './space';

/** Seen from afar: a little smaller than our own half. */
const SCALE = 0.68;
/** One turn on itself every five minutes (chantier 24), a gentle bob. */
const SPIN = (Math.PI * 2) / 300;
const BOB = 0.5;
/**
 * Level of detail (chantier 24): farther than this many radii from the camera, the tiles,
 * pools, fog layers and dens give way to one painted disc on the dome.
 */
const NEAR_RADII = 8;
/**
 * Chantier 41: the painted disc fades out over this band of radii (from `NEAR_RADII` + band
 * down to `NEAR_RADII` − band) while the tiles show under it, instead of swapping at once.
 */
const FADE_BAND = 1;
/** Seconds for the clouds to part over a parcel (or close again). */
const FOG_FADE_S = 1.6;
/** Chantier 41: an alien building seen on a parcel, drawn at the age the parcel had then. */
export interface AlienHouse {
  kind: AlienBuildingKind;
  q: number;
  r: number;
  age: number;
}

/** What the twin shows of an alien face. */
export interface TwinIntel {
  /** Parcels we have eyes on (the clouds part). */
  sectors: number[];
  /** Chantier 41: their village, as seen. */
  village: AlienHouse[];
}

export interface TwinOptions {
  fog: boolean;
  friend?: TwinSnapshot | null;
  /**
   * Alien face: the parcels we have eyes on (chantier 40: beacons, glimpses, edges; the clouds
   * part over them) and the dens and roosts seen there.
   */
  intel?: TwinIntel | null;
  /** Our beacons (flags; chantier 19's bridgeheads), and whether the queen fell (no aliens left). */
  siege?: { heads: { sector: number; fortified: boolean }[]; conquered: boolean } | null;
  /** Chantier 42: the ferret queen is out, at the centre of the face. */
  queen?: boolean;
}

/** Chantier 42: seconds of the queen's rise out of the depths. */
const QUEEN_RISE_S = 4.5;

/** Chantier 42: size of the queen drawn on the twin (world units of a creature's scale). */
const QUEEN_SCALE = 5;

/** Fog layers over the twin surface (local heights). */
const FOG_LAYERS = [1.2, 1.9, 2.6];

/**
 * A far planet: the other half of our kiwi (chantier 05) or a member's face. Since chantier 24
 * it has a fixed place in space (`place`, from `render/space.ts`), leans towards home so its
 * surface shows, and turns slowly on itself (frozen while visited). Under fog of war (alien
 * face) only its silhouette is visible: the client never knows what happens there. Rendered
 * without shadows nor props, so it stays cheap on phones. When a friend lives there (shared
 * universe), no fog: their pools, buildings and name show instead.
 */
export class TwinView {
  readonly group = new Group();
  private readonly spin = new Group();
  private readonly terrain: TerrainView;
  private readonly fogMaterial: ShaderMaterial;
  private readonly fog: Mesh[] = [];
  /** World radius of the planet (picking, framing a visit). */
  readonly radius: number;
  /** Resting place (the planet bobs gently around it). */
  readonly home = new Vector3();
  private angle = 0;
  private readonly sphere = new Sphere();
  private readonly hitPoint = new Vector3();

  private water: WaterView | null = null;
  private buildingMaterial: MeshStandardMaterial | null = null;
  /** A friend's buildings, merged into one geometry (one draw call per planet). */
  private buildingGeometry: BufferGeometry | null = null;
  private label: Sprite | null = null;
  /** The merged buildings (hidden while the village lives, chantier 59). */
  private friendBuildings: Mesh | null = null;
  /** Chantier 59: the ally's village alive while we visit (see `VillageLife`). */
  private life: VillageLife | null = null;
  /** Far level of detail: the face painted on a disc, and what it replaces. */
  private readonly far: Mesh;
  private readonly near: Object3D[] = [];
  private isNear = true;
  private farOpacity = -1;
  /** Chantier 41: the clouds over each parcel (0 closed, 1 parted), easing to `seenGoal`. */
  private readonly seen: number[];
  private readonly seenIntel: number[];
  private readonly fogOverride = new Map<number, 'open' | 'closed'>();
  /** The clouds are moving over a parcel (a sign of life for the frame loop). */
  fading = false;

  private structureGeometries: BufferGeometry[] = [];
  private structureMaterials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  /** Chantier 41: the glowing kiwis of our beacons (they bob and glow). */
  private readonly beaconKiwis: Group[] = [];
  /** Beacons by parcel, and when each was planted on screen (a pop). */
  private readonly beacons = new Map<number, { group: Group; pop: number }>();
  private beaconAura: MeshBasicMaterial | null = null;

  constructor(
    readonly map: FaceMap,
    opts: TwinOptions,
  ) {
    this.terrain = new TerrainView(map);
    this.terrain.tiles.castShadow = false;
    this.terrain.tiles.receiveShadow = false;
    // Far away in the sky: the distance fog must not wash it out.
    this.terrain.group.traverse((o) => {
      if (o instanceof Mesh) (o.material as MeshStandardMaterial).fog = false;
    });
    this.spin.add(this.terrain.group);
    const e = this.terrain.extent();
    const radius = Math.max(e.x, e.z) + 1.2;
    this.radius = radius * SCALE;

    this.fogMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: radius },
        uCloud: { value: PALETTE.cloud.clone() },
        uShade: { value: PALETTE.cloudShade.clone() },
        uSeen: { value: [] as number[] },
        // Inner ring of sectors (see `INTEL.innerRadius`), in local units.
        uInner: { value: Math.hypot(hexToPixel({ q: INTEL.innerRadius, r: 0 }).x, 0) + 0.8 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vLocal;
        varying float vLayer;
        void main() {
          vLocal = position.xy;
          vLayer = modelMatrix[3].y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uRadius, uInner;
        uniform float uSeen[12];
        uniform vec3 uCloud, uShade;
        varying vec2 vLocal;
        varying float vLayer;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vLocal * 0.09 + vec2(vLayer * 3.1, -vLayer * 1.7);
          float n = kFbm(p + vec2(uTime * 0.03, uTime * 0.017));
          float n2 = kFbm(p * 2.3 - vec2(uTime * 0.05, 0.0));
          float puff = smoothstep(0.25, 0.7, n * 0.75 + n2 * 0.4);
          float r = length(vLocal) / uRadius;
          // Thick in the middle, frayed at the rim so the silhouette of the fruit shows.
          float alpha = (0.14 + 0.36 * puff) * (1.0 - smoothstep(0.82, 1.0, r + 0.12 * (n2 - 0.5)));
          // Sectors seen by our scouts: the clouds part (frayed edges from the noise).
          float a = atan(-vLocal.y, vLocal.x);
          if (a < 0.0) a += 6.2831853;
          int slice = int(min(5.0, floor(a / 1.0471976)));
          int idx = slice + (length(vLocal) + 0.6 * (n - 0.5) <= uInner ? 0 : 6);
          float seen = 0.0;
          for (int i = 0; i < 12; i++) if (i == idx) seen = uSeen[i];
          alpha *= 1.0 - 0.92 * seen;
          gl_FragColor = vec4(mix(uShade, uCloud, puff), alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    this.seenIntel = seenMask(opts.intel);
    this.seen = [...this.seenIntel];
    this.fogMaterial.uniforms.uSeen!.value = this.seen;
    if (opts.fog) {
      for (const y of FOG_LAYERS) {
        const layer = new Mesh(new CircleGeometry(radius, 40), this.fogMaterial);
        layer.rotation.x = -Math.PI / 2;
        layer.position.y = y;
        layer.renderOrder = 2;
        this.fog.push(layer);
        this.spin.add(layer);
      }
    }
    if (opts.friend) this.showFriend(map, opts.friend);
    else if (opts.intel && !opts.siege?.conquered) this.showVillage(map, opts.intel.village);
    if (!opts.friend && opts.siege?.heads.length)
      this.showBeacons(map, opts.siege.heads, opts.intel?.village ?? []);
    if (!opts.friend && opts.queen && !opts.siege?.conquered) this.showQueen(map);
    this.far = farDisc(map, radius, opts.fog);
    this.spin.add(this.far);
    this.near.push(this.terrain.tiles, ...this.fog);
    if (this.water) this.near.push(this.water.mesh);
    if (this.obstacles) this.near.push(this.obstacles.group);
    this.setNear(false);
    this.setFarOpacity(1);
    this.group.add(this.spin);
    this.group.scale.setScalar(SCALE);
  }

  /** Puts the planet at its place in space, turned towards home (`planetOrientation`). */
  place(p: SpacePoint): void {
    this.home.set(p.x, p.y, p.z);
    this.group.position.copy(this.home);
    const { yaw, tilt } = planetOrientation(p);
    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(yaw);
    this.group.rotateX(tilt);
  }

  /**
   * Slow spin and bob; a planet being visited holds still (`frozen`) and shows every detail,
   * the others only when the camera (`eye`) comes near.
   */
  update(dt: number, time: number, eye: Vector3, frozen = false, phase = 0): void {
    const radii = frozen ? 0 : eye.distanceTo(this.group.position) / this.radius;
    this.setNear(radii < NEAR_RADII + FADE_BAND);
    this.setFarOpacity(
      Math.min(1, Math.max(0, (radii - NEAR_RADII + FADE_BAND) / (2 * FADE_BAND))),
    );
    // The clouds part (or close) over the parcels, eased.
    const step = dt / FOG_FADE_S;
    this.fading = false;
    for (let i = 0; i < this.seen.length; i++) {
      const o = this.fogOverride.get(i);
      const goal = o === 'open' ? 1 : o === 'closed' ? 0 : this.seenIntel[i]!;
      const v = this.seen[i]!;
      if (v === goal) continue;
      this.fading = true;
      this.seen[i] = v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step);
    }
    if (!frozen) {
      this.angle += dt * SPIN;
      this.group.position.y = this.home.y + Math.sin(time * 0.25 + phase) * BOB;
    }
    this.spin.rotation.y = this.angle;
    this.fogMaterial.uniforms.uTime!.value = time;
    this.life?.update(dt, time);
    if (this.queen && this.queen.rise < 1) {
      // Chantier 42: she climbs out of the depths, the ground trembling around her.
      const q = this.queen;
      q.rise = Math.min(1, q.rise + dt / QUEEN_RISE_S);
      const k = 1 - (1 - q.rise) ** 3;
      q.group.position.y = q.base - (1 - k) * 2.6;
      q.hole.scale.setScalar(0.4 + 0.8 * Math.min(1, q.rise * 2));
      q.group.rotation.y = q.yaw + Math.sin(time * 30) * 0.04 * (1 - q.rise);
      this.fading = true;
    }
    for (const b of this.beacons.values()) {
      if (b.pop >= 1) continue;
      // A beacon just planted springs up.
      b.pop = Math.min(1, b.pop + dt / 0.6);
      const k = b.pop;
      b.group.scale.setScalar(0.65 * (1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2));
    }
    for (let i = 0; i < this.beaconKiwis.length; i++) {
      const k = this.beaconKiwis[i]!;
      k.position.y = 2.75 + Math.sin(time * 1.6 + i) * 0.12;
      k.rotation.z = Math.sin(time * 1.1 + i) * 0.06;
    }
    if (this.beaconAura) this.beaconAura.opacity = 0.18 + 0.08 * Math.sin(time * 2.2);
  }

  /** Chantier 19 (siege show): the middle of the planet, in world space. */
  worldCenter(out: Vector3): Vector3 {
    this.spin.updateWorldMatrix(true, false);
    return this.spin.localToWorld(out.set(0, 0, 0));
  }

  /** Chantier 19 (siege show): the middle of a sector (null: the middle), in world space. */
  sectorWorld(sector: number | null, out: Vector3): Vector3 {
    const tile = sector === null ? undefined : sectorMiddle(this.map, sector);
    if (!tile) return this.worldCenter(out);
    const p = worldPosition(tile);
    this.spin.updateWorldMatrix(true, false);
    return this.spin.localToWorld(out.set(p.x, tile.height, p.z));
  }

  /**
   * Chantier 41: the field of a landing on a parcel (its tiles, `parcelTiles`), in world space:
   * its middle and radius, to frame it.
   */
  parcelFrame(sector: number): { center: Vector3; radius: number } {
    const tiles = parcelTiles(sector);
    let x = 0;
    let z = 0;
    let y = 0;
    for (const h of tiles) {
      const p = worldPosition(h);
      x += p.x;
      z += p.z;
      y += getTile(this.map, h)?.height ?? 0;
    }
    const n = Math.max(1, tiles.length);
    x /= n;
    z /= n;
    let r = 1;
    for (const h of tiles) {
      const p = worldPosition(h);
      r = Math.max(r, Math.hypot(p.x - x, p.z - z));
    }
    this.spin.updateWorldMatrix(true, false);
    const center = this.spin.localToWorld(new Vector3(x, y / n, z));
    return { center, radius: (r + 1) * SCALE };
  }

  private setNear(near: boolean): void {
    if (near === this.isNear) return;
    this.isNear = near;
    for (const o of this.near) o.visible = near;
  }

  /**
   * Chantier 41: the painted disc over the tiles while it fades (drawn over them without the
   * depth test, under the clouds), alone and opaque far away.
   */
  private setFarOpacity(opacity: number): void {
    if (opacity === this.farOpacity) return;
    this.farOpacity = opacity;
    const m = this.far.material as MeshStandardMaterial;
    m.opacity = opacity;
    m.depthTest = opacity >= 1 || !this.isNear;
    m.depthWrite = m.depthTest;
    this.far.renderOrder = m.depthTest ? 0 : 1;
    this.far.visible = opacity > 0;
  }

  /**
   * Chantier 41: hides the beacon of a parcel (a landing on show plants it later), or plants
   * it with a pop.
   */
  /** Chantier 42: plays the queen's rise (false when she is not drawn). */
  riseQueen(): boolean {
    if (!this.queen) return false;
    this.queen.rise = 0;
    this.queen.group.position.y = this.queen.base - 2.6;
    return true;
  }

  get hasQueen(): boolean {
    return this.queen !== null;
  }

  setBeaconHidden(sector: number, hidden: boolean): void {
    const b = this.beacons.get(sector);
    if (!b) return;
    if (hidden) {
      b.group.visible = false;
      b.pop = 0;
      b.group.scale.setScalar(0.001);
    } else if (!b.group.visible) {
      b.group.visible = true;
    }
  }

  /** Chantier 41: something drawn on the face (a landing's show), in its local frame. */
  attach(object: Object3D): void {
    this.terrain.group.add(object);
  }

  /** Chantier 41: whether the tiles and details are drawn (near enough, or visited). */
  get detailed(): boolean {
    return this.isNear;
  }

  /**
   * Chantier 41: forces the clouds of a parcel open (a landing watched) or closed (until the ship
   * sets down), or back to what we know of it (null). They ease there (`FOG_FADE_S`).
   */
  setFog(sector: number, mode: 'open' | 'closed' | null, now = false): void {
    if (mode) this.fogOverride.set(sector, mode);
    else this.fogOverride.delete(sector);
    if (now)
      this.seen[sector] = mode === 'open' ? 1 : mode === 'closed' ? 0 : this.seenIntel[sector]!;
  }

  /** How open the clouds are over a parcel (0–1). */
  fogOpen(sector: number): number {
    return this.seen[sector] ?? 0;
  }

  /**
   * A rebuilt twin takes the place of the old one: same position and turn, the clouds where
   * they were (they ease on from there).
   */
  takeOver(other: TwinView): void {
    this.group.position.copy(other.group.position);
    this.angle = other.angle;
    this.spin.rotation.y = this.angle;
    for (let i = 0; i < this.seen.length; i++) this.seen[i] = other.seen[i] ?? this.seen[i]!;
    for (const [k, v] of other.fogOverride) this.fogOverride.set(k, v);
  }

  /** A friend's colony: pools, buildings (static models) and their name above. */
  private obstacles: ObstaclesView | null = null;

  private showFriend(map: FaceMap, friend: TwinSnapshot): void {
    this.water = new WaterView(map, new Vector3(0.4, 1, 0.3));
    this.terrain.group.add(this.water.mesh);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      flatShading: true,
      fog: false,
    });
    this.buildingMaterial = material;
    // Chantier 24: one merged geometry instead of a mesh per building.
    const parts: BufferGeometry[] = [];
    const m = new Matrix4();
    for (const b of friend.buildings) {
      if (!getTile(map, b)) continue;
      // Chantier 35: big buildings stand over their footprint.
      const f = footprintFrame(map, b.type, b);
      m.makeRotationY(f.angle).setPosition(f.x, f.y, f.z);
      parts.push(buildingGeometry(b.type, b.level).clone().applyMatrix4(m));
    }
    if (parts.length > 0) {
      this.buildingGeometry = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      if (this.buildingGeometry) {
        this.friendBuildings = new Mesh(this.buildingGeometry, material);
        this.terrain.group.add(this.friendBuildings);
      }
    }
    if (friend.obstacles?.length) {
      this.obstacles = new ObstaclesView(map);
      this.obstacles.sync({
        obstacles: friend.obstacles.map((o) => ({ ...o, id: `${o.kind}:${o.q},${o.r}`, loot: {} })),
      });
      this.terrain.group.add(this.obstacles.group);
    }
    this.label = nameLabel(friend.owner);
    // The name floats high above its middle, readable from afar.
    this.label.position.set(0, 16, 0);
    this.label.scale.set(28, 7, 1);
    this.group.add(this.label);
  }

  /**
   * Chantier 41: a beacon on each parcel we hold — a glowing kiwi on a pole, planted where the
   * ship landed (gold, on a low wall, once fortified: chantier 19).
   */
  private queen: {
    group: Group;
    hole: Mesh;
    rig: CreatureRig;
    base: number;
    yaw: number;
    rise: number;
  } | null = null;

  /** Chantier 42: the ferret queen at the centre of the face, crowned, above her opened lair. */
  private showQueen(map: FaceMap): void {
    const tile = getTile(map, { q: 0, r: 0 });
    if (!tile) return;
    const rig = new CreatureRig(1);
    const group = new Group();
    const yaw = 0.6;
    rig.draw({
      kind: 'ferret',
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      scale: QUEEN_SCALE,
      pose: restCreaturePose(),
      age: 3,
    });
    rig.end();
    const crownGeometry = new CylinderGeometry(0.32, 0.38, 0.28, 8, 1, true);
    const spike = new ConeGeometry(0.08, 0.26, 4);
    const gold = new MeshStandardMaterial({
      color: 0xf2c14e,
      emissive: 0x6b4a00,
      metalness: 0.6,
      roughness: 0.35,
      flatShading: true,
      side: DoubleSide,
      fog: false,
    });
    const crown = new Group();
    crown.add(new Mesh(crownGeometry, gold));
    for (let i = 0; i < 5; i++) {
      const s = new Mesh(spike, gold);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.33, 0.24, Math.sin(a) * 0.33);
      crown.add(s);
    }
    // Over her head (the ferret's head stands forward of its body).
    crown.position.set(0, QUEEN_SCALE * 0.62, QUEEN_SCALE * 0.42);
    crown.scale.setScalar(QUEEN_SCALE / 2.2);
    const holeGeometry = new CircleGeometry(1.9, 18).rotateX(-Math.PI / 2);
    const dark = new MeshBasicMaterial({ color: 0x1c1012, transparent: true, opacity: 0.7 });
    const hole = new Mesh(holeGeometry, dark);
    hole.position.set(0, tile.height + 0.03, 0);
    group.add(rig.group, crown);
    group.rotation.y = yaw;
    const base = tile.height;
    group.position.set(0, base, 0);
    this.structureGeometries.push(crownGeometry, spike, holeGeometry);
    this.structureMaterials.push(gold, dark);
    this.queenRig = rig;
    this.queen = { group, hole, rig, base, yaw, rise: 1 };
    const holder = new Group();
    holder.add(group, hole);
    this.terrain.group.add(holder);
    this.near.push(holder);
  }

  private queenRig: CreatureRig | null = null;

  private showBeacons(
    map: FaceMap,
    heads: { sector: number; fortified: boolean }[],
    village: AlienHouse[],
  ): void {
    const blocked = new Set(village.map((h) => hexKey(h)));
    const pole = new CylinderGeometry(0.06, 0.08, 2.4, 6);
    const body = new SphereGeometry(0.42, 10, 7);
    const head = new SphereGeometry(0.24, 8, 6);
    const beak = new ConeGeometry(0.06, 0.5, 5).rotateX(Math.PI / 2 + 0.5);
    const halo = new SphereGeometry(1, 12, 8);
    const wall = new CylinderGeometry(0.75, 0.85, 0.35, 8, 1, true);
    const wood = new MeshStandardMaterial({ color: 0x5a3b22, flatShading: true, fog: false });
    const glow = new MeshStandardMaterial({
      color: 0xfff1b8,
      emissive: 0xffd86b,
      emissiveIntensity: 1.1,
      flatShading: true,
      fog: false,
    });
    const aura = new MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const stone = new MeshStandardMaterial({ color: 0x9a8a76, flatShading: true, fog: false });
    this.structureGeometries.push(pole, body, head, beak, halo, wall);
    this.structureMaterials.push(wood, glow, stone);
    this.beaconAura = aura;
    // One holder for the level of detail: each beacon keeps its own visibility.
    const holder = new Group();
    this.terrain.group.add(holder);
    this.near.push(holder);
    for (const h of heads) {
      const spot = landingTile(h.sector, blocked);
      const tile = getTile(map, spot) ?? sectorMiddle(map, h.sector);
      if (!tile) continue;
      const p = worldPosition(tile);
      const beacon = new Group();
      beacon.position.set(p.x, tile.height, p.z);
      beacon.scale.setScalar(0.65);
      const stick = new Mesh(pole, wood);
      stick.position.y = 1.2;
      const kiwi = new Group();
      kiwi.position.y = 2.75;
      kiwi.rotation.y = Math.atan2(-p.x, -p.z);
      const b = new Mesh(body, glow);
      b.scale.set(1, 0.85, 1.15);
      const hd = new Mesh(head, glow);
      hd.position.set(0, 0.28, 0.36);
      const bk = new Mesh(beak, glow);
      bk.position.set(0, 0.2, 0.68);
      const light = new Mesh(halo, aura);
      light.scale.setScalar(1.1);
      kiwi.add(b, hd, bk, light);
      beacon.add(stick, kiwi);
      if (h.fortified) {
        const ring = new Mesh(wall, stone);
        ring.position.y = 0.17;
        beacon.add(ring);
      }
      this.beaconKiwis.push(kiwi);
      this.beacons.set(h.sector, { group: beacon, pop: 1 });
      holder.add(beacon);
    }
  }

  /**
   * Chantier 41: the alien village seen on the parcels we have eyes on, each building at the
   * age its parcel had then (one merged geometry: one draw call). On a pool of juice, a building
   * stands on a mound of earth.
   */
  private showVillage(map: FaceMap, village: AlienHouse[]): void {
    if (village.length === 0) return;
    const parts: BufferGeometry[] = [];
    const mt = new Matrix4();
    const mound = new CylinderGeometry(0.75, 0.95, 0.5, 8).toNonIndexed();
    mound.deleteAttribute('uv');
    const earth = new Color('#5a3d26');
    const colors = new Float32Array(mound.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([earth.r, earth.g, earth.b], i);
    mound.setAttribute('color', new Float32BufferAttribute(colors, 3));
    for (const h of village) {
      const tile = getTile(map, h);
      if (!tile) continue;
      const p = worldPosition(tile);
      const wet = tile.type === 'juice';
      const y = tile.height + (wet ? 0.25 : 0);
      if (wet) parts.push(mound.clone().applyMatrix4(mt.makeTranslation(p.x, tile.height, p.z)));
      // Turned by a hash of the tile, roughly facing the middle of the face.
      const yaw = Math.atan2(-p.x, -p.z) + (((h.q * 7 + h.r * 13) % 5) - 2) * 0.35;
      mt.makeRotationY(yaw).setPosition(p.x, y, p.z);
      parts.push(alienGeometry(h.kind, h.age).clone().applyMatrix4(mt));
    }
    mound.dispose();
    if (parts.length === 0) return;
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) return;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      flatShading: true,
      fog: false,
    });
    this.structureGeometries.push(merged);
    this.structureMaterials.push(material);
    const mesh = new Mesh(merged, material);
    this.terrain.group.add(mesh);
    this.near.push(mesh);
  }

  /**
   * Distance along the ray to the planet, or null: a sphere around it (cheap enough for every
   * hover, and kinder to a finger than the tiles themselves).
   */
  rayHit(ray: Ray): number | null {
    if (!this.group.visible) return null;
    this.sphere.center.copy(this.group.position);
    this.sphere.radius = this.radius;
    return ray.intersectSphere(this.sphere, this.hitPoint)
      ? ray.origin.distanceTo(this.hitPoint)
      : null;
  }

  /**
   * Chantier 59: shows the ally's village alive (its own buildings, kiwis and paths) instead
   * of the still models, or back to them (null). The view is owned from then on.
   */
  setLife(life: VillageLife | null): void {
    if (this.life === life) return;
    if (this.life) {
      this.terrain.group.remove(this.life.group);
      this.life.dispose();
    }
    this.life = life;
    if (life) {
      this.terrain.group.add(life.group);
      life.bind({ terrain: this.terrain, water: this.water });
    }
    // The village brings its own buildings and obstacles; the ground takes the sun's shadows.
    if (this.friendBuildings) this.friendBuildings.visible = !life;
    // (Detached rather than hidden: the level of detail shows the near parts again.)
    if (this.obstacles) {
      if (life) this.terrain.group.remove(this.obstacles.group);
      else this.terrain.group.add(this.obstacles.group);
    }
    this.terrain.tiles.castShadow = !!life;
    this.terrain.tiles.receiveShadow = !!life;
  }

  get living(): VillageLife | null {
    return this.life;
  }

  setLabelVisible(visible: boolean): void {
    if (this.label) this.label.visible = visible;
  }

  setSky(cloud: Color, shade: Color): void {
    (this.fogMaterial.uniforms.uCloud!.value as Color).copy(cloud);
    (this.fogMaterial.uniforms.uShade!.value as Color).copy(shade);
  }

  dispose(): void {
    this.setLife(null);
    this.terrain.dispose();
    this.water?.dispose();
    this.obstacles?.dispose();
    this.buildingMaterial?.dispose();
    this.buildingGeometry?.dispose();
    const farMaterial = this.far.material as MeshStandardMaterial;
    farMaterial.map?.dispose();
    farMaterial.dispose();
    this.far.geometry.dispose();
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
    for (const layer of this.fog) layer.geometry.dispose();
    for (const g of this.structureGeometries) g.dispose();
    for (const m of this.structureMaterials) m.dispose();
    this.beaconAura?.dispose();
    this.queenRig?.dispose();
    this.fogMaterial.dispose();
  }
}

/** The friend's name, on a ribbon floating above their planet. */
function nameLabel(name: string, fill = 'rgba(246, 234, 208, 0.92)', stroke = '#b88a5a'): Sprite {
  const canvas = document.createElement('canvas');
  const wide = name.length > 18;
  canvas.width = wide ? 512 : 256;
  canvas.height = 64;
  const w = canvas.width;
  const g = canvas.getContext('2d')!;
  g.fillStyle = fill;
  g.strokeStyle = stroke;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(4, 6, w - 8, 52, 26);
  g.fill();
  g.stroke();
  g.fillStyle = '#4a3324';
  g.font = '600 30px Alegreya, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, wide ? 34 : 18), w / 2, 33);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new Sprite(new SpriteMaterial({ map: texture, fog: false, depthTest: false }));
}

/** The land tile of a sector nearest to the middle of its slice and ring (chantier 19). */
function sectorMiddle(map: FaceMap, sector: number): Tile | undefined {
  const slice = sector % (INTEL.sectors / 2);
  const a = ((slice + 0.5) * Math.PI) / 3;
  const r = sector >= INTEL.sectors / 2 ? 14 : 5;
  const x = r * Math.cos(a);
  const y = r * Math.sin(a);
  let best: Tile | undefined;
  let bestD = Infinity;
  for (const tile of map.tiles) {
    if (tile.type === 'juice' || sectorOf(tile.q, tile.r) !== sector) continue;
    const p = hexToPixel(tile);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = tile;
    }
  }
  return best;
}

/**
 * The far level of detail (chantier 24): every tile painted as a dot of its colour on a disc
 * at the mean tile height; under fog of war, veiled by the clouds.
 */
function farDisc(map: FaceMap, radius: number, fog: boolean): Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const px = size / (2 * radius);
  const step = hexToPixel({ q: 1, r: 0 }).x;
  const c = new Color();
  let height = 0;
  for (const tile of map.tiles) {
    const p = worldPosition(tile);
    height += tile.height;
    g.fillStyle = `#${tileTopColor(tile, c, map.params.biome).getHexString()}`;
    g.beginPath();
    g.arc((p.x + radius) * px, (p.z + radius) * px, step * 0.56 * px, 0, Math.PI * 2);
    g.fill();
  }
  if (fog) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `#${PALETTE.cloud.getHexString()}`;
    g.globalAlpha = 0.78;
    g.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const geometry = new CircleGeometry(radius - 0.6, 48).rotateX(-Math.PI / 2);
  // CircleGeometry's UVs run from -X/+Y: flip V so the canvas (+Z down) lines up.
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ map: texture, transparent: true, roughness: 1, fog: false }),
  );
  mesh.position.y = map.tiles.length ? height / map.tiles.length : 0;
  return mesh;
}

/** 1 for each sector seen (the order of `sectorOf`). */
function seenMask(intel: TwinIntel | null | undefined): number[] {
  const mask = new Array<number>(INTEL.sectors).fill(0);
  for (const i of intel?.sectors ?? []) mask[i] = 1;
  return mask;
}
