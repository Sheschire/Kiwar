import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/**
 * Chantier 23: a breeze in the grass, the down tufts and the fur. All in the vertex shader (no
 * CPU work per prop): every instance sways from its base, more at the top, with a phase from
 * its position so that gusts roll across the face. Static shadows do not follow (unnoticed).
 */
export const windUniforms = {
  uWindTime: { value: 0 },
  /** 0 = still (low quality), 1 = the normal breeze. */
  uWindAmount: { value: 1 },
};

/** Patches an instanced standard material; `sway` = world units per unit of height. */
export function withWind(material: Material, sway: number): void {
  const previous = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;
        uniform float uWindAmount;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
        if (uWindAmount > 0.0) {
          // Props stand in an unrotated group: the instance's own frame is enough.
          float h = max(0.0, (mat3(instanceMatrix) * transformed).y);
          float phase = dot(instanceMatrix[3].xz, vec2(0.21, 0.13));
          float gust = 0.6 + 0.4 * sin(uWindTime * 0.37 + phase * 0.5);
          float s = sin(uWindTime * 1.7 + phase) + 0.35 * sin(uWindTime * 3.1 + phase * 2.3);
          vec3 offset = vec3(0.8, 0.0, 0.6) * s * gust * h * h * ${sway.toFixed(3)} * uWindAmount;
          mvPosition += viewMatrix * vec4(offset, 0.0);
          gl_Position = projectionMatrix * mvPosition;
        }
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `${key()}|wind${sway}`;
}
