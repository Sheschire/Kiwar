import {
  awaitingServer,
  ensureAliens,
  localAlienSeed,
  publicState,
  advance,
  applyCommand,
  deserializeSave,
  faceMapOf,
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
  type GuestTransferPreview,
  type TwinSnapshot,
  type UniverseInfo,
  type UniverseSummary,
  universeFriends,
  universeTargets,
  stardustOf,
  colonyNeedsSync,
  deliverToSister,
  hasSister,
  isSister,
  layoutSnapshot,
  sisterFriend,
  syncColonies,
  takeFounding,
} from '@kiwar/shared';
import type { Account, OnlineBackend } from './onlineBackend';
import {
  clearGuestStash,
  readGuestStash,
  shouldAutoSignIn,
  type AuthRedirectError,
} from './authRedirect';
import { NetworkError, onlineConfig, type OnlineConfig } from './onlineConfig';
import { bootMark } from './bootTimes';

const SAVE_KEY = 'kiwar.save.v1';
/** Chantier 19: the local sister colony (the home colony stays under SAVE_KEY). */
const SISTER_KEY = 'kiwar.save.v1.sister';
/** Chantier 19: the colony on screen per universe ('solo' or an id → 0 home, 1 sister). */
const COLONY_KEY = 'kiwar.colony';
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
export type ClientError = CommandError | ServerError | 'network' | 'syncing';

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
  /** Chantier 19: counter-attacks on the bridgeheads (held / fell). */
  counters: { held: number; fell: number };
  meteors: number;
  comets: number;
  stardust: number;
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
  /** Chantier 19: the colony on screen and the layout of the other one (null: no sister). */
  onColony(colony: 0 | 1, sister: TwinSnapshot | null): void;
  /** An auth error came back on the redirect URL (shown once). */
  onAuthError(error: AuthRedirectError | null): void;
  /** The guest's colony may follow into this account: which one to keep? (null: done). */
  onGuestTransfer(preview: GuestTransferPreview | null): void;
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
  /** Chantier 19: the colony on screen (0 home, 1 the sister on the twin face). */
  colony: 0 | 1 = coloniesSeen()[this.universe] === 1 ? 1 : 0;
  /** Local mode: the colony not on screen (advanced every few seconds)… */
  private other: GameState | null = null;
  /** Chantier 32: the cached colony is on screen while the first server answer comes. */
  private previewing = false;
  /** …as it was when it left the screen, and what happened to it since (the summary). */
  private otherFrom: GameState | null = null;
  private otherEvents: GameEvent[] = [];
  /** Layout of the other colony as last shown (the planet at the twin's place). */
  private sister: TwinSnapshot | null = null;
  private sisterKey = '';
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
    bootMark('start');
    if (this.config) {
      const { OnlineBackend } = await import('./onlineBackend');
      bootMark('backend');
      this.online = new OnlineBackend(this.config, (a) => this.onAccountChange(a));
      await this.startOnline(world, fallbackSeed);
    } else {
      this.listener.onSync('local');
      const loaded = deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null));
      if (loaded.ok && !world) this.loadLocal(loaded.save.state);
      else this.newLocalWorld(world?.seed ?? fallbackSeed(), world?.face ?? 'kiwisu');
    }
    // The renderer drives the ticks right after its frames (`tickIfDue`); this timer only
    // takes over when no frame comes (hidden tab).
    this.tickTimer = window.setInterval(() => {
      if (performance.now() - this.lastTickAt >= TICK_MS * 1.5) this.tick();
    }, TICK_MS);
    this.saveTimer = window.setInterval(() => {
      this.advanceOther();
      this.saveSoon();
      if (document.visibilityState === 'visible') this.markSeen();
    }, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Local mode: the home colony and, once founded, its sister (the one on screen is loaded). */
  private loadLocal(home: GameState): void {
    const raw = deserializeSave(safeStorage(() => localStorage.getItem(SISTER_KEY), null));
    const sister =
      raw.ok && isSister(raw.save.state) && hasSister(home) && home.colony.foundedAt > 0
        ? raw.save.state
        : null;
    if (this.colony === 1 && sister) {
      this.other = home;
      this.loadState(sister);
    } else {
      this.setColony(0);
      this.other = sister;
      this.loadState(home);
    }
    this.otherFrom = this.other;
    this.otherEvents = [];
    this.linkLocal();
    this.emitColony(true);
  }

  /** The colony on screen, remembered per universe. */
  private setColony(colony: 0 | 1): void {
    this.colony = colony;
    const seen = coloniesSeen();
    seen[this.universe] = colony;
    safeStorage(() => localStorage.setItem(COLONY_KEY, JSON.stringify(seen)), undefined);
  }

  /** Tells the UI which colony is on screen and how the other one looks (when it changed). */
  private emitColony(force = false, snapshot?: TwinSnapshot | null): void {
    if (snapshot !== undefined) this.sister = snapshot;
    else if (!this.config) {
      const o = this.other;
      const key = o
        ? JSON.stringify([
            o.buildings.map((b) => [b.type, b.level, b.q, b.r]),
            o.paths,
            o.obstacles.length,
            o.terraform,
          ])
        : '';
      if (key !== this.sisterKey || force) {
        this.sisterKey = key;
        this.sister = o ? layoutSnapshot(o, '', this.now()) : null;
      } else return;
    }
    this.listener.onColony(this.colony, this.sister);
  }

  /**
   * Local mode (chantier 19): creates the sister colony when the settlers land, hands the
   * ships between the two faces over and shares the research (the server does it online).
   */
  private linkLocal(): void {
    if (this.config || !this.state) return;
    const home = this.colony === 0 ? this.state : this.other;
    let sister = this.colony === 0 ? this.other : this.state;
    if (!home) return;
    let changed = false;
    const f = home.colony.founding;
    if (f && !sister) {
      sister = takeFounding(home);
      this.otherFrom = sister;
      changed = true;
    } else if (f) home.colony = { ...home.colony, founding: null, foundedAt: f.at };
    if (!sister) return;
    if (deliverToSister(home, sister) + deliverToSister(sister, home) > 0) changed = true;
    if (colonyNeedsSync(home, sister)) syncColonies(home, sister);
    if (this.colony === 0) this.other = sister;
    else this.other = home;
    if (changed) {
      this.emitColony();
      this.saveSoon();
    }
  }

  /** Local mode: the colony off screen lives on (its events wait for the switch summary). */
  private advanceOther(): void {
    if (this.config || !this.other) return;
    const { state, events } = advance(this.other, this.now());
    this.other = state;
    this.otherEvents = [...this.otherEvents, ...events].slice(-500);
    // A technology learnt at home is news on both faces.
    const shared = events.filter((e) => e.type === 'researchDone');
    if (shared.length) this.listener.onEvents(shared);
    this.linkLocal();
    this.emitColony();
  }

  /** Chantier 19: plays the other colony (home or the sister on the twin face). */
  async switchColony(colony: 0 | 1): Promise<boolean> {
    if (colony === this.colony) return false;
    if (this.config) {
      if (!(await this.drainPending())) return false;
      const previous = this.colony;
      this.setColony(colony);
      try {
        await this.loadFromServer(null);
        return true;
      } catch {
        this.setColony(previous);
        return false;
      }
    }
    if (!this.other) return false;
    const now = this.now();
    const from = this.otherFrom ?? this.other;
    const { state, events } = advance(this.other, now);
    const happened = [...this.otherEvents, ...events];
    this.other = this.state;
    this.otherFrom = this.state;
    this.otherEvents = [];
    this.setColony(colony);
    this.state = state;
    this.map = faceMapOf(state);
    this.listener.onWorld(this.map, this.state);
    this.emitState(now);
    this.emitColony(true);
    const away = now - from.now;
    if (away >= OFFLINE_SUMMARY_MIN_MS)
      this.listener.onOfflineSummary(summarize(from, state, happened, away));
    this.save();
    return true;
  }

  /** True when the player has a colony worth protecting (asks before replacing it). */
  hasProgress(): boolean {
    if (this.state) return !isPristine(this.state);
    return deserializeSave(safeStorage(() => localStorage.getItem(SAVE_KEY), null)).ok;
  }

  /**
   * Shows a stored colony, advanced to now. `preview` (chantier 32): the online cache shown
   * while the server answers — no summary, nothing remembered, read-only until the real state.
   */
  private loadState(saved: GameState, preview = false): void {
    this.previewing = preview;
    // Local games hold their alien garrisons (online, only the server does: chantier 07).
    if (!this.config) ensureAliens(saved, localAlienSeed(saved));
    this.map = faceMapOf(saved);
    const now = Math.max(this.now(), saved.now);
    // Online, the stored state dates from the last server write: the player may have watched
    // the colony long after it. The summary only covers the time they were really away.
    const seenAt = this.config
      ? Math.min(now, Math.max(saved.now, seenTimes()[seenKey(saved)] ?? 0))
      : saved.now;
    const before = seenAt > saved.now ? advance(saved, seenAt).state : saved;
    bootMark('loaded');
    const { state, events } = advance(before, now);
    bootMark('advanced');
    this.state = state;
    this.listener.onWorld(this.map, this.state);
    this.emitState(now);
    bootMark(preview ? 'cacheShown' : 'shown');
    if (preview) return;
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
    seen[seenKey(this.state)] = this.now();
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
    this.other = null;
    this.otherFrom = null;
    this.otherEvents = [];
    safeStorage(() => localStorage.removeItem(SISTER_KEY), undefined);
    this.setColony(0);
    this.setWorld(this.state);
    this.emitColony(true);
    this.save();
  }

  private setWorld(state: GameState): void {
    this.state = state;
    this.map = faceMapOf(state);
    this.listener.onWorld(this.map, this.state);
    this.emitState(this.now());
  }

  /**
   * Tells the UI about the new state. When the Kikiwiwis reshaped a tile (chantier 08), the map
   * changes too: the world is sent again (the renderer keeps the view).
   */
  private emitState(now: number): void {
    const map = faceMapOf(this.state);
    if (map !== this.map) {
      this.map = map;
      this.listener.onWorld(this.map, this.state);
    }
    this.listener.onState(this.state, now);
  }

  dispatch(cmd: Command): boolean {
    // Chantier 32: the cached colony shown during the first sync is read-only.
    if (this.previewing) {
      this.listener.onError('syncing');
      return false;
    }
    if (cmd.type === 'setResearch' && this.state && isSister(this.state))
      return this.dispatchHomeResearch(cmd);
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
    if (result.ok) this.linkLocal();
    if (result.events.length) this.listener.onEvents(result.events);
    this.emitState(now);
    if (!result.ok) {
      this.listener.onError(result.error);
      return false;
    }
    if (this.config) {
      this.pending.push(cmd);
      void this.flush();
    } else {
      this.saveSoon();
    }
    return true;
  }

  /**
   * Chantier 19: the shared research is chosen at home. Local mode applies the choice to the
   * home colony; online, the server does (the sister shows it at once).
   */
  private dispatchHomeResearch(cmd: Extract<Command, { type: 'setResearch' }>): boolean {
    const now = this.now();
    if (this.config) {
      this.state = {
        ...this.state,
        research: { ...this.state.research, current: cmd.tech },
      };
      this.emitState(now);
      this.pending.push(cmd);
      void this.flush();
      return true;
    }
    if (!this.other) return false;
    const home = advance(this.other, now).state;
    const result = applyCommand(home, cmd, { now, map: faceMapOf(home) });
    if (!result.ok) {
      this.listener.onError(result.error);
      return false;
    }
    this.other = result.state;
    this.linkLocal();
    this.emitState(now);
    this.saveSoon();
    return true;
  }

  /** Cost of the last `advance` of a tick (ms, for the debug panel). */
  lastAdvanceMs = 0;

  /** True while a tick emits its state (the interface may skip some of those updates). */
  ticking = false;

  /** When the last tick ran (performance clock). */
  private lastTickAt = 0;

  /** Ticks if the last one is at least one tick old (called after each animation frame). */
  tickIfDue(): boolean {
    // A few ms early is fine: frames come every 7–17 ms, ticks stay ~200 ms apart.
    if (performance.now() - this.lastTickAt < TICK_MS - 8) return false;
    this.tick();
    return true;
  }

  tick(): void {
    this.lastTickAt = performance.now();
    if (!this.state) return;
    this.ticking = true;
    try {
      this.tickState();
    } finally {
      this.ticking = false;
    }
  }

  private tickState(): void {
    const now = this.now();
    const start = performance.now();
    const { state, events } = advance(this.state, now);
    this.lastAdvanceMs = performance.now() - start;
    this.state = state;
    this.linkLocal();
    if (events.length) {
      this.listener.onEvents(events);
      this.saveSoon();
    }
    this.emitState(now);
    // A ship landed or a counter-attack struck: only the server knows (hidden garrisons).
    // Chantier 19: settlers landed, the server creates the sister colony.
    if (
      this.online &&
      !this.flushing &&
      this.pending.length === 0 &&
      Date.now() - this.reportPolledAt > REPORT_POLL_MS &&
      (awaitingServer(this.state, now) || this.state.colony.founding !== null)
    ) {
      this.reportPolledAt = Date.now();
      void this.fetchReports();
    }
  }

  /** Asks the server for the outcome of landed ships, then rebases on its answer. */
  private async fetchReports(): Promise<void> {
    try {
      const res = await this.online!.call({
        action: 'load',
        universe: this.universe,
        colony: this.colony,
      });
      if (this.pending.length > 0) return;
      this.acceptServer(res);
      if (res.ok) this.emitColony(false, res.sister ?? null);
      if (res.ok && res.events.length) this.listener.onEvents(res.events);
      this.rebase();
    } catch {
      // Tried again on a later tick.
    }
  }

  private saveScheduled = false;

  /**
   * Saves when the main thread is idle (within 2 s): serialising the whole colony takes a few
   * ms that must not land in the middle of camera movement. `save()` stays synchronous for
   * leaving the page.
   */
  saveSoon(): void {
    if (this.saveScheduled) return;
    this.saveScheduled = true;
    const run = () => {
      this.saveScheduled = false;
      this.save();
    };
    if (typeof window.requestIdleCallback === 'function')
      window.requestIdleCallback(run, { timeout: 2000 });
    else window.setTimeout(run, 500);
  }

  save(): void {
    if (!this.state || this.config) return;
    const now = this.now();
    const home = this.colony === 0 ? this.state : this.other;
    const sister = this.colony === 0 ? this.other : this.state;
    safeStorage(() => {
      if (home) localStorage.setItem(SAVE_KEY, serializeSave(home, now));
      if (sister) localStorage.setItem(SISTER_KEY, serializeSave(sister, now));
    }, undefined);
    this.persistClock();
  }

  // ---------------------------------------------------------------- online mode

  private async startOnline(
    world: { seed: string; face: Face } | null,
    fallbackSeed: () => string,
  ): Promise<void> {
    this.listener.onSync('connecting');
    // Chantier 32: the last known colony shows at once (read-only) while the sign-in and the
    // server's answer come; the server's state replaces it.
    const cacheShown = !world && this.showCache();
    try {
      const account = await this.online!.init();
      bootMark('account');
      this.userId = account.userId;
      this.listener.onAccount(account);
      const redirect = this.online!.redirectError;
      if (redirect && shouldAutoSignIn(redirect, account.isAnonymous)) {
        // That Google account already has its colony: go there (the guest's may follow).
        void this.online!.signInWithGoogle().catch(() => this.listener.onAuthError(redirect));
      } else if (redirect) this.listener.onAuthError(redirect);
      await this.loadFromServer(world);
      // After the colony is on screen: neither of them holds the first display back.
      void this.importLocalSaveOnce()
        .then(() => this.offerGuestTransfer())
        .catch((e: unknown) => console.error(e));
    } catch (e) {
      if (!(e instanceof NetworkError)) console.error(e);
      // Show the last known colony (if any) and keep trying to reconnect.
      this.previewing = false;
      let shown = cacheShown;
      const cached = deserializeSave(safeStorage(() => localStorage.getItem(CACHE_KEY), null));
      if (!shown && cached.ok) {
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

  /** Chantier 32: the cached colony of this universe and colony, shown before the server's. */
  private showCache(): boolean {
    const cached = deserializeSave(safeStorage(() => localStorage.getItem(CACHE_KEY), null));
    if (!cached.ok) return false;
    const state = cached.save.state;
    // The solo colony's id holds the account (`solo-<user>`), unknown before the sign-in: the
    // cache is this browser's last colony, and the server's answer replaces it anyway.
    const universe =
      this.universe === 'solo'
        ? state.universeId.startsWith('solo-')
        : state.universeId === this.universe;
    if (!universe || isSister(state) !== (this.colony === 1)) return false;
    try {
      this.loadState(state, true);
      return true;
    } catch (e) {
      console.error(e);
      this.previewing = false;
      safeStorage(() => localStorage.removeItem(CACHE_KEY), undefined);
      return false;
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
    bootMark('loadCall');
    const res = await this.online!.call({
      action: 'load',
      universe: this.universe,
      colony: this.colony,
      ...(world && this.universe === 'solo' && this.colony === 0 ? { create: world } : {}),
    });
    this.acceptServer(res);
    if (!res.ok && res.error === 'invalidRequest' && this.colony === 1) {
      // No sister colony there (yet): the home colony.
      this.setColony(0);
      return this.loadFromServer(world);
    }
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
    this.emitColony(true, res.sister ?? null);
    this.listener.onSync('online');
  }

  private setUniverse(id: string, info: UniverseInfo | null): void {
    this.universe = id;
    this.colony = coloniesSeen()[id] === 1 ? 1 : 0;
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
    how: { create: string; fromSolo?: boolean } | { code: string; fromSolo?: boolean },
    displayName: string,
  ): Promise<ServerError | 'network' | null> {
    if (!this.online) return 'forbidden';
    if (!(await this.drainPending())) return 'network';
    try {
      const res = await this.online.call(
        'create' in how
          ? { action: 'createUniverse', name: how.create, displayName, fromSolo: how.fromSolo }
          : { action: 'joinUniverse', code: how.code, displayName, fromSolo: how.fromSolo },
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

  /** Chantier 14: the host opens or closes the current universe to solo colonies. */
  async setAllowImports(allow: boolean): Promise<ServerError | 'network' | null> {
    if (!this.online || this.universe === 'solo') return 'forbidden';
    try {
      const res = await this.online.call({
        action: 'universeSettings',
        universe: this.universe,
        allowImports: allow,
      });
      if (!res.ok) return res.error;
      if (res.universe) this.listener.onUniverse(res.universe);
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
        const linked = hasSister(this.state) || isSister(this.state);
        this.state = {
          ...this.state,
          targets: isSister(this.state) ? [] : universeTargets(res.universe.members, me),
          friends: [
            ...universeFriends(res.universe.members, me),
            ...(linked ? [sisterFriend(this.state)] : []),
          ],
        };
        this.emitState(this.now());
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
          res = await this.online.call({
            action: 'command',
            universe: this.universe,
            colony: this.colony,
            command,
          });
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
        else if (res.sister !== undefined) this.emitColony(false, res.sister);
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
    this.emitState(now);
  }

  private onAccountChange(account: Account | null): void {
    this.listener.onAccount(account);
    // Signing in to another account (e.g. on a new device) switches to its colony.
    if (account && this.userId && account.userId !== this.userId) {
      this.userId = account.userId;
      this.serverState = null;
      void this.loadFromServer(null)
        .then(() => this.offerGuestTransfer())
        .catch(() => this.listener.onSync('offline'));
    }
  }

  /**
   * After signing in to another account, the guest colony left behind may follow
   * (`guestTransfer`): silently when the account's own colony was never played, otherwise
   * the player chooses (`keepColony`).
   */
  private async offerGuestTransfer(): Promise<void> {
    const stash = readGuestStash();
    const account = this.online?.currentAccount;
    if (!stash || !account || account.isAnonymous || account.userId === stash.userId) return;
    try {
      const res = await this.online!.call({ action: 'guestTransfer', guestToken: stash.token });
      if (!res.ok || !res.transfer?.guest) {
        clearGuestStash();
        return;
      }
      if (res.transfer.accountPristine) await this.keepColony('guest');
      else this.listener.onGuestTransfer(res.transfer);
    } catch (e) {
      // Offline: the stash stays for the next start (until the guest token expires).
      if (!(e instanceof NetworkError)) console.error(e);
    }
  }

  /** The player's choice after `onGuestTransfer`. */
  async keepColony(keep: 'guest' | 'account'): Promise<void> {
    const stash = readGuestStash();
    this.listener.onGuestTransfer(null);
    if (!stash || !this.online) return;
    try {
      const res = await this.online.call({
        action: 'guestTransfer',
        guestToken: stash.token,
        keep,
      });
      clearGuestStash();
      if (!res.ok) {
        this.listener.onError(res.error);
        return;
      }
      if (keep === 'guest' && this.universe === 'solo' && res.state) {
        this.acceptServer(res);
        this.pending = [];
        this.loadState(res.state);
      }
    } catch (e) {
      if (!(e instanceof NetworkError)) console.error(e);
      this.listener.onError('network');
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

/** The key of a colony in `kiwar.lastSeen` (the sister colony has its own). */
function seenKey(state: GameState): string {
  return isSister(state) ? `${state.universeId}#1` : state.universeId;
}

function coloniesSeen(): Record<string, 0 | 1> {
  return safeStorage(() => {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLONY_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, 0 | 1>) : {};
  }, {});
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
    counters: {
      held: events.filter((e) => e.type === 'counterStruck' && e.victory).length,
      fell: events.filter((e) => e.type === 'counterStruck' && !e.victory).length,
    },
    meteors: events.filter((e) => e.type === 'meteorLanded').length,
    comets: events.filter((e) => e.type === 'cometPassed').length,
    stardust: Math.max(0, stardustOf(after) - stardustOf(before)),
    incidents: events.filter((e) => e.type === 'incident').length,
    gifts: events.flatMap((e) => (e.type === 'cargoReceived' ? [e.from] : [])),
  };
}
