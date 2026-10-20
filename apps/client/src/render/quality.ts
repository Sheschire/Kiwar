export const QUALITY_PRESETS = ['low', 'medium', 'high'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];
export type QualityChoice = QualityPreset | 'auto';

export interface QualitySettings {
  preset: QualityPreset;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  /**
   * Most device pixels drawn per frame: large (HiDPI) desktop screens lower their pixel ratio
   * to stay within it, never below 1 (phones stay well under it).
   */
  pixelBudget: number;
  /** 0 disables shadows. Shadows are static (re-rendered only when the scene changes). */
  shadowMapSize: number;
  /** Use the post-processing chain (otherwise render directly with ACES tone mapping). */
  postprocessing: boolean;
  ao: boolean;
  bloom: boolean;
  tiltShift: boolean;
  msaa: number;
  /** Multiplier on the number of decorative props. */
  propDensity: number;
  /** Moving parts of the buildings (presses, wheels, windmills…). */
  buildingAnimations: boolean;
  /** Small particles of the working buildings (drops, chips, smoke). */
  particles: boolean;
}

export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1.25,
    pixelBudget: 1_600_000,
    shadowMapSize: 1024,
    postprocessing: false,
    ao: false,
    bloom: false,
    tiltShift: false,
    msaa: 0,
    propDensity: 0.45,
    buildingAnimations: false,
    particles: false,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1.5,
    pixelBudget: 2_600_000,
    shadowMapSize: 2048,
    postprocessing: true,
    ao: false,
    bloom: true,
    tiltShift: false,
    msaa: 2,
    propDensity: 0.75,
    buildingAnimations: true,
    particles: true,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 2,
    pixelBudget: 4_200_000,
    shadowMapSize: 2048,
    postprocessing: true,
    ao: true,
    bloom: true,
    tiltShift: true,
    msaa: 2,
    propDensity: 1,
    buildingAnimations: true,
    particles: true,
  },
};

const STORAGE_KEY = 'kiwar.quality';

export function loadQualityChoice(): QualityChoice {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  if (fromUrl === 'auto' || (QUALITY_PRESETS as readonly string[]).includes(fromUrl ?? '')) {
    return fromUrl as QualityChoice;
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'auto' || (QUALITY_PRESETS as readonly string[]).includes(v ?? ''))
      return v as QualityChoice;
  } catch {
    // ignore
  }
  return 'auto';
}

export function saveQualityChoice(choice: QualityChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore
  }
}

let gpuName: string | null = null;

/** The GPU name reported by WebGL (cached; empty when hidden by the browser). */
export function gpuRendererName(): string {
  gpuName ??= readGpuName();
  return gpuName;
}

function readGpuName(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name ?? '');
  } catch {
    return '';
  }
}

/** Picks a preset from the device characteristics. The renderer can still step down at runtime. */
export function detectQuality(): QualityPreset {
  const gpu = gpuRendererName().toLowerCase();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 820;
  const mobile = coarse && smallScreen;

  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (memory <= 3 || cores <= 3) return 'low';
  if (/mali-[gt]?[0-7]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) hd graphics [2-5]/.test(gpu))
    return 'low';
  if (mobile) return 'medium';
  if (/apple m\d|apple gpu|nvidia|geforce|rtx|radeon|amd|iris(\(r\))? xe|\barc\b/.test(gpu)) return 'high';
  return 'medium';
}

/** Integrated GPUs of older laptops (e.g. a 2015 MacBook Pro): a lower pixel ratio. */
export const INTEGRATED_MAX_PIXEL_RATIO = 1.25;

export function isIntegratedGpu(gpu: string): boolean {
  const g = gpu.toLowerCase();
  return /intel/.test(g) && !/iris(\(r\))? xe|\barc\b/.test(g);
}

/** Pixel ratio for a canvas of `cssWidth` × `cssHeight` CSS pixels. */
export function pixelRatioFor(
  q: QualitySettings,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  integrated = false,
): number {
  const max = Math.min(
    devicePixelRatio,
    q.maxPixelRatio,
    integrated ? INTEGRATED_MAX_PIXEL_RATIO : Infinity,
  );
  const fit = Math.sqrt(q.pixelBudget / Math.max(1, cssWidth * cssHeight));
  return Math.max(Math.min(1, max), Math.min(max, fit));
}

export function lowerPreset(p: QualityPreset): QualityPreset | null {
  return p === 'high' ? 'medium' : p === 'medium' ? 'low' : null;
}
