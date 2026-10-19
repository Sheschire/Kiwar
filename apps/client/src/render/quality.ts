export const QUALITY_PRESETS = ['low', 'medium', 'high'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];
export type QualityChoice = QualityPreset | 'auto';

export interface QualitySettings {
  preset: QualityPreset;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
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
}

export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1.25,
    shadowMapSize: 1024,
    postprocessing: false,
    ao: false,
    bloom: false,
    tiltShift: false,
    msaa: 0,
    propDensity: 0.45,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1.5,
    shadowMapSize: 2048,
    postprocessing: true,
    ao: false,
    bloom: true,
    tiltShift: false,
    msaa: 2,
    propDensity: 0.75,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    postprocessing: true,
    ao: true,
    bloom: true,
    tiltShift: true,
    msaa: 4,
    propDensity: 1,
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
    if (v === 'auto' || (QUALITY_PRESETS as readonly string[]).includes(v ?? '')) return v as QualityChoice;
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

function gpuRendererName(): string {
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
  if (/mali-[gt]?[0-7]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) hd graphics [2-5]/.test(gpu)) return 'low';
  if (mobile) return 'medium';
  if (/apple m\d|apple gpu|nvidia|geforce|rtx|radeon|amd|iris xe|arc/.test(gpu)) return 'high';
  return 'medium';
}

export function lowerPreset(p: QualityPreset): QualityPreset | null {
  return p === 'high' ? 'medium' : p === 'medium' ? 'low' : null;
}
