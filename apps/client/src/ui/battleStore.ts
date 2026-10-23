// Chantier 36: the battle on screen, kept out of the main store (its clock moves every frame;
// the bar reads it a few times a second).
import { createStore } from 'zustand/vanilla';
import type { UnitInfo } from '../render/battle/BattleShow';
import { useStoreSlice } from './store';

export interface BattleView {
  /** The wave whose battle is on screen (null: none). */
  reportId: string | null;
  /** Played as it happens (the outcome is told at the end of the show). */
  live: boolean;
  /** Show time and length, in seconds. */
  time: number;
  duration: number;
  speed: 1 | 2 | 4;
  /** The unit whose card is open, as it is now. */
  unit: UnitInfo | null;
}

export const battleStore = createStore<BattleView>(() => ({
  reportId: null,
  live: false,
  time: 0,
  duration: 0,
  speed: 1,
  unit: null,
}));

export const useBattle = <T>(selector: (s: BattleView) => T): T =>
  useStoreSlice(battleStore, selector);

/** A wave struck while the player watches: its show plays live (same rule as the renderer). */
export const LIVE_WAVE_MS = 20_000;
export const isLiveWave = (at: number, now: number): boolean => Math.abs(now - at) < LIVE_WAVE_MS;
