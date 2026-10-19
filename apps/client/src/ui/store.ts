import { createStore } from 'zustand/vanilla';
import { useEffect, useReducer, useRef } from 'preact/hooks';
import { detectLang, persistLang, translate, type Lang, type TKey, type TParams } from '../i18n/i18n';

import type { FaceMap, Tile } from '@kiwar/shared';

export interface UiState {
  lang: Lang;
  settingsOpen: boolean;
  map: FaceMap | null;
  selectedTile: Tile | null;
}

export const uiStore = createStore<UiState>(() => ({
  lang: detectLang(),
  settingsOpen: false,
  map: null,
  selectedTile: null,
}));

export function setLang(lang: Lang): void {
  persistLang(lang);
  uiStore.setState({ lang });
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

export const useUi = <T,>(selector: (s: UiState) => T): T => useStoreSlice(uiStore, selector);

export function useT(): (key: TKey, params?: TParams) => string {
  const lang = useUi((s) => s.lang);
  return (key, params) => translate(lang, key, params);
}
