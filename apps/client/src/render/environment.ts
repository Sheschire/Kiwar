import {
  BackSide,
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
import { PALETTE } from './palette';
import { GLSL_NOISE } from './shaderChunks';

/**
 * Soft pastel cosmic environment around the floating kiwi disc:
 * gradient sky with twinkling procedural stars, a drifting sea of cream clouds
 * below the disc and a few distant kiwi moons.
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
        uZenith: { value: PALETTE.skyZenith },
        uMid: { value: PALETTE.skyMid },
        uHorizon: { value: PALETTE.skyHorizon },
        uBelow: { value: PALETTE.skyBelow },
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
        uniform float uTime;
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
          float neb = kFbm(uv * vec2(2.2, 2.6) + vec2(uTime * 0.004, 0.0));
          col += vec3(0.10, 0.04, 0.10) * smoothstep(0.45, 0.8, neb) * smoothstep(0.05, 0.6, h);
          // Procedural stars: one candidate per cell, brighter higher in the sky.
          vec3 cell = floor(d * 140.0);
          float rnd = kHash3(cell);
          if (rnd > 0.985) {
            vec3 center = (cell + 0.5) / 140.0;
            float dist = length(d - normalize(center)) * 140.0;
            float tw = 0.6 + 0.4 * sin(uTime * (1.0 + rnd * 3.0) + rnd * 60.0);
            float star = smoothstep(0.5, 0.0, dist) * tw * smoothstep(0.05, 0.5, h);
            col += vec3(1.0, 0.95, 0.85) * star * 0.9;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const sky = new Mesh(new SphereGeometry(500, 32, 16), this.skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);

    this.cloudMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCloud: { value: PALETTE.cloud },
        uShade: { value: PALETTE.cloudShade },
        uFade: { value: PALETTE.skyBelow },
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
          float n = kFbm(p + vec2(uTime * 0.012, uTime * 0.006));
          float n2 = kFbm(p * 2.1 - vec2(uTime * 0.02, 0.0));
          float puff = smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.45);
          vec3 col = mix(uShade, uCloud, puff);
          float r = length(vWorld.xz);
          float alpha = (0.55 + 0.45 * puff) * (1.0 - smoothstep(120.0, 260.0, r));
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
