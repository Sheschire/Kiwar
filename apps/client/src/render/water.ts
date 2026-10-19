import type {
  Vector3} from 'three';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial
} from 'three';
import { getTile, HEX_DIRECTIONS, type FaceMap, type Tile } from '@kiwar/shared';
import { GLSL_NOISE } from './shaderChunks';
import { worldPosition } from './terrain';

/** Water surface height above the pool basin. */
export const WATER_LEVEL = 0.2;

function createFlatHexGeometry(radius: number): BufferGeometry {
  const positions: number[] = [];
  const corner = (i: number) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  };
  for (let i = 0; i < 6; i++) positions.push(0, 0, 0, ...corner((i + 1) % 6), ...corner(i));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return g;
}

/**
 * Animated kiwi-juice pools: one instanced hex per juice tile, with sun glints,
 * a fresnel sky tint and foam along edges that touch land.
 */
export class WaterView {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;

  constructor(map: FaceMap, sunDirection: Vector3) {
    const pools = map.tiles.filter((t) => t.type === 'juice');
    const geometry = createFlatHexGeometry(1.0);
    // For each of the 6 edges: 1 if the neighbour in that direction is land.
    const shoreA = new Float32Array(pools.length * 3);
    const shoreB = new Float32Array(pools.length * 3);
    pools.forEach((tile, i) => {
      const shore = HEX_DIRECTIONS.map((d) => {
        const n = getTile(map, { q: tile.q + d.q, r: tile.r + d.r });
        return n && n.type === 'juice' ? 0 : 1;
      });
      shoreA.set(shore.slice(0, 3), i * 3);
      shoreB.set(shore.slice(3, 6), i * 3);
    });
    geometry.setAttribute('aShoreA', new InstancedBufferAttribute(shoreA, 3));
    geometry.setAttribute('aShoreB', new InstancedBufferAttribute(shoreB, 3));

    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sunDirection.clone().normalize() },
        uShallow: { value: new Color('#c9dc2e') },
        uDeep: { value: new Color('#6f9a10') },
        uSky: { value: new Color('#f3d9f0') },
        uFoam: { value: new Color('#fffbe8') },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aShoreA;
        attribute vec3 aShoreB;
        varying vec3 vWorld;
        varying vec2 vLocal;
        varying vec3 vShoreA;
        varying vec3 vShoreB;
        void main() {
          vLocal = position.xz;
          vShoreA = aShoreA;
          vShoreB = aShoreB;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir, uShallow, uDeep, uSky, uFoam;
        varying vec3 vWorld;
        varying vec2 vLocal;
        varying vec3 vShoreA;
        varying vec3 vShoreB;
        ${GLSL_NOISE}

        float edgeDist(int i) {
          // Neighbour direction i sits at angle -60° * i in the XZ plane (pointy-top axial).
          float a = -1.0471976 * float(i);
          vec2 n = vec2(cos(a), sin(a));
          return 0.8660254 - dot(vLocal, n);
        }

        void main() {
          float t = uTime;
          vec2 p = vWorld.xz;
          // Two scrolling noise layers fake gentle ripples.
          float h1 = kNoise(p * 1.6 + vec2(t * 0.35, t * 0.22));
          float h2 = kNoise(p * 2.7 - vec2(t * 0.27, -t * 0.31));
          float h = h1 * 0.6 + h2 * 0.4;
          float e = 0.02;
          float hx = kNoise((p + vec2(e, 0.0)) * 1.6 + vec2(t * 0.35, t * 0.22)) * 0.6
                   + kNoise((p + vec2(e, 0.0)) * 2.7 - vec2(t * 0.27, -t * 0.31)) * 0.4;
          float hz = kNoise((p + vec2(0.0, e)) * 1.6 + vec2(t * 0.35, t * 0.22)) * 0.6
                   + kNoise((p + vec2(0.0, e)) * 2.7 - vec2(t * 0.27, -t * 0.31)) * 0.4;
          vec3 normal = normalize(vec3((h - hx) * 3.5, 1.0, (h - hz) * 3.5));

          // Distance to the closest shore edge (only edges touching land count).
          float shore = 10.0;
          if (vShoreA.x > 0.5) shore = min(shore, edgeDist(0));
          if (vShoreA.y > 0.5) shore = min(shore, edgeDist(1));
          if (vShoreA.z > 0.5) shore = min(shore, edgeDist(2));
          if (vShoreB.x > 0.5) shore = min(shore, edgeDist(3));
          if (vShoreB.y > 0.5) shore = min(shore, edgeDist(4));
          if (vShoreB.z > 0.5) shore = min(shore, edgeDist(5));

          vec3 viewDir = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          float depthMix = smoothstep(0.05, 0.6, shore);
          vec3 col = mix(uShallow, uDeep, depthMix * (0.65 + 0.35 * h));
          col = mix(col, uSky, fresnel * 0.35);

          // Soft caustic-like ridges.
          float ridge = 1.0 - abs(kNoise(p * 2.2 + vec2(t * 0.2, -t * 0.15)) * 2.0 - 1.0);
          col += vec3(0.95, 1.0, 0.6) * pow(ridge, 6.0) * 0.18;

          // Sun glints (sparkles that bloom).
          vec3 refl = reflect(-uSunDir, normal);
          float spec = pow(max(dot(refl, viewDir), 0.0), 60.0);
          float sparkleNoise = kNoise(p * 11.0 + vec2(t * 1.3, -t * 0.9));
          float sparkle = smoothstep(0.86, 0.95, sparkleNoise) * (0.5 + 0.5 * sin(t * 3.0 + p.x * 7.0));
          col += vec3(1.0, 0.98, 0.88) * (spec * 1.2 + sparkle * (0.9 + spec * 4.0));

          // Animated foam lines along the shore.
          float wave = sin(shore * 26.0 - t * 2.4 + h * 4.0) * 0.5 + 0.5;
          float foamBand = smoothstep(0.12, 0.0, shore);
          float foamRipple = smoothstep(0.3, 0.05, shore) * step(0.8, wave) * 0.6;
          float foamNoise = kNoise(p * 6.0 + t * 0.4);
          float foam = clamp(foamBand * (0.75 + 0.5 * foamNoise) + foamRipple * foamNoise, 0.0, 1.0);
          col = mix(col, uFoam, foam);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new InstancedMesh(geometry, this.material, Math.max(pools.length, 1));
    this.mesh.count = pools.length;
    const m = new Matrix4();
    pools.forEach((tile: Tile, i) => {
      const p = worldPosition(tile);
      m.makeTranslation(p.x, tile.height + WATER_LEVEL, p.z);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.receiveShadow = false;
  }

  update(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
