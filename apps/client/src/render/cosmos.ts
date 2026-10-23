import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

/** Stars of the cosmos (one draw call). */
const STAR_COUNT = 5000;
/** Distance of the cosmos from the camera (inside the sky sphere, drawn on the far plane). */
const RADIUS = 800;
const STAR_TINTS = ['#ffffff', '#fff1d6', '#ffe0b8', '#dce6ff', '#ffd6ec'];
const NEBULAE = [
  { az: 0.6, el: 0.2, size: 520, color: '#8a5cc8', turn: 0.4 },
  { az: 1.9, el: 0.05, size: 430, color: '#d86aa8', turn: 1.7 },
  { az: 3.1, el: 0.32, size: 600, color: '#5a7ad8', turn: 2.5 },
  { az: 4.2, el: 0.1, size: 470, color: '#4aa0b8', turn: 0.9 },
  { az: 5.3, el: 0.24, size: 540, color: '#b06ad0', turn: 3.6 },
  { az: 2.6, el: 0.7, size: 640, color: '#7a5cc0', turn: 5.1 },
];

/** Small seeded generator: the same sky on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chantier 32: the starry cosmos around the face — a field of coloured stars (one `Points`
 * draw call) and a few soft nebulae, at infinity like the sky (the group follows the camera),
 * so it agrees with the map of space (chantier 24). Faint by day (only the brightest stars, the
 * nebulae pale), dense at night. Twinkling is a uniform: it never wakes the frame loop.
 */
export class Cosmos {
  readonly group = new Group();
  private readonly starMaterial: ShaderMaterial;
  private readonly nebulaMaterials: ShaderMaterial[] = [];
  private readonly nebulae = new Group();
  private readonly textures: CanvasTexture[] = [];

  constructor() {
    const random = rng(0x6b697769);
    const positions: number[] = [];
    const colors: number[] = [];
    const mags: number[] = [];
    const phases: number[] = [];
    const tint = new Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform on the sphere down to well below the horizon: the camera mostly looks at the
      // band around it, and the far sky shows below the edge of the cloud sea.
      const y = -0.6 + random() * 1.6;
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(a) * r * RADIUS, y * RADIUS, Math.sin(a) * r * RADIUS);
      tint.set(STAR_TINTS[Math.floor(random() * STAR_TINTS.length)]!);
      colors.push(tint.r, tint.g, tint.b);
      // Most stars are faint: magnitude 0 (brightest) to 1 (faintest), skewed towards 1.
      mags.push(1 - random() ** 2.4);
      phases.push(random() * 60);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aMag', new Float32BufferAttribute(mags, 1));
    geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
    this.starMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uPixel: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aMag;
        attribute float aPhase;
        uniform float uTime, uNight, uPixel;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Just before the far plane (exactly on it, points get clipped): anything in the
          // scene covers the stars.
          gl_Position = vec4(p.xy, p.w * 0.9999, p.w);
          // By day only the brightest stars show; at night all of them.
          float limit = mix(0.4, 1.02, uNight);
          float shown = 1.0 - smoothstep(limit - 0.12, limit, aMag);
          float twinkle = 0.7 + 0.3 * sin(uTime * (0.8 + aPhase * 0.05) + aPhase);
          float elevation = position.y / ${RADIUS.toFixed(1)};
          vAlpha = shown * twinkle * (1.0 - 0.5 * aMag) * mix(1.0, 1.5, uNight)
            * smoothstep(-0.6, -0.3, elevation);
          vColor = aColor;
          gl_PointSize = mix(5.0, 1.8, aMag) * uPixel;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * a, a);
          #include <colorspace_fragment>
        }
      `,
    });
    const stars = new Points(geometry, this.starMaterial);
    stars.frustumCulled = false;
    // Before the cloud sea (-5) among the transparent objects: the clouds veil the stars.
    stars.renderOrder = -10;
    this.group.add(stars);

    const up = new Vector3();
    for (const spec of NEBULAE) {
      const texture = nebulaTexture(random);
      this.textures.push(texture);
      const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: {
          uMap: { value: texture },
          uColor: { value: new Color(spec.color) },
          uOpacity: { value: 0.2 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = vec4(p.xy, p.w * 0.9999, p.w);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float a = texture2D(uMap, vUv).r * uOpacity * smoothstep(0.5, 0.25, length(vUv - 0.5));
            gl_FragColor = vec4(uColor * a, a);
            #include <colorspace_fragment>
          }
        `,
      });
      this.nebulaMaterials.push(material);
      const mesh = new Mesh(new PlaneGeometry(spec.size, spec.size), material);
      mesh.position
        .set(
          Math.cos(spec.az) * Math.cos(spec.el),
          Math.sin(spec.el),
          Math.sin(spec.az) * Math.cos(spec.el),
        )
        .multiplyScalar(RADIUS * 0.98);
      mesh.lookAt(up.set(0, 0, 0));
      mesh.rotateZ(spec.turn);
      mesh.frustumCulled = false;
      mesh.renderOrder = -11;
      this.nebulae.add(mesh);
    }
    this.group.add(this.nebulae);
  }

  /** `night` 0 (day) → 1 (night): more stars, brighter nebulae. */
  setNight(night: number): void {
    this.starMaterial.uniforms.uNight!.value = night;
    for (const m of this.nebulaMaterials) m.uniforms.uOpacity!.value = 0.2 + 0.5 * night;
  }

  /** Device pixels per CSS pixel (the stars keep their size on every screen). */
  setPixelRatio(ratio: number): void {
    this.starMaterial.uniforms.uPixel!.value = ratio;
  }

  /** Low quality: no nebulae (big transparent quads cost fill on weak GPUs). */
  setLite(lite: boolean): void {
    this.nebulae.visible = !lite;
  }

  update(time: number, camera: Vector3): void {
    this.group.position.copy(camera);
    this.starMaterial.uniforms.uTime!.value = time;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    this.starMaterial.dispose();
    for (const m of this.nebulaMaterials) m.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh || o instanceof Points) o.geometry.dispose();
    });
  }
}

/** A soft cloudy blot (red channel = density), fading to nothing at the edges. */
function nebulaTexture(random: () => number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2;
    const d = random() ** 0.7 * size * 0.28;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d * 0.6;
    const r = size * (0.08 + random() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.round(18 + random() * 30);
    grad.addColorStop(0, `rgb(${v},${v},${v})`);
    grad.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  // Raw density, not a colour: no colour-space decoding.
  return new CanvasTexture(canvas);
}
