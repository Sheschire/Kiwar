import type { Color } from 'three';
import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  type MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { FaceMap } from '@kiwar/shared';
import { PALETTE } from './palette';
import { GLSL_NOISE } from './shaderChunks';
import { TerrainView } from './terrain';

/**
 * Where the twin floats, relative to the view: just above the top of the frame at the normal
 * zoom, sliding into the upper sky as the player zooms out (`ZOOM_IN` → `ZOOM_OUT`, ratios of
 * the framing distance). `BEHIND`: extra distance beyond the target, so it hangs past our rim.
 */
const ZOOM_IN = 1.08;
const ZOOM_OUT = 1.75;
const BEHIND = 34;
const LEAN = 0.45;
/** Seen from afar: a little smaller than our own half. */
const SCALE = 0.55;
/** Fog layers over the twin surface (local heights). */
const FOG_LAYERS = [1.2, 1.9, 2.6];

/**
 * The other half of our kiwi, floating high above the colony (chantier 05). It is only seen
 * when the camera zooms out, leans towards it so its surface shows, and turns slowly. Under
 * fog of war (alien face) only its silhouette is visible: the client never knows what happens
 * there. Rendered without shadows nor props, so it stays cheap on phones.
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
  private readonly radius: number;

  constructor(map: FaceMap, opts: { fog: boolean }) {
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
        uniform float uTime, uRadius;
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
          float alpha = (0.3 + 0.38 * puff) * (1.0 - smoothstep(0.82, 1.0, r + 0.12 * (n2 - 0.5)));
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
    this.group.add(this.spin);
    this.group.scale.setScalar(SCALE);
  }

  /**
   * Places the twin in the sky of the current view (`zoom`: camera distance / framing
   * distance), leaning towards the camera so its surface shows, turning slowly.
   */
  update(time: number, camera: PerspectiveCamera, target: Vector3, zoom: number): void {
    const forward = this.tmp.subVectors(target, camera.position);
    const distance = forward.length();
    forward.normalize();
    const right = this.right.crossVectors(forward, camera.up).normalize();
    const vHalf = (camera.fov * Math.PI) / 360;
    const along = distance + BEHIND;
    const angularRadius = Math.atan(this.radius / along);
    const k = smoothstep((zoom - ZOOM_IN) / (ZOOM_OUT - ZOOM_IN));
    const hidden = vHalf + angularRadius * 1.15;
    const shown = vHalf * 0.62;
    const angle = hidden + (shown - hidden) * k;
    // Tilt the view direction up by `angle` around the camera's right axis.
    const dir = this.lean.copy(forward).applyAxisAngle(right, angle);
    this.group.position.copy(camera.position).addScaledVector(dir, along);
    this.group.position.y += Math.sin(time * 0.3) * 0.6;
    this.group.visible = k > 0.001;
    const azimuth = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(azimuth);
    this.group.rotateX(LEAN);
    this.spin.rotation.y = time * 0.02;
    this.fogMaterial.uniforms.uTime!.value = time;
  }

  setSky(cloud: Color, shade: Color): void {
    (this.fogMaterial.uniforms.uCloud!.value as Color).copy(cloud);
    (this.fogMaterial.uniforms.uShade!.value as Color).copy(shade);
  }

  dispose(): void {
    this.terrain.dispose();
    for (const layer of this.fog) layer.geometry.dispose();
    this.fogMaterial.dispose();
  }
}

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
