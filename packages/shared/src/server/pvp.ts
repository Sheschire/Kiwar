import { PVP } from '../data/pvp';
import { RESOURCE_IDS } from '../data/resources';
import { advance, type GameEvent } from '../sim/advance';
import {
  applyPvpResult,
  powerShift,
  pvpOutcome,
  pvpRaidOf,
  pvpTravelMs,
  pvpWaiting,
} from '../sim/pvp';
import { cloneState, type Expedition, type GameState, type PvpTarget } from '../sim/state';
import { friendId, userOfFriend, colonyOfFriend, type UniverseMember } from './universes';

/**
 * Chantier 57: the server's side of PvP. The attack is written into the target's game at the
 * departure (`announcePvp`, like a delivery), played there when it lands (the target's own
 * `advance` holds the crew), and its end is copied into the attacker's ship (`settlePvp`).
 * Each write is keyed by the attack's id: a failure between the two is caught up on the next
 * load of either player, and nothing is counted twice.
 */

/** A battle as the universe sees it (the chat line). Written by the server only. */
export interface PvpBattleRow {
  id: string;
  universeId: string;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  outcome: 'held' | 'looted' | 'turnedBack';
  /** Resources carried away (whole units, all kinds). */
  loot: number;
  at: number;
}

export interface PvpRepository {
  /** Adds a battle line (an id already written is left as it is). */
  recordPvpBattle(row: PvpBattleRow): Promise<void>;
}

/** Minimal game storage the PvP needs (the service's repository). */
interface Games {
  findGame(
    userId: string,
    universeId: string,
    colony?: 0 | 1,
  ): Promise<{ id: string; state: GameState; version: number } | null>;
  update(
    gameId: string,
    state: GameState,
    expectedVersion: number,
  ): Promise<{ id: string; state: GameState; version: number } | null>;
}

/** The other members' home colonies, as PvP targets (a sister colony is never one). */
export function pvpTargetsOf(members: readonly UniverseMember[], me: UniverseMember): PvpTarget[] {
  return members
    .filter((m) => m.userId !== me.userId)
    .map((m) => {
      const distance = Math.abs(m.kiwiIndex - me.kiwiIndex);
      return {
        id: friendId(m.userId),
        owner: m.displayName,
        kiwiIndex: m.kiwiIndex,
        distance,
        travelMs: pvpTravelMs(distance),
      };
    })
    .sort((a, b) => a.distance - b.distance || a.kiwiIndex - b.kiwiIndex);
}

/** The id of an attack: the attacker and its ship. */
export const raidIdOf = (attackerId: string, e: Pick<Expedition, 'id'>) => `${attackerId}/${e.id}`;

/** The user a PvP target id points to (null: not a home colony). */
export function targetUserOf(id: string): string | null {
  return id.startsWith('ally:') && colonyOfFriend(id) === 0 ? userOfFriend(id) : null;
}

/** Writes the attack into the target's game (its notice starts now). */
export async function announcePvp(
  repo: Games,
  universeId: string,
  attacker: { userId: string; displayName: string; state: GameState },
  e: Expedition,
  seeds: () => string,
): Promise<boolean> {
  const target = targetUserOf(e.targetId);
  if (!target) return false;
  const id = raidIdOf(attacker.userId, e);
  for (let attempt = 0; attempt < 4; attempt++) {
    const game = await repo.findGame(target, universeId, 0);
    if (!game) return false;
    if (game.state.pvp.incoming.some((r) => r.id === id)) return true;
    const raid = pvpRaidOf(attacker.state, e, game.state, {
      id,
      from: friendId(attacker.userId),
      owner: attacker.displayName,
      seed: seeds(),
      shift: powerShift(seeds()),
    });
    const next = cloneState(game.state);
    next.pvp.incoming.push(raid);
    if (await repo.update(game.id, next, game.version)) return true;
  }
  return false;
}

/**
 * Plays an attack at its target if it is due and not played yet, and returns how it ended
 * (null: the target has no news of it — left the universe, or the announcement never landed).
 */
export async function resolveAtTarget(
  repo: Games,
  universeId: string,
  targetId: string,
  raidId: string,
  onPlayed: (userId: string, before: GameState, after: GameState) => Promise<void>,
) {
  const target = targetUserOf(targetId);
  if (!target) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const game = await repo.findGame(target, universeId, 0);
    if (!game) return null;
    const done = game.state.pvp.defended.find((d) => d.id === raidId);
    if (done) return done;
    const raid = game.state.pvp.incoming.find((r) => r.id === raidId);
    if (!raid || !raid.units) return null;
    const next = advance(game.state, Math.max(game.state.now, raid.at)).state;
    const saved = await repo.update(game.id, next, game.version);
    if (!saved) continue;
    await onPlayed(target, game.state, saved.state);
    return saved.state.pvp.defended.find((d) => d.id === raidId) ?? null;
  }
  return null;
}

/**
 * The attacker's ships that landed get their news: the target is played first, then the crew's
 * fate is written into our state (at the arrival). Returns the state and the arrival events.
 */
export async function settlePvp(
  repo: Games,
  universeId: string,
  userId: string,
  state: GameState,
  now: number,
  onPlayed: (userId: string, before: GameState, after: GameState) => Promise<void>,
): Promise<{ state: GameState; events: GameEvent[]; changed: boolean }> {
  let s = state;
  const events: GameEvent[] = [];
  let changed = false;
  for (const waiting of pvpWaiting(state, now).sort((a, b) => a.arriveAt - b.arriveAt)) {
    const d = await resolveAtTarget(
      repo,
      universeId,
      waiting.targetId,
      raidIdOf(userId, waiting),
      onPlayed,
    );
    if (s.now < waiting.arriveAt) {
      const r = advance(s, waiting.arriveAt);
      s = r.state;
      events.push(...r.events);
    } else s = cloneState(s);
    const e = s.expeditions.find((x) => x.id === waiting.id);
    if (!e) continue;
    applyPvpResult(s, e, d);
    changed = true;
    events.push({
      type: 'expeditionArrived',
      at: e.arriveAt,
      expeditionId: e.id,
      victory: !!e.result?.victory,
      mission: 'pvp',
      ...(e.result?.outcome ? { outcome: e.result.outcome } : {}),
    });
  }
  return { state: s, events, changed };
}

/** The battles that ended between two states of a defender (for the chat lines). */
export function battlesPlayed(
  before: GameState,
  after: GameState,
  universeId: string,
  defender: { userId: string; displayName: string },
): PvpBattleRow[] {
  const known = new Set(before.pvp.defended.map((d) => d.id));
  return after.pvp.defended
    .filter((d) => !known.has(d.id))
    .map((d) => ({
      id: d.id,
      universeId,
      attackerId: userOfFriend(d.from),
      attackerName: d.owner,
      defenderId: defender.userId,
      defenderName: defender.displayName,
      outcome: d.turnedBack ? 'turnedBack' : pvpOutcome(d) === 'victory' ? 'looted' : 'held',
      loot: Math.floor(RESOURCE_IDS.reduce((sum, r) => sum + d.loot[r], 0)),
      at: d.at,
    }));
}

/** Whether the server should refresh the player's last activity (absence protection). */
export function staleActivity(state: GameState, now: number): boolean {
  return state.pvp.on && now - state.pvp.lastActiveAt >= PVP.activeStepMs;
}
