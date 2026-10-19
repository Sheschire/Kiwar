import { createStore } from 'zustand/vanilla';
import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { Face, FaceMap, GameState, Tile } from '@kiwar/shared';
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
import type { UniverseInfo } from '@kiwar/shared';
import type { QualityChoice, QualityPreset } from '../render/quality';
import { DEFAULT_SETTINGS, type AudioSettings } from '../audio/settings';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  key: TKey;
  params?: TParams;
}

export type Modal =
  'none' | 'settings' | 'expedition' | 'report' | 'universe' | 'demolish' | 'village';

export interface UiState {
  lang: Lang;
  modal: Modal;
  debugOpen: boolean;
  objectivesOpen: boolean;
  game: GameState | null;
  map: FaceMap | null;
  /** Simulation time of the last update. */
  now: number;
  selectedTile: Tile | null;
  qualityChoice: QualityChoice;
  qualityPreset: QualityPreset;
  fps: number;
  timeScale: number;
  offlineSummary: OfflineSummary | null;
  pendingWorld: { seed: string; face: Face } | null;
  toasts: Toast[];
  sync: SyncStatus;
  account: Account | null;
  /** Launchpad being prepared (expedition modal). */
  expeditionPad: string | null;
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
  /** Volume settings (mirrors the audio engine). */
  audio: AudioSettings;
  /** Kiwi whose sheet is open in the village screen (null = the list). */
  kiwiId: string | null;
  villageTab: 'kiwis' | 'memorial';
  /** Kiwi followed by the camera. */
  followId: string | null;
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
  selectedTile: null,
  qualityChoice: 'auto',
  qualityPreset: 'medium',
  fps: 0,
  timeScale: 1,
  offlineSummary: null,
  pendingWorld: null,
  toasts: [],
  sync: 'local',
  account: null,
  expeditionPad: null,
  reportId: null,
  demolishId: null,
  unreadReports: [],
  universe: null,
  pendingJoin: null,
  chatOpen: false,
  chat: [],
  chatUnread: 0,
  pathMode: false,
  audio: DEFAULT_SETTINGS,
  kiwiId: null,
  villageTab: 'kiwis',
  followId: null,
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
        if (!equals(next, valueRef.current)) force(0);
      }),
    [store, equals],
  );
  return value;
}

export const useUi = <T>(selector: (s: UiState) => T): T => useStoreSlice(uiStore, selector);

export type Translate = (key: TKey, params?: TParams) => string;

export function useT(): Translate {
  const lang = useUi((s) => s.lang);
  return (key, params) => translate(lang, key, params);
}
