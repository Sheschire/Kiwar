import { ShaderChunk } from 'three';

/**
 * Low quality shadows. In three r180 the PCF filter reads the shadow map 17 times per lit pixel
 * (depth packed in RGBA, compared by hand): heavy for integrated GPUs. The game never uses
 * `BasicShadowMap` (one hard tap), so its branch of the directional-light shadow becomes a
 * light 4-read PCF, picked by the low preset (see `GameRenderer.applyPreset`).
 */
const BASIC =
  /(#elif defined\( SHADOWMAP_TYPE_VSM \)\s*shadow = VSMShadow\( shadowMap, shadowCoord\.xy, shadowCoord\.z \);\s*#else)\s*shadow = texture2DCompare\( shadowMap, shadowCoord\.xy, shadowCoord\.z \);/;

const LITE = /* glsl */ `
      // Four reads on a grid of (radius / 2) texels, blended bilinearly: a soft edge without
      // the stairs of a few separate taps.
      vec2 liteSize = shadowMapSize / max(1.0, shadowRadius * 0.5);
      vec2 liteUv = shadowCoord.xy * liteSize - 0.5;
      vec2 liteF = fract(liteUv);
      vec2 liteStep = 1.0 / liteSize;
      vec2 liteBase = (floor(liteUv) + 0.5) * liteStep;
      float s00 = texture2DCompare( shadowMap, liteBase, shadowCoord.z );
      float s10 = texture2DCompare( shadowMap, liteBase + vec2( liteStep.x, 0.0 ), shadowCoord.z );
      float s01 = texture2DCompare( shadowMap, liteBase + vec2( 0.0, liteStep.y ), shadowCoord.z );
      float s11 = texture2DCompare( shadowMap, liteBase + liteStep, shadowCoord.z );
      shadow = mix( mix( s00, s10, liteF.x ), mix( s01, s11, liteF.x ), liteF.y );`;

/** Whether the light PCF is in place (false if three changed its chunk: hard shadows then). */
export const liteShadows = BASIC.test(ShaderChunk.shadowmap_pars_fragment);
if (liteShadows)
  ShaderChunk.shadowmap_pars_fragment = ShaderChunk.shadowmap_pars_fragment.replace(
    BASIC,
    (_, head: string) => `${head}${LITE}`,
  );
