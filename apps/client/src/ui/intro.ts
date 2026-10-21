import {
  climateOf,
  DEFAULT_FACE_PARAMS,
  drawBiomes,
  FACES,
  generateFace,
  RESOURCE_IDS,
  tileDeposit,
  type BiomeId,
  type Face,
  type FaceMap,
  type FaceParams,
  type Resources,
} from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import type { IntroPhase, IntroScene } from '../render/intro';
import { audio } from '../audio/engine';
import { uiStore } from './store';

/**
 * Chantier 05: the intro and the choice of a face. `new`: a new world (pick a face of the
 * seed's kiwi); `join`: a new colony in a shared universe (only the free faces); `replay`:
 * watching it again from the settings (the colony does not change).
 */
export type IntroMode = 'new' | 'join' | 'replay';

export interface IntroUi {
  mode: IntroMode;
  seed: string;
  biomes: Record<Face, BiomeId>;
  /** Faces already taken in a shared universe, with who holds them. */
  taken: Partial<Record<Face, string>>;
  /** The player's own face (replay). */
  current: Face | null;
  phase: IntroPhase;
  focus: Face;
  /** Sustainable harvest of each resource, 0–1 (1.5 × the classic faces of the seed = full). */
  gauges: Record<Face, Resources>;
}

export interface IntroOptions {
  mode: IntroMode;
  seed: string;
  /** Generation parameters of each face (default: the biomes drawn from the seed). */
  params?: Record<Face, FaceParams>;
  taken?: Partial<Record<Face, string>>;
  current?: Face | null;
  /** Face shown first (default: the player's, or the first free one). */
  focus?: Face;
  /** Called with the chosen face once the camera has dived onto it. */
  onChoose?(face: Face): void;
}

const SEEN_KEY = 'kiwar.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

/** Regrowth of every resource on a face, climate included (what it can sustain). */
function sustainable(map: FaceMap, face: Face): Resources {
  const out: Resources = { pulp: 0, fiber: 0, seeds: 0, juice: 0 };
  const climate = climateOf(face, map.params.biome);
  for (const tile of map.tiles) {
    const dep = tileDeposit(tile, map.params.biome);
    if (dep) out[dep.resource] += dep.regen * climate[dep.resource];
  }
  return out;
}

function gaugesOf(maps: Record<Face, FaceMap>, seed: string): Record<Face, Resources> {
  const ref: Resources = { pulp: 0, fiber: 0, seeds: 0, juice: 0 };
  for (const face of FACES) {
    const r = sustainable(generateFace(seed, face, DEFAULT_FACE_PARAMS), face);
    for (const id of RESOURCE_IDS) ref[id] += r[id] / FACES.length;
  }
  const out = {} as Record<Face, Resources>;
  for (const face of FACES) {
    const v = sustainable(maps[face], face);
    out[face] = { pulp: 0, fiber: 0, seeds: 0, juice: 0 };
    for (const id of RESOURCE_IDS)
      out[face][id] = Math.min(1, ref[id] > 0 ? v[id] / (ref[id] * 1.5) : 0);
  }
  return out;
}

let renderer: GameRenderer | null = null;
let scene: IntroScene | null = null;
let onChoose: ((face: Face) => void) | null = null;

export function bindIntro(r: GameRenderer): void {
  renderer = r;
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function startIntro(opts: IntroOptions): void {
  if (!renderer) return;
  const drawn = drawBiomes(opts.seed);
  const params = opts.params ?? {
    kiwisu: { ...DEFAULT_FACE_PARAMS, biome: drawn.kiwisu },
    kiwino: { ...DEFAULT_FACE_PARAMS, biome: drawn.kiwino },
  };
  const maps = {
    kiwisu: generateFace(opts.seed, 'kiwisu', params.kiwisu),
    kiwino: generateFace(opts.seed, 'kiwino', params.kiwino),
  };
  const taken = opts.taken ?? {};
  const focus: Face = opts.focus ?? opts.current ?? FACES.find((f) => !taken[f]) ?? 'kiwisu';
  onChoose = opts.onChoose ?? null;
  uiStore.setState({
    modal: 'none',
    selectedTile: null,
    introFade: false,
    intro: {
      mode: opts.mode,
      seed: opts.seed,
      biomes: { kiwisu: params.kiwisu.biome, kiwino: params.kiwino.biome },
      taken,
      current: opts.current ?? null,
      phase: 'waiting',
      focus,
      gauges: gaugesOf(maps, opts.seed),
    },
  });
  scene = renderer.playIntro(
    maps,
    {
      onPhase: (phase) => {
        const intro = uiStore.getState().intro;
        if (intro) uiStore.setState({ intro: { ...intro, phase } });
        if (phase === 'choice') scene?.setFocus(uiStore.getState().intro?.focus ?? focus);
      },
      onFocus: (face) => focusIntro(face),
      onSlice: () => audio.play('intro.slice'),
      onJuice: () => audio.play('intro.juice'),
      onDone: (face) => finish(face),
    },
    reducedMotion(),
  );
}

/** Shows a face (hover); `lock`: a deliberate pick (a tap or a tab) that hovering keeps. */
export function focusIntro(face: Face, lock = false): void {
  if (lock) scene?.lock();
  const intro = uiStore.getState().intro;
  if (!intro || intro.focus === face) return;
  uiStore.setState({ intro: { ...intro, focus: face } });
  scene?.setFocus(face);
  audio.play('ui.select');
}

export function skipIntro(): void {
  scene?.skip();
}

/** The player asks for the cut (the call-to-action button; taps and swipes go to the scene). */
export function sliceIntro(): void {
  scene?.slice();
}

/** Confirms the focused face (or leaves, when replaying). */
export function chooseIntro(): void {
  const intro = uiStore.getState().intro;
  if (!intro || intro.phase !== 'choice') return;
  const face = intro.mode === 'replay' ? (intro.current ?? intro.focus) : intro.focus;
  if (intro.mode !== 'replay' && intro.taken[face]) return;
  audio.play('ui.click');
  scene?.choose(face);
}

export function setIntroLayout(width: number, height: number): void {
  const phone = width <= 760;
  renderer?.setIntroLayout(
    phone ? { right: 0, bottom: 0.48 } : { right: Math.min(0.45, 392 / width), bottom: 0 },
  );
  void height;
}

function finish(face: Face): void {
  markSeen();
  const choose = onChoose;
  onChoose = null;
  scene = null;
  renderer?.endIntro();
  uiStore.setState({ intro: null, introFade: true });
  choose?.(face);
  window.setTimeout(() => uiStore.setState({ introFade: false }), 700);
}
