import { h, render } from 'preact';
import type { Vector3 } from 'three';
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
} from 'three';
import type { BuildingType } from '@kiwar/shared';
import { Icon, buildingIcon } from '../ui/iconSet';
import { seasonUniforms } from './seasonLook';

/**
 * Chantier 17: a painted round sign by each building, with the building's interface icon, so
 * a building reads at a glance. Every sign is one instance of a single mesh (one draw call for
 * the whole colony) facing the camera, its icon taken from one shared atlas texture.
 */

/** Building types with a sign, in atlas order (the camp stays a bare camp). */
const SIGNED: readonly BuildingType[] = [
  'nest',
  'hut',
  'warehouse',
  'launchpad',
  'pulpery',
  'fiberWorkshop',
  'seedQuarry',
  'juiceWell',
  'school',
  'library',
  'monument',
  'lab',
  'seedTurret',
  'skyTurret',
  'trainingCamp',
  'forge',
];
const GRID = 4;
const CELL = 128;
/** Width of a sign in world units. */
const SIZE = 0.46;
const MAX_SIGNS = 256;
/** Camera distance up to which a sign keeps its world size, and how much it may grow after. */
const NEAR = 32;
const GROW = 1.7;

export function hasSign(type: BuildingType): boolean {
  return SIGNED.includes(type);
}

let atlas: CanvasTexture | null = null;

/** The atlas: a parchment disc ringed with wood, and the icon of the building on it. */
function signAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID * CELL;
  const g = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  atlas = texture;
  SIGNED.forEach((type, i) => {
    const x = (i % GRID) * CELL;
    const y = Math.floor(i / GRID) * CELL;
    const c = CELL / 2;
    g.beginPath();
    g.arc(x + c, y + c, c - 6, 0, Math.PI * 2);
    g.fillStyle = '#f6ead0';
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#7a5233';
    g.stroke();
    // The interface icon (inline SVG), drawn once loaded.
    const host = document.createElement('div');
    render(h(Icon, { name: buildingIcon(type), size: 80 }), host);
    const svg = host.querySelector('svg');
    if (!svg) return;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.onload = () => {
      g.drawImage(img, x + c - 40, y + c - 40, 80, 80);
      texture.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
  });
  return texture;
}

export interface SignSpot {
  type: BuildingType;
  at: Vector3;
}

export class SignsView {
  readonly mesh: InstancedMesh;
  private readonly cells: InstancedBufferAttribute;
  private readonly material: ShaderMaterial;
  private readonly matrix = new Matrix4();

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    this.cells = new InstancedBufferAttribute(new Float32Array(MAX_SIGNS), 1);
    geometry.setAttribute('aCell', this.cells);
    this.material = new ShaderMaterial({
      uniforms: {
        uMap: { value: signAtlas() },
        uSize: { value: SIZE },
        // Painted, not lit: darker at night (shared with the terrain's day/night look).
        uNight: seasonUniforms.uNight,
      },
      vertexShader: /* glsl */ `
        attribute float aCell;
        uniform float uSize;
        varying vec2 vUv;
        void main() {
          vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          // Grows a little when zoomed out, so the icon still reads at the default zoom
          // (and rises with it, so it never sinks into the ground).
          float k = clamp(distance(center, cameraPosition) / ${NEAR.toFixed(1)}, 1.0, ${GROW.toFixed(2)});
          center.y += (k - 1.0) * uSize * 0.5;
          // Facing the camera: its right and up axes in world space.
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = center + (right * position.x + up * position.y) * uSize * k;
          float col = mod(aCell, ${GRID}.0);
          float row = floor(aCell / ${GRID}.0);
          vUv = vec2((col + uv.x) / ${GRID}.0, 1.0 - (row + 1.0 - uv.y) / ${GRID}.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uNight;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uMap, vUv);
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(c.rgb * (1.0 - 0.6 * uNight), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new InstancedMesh(geometry, this.material, MAX_SIGNS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // Never in the way of a tap on the building or its tile.
    this.mesh.raycast = () => {};
  }

  /** Every sign at once (called when the buildings change). */
  sync(spots: readonly SignSpot[]): void {
    let n = 0;
    for (const s of spots) {
      if (n >= MAX_SIGNS) break;
      const cell = SIGNED.indexOf(s.type);
      if (cell < 0) continue;
      this.matrix.makeTranslation(s.at.x, s.at.y, s.at.z);
      this.mesh.setMatrixAt(n, this.matrix);
      this.cells.setX(n, cell);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cells.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
