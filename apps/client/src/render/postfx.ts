import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  KernelSize,
  RenderPass,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import {
  Color,
  HalfFloatType,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { QualitySettings } from './quality';

/**
 * Post-processing chain: AO (N8AO) → bloom, tilt-shift, colour grading, tone mapping, vignette.
 * All effects are merged into a single EffectPass to keep the number of full-screen passes low.
 */
export class PostFx {
  readonly composer: EffectComposer;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    quality: QualitySettings,
  ) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: HalfFloatType,
      multisampling: quality.msaa,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    if (quality.ao) {
      const ao = new N8AOPostPass(scene, camera, 1, 1);
      // Kept short and soft: a wide, dark screen-space AO slides around objects as the camera
      // moves (it only knows what is on screen), and at half resolution its edges shimmer.
      ao.configuration.aoRadius = 0.9;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 1.5;
      ao.configuration.color = new Color('#3a2238');
      ao.configuration.halfRes = false;
      ao.setQualityMode('Medium');
      this.composer.addPass(ao);
    }

    const effects: Effect[] = [];
    if (quality.bloom) {
      effects.push(
        new BloomEffect({
          intensity: 0.55,
          luminanceThreshold: 0.82,
          luminanceSmoothing: 0.25,
          mipmapBlur: true,
          radius: 0.6,
        }),
      );
    }
    if (quality.tiltShift) {
      effects.push(
        new TiltShiftEffect({
          focusArea: 0.75,
          feather: 0.2,
          offset: 0.04,
          kernelSize: KernelSize.SMALL,
        }),
      );
    }
    effects.push(
      new HueSaturationEffect({ saturation: 0.08, hue: 0 }),
      new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.06 }),
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.32, darkness: 0.42 }),
    );
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height, false);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
