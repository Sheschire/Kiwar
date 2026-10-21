import { ObstaclesView } from './obstacles';
import type { Color } from 'three';
import {
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  SphereGeometry,
  DoubleSide,
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
  landTileNear,
  type FaceMap,
  type IntelReport,
  type TwinSnapshot,
} from '@kiwar/shared';
import { buildingGeometry } from './buildingModels';
import { WaterView, WATER_LEVEL } from './water';
import { PALETTE } from './palette';
import { GLSL_NOISE } from './shaderChunks';
import { TerrainView, worldPosition } from './terrain';
import { planetOrientation, type SpacePoint } from './space';

/** Seen from afar: a little smaller than our own half. */
const SCALE = 0.68;
/** One turn on itself every five minutes (chantier 24), a gentle bob. */
const SPIN = (Math.PI * 2) / 300;
const BOB = 0.5;
export interface TwinOptions {
  fog: boolean;
  friend?: TwinSnapshot | null;
  /** Alien face: what our scouts saw (the clouds part over those sectors, chantier 07). */
  intel?: IntelReport | null;
}

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
  private label: Sprite | null = null;

  private structureGeometries: (ConeGeometry | SphereGeometry)[] = [];
  private structureMaterials: MeshStandardMaterial[] = [];

  constructor(map: FaceMap, opts: TwinOptions) {
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
        uSeen: { value: seenMask(opts.intel) },
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
    else if (opts.intel) this.showStructures(map, opts.intel);
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

  /** Slow spin and bob; a planet being visited holds still (`frozen`). */
  update(dt: number, time: number, frozen = false, phase = 0): void {
    if (!frozen) {
      this.angle += dt * SPIN;
      this.group.position.y = this.home.y + Math.sin(time * 0.25 + phase) * BOB;
    }
    this.spin.rotation.y = this.angle;
    this.fogMaterial.uniforms.uTime!.value = time;
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
    for (const b of friend.buildings) {
      const tile = getTile(map, b);
      if (!tile) continue;
      const mesh = new Mesh(buildingGeometry(b.type, b.level), material);
      const p = worldPosition(b);
      const y = tile.type === 'juice' ? tile.height + WATER_LEVEL - 0.08 : tile.height;
      mesh.position.set(p.x, y, p.z);
      mesh.rotation.y = Math.atan2(p.x, p.z) + Math.PI;
      this.terrain.group.add(mesh);
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

  /** Dens and roosts seen by the scouts, frozen as they were reported. */
  private showStructures(map: FaceMap, intel: IntelReport): void {
    const den = new SphereGeometry(0.42, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const roost = new ConeGeometry(0.28, 1.3, 6);
    const denMat = new MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true, fog: false });
    const roostMat = new MeshStandardMaterial({ color: 0x3d2f4f, flatShading: true, fog: false });
    this.structureGeometries.push(den, roost);
    this.structureMaterials.push(denMat, roostMat);
    for (const s of intel.structures) {
      const tile = landTileNear(map, s.q, s.r);
      if (!tile) continue;
      const mesh = s.kind === 'den' ? new Mesh(den, denMat) : new Mesh(roost, roostMat);
      const p = worldPosition(tile);
      mesh.position.set(p.x, tile.height + (s.kind === 'den' ? 0 : 0.6), p.z);
      this.terrain.group.add(mesh);
    }
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

  setLabelVisible(visible: boolean): void {
    if (this.label) this.label.visible = visible;
  }

  setSky(cloud: Color, shade: Color): void {
    (this.fogMaterial.uniforms.uCloud!.value as Color).copy(cloud);
    (this.fogMaterial.uniforms.uShade!.value as Color).copy(shade);
  }

  dispose(): void {
    this.terrain.dispose();
    this.water?.dispose();
    this.obstacles?.dispose();
    // Building geometries are cached and shared with the colony: only the material goes.
    this.buildingMaterial?.dispose();
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
    for (const layer of this.fog) layer.geometry.dispose();
    for (const g of this.structureGeometries) g.dispose();
    for (const m of this.structureMaterials) m.dispose();
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

/** 1 for each sector seen (the order of `sectorOf`). */
function seenMask(intel: IntelReport | null | undefined): number[] {
  const mask = new Array<number>(INTEL.sectors).fill(0);
  for (const i of intel?.sectors ?? []) mask[i] = 1;
  return mask;
}
