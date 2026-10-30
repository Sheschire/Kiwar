import { THUMB_QUERY } from './layout';
import { createStore } from 'zustand/vanilla';
import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { BuildingType, Face, FaceMap, GameState, StatId, Tile } from '@kiwar/shared';
import {
  detectLang,
  persistLang,
  translate,
  type Lang,
  type TKey,
  type TParams,
} from '../i18n/i18n';
import type { OfflineSummary, SyncStatus } from '../game/GameController';
import type { Account } from '../game/onlineBackend';
import type { AuthRedirectError } from '../game/authRedirect';
import type { ChatMessage } from '../game/chat';
import type {
  AllySnapshot,
  GuestTransferPreview,
  LogisticsChange,
  TwinSnapshot,
  UniverseInfo,
} from '@kiwar/shared';
import type { QualityChoice, QualityPreset } from '../render/quality';
import type { PlanetRef } from '../render/space';
import { DEFAULT_FPS_CAP, type FpsCap } from '../render/frameLimiter';
import { DEFAULT_SETTINGS, type AudioSettings } from '../audio/settings';
import type { IntroUi } from './intro';

/** Order of the village list: the four plain orders or a stat, best first (chantier 20). */
export type VillageSort = 'level' | 'name' | 'job' | 'born' | StatId;

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  key: TKey;
  params?: TParams;
}

export type Modal =
  | 'none'
  | 'settings'
  | 'expedition'
  | 'report'
  | 'universe'
  | 'demolish'
  | 'village'
  | 'defense'
  | 'plans'
  | 'siege'
  /** Chantier 48: the depths. */
  | 'depths';

/** A planner opened on a mission: the settlers' ship, or a landing on a given parcel (chantier 40). */
export interface SiegePlan {
  /** Chantier 42: also a guard for a beacon (`bringBack`: guards to relieve) and the queen. */
  mission: 'land' | 'found' | 'guard' | 'final';
  sector?: number;
  targetId?: string;
  bringBack?: string[];
}

export interface UiState {
  lang: Lang;
  modal: Modal;
  debugOpen: boolean;
  objectivesOpen: boolean;
  /** Chantier 21: the named menu of the thumb bar (phones and touch screens). */
  menuOpen: boolean;
  /** Chantier 20: the construction queue and the wave alert can fold (remembered). */
  queueOpen: boolean;
  threatOpen: boolean;
  game: GameState | null;
  map: FaceMap | null;
  /** Simulation time of the last update. */
  now: number;
  /**
   * The same game and time refreshed once a second (and right after the player acts): for the
   * widgets that change slowly (clock, objectives, badges), so they skip most ticks.
   */
  slowGame: GameState | null;
  slowNow: number;
  selectedTile: Tile | null;
  qualityChoice: QualityChoice;
  qualityPreset: QualityPreset;
  /** Chantier 23: frames per second the player allows (0 = no cap). */
  fpsCap: FpsCap;
  timeScale: number;
  offlineSummary: OfflineSummary | null;
  /** The full summary was asked for from the corner bubble. */
  recapOpen: boolean;
  /** World waiting for confirmation; `pick`: the face will be chosen in the intro. */
  pendingWorld: { seed: string; face: Face; pick?: boolean } | null;
  toasts: Toast[];
  sync: SyncStatus;
  account: Account | null;
  /** Lasting slow frames: advice for the player (`slowFramesTip`), until dismissed. */
  gpuTip: 'gpu' | 'auto' | null;
  /** Auth error sent back by a redirect (Google, magic link), until dismissed. */
  authError: AuthRedirectError | null;
  /** The guest colony may follow into this account: the player picks one. */
  guestTransfer: GuestTransferPreview | null;
  /** Launchpad being prepared (expedition modal). */
  expeditionPad: string | null;
  /** The expedition modal opens on a delivery to this ally (`Friend.id`). */
  deliverTo: string | null;
  /** Chantier 19: the siege mission the expedition planner is set to (null: free choice). */
  siegePlan: SiegePlan | null;
  /** Expedition whose report is shown. */
  reportId: string | null;
  /** Chantier 40: the bestiary, shown over any screen. */
  bestiaryOpen: boolean;
  /** Building waiting for demolition confirmation. */
  demolishId: string | null;
  /** Reports not opened yet. */
  unreadReports: string[];
  /** Shared universe being played (null = solo colony). */
  universe: UniverseInfo | null;
  /** Invite code from a `?join=` link, waiting for confirmation. */
  pendingJoin: string | null;
  chatOpen: boolean;
  chat: ChatMessage[];
  chatUnread: number;
  /** Path painting mode. */
  pathMode: boolean;
  /** Chantier 12: logistics changes of the last painted stroke. */
  pathGains: LogisticsChange[] | null;
  /** Chantier 45: digging canals (taps dig), and the tile pointed or last tapped. */
  digMode: boolean;
  digTile: Tile | null;
  /** Chantier 11: the plans screen tab, and the building being placed from the tree. */
  plansTab: 'buildings' | 'research';
  placing: BuildingType | null;
  /**
   * Chantier 16: the tile under the placement ghost (pointed by the mouse, or tapped on a
   * phone: `placingPinned`, confirmed by "Build here").
   */
  placingTile: Tile | null;
  placingPinned: boolean;
  /** Chantier 35: orientation (0–5) of a 3-tile footprint being placed (R or "Turn"). */
  placingRot: number;
  /** Level badges above every building, whatever the zoom. */
  showLevels: boolean;
  /** Chantier 12: logistics overlay (efficiency above every producer). */
  showLogistics: boolean;
  /** Volume settings (mirrors the audio engine). */
  audio: AudioSettings;
  /** Kiwi whose sheet is open in the village screen (null = the list). */
  kiwiId: string | null;
  villageTab: 'kiwis' | 'posts' | 'auto' | 'memorial';
  /** Order of the kiwi list, also used by the ◀ ▶ arrows of a sheet. */
  villageSort: VillageSort;
  /** Kiwi followed by the camera. */
  followId: string | null;
  /** Intro and choice of a face (chantier 05). */
  intro: IntroUi | null;
  /** Short fade from the intro into the game. */
  introFade: boolean;
  /** Last wave report not opened yet (chantier 06). */
  unreadWave: string | null;
  /** The colony could not be shown at startup (message for the boot screen). */
  bootError: string | null;
  /** The other players' colonies (shared universes). */
  allies: AllySnapshot[];
  /** A friend living on our twin face (older shared universes), by name; null: aliens. */
  twinOwner: string | null;
  /** Chantier 19: the colony on screen (0 home, 1 the sister on the twin face). */
  colony: 0 | 1;
  /** Chantier 19: the layout of our other colony (null: no sister yet). */
  sister: TwinSnapshot | null;
  /** Far planet the camera is visiting (chantier 24: the twin or a member's; null: home). */
  visit: PlanetRef | null;
  /** A new version of the game is installed and waits for a reload (`ui/update.ts`). */
  updateReady: boolean;
  /** Chantier 59: the visited ally's colony as last received (no stocks; null: none). */
  allyVillage: GameState | null;
  /** Chantier 59: the tile of the visited village whose sheet is open (null: none). */
  allyTile: { q: number; r: number } | null;
  /** Chantier 41: a landing that just happened, offered to watch (expedition id). */
  landingInvite: string | null;
  /** Chantier 49: the cut of the depths is on screen (the HUD shrinks to its banner). */
  cutOpen: boolean;
  /** Chantier 49: the room the Depths screen opens on (a tap in the cut; null: none). */
  depthsRoom: string | null;
  /** Chantier 41: the landing watched on the twin (expedition id; null: none). */
  watchingLanding: string | null;
  /** Chantier 24: the card of a tapped planet ("Go there"). */
  planetCard: PlanetRef | null;
  /** Chantier 24: the Planets list is open. */
  planetsOpen: boolean;
}

const LEVELS_KEY = 'kiwar.levels';

function loadShowLevels(): boolean {
  try {
    return localStorage.getItem(LEVELS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShowLevels(on: boolean): void {
  try {
    localStorage.setItem(LEVELS_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

const QUEUE_OPEN_KEY = 'kiwar.queueOpen';
const THREAT_OPEN_KEY = 'kiwar.threatOpen';
/** Chantier 32: the objectives panel keeps its state across reloads. */
const OBJECTIVES_OPEN_KEY = 'kiwar.objectivesOpen';

function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** Chantier 20: fold or unfold the construction queue / the wave alert, remembered (and the
 * objectives, chantier 32). */
export function setPanelOpen(panel: 'queue' | 'threat' | 'objectives', open: boolean): void {
  const key = { queue: QUEUE_OPEN_KEY, threat: THREAT_OPEN_KEY, objectives: OBJECTIVES_OPEN_KEY }[
    panel
  ];
  try {
    localStorage.setItem(key, open ? '1' : '0');
  } catch {
    // ignore
  }
  uiStore.setState(
    panel === 'queue'
      ? { queueOpen: open }
      : panel === 'threat'
        ? { threatOpen: open }
        : { objectivesOpen: open },
  );
}

// Chantier 21: the objectives start open on wide mouse screens; with the thumb bar they start
// folded into a one-line pill.
const wideScreen =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(min-width: 900px)').matches &&
  !window.matchMedia(THUMB_QUERY).matches;

export const uiStore = createStore<UiState>(() => ({
  lang: detectLang(),
  modal: 'none',
  debugOpen: false,
  objectivesOpen: loadFlag(OBJECTIVES_OPEN_KEY, wideScreen),
  menuOpen: false,
  queueOpen: loadFlag(QUEUE_OPEN_KEY, true),
  threatOpen: loadFlag(THREAT_OPEN_KEY, true),
  game: null,
  map: null,
  now: 0,
  slowGame: null,
  slowNow: 0,
  selectedTile: null,
  qualityChoice: 'auto',
  qualityPreset: 'medium',
  fpsCap: DEFAULT_FPS_CAP,
  timeScale: 1,
  offlineSummary: null,
  recapOpen: false,
  pendingWorld: null,
  toasts: [],
  sync: 'local',
  account: null,
  gpuTip: null,
  authError: null,
  guestTransfer: null,
  expeditionPad: null,
  deliverTo: null,
  siegePlan: null,
  reportId: null,
  bestiaryOpen: false,
  demolishId: null,
  unreadReports: [],
  universe: null,
  pendingJoin: null,
  chatOpen: false,
  chat: [],
  chatUnread: 0,
  pathMode: false,
  pathGains: null,
  digMode: false,
  digTile: null,
  plansTab: 'buildings',
  placing: null,
  placingTile: null,
  placingPinned: false,
  placingRot: 0,
  showLevels: loadShowLevels(),
  showLogistics: false,
  audio: DEFAULT_SETTINGS,
  kiwiId: null,
  villageTab: 'kiwis',
  villageSort: 'level',
  followId: null,
  intro: null,
  introFade: false,
  unreadWave: null,
  bootError: null,
  allies: [],
  twinOwner: null,
  colony: 0,
  sister: null,
  allyVillage: null,
  allyTile: null,
  updateReady: false,
  visit: null,
  landingInvite: null,
  cutOpen: false,
  depthsRoom: null,
  watchingLanding: null,
  planetCard: null,
  planetsOpen: false,
}));

export function setLang(lang: Lang): void {
  persistLang(lang);
  uiStore.setState({ lang });
}

let toastId = 0;
export function pushToast(kind: Toast['kind'], key: TKey, params?: TParams): void {
  const id = ++toastId;
  uiStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, key, params }] }));
  window.setTimeout(
    () => uiStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    kind === 'error' ? 3200 : 2600,
  );
}

/** Subscribe a Preact component to a slice of a zustand vanilla store. */
export function useStoreSlice<S, T>(
  store: { getState(): S; subscribe(listener: (s: S) => void): () => void },
  selector: (s: S) => T,
  equals: (a: T, b: T) => boolean = Object.is,
): T {
  const equalsRef = useRef(equals);
  equalsRef.current = equals;
  const [, force] = useReducer((n: number) => n + 1, 0);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const value = selector(store.getState());
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(
    () =>
      store.subscribe((s) => {
        const next = selectorRef.current(s);
        if (!equalsRef.current(next, valueRef.current)) force(0);
      }),
    [store],
  );
  return value;
}

export const useUi = <T>(selector: (s: UiState) => T, equals?: (a: T, b: T) => boolean): T =>
  useStoreSlice(uiStore, selector, equals);

/** Same keys with the same values (one level deep): for selectors returning objects or arrays. */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

export type Translate = (key: TKey, params?: TParams) => string;

const translators = new Map<Lang, Translate>();

/** The translator of the current language (the same function while the language stays). */
export function useT(): Translate {
  const lang = useUi((s) => s.lang);
  let t = translators.get(lang);
  if (!t) {
    t = (key, params) => translate(lang, key, params);
    translators.set(lang, t);
  }
  return t;
}
