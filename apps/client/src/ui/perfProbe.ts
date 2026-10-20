// Measures the cost of the interface: store updates, Preact re-renders and how long a menu
// takes to show. Kept out of the main store so measuring does not wake every selector.
import { options } from 'preact';
import { createStore } from 'zustand/vanilla';
import type { FrameStats } from '../render/perfStats';
import { useStoreSlice, uiStore, type UiState } from './store';

export interface MenuTiming {
  name: string;
  /** From the state change to the first frame painted after it (ms). */
  ms: number;
  /** Preact work of the update that opened it (ms). */
  render: number;
}

export interface PerfState {
  frame: FrameStats | null;
  gpu: string;
  /** Main-thread time spent in store listeners and Preact re-renders, per second (ms). */
  uiMsPerSecond: number;
  /** Store updates per second. */
  updatesPerSecond: number;
  /** Slowest single update + re-render of the last second (ms). */
  worstUpdate: number;
  lastMenu: MenuTiming | null;
  menus: MenuTiming[];
}

export const perfStore = createStore<PerfState>(() => ({
  frame: null,
  gpu: '',
  uiMsPerSecond: 0,
  updatesPerSecond: 0,
  worstUpdate: 0,
  lastMenu: null,
  menus: [],
}));

export const usePerf = <T>(selector: (s: PerfState) => T): T => useStoreSlice(perfStore, selector);

let installed = false;

/** Wraps the store and Preact's render queue with timers (cheap: a few `performance.now`). */
export function installPerfProbe(gpu: string): void {
  if (installed) return;
  installed = true;
  perfStore.setState({ gpu });

  let busy = 0;
  let updates = 0;
  let worst = 0;
  let pendingStore = 0;
  let windowStart = performance.now();
  let opening: { name: string; at: number; render: number | null } | null = null;

  const flushWindow = (now: number) => {
    if (now - windowStart < 1000) return;
    const seconds = (now - windowStart) / 1000;
    perfStore.setState({
      uiMsPerSecond: busy / seconds,
      updatesPerSecond: updates / seconds,
      worstUpdate: worst,
    });
    busy = 0;
    updates = 0;
    worst = 0;
    windowStart = now;
  };

  const setState = uiStore.setState;
  uiStore.setState = ((...args: Parameters<typeof setState>) => {
    const t = performance.now();
    setState(...args);
    const spent = performance.now() - t;
    busy += spent;
    pendingStore += spent;
    updates++;
    flushWindow(t);
  }) as typeof setState;

  const defer = (cb: () => void) => void Promise.resolve().then(cb);
  const previous = options.debounceRendering;
  options.debounceRendering = (cb) =>
    (previous ?? defer)(() => {
      const t = performance.now();
      cb();
      const spent = performance.now() - t;
      busy += spent;
      worst = Math.max(worst, spent + pendingStore);
      if (opening && opening.render === null) opening.render = spent;
      pendingStore = 0;
    });

  const menuOf = (s: UiState) =>
    s.modal !== 'none' ? s.modal : s.selectedTile ? 'sheet' : s.debugOpen ? 'debug' : null;
  let current = menuOf(uiStore.getState());
  uiStore.subscribe((s) => {
    const next = menuOf(s);
    if (next === current) return;
    current = next;
    if (!next) return;
    const entry = { name: next, at: performance.now(), render: null as number | null };
    opening = entry;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const timing = {
          name: entry.name,
          ms: performance.now() - entry.at,
          render: entry.render ?? 0,
        };
        if (opening === entry) opening = null;
        perfStore.setState((p) => ({ lastMenu: timing, menus: [...p.menus.slice(-19), timing] }));
      }),
    );
  });
}
