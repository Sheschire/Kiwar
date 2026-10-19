import {
  advance,
  applyCommand,
  deserializeSave,
  generateFace,
  newGame,
  serializeSave,
  RESOURCE_IDS,
  type Command,
  type CommandError,
  type Face,
  type FaceMap,
  type GameEvent,
  type GameState,
  type Resources,
} from '@kiwar/shared';

const SAVE_KEY = 'kiwar.save.v1';
const CLOCK_KEY = 'kiwar.clockOffset';
const AUTOSAVE_MS = 5000;
const TICK_MS = 200;
/** Absences shorter than this do not show the "while you were away" summary. */
const OFFLINE_SUMMARY_MIN_MS = 60_000;

export interface OfflineSummary {
  awayMs: number;
  gained: Resources;
  completed: { buildingType: string; level: number }[];
  hatched: string[];
  storageFull: string[];
}

export interface ControllerListener {
  onState(state: GameState, now: number): void;
  onWorld(map: FaceMap, state: GameState): void;
  onEvents(events: GameEvent[]): void;
  onError(error: CommandError): void;
  onOfflineSummary(summary: OfflineSummary): void;
}

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Bridges the pure simulation and the client: owns the injected clock (with a debug time
 * multiplier), advances the state, dispatches commands and persists to localStorage.
 * The UI and the renderer never mutate the state; they call `dispatch`.
 */
export class GameController {
  state!: GameState;
  map!: FaceMap;
  private timeScale = 1;
  /** virtual = real + offset (offset grows while the debug multiplier is > 1). */
  private clockOffset: number;
  private scaleAnchor = { real: Date.now(), virtual: Date.now() };
  private tickTimer: number | undefined;
  private saveTimer: number | undefined;

  constructor(private readonly listener: ControllerListener) {
    this.clockOffset = safeStorage(() => Number(localStorage.getItem(CLOCK_KEY)) || 0, 0);
    this.scaleAnchor = { real: Date.now(), virtual: Date.now() + this.clockOffset };
  }

  /** Current simulation time. */
  now(): number {
    const real = Date.now();
    return Math.round(this.scaleAnchor.virtual + (real - this.scaleAnchor.real) * this.timeScale);
  }

  get scale(): number {
    return this.timeScale;
  }

  setTimeScale(scale: number): void {
    const now = this.now();
    this.timeScale = scale;
    this.scaleAnchor = { real: Date.now(), virtual: now };
    this.persistClock();
  }

  private persistClock(): void {
    this.clockOffset = this.now() - Date.now();
    safeStorage(() => localStorage.setItem(CLOCK_KEY, String(this.clockOffset)), undefined);
  }

  /** Loads the save (applying offline progress) or starts a new game. */
  start(world: { seed: string; face: Face } | null, fallbackSeed: () => string): void {
    const loaded = deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null));
    if (loaded.ok && !world) {
      this.loadState(loaded.save.state);
    } else {
      this.newWorld(world?.seed ?? fallbackSeed(), world?.face ?? 'kiwisu');
    }
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
    this.saveTimer = window.setInterval(() => this.save(), AUTOSAVE_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  hasSave(): boolean {
    return deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null)).ok;
  }

  private loadState(saved: GameState): void {
    this.map = generateFace(saved.seed, saved.face, saved.params);
    const now = Math.max(this.now(), saved.now);
    const { state, events } = advance(saved, now);
    this.state = state;
    this.listener.onWorld(this.map, this.state);
    this.listener.onState(this.state, now);
    const away = now - saved.now;
    if (away >= OFFLINE_SUMMARY_MIN_MS)
      this.listener.onOfflineSummary(summarize(saved, state, events, away));
    this.save();
  }

  newWorld(seed: string, face: Face): void {
    // A fresh world also resets the debug clock drift.
    this.timeScale = 1;
    this.clockOffset = 0;
    this.scaleAnchor = { real: Date.now(), virtual: Date.now() };
    this.persistClock();
    this.state = newGame({ seed, face, now: this.now() });
    this.map = generateFace(seed, face, this.state.params);
    this.listener.onWorld(this.map, this.state);
    this.listener.onState(this.state, this.now());
    this.save();
  }

  dispatch(cmd: Command): boolean {
    const now = this.now();
    const result = applyCommand(this.state, cmd, { now, map: this.map });
    this.state = result.state;
    if (result.events.length) this.listener.onEvents(result.events);
    if (!result.ok) {
      this.listener.onError(result.error);
      this.listener.onState(this.state, now);
      return false;
    }
    this.listener.onState(this.state, now);
    this.save();
    return true;
  }

  tick(): void {
    const now = this.now();
    const { state, events } = advance(this.state, now);
    this.state = state;
    if (events.length) {
      this.listener.onEvents(events);
      this.save();
    }
    this.listener.onState(this.state, now);
  }

  save(): void {
    if (!this.state) return;
    safeStorage(
      () => localStorage.setItem(SAVE_KEY, serializeSave(this.state, this.now())),
      undefined,
    );
    this.persistClock();
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.save();
    else this.tick();
  };

  private onPageHide = () => this.save();

  dispose(): void {
    window.clearInterval(this.tickTimer);
    window.clearInterval(this.saveTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
  }
}

function summarize(
  before: GameState,
  after: GameState,
  events: GameEvent[],
  awayMs: number,
): OfflineSummary {
  const gained = {} as Resources;
  for (const id of RESOURCE_IDS)
    gained[id] = Math.max(0, after.resources[id] - before.resources[id]);
  return {
    awayMs,
    gained,
    completed: events.flatMap((e) =>
      e.type === 'constructionComplete' ? [{ buildingType: e.buildingType, level: e.level }] : [],
    ),
    hatched: events.flatMap((e) => (e.type === 'hatched' ? [e.name] : [])),
    storageFull: [
      ...new Set(events.flatMap((e) => (e.type === 'storageFull' ? [e.resource] : []))),
    ],
  };
}
