// Camera facts for small widgets (compass), kept out of the main store: they change while the
// camera turns, many times per second.
import { createStore } from 'zustand/vanilla';
import type { CometArrow } from '../render/comets';
import type { PlanetRef } from '../render/space';
import { useStoreSlice } from './store';

export interface ViewState {
  /** Camera azimuth (rad, camera-controls convention). */
  azimuth: number;
  /** Chantier 24: the far planet under the pointer, and where the pointer is (client px). */
  planetHover: { planet: PlanetRef; x: number; y: number } | null;
  /** Chantier 32: the arrow towards the comet when it is in the sky but off screen. */
  cometArrow: CometArrow | null;
}

export const viewStore = createStore<ViewState>(() => ({
  azimuth: 0,
  planetHover: null,
  cometArrow: null,
}));

export const useView = <T>(selector: (s: ViewState) => T): T => useStoreSlice(viewStore, selector);
