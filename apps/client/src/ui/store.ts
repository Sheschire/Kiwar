import { createStore } from 'zustand/vanilla';
import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { BuildingType, Face, FaceMap, GameState, Tile } from '@kiwar/shared';
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
import type { ChatMessage } from '../game/chat';
import type { AllySnapshot, LogisticsChange, UniverseInfo } from '@kiwar/shared';
import type { QualityChoice, QualityPreset } from '../render/quality';
import { DEFAULT_SETTINGS, type AudioSettings } from '../audio/settings';
import type { IntroUi } from './intro';

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
  | 'plans';

export interface UiState {
  lang: Lang;
  modal: Modal;
  debugOpen: boolean;
  objectivesOpen: boolean;
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
  timeScale: number;
  offlineSummary: OfflineSummary | null;
  /** The full summary was asked for from the corner bubble. */
  recapOpen: boolean;
  /** World waiting for confirmation; `pick`: the face will be chosen in the intro. */
  pendingWorld: { seed: string; face: Face; pick?: boolean } | null;
  toasts: Toast[];
  sync: SyncStatus;
  account: Account | null;
  /** Launchpad being prepared (expedition modal). */
  expeditionPad: string | null;
  /** The expedition modal opens on a delivery to this ally (`Friend.id`). */
  deliverTo: string | null;
  /** Expedition whose report is shown. */
  reportId: string | null;
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
  /** Chantier 11: the plans screen tab, and the building being placed from the tree. */
  plansTab: 'buildings' | 'research';
  placing: BuildingType | null;
  /** Level badges above every building, whatever the zoom. */
  showLevels: boolean;
  /** Chantier 12: logistics overlay (efficiency above every producer). */
  showLogistics: boolean;
  /** Volume settings (mirrors the audio engine). */
  audio: AudioSettings;
  /** Kiwi whose sheet is open in the village screen (null = the list). */
  kiwiId: string | null;
  villageTab: 'kiwis' | 'posts' | 'memorial';
  /** Order of the kiwi list, also used by the ◀ ▶ arrows of a sheet. */
  villageSort: 'level' | 'name' | 'job' | 'born';
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
  /** Kiwi of the ally being visited by the camera (null: at home). */
  visit: number | null;
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

const wideScreen =
  typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches;

export const uiStore = createStore<UiState>(() => ({
  lang: detectLang(),
  modal: 'none',
  debugOpen: false,
  objectivesOpen: wideScreen,
  game: null,
  map: null,
  now: 0,
  slowGame: null,
  slowNow: 0,
  selectedTile: null,
  qualityChoice: 'auto',
  qualityPreset: 'medium',
  timeScale: 1,
  offlineSummary: null,
  recapOpen: false,
  pendingWorld: null,
  toasts: [],
  sync: 'local',
  account: null,
  expeditionPad: null,
  deliverTo: null,
  reportId: null,
  demolishId: null,
  unreadReports: [],
  universe: null,
  pendingJoin: null,
  chatOpen: false,
  chat: [],
  chatUnread: 0,
  pathMode: false,
  pathGains: null,
  plansTab: 'buildings',
  placing: null,
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
  visit: null,
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
