/**
 * Chantier 56: the seasons of a league. Each shared universe runs its own seasons of
 * `SEASON_MS`, one after the other, the first one opened by the first request the server
 * answers in that universe once the leagues exist. A season's end only resets the ranking:
 * no colony is touched. The podium keeps a dated title and picks a cosmetic.
 */
import type { TimeMs } from '../types/ids';

export const LEAGUE = {
  /** About four weeks. */
  seasonMs: 28 * 24 * 3_600_000,
  /** Places that win a title and a cosmetic. */
  podium: 3,
} as const;

export const LEAGUE_COSMETICS = ['banner', 'capes', 'pennants', 'crown'] as const;
/** Drawn on the colony only: a banner on the Nest, capes, pennants on the paths, a crown. */
export type LeagueCosmetic = (typeof LEAGUE_COSMETICS)[number];

export interface LeagueSeason {
  n: number;
  startsAt: TimeMs;
  endsAt: TimeMs;
  /** Set once the podium has been written. */
  closedAt: TimeMs | null;
}

/**
 * The seasons to add so that one covers `now`: from the last known season (or none, then the
 * first one starts at `now`). Seasons follow each other without a gap, even across a long
 * silence (an empty season has no podium).
 */
export function seasonsToOpen(last: LeagueSeason | null, now: TimeMs): LeagueSeason[] {
  if (!last) return [{ n: 1, startsAt: now, endsAt: now + LEAGUE.seasonMs, closedAt: null }];
  const out: LeagueSeason[] = [];
  let prev = last;
  while (prev.endsAt <= now) {
    prev = {
      n: prev.n + 1,
      startsAt: prev.endsAt,
      endsAt: prev.endsAt + LEAGUE.seasonMs,
      closedAt: null,
    };
    out.push(prev);
  }
  return out;
}

/** A row of the ranking of a season. */
export interface LeagueStanding {
  userId: string;
  points: number;
  feats: number;
  /** When the player reached their total (the first to get there wins a tie). */
  lastAt: TimeMs;
}

/** Points of each player in a season, best first (ties: the first to reach the total). */
export function rankSeason(
  feats: readonly { userId: string; points: number; at: TimeMs }[],
): LeagueStanding[] {
  const by = new Map<string, LeagueStanding>();
  for (const f of feats) {
    const row = by.get(f.userId) ?? { userId: f.userId, points: 0, feats: 0, lastAt: 0 };
    row.points += f.points;
    row.feats += 1;
    row.lastAt = Math.max(row.lastAt, f.at);
    by.set(f.userId, row);
  }
  return [...by.values()]
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points || a.lastAt - b.lastAt || (a.userId < b.userId ? -1 : 1));
}

/** The podium of a ranking (at most `LEAGUE.podium` places). */
export function podiumOf(ranking: readonly LeagueStanding[]): LeagueStanding[] {
  return ranking.slice(0, LEAGUE.podium);
}
