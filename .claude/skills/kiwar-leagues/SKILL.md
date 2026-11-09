---
name: kiwar-leagues
description: Kiwar leagues (chantier 56) — public, dated feats read from the held state (`data/feats.ts`, `league/feats.ts`: single feats and tiered families, points by rarity), seasons of 28 days per shared universe opened and closed lazily by the server (`league/seasons.ts`, `server/leagues.ts`), the tables `league_seasons`, `league_feats`, `league_players`, `league_titles` and the view `league_ranking` (members read, only the game function writes), the actions `league`, `leagueReward`, `leagueWear`, the League screen, feats in the chat, and the cosmetics (Nest banner, capes, path pennants, monument crown). Use when adding a feat, touching seasons, rankings, titles or league cosmetics.
---

# Kiwar leagues (chantier 56)

Load `kiwar-online` (server, SQL, mock) and `kiwar-design` (guard rails) with it.

## The rules (owner, October–November 2026)

- A ranking **per shared universe**, on **public, dated feats**; seasons of ~4 weeks that only
  reset the ranking: **no colony is ever touched**. Solo: no ranking, the colony's own feats.
- A feat rewards **a step passed**, never time connected: no daily streak, nothing lost by an
  absence. Rewards are **cosmetic only** (a dated title + one cosmetic picked by the podium).
- Everything is computed by the server from the state it holds (charter 10).
- Feats already passed when a player **enters the league** of a universe (first request after
  the deployment, a solo colony brought along) go to the **record only**: season 0, 0 point.
- Advanced colonies keep steps to pass: **tiered families** (waves held, landings won, a kiwi's
  level, population, constructions).

## Feats (`packages/shared/src/data/feats.ts`, `league/feats.ts`)

- `FEATS`: id, group, rarity (or one rarity per tier), `tiers`. Key = the id, or `id:threshold`
  for a tier (`wavesHeld:40`). `FEAT_POINTS` common 10 / notable 25 / rare 50 / legendary 100;
  `featPoints`, `featRarity`, `parseFeatKey`, `isFeatKey`, `FEAT_KEYS` (table order).
- `featsOf(state)` reads **public state only** (never `aliens`, never what `depthSeed` hides):
  `ageOf`, `faceViews[*].beacons` (inner parcel = centre, `isInner`), `siege.conqueredAt`,
  `colony`, the tunnel, `depths.galleries` (+ `depthsMapOf` for a locule), villagers
  (`kikiwiwi`, `shiny === 'star'`, class tier 3, level), owned gear tiers (armory + worn).
  `featMeasures` gives the numbers of the families; `nextTiers` the next step of each.
- **Adding a feat**: an id in `FEAT_IDS` + `FEATS`, its detection in `singleFeats` (or its
  measure in `featMeasures` for a family), its name in `league.feats.<id>` (FR + EN, `{n}` for
  tiers), a case in `test/feats.test.ts`. Never read hidden data. Prefer monotonic facts (the
  state keeps them once passed): a feat is written once per player anyway, but a fact that
  can be lost would show again in "next steps".
- Not yet in: the core and the Great Weevil (chantier 52), the kiwaïs (53), the orchard fruits
  (54–55): add them when those chantiers are done.

## Server (`packages/shared/src/server/leagues.ts`)

- `LeagueRepository` (part of `GameRepository`): seasons, feats, players, titles, cosmetic,
  worn. `createMemoryLeagues()` is spread into `createMemoryRepository()`; Supabase version in
  `supabase/functions/game/repository.ts` (a missing table reads empty and skips writes).
- `recordLeague(repo, universe, members, user, colony, before, after, now, enter)`: commands
  write `newFeats(featsOf(before), featsOf(after))` (nothing new → no query); loads
  (`enter`) also catch up feats not recorded yet; the first time a player is seen
  (`openLeaguePlayer` true) their past goes to season 0. Called through `leagueOf` in
  `gameService.ts` (load home/sister/new game, command), wrapped in `quietly`: **the leagues
  never block a game request**.
- Feats are dated by the server time of the request that sees them (an offline step counts
  when the server next writes or loads the colony).
- `ensureSeasons`: the first season opens at the first league request of a universe; ended
  seasons are closed with `rankSeason` → `podiumOf` (ties: the first to reach the total) →
  `league_titles` (display name kept), seasons follow on without gaps (`seasonsToOpen`).
- Actions: `league { universe }` → `LeagueView` (`now`, current season, feats of members,
  titles, players); `leagueReward { universe, season, cosmetic }` (podium place, once; adds it
  to `worn`); `leagueWear { universe, worn }` (only picked cosmetics). Solo → `forbidden`.
- Looks: `looksOf(titles, players)` → `LeagueLook` (best rank per cosmetic worn) in
  `AllySnapshot.league` and the response's `leagueLook` (from `neighboursOf`).

## SQL (`supabase/migrations/20261105000000_leagues.sql`)

`league_seasons` (pk universe + n), `league_feats` (unique universe + user + feat; season 0 =
before the leagues; realtime publication), `league_players` (`worn text[]`), `league_titles`
(pk universe + season + user, unique rank). RLS: select for `is_universe_member`, no write
policy (service role only). View `league_ranking` with `security_invoker` (seasons ≥ 1).
Tests in `supabase/tests/rls_test.sql` (member reads, non-member reads nothing, a player can
neither write, change nor delete).

## Client

- `ui/components/LeagueModal.tsx` (`modal: 'league'`): tabs Season (ranking from
  `rankSeason`, time left from the server's `now`, `Reward`: pick, then show/hide), Feats
  (recorded feats, `NextSteps` from `nextTiers`), Record (each member, titles, dated feats,
  "before the leagues"). Solo: `SoloFeats` from `featsOf`. `featName`, `titleName`.
- Button in `TopBar` (`TrophyIcon`) and an entry in `MobileNav`'s menu. i18n `league.*`.
- `GameController.league(change)` / `actions.league`; `onLeagueLook` → store `leagueLook` +
  `renderer.setLeagueLook`.
- Chat: `ChatChannel` also reads `league_feats` (season ≥ 1, realtime + poll) → store
  `chatFeats`; `ChatPanel` merges them by time (`chat-feat`), never counted as unread. The mock
  serves `GET /rest/v1/league_feats`.
- Cosmetics: `render/leagueDecor.ts` `LeagueDecor` (banner beside the Nest, pennants on path
  tiles ≤ 3 from it, laurel crown on the monument; `rankColor` gold/silver/bronze; signature
  sync, returns true when it changed → shadows refreshed) and capes in the kiwi rig
  (`KiwiDraw.cape`, `KiwisView.setCape`). Our colony in `GameRenderer.syncLeague`; an ally's
  in `VillageLife.sync(state, look)` (`setAllyVillage(…, ally.league)`). Sheet:
  `?kiwis&clips=cape 1,cape 2,cape 3`. `BuildingsView.standOf(id)` gives a building's ground
  and height.

## Checks

- Mock: `pnpm mock:supabase` + `pnpm dev:online`; seed two players with direct calls to
  `/functions/v1/game` (signup on `/auth/v1/signup`), `/__mock/conquer` gives feats,
  `/__mock/clock?ms=` ends a season (28 days = 2 419 200 000 ms).
- A forced look in solo: `renderer.setLeagueLook({ banner: { rank: 1, season: 2 }, … })`.
- To test with the owner: healthy competition or pressure (the feeling), the points by rarity,
  the 28-day season.

## Chantier 55

Feats `apple`, `pineapple` (rare), `crown` (legendary: the pineapple's crown in
`orchard.taken`), `orchardRoute` (rare: a route standing); `raspberry` now reads
`orchard.visited` (a visit to another fruit does not count). No SQL change (a feat is a text).
