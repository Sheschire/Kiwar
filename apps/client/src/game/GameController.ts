import {
  awaitingReport,
  ensureAliens,
  localAlienSeed,
  publicState,
  advance,
  applyCommand,
  deserializeSave,
  generateFace,
  isPristine,
  migrateState,
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
  type AllySnapshot,
  type TwinSnapshot,
  type UniverseInfo,
  type UniverseSummary,
  universeFriends,
  universeTargets,
} from '@kiwar/shared';
import type { Account, OnlineBackend } from './onlineBackend';
import { NetworkError, onlineConfig, type OnlineConfig } from './onlineConfig';

const SAVE_KEY = 'kiwar.save.v1';
const IMPORTED_KEY = 'kiwar.save.v1.imported';
const CACHE_KEY = 'kiwar.online.cache';
const CLOCK_KEY = 'kiwar.clockOffset';
const UNIVERSE_KEY = 'kiwar.universe';
/** Online: when the player last had each colony on screen (server time, per universe). */
const SEEN_KEY = 'kiwar.lastSeen';
const AUTOSAVE_MS = 5000;
const TICK_MS = 200;
/** Absences shorter than this do not show the "while you were away" summary. */
const OFFLINE_SUMMARY_MIN_MS = 60_000;
/** Re-download the authoritative state when coming back after this long. */
const RESYNC_AFTER_MS = 30_000;
/** How often to ask the server about a landed ship. */
const REPORT_POLL_MS = 5_000;

export type SyncStatus = 'local' | 'connecting' | 'online' | 'syncing' | 'offline';

/** Everything that can go wrong for a player action (rules, server, network). */
export type ClientError = CommandError | ServerError | 'network';

export interface OfflineSummary {
  awayMs: number;
  gained: Resources;
  completed: { buildingType: string; level: number }[];
  hatched: string[];
  storageFull: string[];
  /** Food stocks that ran dry, and kiwis who starved. */
  foodRanOut: string[];
  starved: string[];
  /** Chantier 06: predator waves (repelled / lost), meteorites and small incidents. */
  waves: { won: number; lost: number };
  meteors: number;
  incidents: number;
  /** Allies whose gifts landed meanwhile (one entry per delivery). */
  gifts: string[];
}

export interface ControllerListener {
  onState(state: GameState, now: number): void;
  onWorld(map: FaceMap, state: GameState): void;
  onEvents(events: GameEvent[]): void;
  onError(error: ClientError): void;
  onOfflineSummary(summary: OfflineSummary): void;
  onSync(status: SyncStatus): void;
  onAccount(account: Account | null): void;
  /** Shared universe currently played (null = solo). */
  onUniverse(info: UniverseInfo | null): void;
  /** A friend living on the twin face (shared universes; null = aliens under fog). */
  onTwin(twin: TwinSnapshot | null): void;
  /** The other players of the universe, on kiwis far away (shared universes). */
  onAllies(allies: AllySnapshot[]): void;
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
  /** Created lazily in `start()` (supabase-js is loaded on demand). */
  online: OnlineBackend | null = null;
  private readonly config: OnlineConfig | null;
  private timeScale = 1;
  /** Local mode: virtual = real + offset (offset grows while the debug multiplier is > 1). */
  private clockOffset: number;
  private scaleAnchor = { real: Date.now(), virtual: Date.now() };
  /** Online mode: server time = Date.now() + serverOffset. */
  private serverOffset = 0;
  private serverState: GameState | null = null;
  private pending: Command[] = [];
  /** The send loop in progress, if any (awaitable). */
  private flushing: Promise<void> | null = null;
  private retryTimer: number | undefined;
  private retryDelay = 2000;
  private hiddenAt = 0;
  private userId: string | null = null;
  /** 'solo' or the id of the shared universe being played. */
  universe = safeStorage(() => localStorage.getItem(UNIVERSE_KEY), null) ?? 'solo';
  private tickTimer: number | undefined;
  private reportPolledAt = 0;
  private saveTimer: number | undefined;

  constructor(private readonly listener: ControllerListener) {
    this.config = onlineConfig();
    this.clockOffset = this.config
      ? 0
      : safeStorage(() => Number(localStorage.getItem(CLOCK_KEY)) || 0, 0);
    this.scaleAnchor = { real: Date.now(), virtual: Date.now() + this.clockOffset };
  }

  get isOnline(): boolean {
    return this.config !== null;
  }

  /** Current simulation time. */
  now(): number {
    if (this.config) return Date.now() + this.serverOffset;
    const real = Date.now();
    return Math.round(this.scaleAnchor.virtual + (real - this.scaleAnchor.real) * this.timeScale);
  }

  get scale(): number {
    return this.timeScale;
  }

  /** Debug time multiplier (local mode only: the server owns the clock online). */
  setTimeScale(scale: number): void {
    if (this.config) return;
    const now = this.now();
    this.timeScale = scale;
    this.scaleAnchor = { real: Date.now(), virtual: now };
    this.persistClock();
  }

  private persistClock(): void {
    if (this.config) return;
    this.clockOffset = this.now() - Date.now();
    safeStorage(() => localStorage.setItem(CLOCK_KEY, String(this.clockOffset)), undefined);
  }

  /** Loads the game (applying offline progress) or starts a new one. */
  async start(
    world: { seed: string; face: Face } | null,
    fallbackSeed: () => string,
  ): Promise<void> {
    if (this.config) {
      const { OnlineBackend } = await import('./onlineBackend');
      this.online = new OnlineBackend(this.config, (a) => this.onAccountChange(a));
      await this.startOnline(world, fallbackSeed);
    } else {
      this.listener.onSync('local');
      const loaded = deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null));
      if (loaded.ok && !world) this.loadState(loaded.save.state);
      else this.newLocalWorld(world?.seed ?? fallbackSeed(), world?.face ?? 'kiwisu');
    }
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
    this.saveTimer = window.setInterval(() => {
      this.save();
      if (document.visibilityState === 'visible') this.markSeen();
    }, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** True when the player has a colony worth protecting (asks before replacing it). */
  hasProgress(): boolean {
    if (this.state) return !isPristine(this.state);
    return deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null)).ok;
  }

  private loadState(saved: GameState): void {
    // Local games hold their alien garrisons (online, only the server does: chantier 07).
    if (!this.config) ensureAliens(saved, localAlienSeed(saved));
    this.map = generateFace(saved.seed, saved.face, saved.params);
    const now = Math.max(this.now(), saved.now);
    // Online, the stored state dates from the last server write: the player may have watched
    // the colony long after it. The summary only covers the time they were really away.
    const seenAt = this.config
      ? Math.min(now, Math.max(saved.now, seenTimes()[saved.universeId] ?? 0))
      : saved.now;
    const before = seenAt > saved.now ? advance(saved, seenAt).state : saved;
    const { state, events } = advance(before, now);
    this.state = state;
    this.listener.onWorld(this.map, this.state);
    this.listener.onState(this.state, now);
    const away = now - before.now;
    if (away >= OFFLINE_SUMMARY_MIN_MS) {
      this.listener.onOfflineSummary(summarize(before, state, events, away));
    }
    this.markSeen();
    this.save();
  }

  /** Online: remembers that the player has the colony on screen right now. */
  private markSeen(): void {
    if (!this.config || !this.state) return;
    const seen = seenTimes();
    seen[this.state.universeId] = this.now();
    safeStorage(() => localStorage.setItem(SEEN_KEY, JSON.stringify(seen)), undefined);
  }

  newWorld(seed: string, face: Face): void {
    if (this.config) void this.newOnlineWorld(seed, face);
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
    let result: ReturnType<typeof applyCommand>;
    try {
      result = applyCommand(this.state, cmd, { now, map: this.map });
    } catch (e) {
      // A bug in the rules must not swallow the click silently.
      console.error(e);
      this.listener.onError('internal');
      return false;
    }
    this.state = result.state;
    if (result.events.length) this.listener.onEvents(result.events);
    this.listener.onState(this.state, now);
    if (!result.ok) {
      this.listener.onError(result.error);
      return false;
    }
    if (this.config) {
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
    // A ship landed: only the server knows what it found (hidden garrisons).
    if (
      this.online &&
      !this.flushing &&
      this.pending.length === 0 &&
      Date.now() - this.reportPolledAt > REPORT_POLL_MS &&
      awaitingReport(this.state, now).length > 0
    ) {
      this.reportPolledAt = Date.now();
      void this.fetchReports();
    }
  }

  /** Asks the server for the outcome of landed ships, then rebases on its answer. */
  private async fetchReports(): Promise<void> {
    try {
      const res = await this.online!.call({ action: 'load', universe: this.universe });
      if (this.pending.length > 0) return;
      this.acceptServer(res);
      if (res.ok && res.events.length) this.listener.onEvents(res.events);
      this.rebase();
    } catch {
      // Tried again on a later tick.
    }
  }

  save(): void {
    if (!this.state || this.config) return;
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
      let shown = false;
      if (cached.ok) {
        try {
          this.loadState(cached.save.state);
          shown = true;
        } catch (err) {
          // The cache holds the state that just failed: never loop on it.
          console.error(err);
          safeStorage(() => localStorage.removeItem(CACHE_KEY), undefined);
        }
      }
      if (!shown)
        this.setWorld(
          publicState(
            newGame({
              seed: world?.seed ?? fallbackSeed(),
              face: world?.face ?? 'kiwisu',
              now: this.now(),
            }),
          ),
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
      // Stored states may predate this client's schema (or come from a newer server).
      const migrated = migrateState(res.state);
      if (!migrated.ok) throw new Error(`server state ${migrated.reason}`);
      res.state = migrated.state;
      this.serverState = res.state;
      safeStorage(
        () => localStorage.setItem(CACHE_KEY, serializeSave(res.state!, res.serverTime)),
        undefined,
      );
    }
  }

  private async loadFromServer(world: { seed: string; face: Face } | null): Promise<void> {
    const res = await this.online!.call({
      action: 'load',
      universe: this.universe,
      ...(world && this.universe === 'solo' ? { create: world } : {}),
    });
    this.acceptServer(res);
    if (!res.ok && res.error === 'forbidden' && this.universe !== 'solo') {
      // No longer a member (or unknown universe): back to the solo colony.
      this.setUniverse('solo', null);
      return this.loadFromServer(world);
    }
    if (!res.ok || !res.state) throw new NetworkError(res.ok ? 'no state' : res.error);
    this.pending = [];
    this.loadState(res.state);
    this.listener.onUniverse(res.universe ?? null);
    this.listener.onTwin(res.twin ?? null);
    this.listener.onAllies(res.allies ?? []);
    this.listener.onSync('online');
  }

  private setUniverse(id: string, info: UniverseInfo | null): void {
    this.universe = id;
    safeStorage(() => localStorage.setItem(UNIVERSE_KEY, id), undefined);
    this.listener.onUniverse(info);
  }

  // ---------------------------------------------------------------- shared universes

  async listUniverses(): Promise<UniverseSummary[]> {
    if (!this.online) return [];
    const res = await this.online.call({ action: 'listUniverses' });
    return res.ok ? (res.universes ?? []) : [];
  }

  /** Creates or joins a universe and switches to it. Returns an error code on failure. */
  async enterUniverse(
    how: { create: string; fromSolo?: boolean } | { code: string },
    displayName: string,
  ): Promise<ServerError | 'network' | null> {
    if (!this.online) return 'forbidden';
    if (!(await this.drainPending())) return 'network';
    try {
      const res = await this.online.call(
        'create' in how
          ? { action: 'createUniverse', name: how.create, displayName, fromSolo: how.fromSolo }
          : { action: 'joinUniverse', code: how.code, displayName },
      );
      this.acceptServer(res);
      if (!res.ok || !res.state || !res.universe) return res.ok ? 'internal' : res.error;
      this.setUniverse(res.universe.id, res.universe);
      this.pending = [];
      this.loadState(res.state);
      this.listener.onTwin(res.twin ?? null);
      this.listener.onAllies(res.allies ?? []);
      return null;
    } catch {
      return 'network';
    }
  }

  /** Switches to the solo colony or to another universe the player belongs to. */
  async switchUniverse(id: string): Promise<boolean> {
    if (!this.online || id === this.universe) return false;
    if (!(await this.drainPending())) return false;
    const previous = this.universe;
    this.setUniverse(id, null);
    try {
      await this.loadFromServer(null);
      return true;
    } catch {
      this.setUniverse(previous, null);
      return false;
    }
  }

  /**
   * Refreshes the member list of the current universe and the expedition targets that depend on
   * it (friends may have joined). Light: does not reload the colony.
   */
  async refreshUniverse(): Promise<void> {
    if (!this.online || this.universe === 'solo') return;
    try {
      const res = await this.online.call({ action: 'universeInfo', universe: this.universe });
      if (!res.ok || !res.universe) return;
      const me = res.universe.members.find((m) => m.userId === this.userId);
      if (me && this.state) {
        // Same pure helper as the server, so the planner shows exactly the server's targets.
        this.state = {
          ...this.state,
          targets: universeTargets(res.universe.members, me),
          friends: universeFriends(res.universe.members, me),
        };
        this.listener.onState(this.state, this.now());
      }
      this.listener.onUniverse(res.universe);
      this.listener.onTwin(res.twin ?? null);
      // Allies' gifts are added to our game by the server when their ship leaves (at least an
      // hour and a half before it lands): pick them up with the same light refresh.
      if (!this.flushing && this.pending.length === 0) void this.fetchReports();
      this.listener.onAllies(res.allies ?? []);
    } catch {
      // Offline: keep what we have.
    }
  }

  /**
   * Chantier 05: a newcomer to a shared universe moves to the other face of their kiwi (only
   * while the colony is untouched, and if nobody lives there).
   */
  async pickFace(face: Face): Promise<ClientError | null> {
    if (!this.online || this.universe === 'solo') return 'forbidden';
    if (this.state?.face === face) return null;
    if (!(await this.drainPending())) return 'network';
    try {
      const res = await this.online.call({ action: 'pickFace', universe: this.universe, face });
      this.acceptServer(res);
      if (!res.ok || !res.state) return res.ok ? 'internal' : res.error;
      this.pending = [];
      this.loadState(res.state);
      if (res.universe) this.listener.onUniverse(res.universe);
      this.listener.onTwin(res.twin ?? null);
      this.listener.onAllies(res.allies ?? []);
      return null;
    } catch {
      return 'network';
    }
  }

  /** Waits for queued commands to reach the server (they belong to the current universe). */
  private async drainPending(): Promise<boolean> {
    await this.flush();
    return this.pending.length === 0;
  }

  /** Brings a milestone-1 local colony into the account, once, if the account is still empty. */
  private async importLocalSaveOnce(): Promise<void> {
    // The import goes to the solo colony: never compare it with a shared one.
    if (this.universe !== 'solo') return;
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
    if (res.ok && res.state) this.loadState(res.state);
  }

  private async newOnlineWorld(seed: string, face: Face): Promise<void> {
    this.listener.onSync('syncing');
    try {
      if (this.universe !== 'solo') this.setUniverse('solo', null);
      const res = await this.online!.call({ action: 'newWorld', seed, face });
      this.acceptServer(res);
      if (!res.ok || !res.state) {
        if (!res.ok) this.listener.onError(res.error);
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
  private flush(): Promise<void> {
    if (!this.online) return Promise.resolve();
    this.flushing ??= this.sendPending().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async sendPending(): Promise<void> {
    if (!this.online) return;
    this.listener.onSync('syncing');
    try {
      while (this.pending.length > 0) {
        const command = this.pending[0]!;
        let res: GameResponse;
        try {
          res = await this.online.call({ action: 'command', universe: this.universe, command });
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
    } catch (e) {
      console.error(e);
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
      this.markSeen();
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

  private onPageHide = () => {
    this.markSeen();
    this.save();
  };

  dispose(): void {
    window.clearInterval(this.tickTimer);
    window.clearInterval(this.saveTimer);
    window.clearTimeout(this.retryTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
  }
}

function seenTimes(): Record<string, number> {
  return safeStorage(() => {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  }, {});
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
    foodRanOut: [...new Set(events.flatMap((e) => (e.type === 'foodRanOut' ? [e.resource] : [])))],
    starved: events.flatMap((e) => (e.type === 'starved' ? [e.name] : [])),
    waves: {
      won: events.filter((e) => e.type === 'waveStruck' && e.victory).length,
      lost: events.filter((e) => e.type === 'waveStruck' && !e.victory).length,
    },
    meteors: events.filter((e) => e.type === 'meteorLanded').length,
    incidents: events.filter((e) => e.type === 'incident').length,
    gifts: events.flatMap((e) => (e.type === 'cargoReceived' ? [e.from] : [])),
  };
}
