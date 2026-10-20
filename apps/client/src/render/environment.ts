import {
  BackSide,
  type Color,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
} from 'three';
import type { SkyState } from './dayCycle';
import { PALETTE } from './palette';
import { GLSL_NOISE } from './shaderChunks';

/**
 * Soft pastel cosmic environment around the floating kiwi disc:
 * gradient sky with twinkling procedural stars, a living sea of cream clouds below the disc
 * (rolling billows, a swell, gaps over a starry deep; plain drift in low quality) and a few
 * distant kiwi moons.
 */
export class Environment {
  readonly group = new Group();
  private readonly skyMaterial: ShaderMaterial;
  private readonly cloudMaterial: ShaderMaterial;
  private readonly moons: Group[] = [];

  constructor(scene: Scene) {
    this.skyMaterial = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uZenith: { value: PALETTE.skyZenith.clone() },
        uMid: { value: PALETTE.skyMid.clone() },
        uHorizon: { value: PALETTE.skyHorizon.clone() },
        uBelow: { value: PALETTE.skyBelow.clone() },
        uStars: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uStars;
        uniform vec3 uZenith, uMid, uHorizon, uBelow;
        varying vec3 vDir;
        ${GLSL_NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, h));
          col = mix(col, uZenith, smoothstep(0.3, 0.95, h));
          col = mix(col, uBelow, smoothstep(0.0, -0.4, h));
          // Soft nebula swirls.
          vec2 uv = vec2(atan(d.z, d.x), h * 2.0);
          vec2 nebUv = uv * vec2(2.2, 2.6) + vec2(uTime * 0.004, 0.0);
          #ifdef KIWAR_LITE
            // Low quality: two octaves (+ the mean of the two left out).
            float neb = 0.5 * kNoise(nebUv) + 0.25 * kNoise(nebUv * 2.03 + vec2(17.1, 9.2)) + 0.094;
          #else
            float neb = kFbm(nebUv);
          #endif
          col += vec3(0.10, 0.04, 0.10) * smoothstep(0.45, 0.8, neb) * smoothstep(0.05, 0.6, h);
          // Procedural stars: one candidate per cell, brighter higher in the sky.
          vec3 cell = floor(d * 140.0);
          float rnd = kHash3(cell);
          if (rnd > 0.985) {
            vec3 center = (cell + 0.5) / 140.0;
            float dist = length(d - normalize(center)) * 140.0;
            float tw = 0.6 + 0.4 * sin(uTime * (1.0 + rnd * 3.0) + rnd * 60.0);
            float star = smoothstep(0.5, 0.0, dist) * tw * smoothstep(0.05, 0.5, h);
            col += vec3(1.0, 0.95, 0.85) * star * 0.9 * uStars;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const sky = new Mesh(new SphereGeometry(500, 32, 16), this.skyMaterial);
    sky.frustumCulled = false;
    // Drawn after the opaque scene (it sits on the far plane): the depth test then skips the
    // pixels the colony covers before the noise runs, instead of shading the whole screen.
    sky.renderOrder = 50;
    this.group.add(sky);

    this.cloudMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCloud: { value: PALETTE.cloud.clone() },
        uShade: { value: PALETTE.cloudShade.clone() },
        uFade: { value: PALETTE.skyBelow.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCloud, uShade, uFade;
        varying vec2 vUv;
        varying vec3 vWorld;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vWorld.xz * 0.035;
          #ifdef KIWAR_LITE
            // Low quality: the plain drifting sea, one noise for the fine puffs.
            float n = kFbm(p + vec2(uTime * 0.012, uTime * 0.006));
            float n2 = kNoise(p * 2.1 - vec2(uTime * 0.02, 0.0)) * 0.94;
            float puff = smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.45);
            vec3 col = mix(uShade, uCloud, puff);
            float hole = 0.0;
          #else
            // Chantier 17: a living sea, same two noises: the fine puffs are warped by the
            // big billows (they roll and boil), a slow swell runs across, and gaps open
            // over a starry deep.
            float n = kFbm(p + vec2(uTime * 0.02, uTime * 0.009));
            float n2 = kFbm(p * 2.1 + vec2(n * 1.6) - vec2(uTime * 0.035, -uTime * 0.012));
            float d = n * 0.7 + n2 * 0.45;
            float puff = smoothstep(0.35, 0.75, d);
            float swell = sin(dot(vWorld.xz, vec2(0.05, 0.032)) - uTime * 0.45 + n * 4.0);
            vec3 col = mix(uShade, uCloud, clamp(puff + swell * 0.1, 0.0, 1.0));
            float hole = 1.0 - smoothstep(0.3, 0.44, d);
            vec2 cell = floor(vWorld.xz * 0.6);
            float rnd = kHash(cell);
            float star = 0.0;
            if (rnd > 0.93) {
              vec2 f = fract(vWorld.xz * 0.6) - 0.5;
              float tw = 0.55 + 0.45 * sin(uTime * (1.5 + rnd * 3.0) + rnd * 40.0);
              star = smoothstep(0.22, 0.0, length(f)) * tw;
            }
            col = mix(col, mix(uFade, uShade, 0.5) * 0.72 + vec3(1.0, 0.95, 0.85) * star, hole);
          #endif
          float r = length(vWorld.xz);
          float alpha = max(0.55 + 0.45 * puff, hole * 0.9) * (1.0 - smoothstep(120.0, 260.0, r));
          // Blend into the sky colour towards the horizon.
          col = mix(col, uFade, smoothstep(160.0, 260.0, r));
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    const clouds = new Mesh(new PlaneGeometry(600, 600, 1, 1), this.cloudMaterial);
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -26;
    clouds.renderOrder = -5;
    this.group.add(clouds);

    const moonSpecs = [
      { x: -140, y: 55, z: -190, s: 9, tilt: 0.6 },
      { x: 210, y: 85, z: -120, s: 5, tilt: -0.9 },
      { x: 60, y: 40, z: 230, s: 6.5, tilt: 2.2 },
    ];
    for (const spec of moonSpecs) {
      const moon = createKiwiMoon(spec.s);
      moon.position.set(spec.x, spec.y, spec.z);
      moon.rotation.set(spec.tilt, spec.tilt * 0.7, 0.3);
      this.moons.push(moon);
      this.group.add(moon);
    }

    scene.add(this.group);
  }

  /** Day/night colours of the sky and the cloud sea (`night` 0–1 brightens the stars). */
  setSky(sky: SkyState): void {
    const u = this.skyMaterial.uniforms;
    (u.uZenith!.value as Color).copy(sky.zenith);
    (u.uMid!.value as Color).copy(sky.mid);
    (u.uHorizon!.value as Color).copy(sky.horizon);
    (u.uBelow!.value as Color).copy(sky.below);
    u.uStars!.value = 1 + sky.night * 0.8;
    const c = this.cloudMaterial.uniforms;
    (c.uCloud!.value as Color).copy(sky.cloud);
    (c.uShade!.value as Color).copy(sky.cloudShade);
    (c.uFade!.value as Color).copy(sky.below);
  }

  /** Low quality: lighter sky and cloud noise (integrated GPUs pay for every pixel). */
  setLite(lite: boolean): void {
    for (const m of [this.skyMaterial, this.cloudMaterial]) {
      if ('KIWAR_LITE' in m.defines === lite) continue;
      if (lite) m.defines.KIWAR_LITE = '';
      else delete m.defines.KIWAR_LITE;
      m.needsUpdate = true;
    }
  }

  update(time: number): void {
    this.skyMaterial.uniforms.uTime!.value = time;
    this.cloudMaterial.uniforms.uTime!.value = time;
    for (let i = 0; i < this.moons.length; i++) {
      const m = this.moons[i]!;
      m.rotation.y += 0.0006 * (i + 1);
      m.position.y += Math.sin(time * 0.2 + i) * 0.004;
    }
  }
}

function createKiwiMoon(radius: number): Group {
  const g = new Group();
  const skin = new Mesh(
    new SphereGeometry(radius, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new MeshStandardMaterial({ color: PALETTE.moonSkin, roughness: 1, fog: false }),
  );
  skin.rotation.x = Math.PI;
  const flesh = new Mesh(
    new CircleGeometry(radius, 28),
    new MeshBasicMaterial({ color: PALETTE.moonFlesh, fog: false }),
  );
  flesh.rotation.x = -Math.PI / 2;
  flesh.position.y = 0.01;
  const core = new Mesh(
    new CircleGeometry(radius * 0.28, 20),
    new MeshBasicMaterial({ color: PALETTE.moonCore, fog: false }),
  );
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.02;
  g.add(skin, flesh, core);
  return g;
}
