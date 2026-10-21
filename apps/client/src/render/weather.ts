import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  NormalBlending,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
} from 'three';
import { getTile, hashSeed, type CalendarView, type FaceMap, type GameState } from '@kiwar/shared';
import { worldPosition } from './terrain';

type WeatherKind = 'rain' | 'snow' | 'leaves' | 'fireflies';

interface KindDef {
  count: number;
  color: string;
  size: number;
  /** Fall speed (units per second); fireflies hover. */
  fall: number;
  sway: number;
  additive: boolean;
  /** Box height above the ground. */
  height: number;
}

const KINDS: Record<WeatherKind, KindDef> = {
  rain: {
    count: 900,
    color: '#d8e6ff',
    size: 0.32,
    fall: 9,
    sway: 0.05,
    additive: false,
    height: 14,
  },
  snow: {
    count: 700,
    color: '#ffffff',
    size: 0.13,
    fall: 0.9,
    sway: 0.5,
    additive: false,
    height: 12,
  },
  leaves: {
    count: 160,
    color: '#d9792c',
    size: 0.2,
    fall: 0.7,
    sway: 0.9,
    additive: false,
    height: 10,
  },
  fireflies: {
    count: 140,
    color: '#f6ff9a',
    size: 0.16,
    fall: 0,
    sway: 0.6,
    additive: true,
    height: 1.6,
  },
};

/**
 * Cosmetic weather and night life: rain in spring, falling leaves in autumn, snow in winter,
 * fireflies at night and glowing windows. Particles are animated in the vertex shader (no CPU
 * work per particle); the weather of a day is drawn from a hash of the date, so every player of
 * a universe sees the same sky.
 */
export class WeatherView {
  readonly group = new Group();
  private readonly layers = new Map<WeatherKind, { points: Points; material: ShaderMaterial }>();
  private readonly glows: Sprite[] = [];
  private readonly glowMaterial: SpriteMaterial;
  private glowSig = '';
  private density = 1;

  constructor(
    private readonly map: FaceMap,
    radius: number,
  ) {
    for (const kind of Object.keys(KINDS) as WeatherKind[]) {
      const def = KINDS[kind];
      const seeds = new Float32Array(def.count * 4);
      for (let i = 0; i < def.count; i++) {
        // Uniform over the disc of the face.
        const r = radius * Math.sqrt(hash01(kind, i, 0));
        const a = Math.PI * 2 * hash01(kind, i, 1);
        seeds.set(
          [Math.cos(a) * r, hash01(kind, i, 2), Math.sin(a) * r, hash01(kind, i, 3)],
          i * 4,
        );
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(new Float32Array(def.count * 3), 3),
      );
      geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
      geometry.boundingSphere = null;
      const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: def.additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uAmount: { value: 0 },
          uColor: { value: new Color(def.color) },
          uSize: { value: def.size },
          uFall: { value: def.fall },
          uSway: { value: def.sway },
          uHeight: { value: def.height },
          uKind: { value: Object.keys(KINDS).indexOf(kind) },
          uScale: { value: 1000 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uAmount, uSize, uFall, uSway, uHeight, uKind, uScale;
          varying float vAlpha;
          varying float vSeed;
          void main() {
            vSeed = aSeed.w;
            vec3 p = vec3(aSeed.x, 0.0, aSeed.z);
            float phase = aSeed.y * uHeight;
            if (uFall > 0.0) {
              p.y = uHeight - mod(phase + uTime * uFall * (0.8 + 0.4 * aSeed.w), uHeight);
            } else {
              p.y = 0.25 + phase + 0.3 * sin(uTime * 0.7 + aSeed.w * 40.0);
            }
            float t = uTime * (0.5 + aSeed.w);
            p.x += sin(t + aSeed.w * 17.0) * uSway;
            p.z += cos(t * 0.8 + aSeed.w * 23.0) * uSway;
            // Only a share of the particles show, depending on how strong the weather is.
            vAlpha = step(aSeed.w, uAmount);
            if (uKind > 2.5) vAlpha *= 0.5 + 0.5 * sin(uTime * 2.3 + aSeed.w * 50.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * uScale / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uKind;
          varying float vAlpha;
          varying float vSeed;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float shape;
            if (uKind < 0.5) shape = step(abs(d.x + d.y * 0.15), 0.05); // slanted rain streak
            else if (uKind < 1.5) shape = smoothstep(0.5, 0.2, length(d)); // snowflake
            else if (uKind < 2.5) shape = step(length(d * vec2(1.0, 1.8)), 0.45); // leaf
            else shape = smoothstep(0.5, 0.0, length(d)); // firefly glow
            float a = shape * vAlpha;
            if (a < 0.02) discard;
            vec3 col = uColor;
            if (uKind > 1.5 && uKind < 2.5) col = mix(uColor, vec3(0.85, 0.65, 0.2), vSeed);
            gl_FragColor = vec4(col, a * (uKind < 0.5 ? 0.55 : 0.9));
            #include <colorspace_fragment>
          }
        `,
      });
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 5;
      this.group.add(points);
      this.layers.set(kind, { points, material });
    }

    this.glowMaterial = new SpriteMaterial({
      map: glowTexture(),
      color: new Color('#ffcf7a'),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
  }

  /** Low quality: fewer particles. */
  setDensity(density: number): void {
    this.density = density;
  }

  /**
   * A soft halo at night over the buildings where kiwis sleep or work (chantier 23: an empty
   * building stays dark; the panes themselves are `WindowsView`). Without the list (before the
   * first sync of the buildings) the Nest and the huts glow.
   */
  sync(state: GameState, lit: ReadonlySet<string> | null): void {
    const glowing = state.buildings.filter((b) =>
      lit ? lit.has(b.id) : b.type === 'nest' || b.type === 'hut',
    );
    const sig = glowing.map((b) => `${b.q},${b.r},${b.level}`).join(';');
    if (sig === this.glowSig) return;
    this.glowSig = sig;
    for (const g of this.glows) this.group.remove(g);
    this.glows.length = 0;
    for (const b of glowing) {
      const tile = getTile(this.map, b);
      const p = worldPosition(b);
      const s = new Sprite(this.glowMaterial);
      const big = b.type === 'nest' ? 1.6 : b.type === 'hut' ? 1 : 0.85;
      s.position.set(p.x, (tile?.height ?? 0) + 0.7 * big, p.z);
      s.scale.setScalar(2.2 * big);
      s.renderOrder = 6;
      this.glows.push(s);
      this.group.add(s);
    }
  }

  /** Pixels per world unit at distance 1 (point sizes follow the camera like meshes). */
  setViewScale(scale: number): void {
    for (const { material } of this.layers.values()) material.uniforms.uScale!.value = scale;
  }

  update(time: number, c: CalendarView, night: number): void {
    const w = weatherOf(c);
    const amounts: Record<WeatherKind, number> = {
      rain: w.rain,
      snow: w.snow,
      leaves: w.leaves,
      fireflies: c.season === 'winter' ? 0 : night * 0.8,
    };
    for (const [kind, layer] of this.layers) {
      const amount = amounts[kind] * this.density;
      layer.points.visible = amount > 0.01;
      layer.material.uniforms.uTime!.value = time;
      layer.material.uniforms.uAmount!.value = amount;
    }
    this.glowMaterial.opacity = night * 0.85;
    for (const g of this.glows) g.visible = night > 0.02;
  }

  dispose(): void {
    for (const { points, material } of this.layers.values()) {
      points.geometry.dispose();
      material.dispose();
    }
    this.glowMaterial.map?.dispose();
    this.glowMaterial.dispose();
  }
}

/** Weather of the day (cosmetic, deterministic): showers in spring, leaves, snowfalls. */
export function weatherOf(c: CalendarView): { rain: number; snow: number; leaves: number } {
  const h = hashString(`${c.year}/${c.season}/${c.day}`);
  const roll = (h % 1000) / 1000;
  const hour = c.dayProgress;
  // A shower or snowfall covers part of the day, fading in and out.
  const start = (((h >>> 10) % 1000) / 1000) * 0.6;
  const window = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (hour - start) / 0.4))));
  switch (c.season) {
    case 'spring':
      return { rain: roll < 0.55 ? window * 0.9 : 0, snow: 0, leaves: 0 };
    case 'summer':
      return { rain: roll < 0.15 ? window * 0.6 : 0, snow: 0, leaves: 0 };
    case 'autumn':
      return { rain: roll < 0.3 ? window * 0.5 : 0, snow: 0, leaves: 0.35 + 0.5 * roll };
    case 'winter':
      return { rain: 0, snow: roll < 0.75 ? 0.25 + window * 0.75 : 0.15, leaves: 0 };
  }
}

const hashString = (s: string) => hashSeed(s)[0]! >>> 0;

function hash01(kind: string, i: number, k: number): number {
  return (hashString(`${kind}/${i}/${k}`) % 100_000) / 100_000;
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}
