import { Color, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import { SEASONS, SEASON_MS, type CalendarView, type Season } from '@kiwar/shared';

/**
 * Season look shared by the terrain, props and buildings: a colour tint of the vegetation and
 * snow on every surface facing up. The uniforms are shared objects, so one update per frame
 * restyles every patched material.
 */
export const seasonUniforms = {
  uSeasonTint: { value: new Color('#ffffff') },
  uSeasonTintAmount: { value: 0 },
  uSnow: { value: 0 },
  /** Moonlight: colours fade towards a cool grey at night (0 by day, 1 deep in the night). */
  uNight: { value: 0 },
};

interface Look {
  tint: Color;
  amount: number;
  snow: number;
}

const LOOKS: Record<Season, Look> = {
  spring: { tint: new Color('#d4f58c'), amount: 0.18, snow: 0 },
  summer: { tint: new Color('#5e9a24'), amount: 0.16, snow: 0 },
  autumn: { tint: new Color('#d98a3a'), amount: 0.5, snow: 0 },
  winter: { tint: new Color('#dfe7ef'), amount: 0.3, snow: 0.85 },
};

/** Share of a season spent blending on each side of a season change (about two hours). */
const BLEND = 0.08;

/** Season look at time `t`, crossfaded around each season change. */
export function updateSeasonLook(c: CalendarView, t: number): void {
  const left = (c.seasonEndsAt - t) / SEASON_MS;
  const fromStart = 1 - left;
  let a = LOOKS[c.season];
  let b = a;
  let k = 0;
  if (left < BLEND) {
    b = LOOKS[c.next];
    k = 0.5 * smooth(1 - left / BLEND);
  } else if (fromStart < BLEND) {
    a = LOOKS[SEASONS[(SEASONS.indexOf(c.season) + 3) % 4]!];
    b = LOOKS[c.season];
    k = 0.5 + 0.5 * smooth(fromStart / BLEND);
  }
  seasonUniforms.uSeasonTint.value.copy(a.tint).lerp(b.tint, k);
  seasonUniforms.uSeasonTintAmount.value = a.amount + (b.amount - a.amount) * k;
  seasonUniforms.uSnow.value = a.snow + (b.snow - a.snow) * k;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Patches a standard material: tints `diffuseColor` (vegetation, `tint` = 0..1 share) and
 * whitens upward-facing fragments with snow. Chains any existing `onBeforeCompile`.
 */
export function withSeasonLook(material: Material, opts: { tint: number; snow: number }): void {
  const previous = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, seasonUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vSeasonUp;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          vec4 seasonN = vec4(objectNormal, 0.0);
          #ifdef USE_INSTANCING
            seasonN = instanceMatrix * seasonN;
          #endif
          vSeasonUp = normalize((modelMatrix * seasonN).xyz).y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vSeasonUp;
        uniform vec3 uSeasonTint;
        uniform float uSeasonTintAmount;
        uniform float uSnow;
        uniform float uNight;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float green = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.8) * 4.0, 0.0, 1.0);
          float tintK = uSeasonTintAmount * ${opts.tint.toFixed(2)} * (0.35 + 0.65 * green);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSeasonTint * (0.55 + 0.45 * dot(diffuseColor.rgb, vec3(0.6))), tintK);
          float snowK = uSnow * ${opts.snow.toFixed(2)} * smoothstep(0.55, 0.85, vSeasonUp);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), snowK);
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, lum * vec3(0.86, 0.9, 1.0), uNight * 0.5);
        }`,
      );
  };
  material.customProgramCacheKey = () => `${key()}|season${opts.tint}/${opts.snow}`;
}
