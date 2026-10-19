import {
  advance,
  applyCommand,
  deserializeSave,
  generateFace,
  isPristine,
  newGame,
  serializeSave,
  RESOURCE_IDS,
  type Command,
  type CommandError,
  type Face,
  type FaceMap,
  type GameEvent,
  type GameResponse,
  type GameState,
  type Resources,
  type ServerError,
} from '@kiwar/shared';
import { NetworkError, OnlineBackend, onlineConfig, type Account } from './onlineBackend';

const SAVE_KEY = 'kiwar.save.v1';
const IMPORTED_KEY = 'kiwar.save.v1.imported';
const CACHE_KEY = 'kiwar.online.cache';
const CLOCK_KEY = 'kiwar.clockOffset';
const AUTOSAVE_MS = 5000;
const TICK_MS = 200;
/** Absences shorter than this do not show the "while you were away" summary. */
const OFFLINE_SUMMARY_MIN_MS = 60_000;
/** Re-download the authoritative state when coming back after this long. */
const RESYNC_AFTER_MS = 30_000;

export type SyncStatus = 'local' | 'connecting' | 'online' | 'syncing' | 'offline';

/** Everything that can go wrong for a player action (rules, server, network). */
export type ClientError = CommandError | ServerError | 'network';

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
  onError(error: ClientError): void;
  onOfflineSummary(summary: OfflineSummary): void;
  onSync(status: SyncStatus): void;
  onAccount(account: Account | null): void;
}

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Bridges the pure simulation and the client. It owns the clock, advances the state, dispatches
 * commands and persists the game:
 * - **local mode** (no backend configured): localStorage save, debug time multiplier;
 * - **online mode** (Supabase): the server is authoritative. Commands are applied optimistically
 *   for instant feedback, sent to the server in order, and the local state is rebased on every
 *   authoritative answer (pending commands are replayed on top of it).
 * The UI and the renderer never mutate the state; they call `dispatch`.
 */
export class GameController {
  state!: GameState;
  map!: FaceMap;
  readonly online: OnlineBackend | null;
  private timeScale = 1;
  /** Local mode: virtual = real + offset (offset grows while the debug multiplier is > 1). */
  private clockOffset: number;
  private scaleAnchor = { real: Date.now(), virtual: Date.now() };
  /** Online mode: server time = Date.now() + serverOffset. */
  private serverOffset = 0;
  private serverState: GameState | null = null;
  private pending: Command[] = [];
  private flushing = false;
  private retryTimer: number | undefined;
  private retryDelay = 2000;
  private hiddenAt = 0;
  private userId: string | null = null;
  private tickTimer: number | undefined;
  private saveTimer: number | undefined;

  constructor(private readonly listener: ControllerListener) {
    const config = onlineConfig();
    this.online = config ? new OnlineBackend(config, (a) => this.onAccountChange(a)) : null;
    this.clockOffset = this.online
      ? 0
      : safeStorage(() => Number(localStorage.getItem(CLOCK_KEY)) || 0, 0);
    this.scaleAnchor = { real: Date.now(), virtual: Date.now() + this.clockOffset };
  }

  get isOnline(): boolean {
    return this.online !== null;
  }

  /** Current simulation time. */
  now(): number {
    if (this.online) return Date.now() + this.serverOffset;
    const real = Date.now();
    return Math.round(this.scaleAnchor.virtual + (real - this.scaleAnchor.real) * this.timeScale);
  }

  get scale(): number {
    return this.timeScale;
  }

  /** Debug time multiplier (local mode only: the server owns the clock online). */
  setTimeScale(scale: number): void {
    if (this.online) return;
    const now = this.now();
    this.timeScale = scale;
    this.scaleAnchor = { real: Date.now(), virtual: now };
    this.persistClock();
  }

  private persistClock(): void {
    if (this.online) return;
    this.clockOffset = this.now() - Date.now();
    safeStorage(() => localStorage.setItem(CLOCK_KEY, String(this.clockOffset)), undefined);
  }

  /** Loads the game (applying offline progress) or starts a new one. */
  async start(
    world: { seed: string; face: Face } | null,
    fallbackSeed: () => string,
  ): Promise<void> {
    if (this.online) {
      await this.startOnline(world, fallbackSeed);
    } else {
      this.listener.onSync('local');
      const loaded = deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null));
      if (loaded.ok && !world) this.loadState(loaded.save.state);
      else this.newLocalWorld(world?.seed ?? fallbackSeed(), world?.face ?? 'kiwisu');
    }
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
    this.saveTimer = window.setInterval(() => this.save(), AUTOSAVE_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** True when the player has a colony worth protecting (asks before replacing it). */
  hasProgress(): boolean {
    if (this.state) return !isPristine(this.state);
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
    if (away >= OFFLINE_SUMMARY_MIN_MS) {
      this.listener.onOfflineSummary(summarize(saved, state, events, away));
    }
    this.save();
  }

  newWorld(seed: string, face: Face): void {
    if (this.online) void this.newOnlineWorld(seed, face);
    else this.newLocalWorld(seed, face);
  }

  private newLocalWorld(seed: string, face: Face): void {
    // A fresh world also resets the debug clock drift.
    this.timeScale = 1;
    this.clockOffset = 0;
    this.scaleAnchor = { real: Date.now(), virtual: Date.now() };
    this.persistClock();
    this.state = newGame({ seed, face, now: this.now() });
    this.setWorld(this.state);
    this.save();
  }

  private setWorld(state: GameState): void {
    this.state = state;
    this.map = generateFace(state.seed, state.face, state.params);
    this.listener.onWorld(this.map, this.state);
    this.listener.onState(this.state, this.now());
  }

  dispatch(cmd: Command): boolean {
    const now = this.now();
    const result = applyCommand(this.state, cmd, { now, map: this.map });
    this.state = result.state;
    if (result.events.length) this.listener.onEvents(result.events);
    this.listener.onState(this.state, now);
    if (!result.ok) {
      this.listener.onError(result.error);
      return false;
    }
    if (this.online) {
      this.pending.push(cmd);
      void this.flush();
    } else {
      this.save();
    }
    return true;
  }

  tick(): void {
    if (!this.state) return;
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
    if (!this.state || this.online) return;
    safeStorage(
      () => localStorage.setItem(SAVE_KEY, serializeSave(this.state, this.now())),
      undefined,
    );
    this.persistClock();
  }

  // ---------------------------------------------------------------- online mode

  private async startOnline(
    world: { seed: string; face: Face } | null,
    fallbackSeed: () => string,
  ): Promise<void> {
    this.listener.onSync('connecting');
    try {
      const account = await this.online!.init();
      this.userId = account.userId;
      this.listener.onAccount(account);
      await this.loadFromServer(world);
      await this.importLocalSaveOnce();
    } catch (e) {
      if (!(e instanceof NetworkError)) console.error(e);
      // Show the last known colony (if any) and keep trying to reconnect.
      const cached = deserializeSave(safeStorage(() => localStorage.getItem(CACHE_KEY), null));
      if (cached.ok) this.loadState(cached.save.state);
      else
        this.setWorld(
          newGame({
            seed: world?.seed ?? fallbackSeed(),
            face: world?.face ?? 'kiwisu',
            now: this.now(),
          }),
        );
      this.listener.onSync('offline');
      this.scheduleRetry(() => this.reconnect(world));
    }
  }

  private async reconnect(world: { seed: string; face: Face } | null): Promise<void> {
    try {
      const account = await this.online!.init();
      this.userId = account.userId;
      this.listener.onAccount(account);
      await this.loadFromServer(world);
      this.retryDelay = 2000;
      if (this.pending.length) void this.flush();
    } catch {
      this.listener.onSync('offline');
      this.scheduleRetry(() => this.reconnect(world));
    }
  }

  private scheduleRetry(fn: () => void): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(fn, this.retryDelay);
    this.retryDelay = Math.min(30_000, this.retryDelay * 2);
  }

  private acceptServer(res: GameResponse): void {
    // Smoothly track the server clock (half-way correction avoids jitter).
    const offset = res.serverTime - Date.now();
    this.serverOffset = this.serverState ? Math.round((this.serverOffset + offset) / 2) : offset;
    if (res.state) {
      this.serverState = res.state;
      safeStorage(
        () => localStorage.setItem(CACHE_KEY, serializeSave(res.state!, res.serverTime)),
        undefined,
      );
    }
  }

  private async loadFromServer(world: { seed: string; face: Face } | null): Promise<void> {
    const res = await this.online!.call({ action: 'load', ...(world ? { create: world } : {}) });
    this.acceptServer(res);
    if (!res.ok || !res.state) throw new NetworkError(res.ok ? 'no state' : res.error);
    this.pending = [];
    this.loadState(res.state);
    this.listener.onSync('online');
  }

  /** Brings a milestone-1 local colony into the account, once, if the account is still empty. */
  private async importLocalSaveOnce(): Promise<void> {
    if (safeStorage(() => localStorage.getItem(IMPORTED_KEY), null)) return;
    const local = safeStorage(() => localStorage.getItem(SAVE_KEY), null);
    const loaded = deserializeSave(local);
    if (
      !loaded.ok ||
      isPristine(loaded.save.state) ||
      !this.serverState ||
      !isPristine(this.serverState)
    ) {
      if (loaded.ok) safeStorage(() => localStorage.setItem(IMPORTED_KEY, 'skipped'), undefined);
      return;
    }
    const res = await this.online!.call({ action: 'import', save: local! });
    this.acceptServer(res);
    safeStorage(
      () => localStorage.setItem(IMPORTED_KEY, res.ok ? 'imported' : 'rejected'),
      undefined,
    );
    if (res.ok) this.loadState(res.state);
  }

  private async newOnlineWorld(seed: string, face: Face): Promise<void> {
    this.listener.onSync('syncing');
    try {
      const res = await this.online!.call({ action: 'newWorld', seed, face });
      this.acceptServer(res);
      if (!res.ok) {
        this.listener.onError(res.error);
        this.listener.onSync('online');
        return;
      }
      this.pending = [];
      this.setWorld(advance(res.state, this.now()).state);
      this.listener.onSync('online');
    } catch {
      this.listener.onError('network');
      this.listener.onSync('offline');
    }
  }

  /** Sends pending commands one by one; rebases the local state on each authoritative answer. */
  private async flush(): Promise<void> {
    if (this.flushing || !this.online) return;
    this.flushing = true;
    this.listener.onSync('syncing');
    try {
      while (this.pending.length > 0) {
        const command = this.pending[0]!;
        let res: GameResponse;
        try {
          res = await this.online.call({ action: 'command', command });
        } catch {
          this.listener.onSync('offline');
          this.scheduleRetry(() => void this.flush());
          return;
        }
        this.acceptServer(res);
        if (!res.ok && res.error === 'rateLimited') {
          await new Promise((r) => window.setTimeout(r, 2000));
          continue;
        }
        if (!res.ok && res.error === 'unauthorized') {
          await this.online.init();
          continue;
        }
        this.pending.shift();
        if (!res.ok) this.listener.onError(res.error);
        this.rebase();
      }
      this.retryDelay = 2000;
      this.listener.onSync('online');
    } finally {
      this.flushing = false;
    }
  }

  /** Authoritative state + still-pending commands, advanced to now (events already shown). */
  private rebase(): void {
    if (!this.serverState) return;
    const now = this.now();
    let state = advance(this.serverState, now).state;
    for (const cmd of this.pending) {
      const r = applyCommand(state, cmd, { now, map: this.map });
      if (r.ok) state = r.state;
    }
    this.state = state;
    this.listener.onState(this.state, now);
  }

  private onAccountChange(account: Account | null): void {
    this.listener.onAccount(account);
    // Signing in to another account (e.g. on a new device) switches to its colony.
    if (account && this.userId && account.userId !== this.userId) {
      this.userId = account.userId;
      this.serverState = null;
      void this.loadFromServer(null).catch(() => this.listener.onSync('offline'));
    }
  }

  // ---------------------------------------------------------------- lifecycle

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.save();
      return;
    }
    // Coming back online after a while: fetch the authoritative state (other devices may
    // have played meanwhile).
    if (this.online && this.pending.length === 0 && Date.now() - this.hiddenAt > RESYNC_AFTER_MS) {
      void this.loadFromServer(null).catch(() => this.listener.onSync('offline'));
    } else {
      this.tick();
    }
  };

  private onPageHide = () => this.save();

  dispose(): void {
    window.clearInterval(this.tickTimer);
    window.clearInterval(this.saveTimer);
    window.clearTimeout(this.retryTimer);
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
