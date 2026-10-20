// Effects of the intro's cut (chantier 10): the whole round kiwi, the blade's trail and the
// juice that splashes out.
import {
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { GLSL_NOISE } from './shaderChunks';

/** The whole fruit before the cut: a smooth, round, furry kiwi (radius 1, scaled by the caller). */
export function createWholeKiwi(): Mesh {
  const material = new MeshStandardMaterial({ color: '#7a4e2e', roughness: 0.95 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Fur streaks along the fruit's axis (X), darker towards both ends.
          float a = atan(vObj.z, vObj.y);
          float fur = kNoise(vec2(a * 50.0, vObj.x * 14.0)) * 0.5 + kNoise(vec2(a * 120.0, vObj.x * 34.0)) * 0.5;
          diffuseColor.rgb *= 0.78 + 0.32 * fur;
          diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.55, 1.0, abs(vObj.x));
        }`,
      );
  };
  material.customProgramCacheKey = () => 'kiwar-whole-kiwi';
  const mesh = new Mesh(new SphereGeometry(1, 64, 48), material);
  // Hairs lie along the fruit, towards its ends.
  addFurShells(mesh, new Vector3(1, 0, 0));
  return mesh;
}

const FUR_LAYERS = 14;
/** Length of the hairs, as a share of the radius. */
const FUR_LENGTH = 0.06;

/**
 * Shell fur: copies of the mesh, a little larger each, keeping only the pixels of hairs long
 * enough to reach that layer (one hair per cell of a 3D grid on the unit surface). Roots dark,
 * tips lighter. `lean`: object-space direction the hairs bend towards. Intro only (one draw per
 * layer). The copies share the geometry: dispose only their materials (`disposeFur`).
 */
export function addFurShells(mesh: Mesh, lean: Vector3): void {
  for (let i = 1; i <= FUR_LAYERS; i++) {
    const layer = i / FUR_LAYERS;
    const material = new MeshStandardMaterial({ color: '#6e4b2c', roughness: 1 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLayer = { value: layer };
      shader.uniforms.uLean = { value: lean };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFur;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFur = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vFur;
          uniform float uLayer;
          uniform vec3 uLean;
          float furHash(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Higher layers sample the grid shifted along the lean: the hairs bend.
            vec3 p = normalize(vFur) * 95.0 + uLean * uLayer * 1.8;
            // Warp the grid: without it the sphere slices the cells into visible rings.
            p += 1.6 * sin(p.yzx * 0.11 + p.zxy * 0.07);
            vec3 cell = floor(p);
            float len = 0.35 + 0.65 * furHash(cell);
            vec3 centre = cell + 0.5 + (vec3(furHash(cell + 1.7), furHash(cell + 4.1), furHash(cell + 9.3)) - 0.5) * 0.5;
            float thick = 0.62 * (1.0 - uLayer / len);
            if (uLayer > len || distance(p, centre) > thick) discard;
            float tone = furHash(cell + 3.3);
            diffuseColor.rgb *= (0.35 + 0.85 * uLayer) * (0.8 + 0.4 * tone);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.53, 0.36), 0.45 * uLayer * uLayer);
          }`,
        );
    };
    material.customProgramCacheKey = () => `kiwar-fur-${i}`;
    const shell = new Mesh(mesh.geometry, material);
    shell.scale.setScalar(1 + FUR_LENGTH * layer);
    shell.userData.fur = true;
    mesh.add(shell);
  }
}

/** Disposes the fur materials added by `addFurShells` (the geometry belongs to the mesh). */
export function disposeFur(mesh: Mesh): void {
  for (const child of [...mesh.children]) {
    if (!(child instanceof Mesh) || !child.userData.fur) continue;
    (child.material as MeshStandardMaterial).dispose();
    mesh.remove(child);
  }
}

/**
 * The blade: a thin bright streak sweeping down the seam, its tail fading out (no flash).
 * `progress` 0 → 1 moves the head from the top to the bottom; `fade` dims the whole streak.
 */
export class BladeTrail {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uHead: { value: 0 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHead;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          // Head at 1 - uHead (top to bottom), tail behind it (above).
          float head = 1.0 - uHead;
          float d = vUv.y - head;
          float tail = d < 0.0 ? 0.0 : 1.0 - smoothstep(0.0, 0.45, d);
          float core = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));
          float a = tail * core * uFade;
          vec3 color = mix(vec3(0.78, 0.95, 0.72), vec3(1.0, 1.0, 0.96), core * core);
          gl_FragColor = vec4(color, a);
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  set(progress: number, fade: number): void {
    this.material.uniforms.uHead!.value = progress;
    this.material.uniforms.uFade!.value = fade;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

interface Drop {
  p: Vector3;
  v: Vector3;
  size: number;
  spin: number;
}

const GRAVITY = 26;
const LIFE_S = 1.5;
const JUICE = 150;
const SEEDS = 22;

/** Juice and a few seeds splashing out of the cut, falling and shrinking. */
export class JuiceBurst {
  readonly drops: InstancedMesh;
  readonly seeds: InstancedMesh;
  private readonly juice: Drop[] = [];
  private readonly pips: Drop[] = [];
  private age = Infinity;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly axis = new Vector3(0.3, 1, 0.2).normalize();

  constructor() {
    this.drops = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshStandardMaterial({
        color: new Color('#a6d84a'),
        emissive: new Color('#36561a'),
        roughness: 0.25,
        transparent: true,
        opacity: 0.82,
      }),
      JUICE,
    );
    this.seeds = new InstancedMesh(
      new IcosahedronGeometry(1, 0).scale(0.55, 1, 0.55),
      new MeshStandardMaterial({ color: '#1f160e', roughness: 0.4 }),
      SEEDS,
    );
    for (const mesh of [this.drops, this.seeds]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 5;
    }
  }

  /** Splashes from the seam (the plane x = 0) of a fruit of radius `radius`. */
  burst(radius: number): void {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const spawn = (out: Drop[], count: number, size: () => number) => {
      out.length = 0;
      for (let i = 0; i < count; i++) {
        // Along the blade's path (the visible rim of the seam), a little towards the camera.
        const y = (rand() * 2 - 1) * radius * 0.85;
        const z = radius * (0.4 + rand() * 0.55);
        const side = rand() < 0.5 ? -1 : 1;
        out.push({
          p: new Vector3(side * rand() * 0.6, y, z),
          v: new Vector3(side * (3 + rand() * 11), 4 + rand() * 12, 3 + rand() * 10).multiplyScalar(
            radius / 14,
          ),
          size: size(),
          spin: rand() * Math.PI * 2,
        });
      }
    };
    spawn(this.juice, JUICE, () => (0.08 + rand() * 0.2) * (radius / 14));
    spawn(this.pips, SEEDS, () => (0.12 + rand() * 0.06) * (radius / 14));
    this.age = 0;
    this.drops.visible = true;
    this.seeds.visible = true;
  }

  update(dt: number): void {
    if (this.age > LIFE_S) return;
    this.age += dt;
    const k = Math.min(1, this.age / LIFE_S);
    const shrink = 1 - k * k;
    this.write(this.drops, this.juice, dt, shrink);
    this.write(this.seeds, this.pips, dt, Math.min(1, shrink * 1.4));
    if (this.age > LIFE_S) {
      this.drops.visible = false;
      this.seeds.visible = false;
    }
  }

  private write(mesh: InstancedMesh, drops: Drop[], dt: number, shrink: number): void {
    drops.forEach((d, i) => {
      d.v.y -= GRAVITY * dt;
      d.p.addScaledVector(d.v, dt);
      d.spin += dt * 5;
      // Drops stretch along their fall a little.
      const stretch = 1 + Math.min(0.8, d.v.length() * 0.02);
      this.q.setFromAxisAngle(this.axis, d.spin);
      this.s.set(d.size * shrink, d.size * shrink * stretch, d.size * shrink);
      this.m.compose(d.p, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.drops, this.seeds]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }
}
