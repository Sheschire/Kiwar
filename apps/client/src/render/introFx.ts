// Effects of the intro's cut (chantiers 10 and 22): the whole round kiwi, the blade's trail,
// the juice that splashes out, the strands of juice, the wet flesh of the fresh cut.
import {
  AdditiveBlending,
  DoubleSide,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
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
          // Chantier 22: the seam where the blade will pass, a faint pale line.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.8, 0.55), 0.55 * (1.0 - smoothstep(0.004, 0.022, abs(vObj.x))));
        }`,
      );
  };
  material.customProgramCacheKey = () => 'kiwar-whole-kiwi';
  const mesh = new Mesh(new SphereGeometry(1, 64, 48), material);
  // Hairs lie along the fruit, towards its ends, parted along the seam.
  addFurShells(mesh, new Vector3(1, 0, 0), 0.03);
  return mesh;
}

/** The blade's quad spans the seam's circle with this much margin around it. */
export const RING = 1.15;

const FUR_LAYERS = 14;
/** Shake of the fur after the blade's blow (shared by every fur shell, intro only). */
export const furShiver = { value: 0 };
/** Length of the hairs, as a share of the radius. */
const FUR_LENGTH = 0.06;

/**
 * Shell fur: copies of the mesh, a little larger each, keeping only the pixels of hairs long
 * enough to reach that layer (one hair per cell of a 3D grid on the unit surface). Roots dark,
 * tips lighter. `lean`: object-space direction the hairs bend towards. Intro only (one draw per
 * layer). The copies share the geometry: dispose only their materials (`disposeFur`).
 */
export function addFurShells(mesh: Mesh, lean: Vector3, parting = 0): void {
  for (let i = 1; i <= FUR_LAYERS; i++) {
    const layer = i / FUR_LAYERS;
    const material = new MeshStandardMaterial({ color: '#6e4b2c', roughness: 1 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLayer = { value: layer };
      shader.uniforms.uLean = { value: lean };
      shader.uniforms.uParting = { value: parting };
      shader.uniforms.uShiver = furShiver;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFur;\nuniform float uShiver;\nuniform float uLayer;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vFur = position;
          // Chantier 22: the hairs quiver after the blow, the tips most.
          transformed += normal * uShiver * uLayer * 0.04 * sin(dot(position, vec3(37.0, 23.0, 41.0)));`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vFur;
          uniform float uLayer;
          uniform vec3 uLean;
          uniform float uParting;
          float furHash(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // No hair on the seam (the plane x = 0), so the cut line shows.
            if (abs(normalize(vFur).x) < uParting) discard;
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
    material.customProgramCacheKey = () => `kiwar-fur-${i}-${parting > 0 ? 'p' : 'n'}`;
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

/** A soft halo behind the whole fruit, pulsing while it waits for the player. */
export interface Glow {
  sprite: Sprite;
  /** Pulse, 0 (dim) → 1 (bright). */
  set(pulse: number): void;
  dispose(): void;
}

export function createGlow(): Glow {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 238, 190, 1)');
  grad.addColorStop(0.4, 'rgba(214, 240, 150, 0.55)');
  grad.addColorStop(1, 'rgba(160, 120, 220, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const map = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  const sprite = new Sprite(material);
  sprite.renderOrder = -1;
  return {
    sprite,
    set(pulse) {
      material.opacity = 0.22 + 0.28 * pulse;
    },
    dispose() {
      map.dispose();
      material.dispose();
    },
  };
}

/**
 * The blade (chantier 22): a bright streak running along the seam itself — the front half of
 * the cut's circle, drawn in the plane of the cut — its tail fading out behind it. The quad
 * spans the circle (radius 1 / `RING`), local X towards the camera, local Y the seam's long
 * axis. `progress` 0 → 1 moves the head from the top end to the bottom end; `fade` dims it.
 */
export class BladeTrail {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
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
          vec2 p = (vUv - 0.5) * 2.0 * ${RING.toFixed(2)};
          // Only the front half of the circle (towards the camera) is the visible seam.
          if (p.x < 0.0) discard;
          float r = length(p);
          float ring = 1.0 - smoothstep(0.0, 0.05, abs(r - 1.0));
          // 0 at the top end of the seam, 1 at the bottom end.
          float along = atan(p.x, p.y) / 3.14159265;
          float d = uHead - along;
          float tail = d < 0.0 ? 0.0 : 1.0 - smoothstep(0.0, 0.5, d);
          // A brighter spark at the head of the blade.
          float spark = exp(-d * d * 900.0) * (1.0 - smoothstep(0.0, 0.12, abs(r - 1.0)));
          float a = max(ring * tail, spark) * uFade;
          if (a < 0.002) discard;
          float core = 1.0 - smoothstep(0.0, 0.02, abs(r - 1.0));
          vec3 color = mix(vec3(0.78, 0.95, 0.72), vec3(1.0, 1.0, 0.96), max(core, spark));
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
  age: number;
  life: number;
}

const GRAVITY = 26;
/** Fine juice thrown out by the blade, plus room for the drips of the strands. */
const JUICE = 100;
const DRIPS = 48;
const SEEDS = 16;
const UP = new Vector3(0, 1, 0);

/**
 * Juice and a few seeds splashing out of the cut (a fine spray, chantier 22), and the drops
 * the strands of juice let go of when they break (`drip`). Each drop falls, stretches along
 * its fall and shrinks away over its own life.
 */
export class JuiceBurst {
  readonly drops: InstancedMesh;
  readonly seeds: InstancedMesh;
  private readonly juice: Drop[] = [];
  private readonly pips: Drop[] = [];
  private rand = seeded(7);
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly dir = new Vector3();
  private readonly axis = new Vector3(0.3, 1, 0.2).normalize();

  constructor() {
    this.drops = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshStandardMaterial({
        color: new Color('#b4e05a'),
        emissive: new Color('#36561a'),
        roughness: 0.12,
        transparent: true,
        opacity: 0.8,
      }),
      JUICE + DRIPS,
    );
    this.seeds = new InstancedMesh(
      new IcosahedronGeometry(1, 0).scale(0.55, 1, 0.55),
      new MeshStandardMaterial({ color: '#1f160e', roughness: 0.3 }),
      SEEDS,
    );
    for (const mesh of [this.drops, this.seeds]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.count = 0;
      mesh.renderOrder = 5;
    }
  }

  /**
   * Sprays from the seam (the plane x = 0) of a fruit of radius `radius`, turned by `pose`
   * (the fruit's orientation when cut).
   */
  burst(radius: number, pose: Quaternion): void {
    const rand = (this.rand = seeded(7));
    const s = radius / 14;
    const spawn = (out: Drop[], count: number, size: () => number) => {
      out.length = 0;
      for (let i = 0; i < count; i++) {
        // Along the seam's rim, where the blade runs, thrown out sideways from the cut,
        // upwards and a little towards the camera.
        const a = rand() * Math.PI * 2;
        const r = radius * (0.75 + rand() * 0.25);
        const side = rand() < 0.5 ? -1 : 1;
        out.push({
          p: new Vector3(side * rand() * 0.4, Math.cos(a) * r, Math.sin(a) * r).applyQuaternion(
            pose,
          ),
          v: new Vector3(side * (2 + rand() * 9) * s, 0, 0)
            .applyQuaternion(pose)
            .add(new Vector3(0, (3 + rand() * 10) * s, (2 + rand() * 8) * s)),
          size: size(),
          spin: rand() * Math.PI * 2,
          age: 0,
          life: 1.1 + rand() * 0.7,
        });
      }
    };
    spawn(this.juice, JUICE, () => (0.04 + rand() * 0.11) * s);
    spawn(this.pips, SEEDS, () => (0.1 + rand() * 0.05) * s);
    this.drops.visible = true;
    this.seeds.visible = true;
  }

  /** A few drops falling from a broken strand of juice at `p`. */
  drip(p: Vector3, count: number, size: number): void {
    const rand = this.rand;
    for (let i = 0; i < count && this.juice.length < JUICE + DRIPS; i++)
      this.juice.push({
        p: p.clone(),
        v: new Vector3((rand() - 0.5) * 3, -rand() * 2, (rand() - 0.5) * 3).multiplyScalar(
          size * 4,
        ),
        size: size * (0.5 + rand() * 0.6),
        spin: 0,
        age: 0,
        life: 0.9 + rand() * 0.6,
      });
    this.drops.visible = true;
  }

  update(dt: number): void {
    if (this.drops.visible) this.drops.visible = this.write(this.drops, this.juice, dt, true);
    if (this.seeds.visible) this.seeds.visible = this.write(this.seeds, this.pips, dt, false);
  }

  /** Moves the drops and writes their matrices; false once they are all gone. */
  private write(mesh: InstancedMesh, drops: Drop[], dt: number, juice: boolean): boolean {
    let alive = false;
    drops.forEach((d, i) => {
      d.age += dt;
      const k = Math.min(1, d.age / d.life);
      const size = d.size * (1 - k * k);
      if (size > 0) alive = true;
      d.v.y -= GRAVITY * dt;
      d.p.addScaledVector(d.v, dt);
      if (juice) {
        // Drops stretch along their fall.
        const speed = d.v.length();
        this.q.setFromUnitVectors(UP, this.dir.copy(d.v).divideScalar(speed || 1));
        this.s.set(size, size * (1 + Math.min(1.6, speed * 0.04)), size);
      } else {
        d.spin += dt * 5;
        this.q.setFromAxisAngle(this.axis, d.spin);
        this.s.setScalar(size);
      }
      this.m.compose(d.p, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
    });
    mesh.count = drops.length;
    mesh.instanceMatrix.needsUpdate = true;
    return alive;
  }

  dispose(): void {
    for (const mesh of [this.drops, this.seeds]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }
}

const STRANDS = 12;

interface Strand {
  /** Ends on each half, in its pivot's space. */
  a: Vector3;
  b: Vector3;
  /** Length at which it breaks (its length when the halves touch, plus some stretch). */
  breaks: number;
  thick: number;
  broken: boolean;
}

/**
 * Strands of juice stretching between the two halves as they part (chantier 22): each a
 * sagging thread in two segments, thinner as it stretches, until it breaks and drips.
 */
export class JuiceStrands {
  readonly mesh: InstancedMesh;
  private readonly strands: Strand[] = [];
  private pivots: [Object3D, Object3D] | null = null;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly pa = new Vector3();
  private readonly pb = new Vector3();
  private readonly mid = new Vector3();
  private readonly dir = new Vector3();

  constructor() {
    const geometry = new CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    this.mesh = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({
        color: new Color('#b4e05a'),
        emissive: new Color('#36561a'),
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
      }),
      STRANDS * 2,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }

  /**
   * Anchors the strands on the cut while the halves still touch: points of the seam (radius
   * `radius`, plane x = 0 turned by `pose`) seen from each half's pivot, `lift` above it.
   */
  attach(a: Object3D, b: Object3D, radius: number, pose: Quaternion, lift: number): void {
    const rand = seeded(11);
    this.pivots = [a, b];
    this.strands.length = 0;
    a.updateMatrixWorld();
    b.updateMatrixWorld();
    for (let i = 0; i < STRANDS; i++) {
      const ang = rand() * Math.PI * 2;
      const r = radius * Math.sqrt(0.05 + rand() * 0.75);
      const p = new Vector3(0, Math.cos(ang) * r, Math.sin(ang) * r).applyQuaternion(pose);
      // On the flesh of each cut (`lift` above the pivot, where the veil lies).
      const ea = a.worldToLocal(p.clone()).setY(lift);
      const eb = b.worldToLocal(p.clone()).setY(lift);
      const rest = a.localToWorld(ea.clone()).distanceTo(b.localToWorld(eb.clone()));
      this.strands.push({
        a: ea,
        b: eb,
        breaks: rest + radius * (0.3 + rand() * 0.9),
        thick: radius * (0.011 + rand() * 0.016),
        broken: false,
      });
    }
    this.mesh.visible = true;
  }

  /** Follows the halves; returns how many strands broke this frame (they drip into `juice`). */
  update(juice: JuiceBurst): number {
    if (!this.pivots || !this.mesh.visible) return 0;
    const [a, b] = this.pivots;
    let broke = 0;
    let shown = 0;
    this.strands.forEach((st, i) => {
      if (st.broken) return;
      a.localToWorld(this.pa.copy(st.a));
      b.localToWorld(this.pb.copy(st.b));
      const length = this.pa.distanceTo(this.pb);
      if (length > st.breaks) {
        st.broken = true;
        broke++;
        juice.drip(this.mid.addVectors(this.pa, this.pb).multiplyScalar(0.5), 4, st.thick * 1.3);
        return;
      }
      // Thinner as it stretches (the same juice spread over a longer thread), sagging.
      const thick = st.thick * Math.sqrt(1 / (1 + length / (st.thick * 40)));
      this.mid.addVectors(this.pa, this.pb).multiplyScalar(0.5);
      this.mid.y -= length * 0.18;
      this.segment(i * 2, this.pa, this.mid, thick);
      this.segment(i * 2 + 1, this.mid, this.pb, thick);
      shown++;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (shown === 0) this.mesh.visible = false;
    return broke;
  }

  private segment(index: number, from: Vector3, to: Vector3, thick: number): void {
    const length = this.dir.subVectors(to, from).length();
    this.q.setFromUnitVectors(UP, this.dir.divideScalar(length || 1));
    this.s.set(thick, length, thick);
    this.m.compose(from, this.q, this.s);
    this.mesh.setMatrixAt(index, this.m);
  }

  /** Hides every strand (skip). */
  clear(): void {
    this.mesh.visible = false;
    this.pivots = null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
  }
}

/** Seeded random numbers in [0, 1) (the intro looks the same every time). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

let fleshTexture: CanvasTexture | null = null;

/**
 * Kiwi flesh, drawn once on a canvas (chantier 22): a creamy white heart, fibres radiating
 * from it, a ring of black teardrop seeds, bright green flesh darkening outwards and a pale
 * band under the skin.
 */
function fleshMap(): CanvasTexture {
  if (fleshTexture) return fleshTexture;
  const size = 512;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const rand = seeded(23);
  const flesh = g.createRadialGradient(c, c, 0, c, c, c);
  flesh.addColorStop(0, '#f6f3d6');
  flesh.addColorStop(0.16, '#eef0c0');
  flesh.addColorStop(0.24, '#b9dd63');
  flesh.addColorStop(0.62, '#8cc63a');
  flesh.addColorStop(0.86, '#77b02c');
  flesh.addColorStop(0.93, '#c4df86');
  flesh.addColorStop(0.97, '#7a5a36');
  flesh.addColorStop(1, '#5a3e26');
  g.fillStyle = flesh;
  g.fillRect(0, 0, size, size);
  // Fibres radiating from the heart.
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = c * (0.1 + rand() * 0.1);
    const r1 = c * (0.45 + rand() * 0.45);
    g.strokeStyle = rand() < 0.5 ? 'rgba(236, 248, 196, 0.32)' : 'rgba(98, 150, 34, 0.28)';
    g.lineWidth = 1 + rand() * 2.5;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.stroke();
  }
  // The ring of seeds, pointing outwards.
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand() * 0.05;
    const r = c * (0.27 + rand() * 0.1);
    g.save();
    g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    g.rotate(a);
    g.fillStyle = rand() < 0.2 ? '#3a2a18' : '#18110b';
    g.beginPath();
    g.ellipse(0, 0, 7 + rand() * 3, 3 + rand(), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  fleshTexture = new CanvasTexture(canvas);
  fleshTexture.colorSpace = SRGBColorSpace;
  return fleshTexture;
}

/**
 * The fresh cut on a half (chantier 22): a disc of wet kiwi flesh over its face, with a
 * brief warm glow, melting away (a dissolve through noise) to reveal the colony's tiles.
 */
export class FleshVeil {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private readonly melt = { value: 0 };
  private readonly sheen = { value: 0 };

  constructor(radius: number) {
    this.material = new MeshStandardMaterial({
      map: fleshMap(),
      roughness: 0.14,
      metalness: 0,
      emissive: new Color('#ffb860'),
      emissiveIntensity: 0,
      side: DoubleSide,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uMelt = this.melt;
      shader.uniforms.uSheen = this.sheen;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uMelt;\nuniform float uSheen;\n${GLSL_NOISE}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            // Melts from the rim inwards, through noise; a wet bright lip at the edge.
            vec2 q = vMapUv - 0.5;
            float n = kNoise(q * 9.0) * 0.6 + kNoise(q * 23.0) * 0.4;
            float edge = n * 0.55 + (1.0 - length(q) * 2.0) * 0.45;
            if (edge < uMelt) discard;
            diffuseColor.rgb += vec3(0.25, 0.3, 0.12) * (1.0 - smoothstep(0.0, 0.05, edge - uMelt)) * step(0.001, uMelt);
            // Wet glints: thin bright streaks across the flesh.
            float band = abs(dot(q, vec2(0.6, 0.8)) - 0.12 - 0.06 * kNoise(q * 14.0));
            diffuseColor.rgb += vec3(0.32) * pow(max(0.0, 1.0 - band * 7.0), 8.0);
            // Chantier 32: a grazing light sweeps slowly across while the cut is looked at,
            // catching the seeds' ring and the fibres.
            if (uSheen > 0.0) {
              float sweep = dot(q, vec2(0.8, -0.6)) - (uSheen * 1.3 - 0.65);
              float fade = sin(uSheen * 3.14159);
              diffuseColor.rgb += vec3(0.3, 0.27, 0.14) * exp(-sweep * sweep * 30.0) * fade;
            }
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          // Juicy flesh stays bright whatever the light (a little of its own colour).
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3;',
        );
    };
    this.material.customProgramCacheKey = () => 'kiwar-flesh-veil';
    this.mesh = new Mesh(new CircleGeometry(radius, 64).rotateX(-Math.PI / 2), this.material);
    this.mesh.visible = false;
  }

  /**
   * `glow` 0 → 1 (warm light on the fresh cut), `melt` 0 (whole) → 1 (gone), `sheen` 0 → 1
   * (the grazing light's sweep across the flesh; 0 = none).
   */
  set(glow: number, melt: number, sheen: number): void {
    this.material.emissiveIntensity = glow * 0.35;
    this.melt.value = melt;
    this.sheen.value = sheen;
    this.mesh.visible = melt < 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
