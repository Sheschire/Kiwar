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
  Vector3,
  type PerspectiveCamera,
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
import { FRONT_AZIMUTH } from './front';

/**
 * Where the twin floats: towards the front, hidden above the frame when zoomed in, half
 * showing at the top of the screen at the normal zoom (1.0) and fully in the upper sky from a
 * slight zoom out (`ZOOM_IN` → `ZOOM_OUT`, ratios of the framing distance, chantier 17).
 * `BEHIND`: extra distance beyond the target, so it hangs past our rim.
 */
const ZOOM_IN = 0.6;
const ZOOM_OUT = 1.15;
const BEHIND = 34;
const LEAN = 0.45;
/** Seen from afar: a little smaller than our own half. */
const SCALE = 0.68;
export interface TwinOptions {
  fog: boolean;
  friend?: TwinSnapshot | null;
  /** Alien face: what our scouts saw (the clouds part over those sectors, chantier 07). */
  intel?: IntelReport | null;
  /** Placed by its owner (an ally's planet far away) instead of following the camera. */
  anchored?: boolean;
  /** Ribbon under an alien twin ("Alien face — to colonise"), so it reads as a target. */
  caption?: string;
}

/** Fog layers over the twin surface (local heights). */
const FOG_LAYERS = [1.2, 1.9, 2.6];

/**
 * The other half of our kiwi, floating high above the colony (chantier 05). It is only seen
 * when the camera zooms out, leans towards it so its surface shows, and turns slowly. Under
 * fog of war (alien face) only its silhouette is visible: the client never knows what happens
 * there. Rendered without shadows nor props, so it stays cheap on phones. When a friend lives
 * there (shared universe), no fog: their pools, buildings and name show instead.
 */
export class TwinView {
  readonly group = new Group();
  private readonly spin = new Group();
  private readonly terrain: TerrainView;
  private readonly fogMaterial: ShaderMaterial;
  private readonly fog: Mesh[] = [];
  private readonly lean = new Vector3();
  private readonly tmp = new Vector3();
  private readonly right = new Vector3();
  /** World radius of the twin (for its apparent size). */
  readonly radius: number;
  private readonly anchored: boolean;

  private water: WaterView | null = null;
  private buildingMaterial: MeshStandardMaterial | null = null;
  private label: Sprite | null = null;
  private caption: Sprite | null = null;

  private structureGeometries: (ConeGeometry | SphereGeometry)[] = [];
  private structureMaterials: MeshStandardMaterial[] = [];

  constructor(map: FaceMap, opts: TwinOptions) {
    this.anchored = !!opts.anchored;
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
    if (opts.caption && !opts.friend && !opts.anchored) {
      // Chantier 17: says what the half is, so it reads as a target, not a far moon.
      this.caption = nameLabel(opts.caption, 'rgba(232, 240, 214, 0.9)', '#7d9a4a');
      this.caption.material.transparent = true;
      // After the fog layers, which would veil it.
      this.caption.renderOrder = 10;
      this.caption.scale.set(radius * 1.1, radius * 0.1375, 1);
      this.group.add(this.caption);
    }
    this.group.add(this.spin);
    this.group.scale.setScalar(SCALE);
  }

  /**
   * Places the twin in the sky, always towards the colony's front (`FRONT_AZIMUTH`): like the
   * moon, it keeps its place in the sky while the camera turns (it slides off screen when the
   * player looks the other way) and keeps the same orientation; it rises into the upper sky as
   * the player zooms out (`zoom`: camera distance / framing distance) and turns slowly.
   */
  update(time: number, camera: PerspectiveCamera, target: Vector3, zoom: number): void {
    const forward = this.tmp.subVectors(target, camera.position);
    const distance = forward.length();
    // The view's pitch, but facing the front whatever the camera azimuth.
    const pitch = Math.asin(Math.min(1, Math.max(-1, -forward.y / distance)));
    forward.set(
      Math.sin(FRONT_AZIMUTH) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(FRONT_AZIMUTH) * Math.cos(pitch),
    );
    const right = this.right.crossVectors(forward, camera.up).normalize();
    const vHalf = (camera.fov * Math.PI) / 360;
    const along = distance + BEHIND;
    const angularRadius = Math.atan(this.radius / along);
    const k = smoothstep((zoom - ZOOM_IN) / (ZOOM_OUT - ZOOM_IN));
    const hidden = vHalf + angularRadius * 1.15;
    const shown = vHalf * 0.6;
    const angle = hidden + (shown - hidden) * k;
    // Tilt the front direction up by `angle` around its right axis.
    const dir = this.lean.copy(forward).applyAxisAngle(right, angle);
    this.group.position.copy(camera.position).addScaledVector(dir, along);
    this.group.position.y += Math.sin(time * 0.3) * 0.6;
    this.group.visible = k > 0.001;
    // Fixed orientation: as seen from the side opposite the front.
    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(FRONT_AZIMUTH - Math.PI);
    this.group.rotateX(LEAN);
    this.spin.rotation.y = time * 0.02;
    this.fogMaterial.uniforms.uTime!.value = time;
    if (this.caption && this.group.visible) {
      // Over the visible top of the half (its bottom hides behind our rim), once in view.
      this.group.updateMatrixWorld();
      this.tmp.copy(this.group.position).addScaledVector(camera.up, this.radius * 0.25);
      this.caption.position.copy(this.group.worldToLocal(this.tmp));
      this.caption.material.opacity = smoothstep((k - 0.75) / 0.25);
      this.caption.visible = k > 0.75;
    }
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
    const e = this.terrain.extent();
    if (this.anchored) {
      // An ally's planet: the name floats high above its middle, readable from afar.
      this.label.position.set(0, 16, 0);
      this.label.scale.set(28, 7, 1);
    } else {
      // Above the far rim (the group leans towards the camera, its -Z side is up on screen).
      this.label.position.set(0, 6, -Math.max(e.x, e.z) - 2);
      this.label.scale.set(16, 4, 1);
    }
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
    for (const sprite of [this.label, this.caption]) {
      if (!sprite) continue;
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const layer of this.fog) layer.geometry.dispose();
    for (const g of this.structureGeometries) g.dispose();
    for (const m of this.structureMaterials) m.dispose();
    this.fogMaterial.dispose();
  }
}

/** The friend's name (or the alien face's caption), on a ribbon floating by their half. */
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

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
