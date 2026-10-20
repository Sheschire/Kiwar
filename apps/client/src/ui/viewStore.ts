// Camera facts for small widgets (compass), kept out of the main store: they change while the
// camera turns, many times per second.
import { createStore } from 'zustand/vanilla';
import { useStoreSlice } from './store';

export interface ViewState {
  /** Camera azimuth (rad, camera-controls convention). */
  azimuth: number;
}

export const viewStore = createStore<ViewState>(() => ({ azimuth: 0 }));

export const useView = <T>(selector: (s: ViewState) => T): T => useStoreSlice(viewStore, selector);
