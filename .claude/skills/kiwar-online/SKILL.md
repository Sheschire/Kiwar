---
name: kiwar-online
description: Kiwar online mode — Supabase schema and RLS, the `game` edge function bundling the shared rules, universes/chat, the local mock server and DB tests. Use when touching server code, SQL, protocol or online client code.
---

# Kiwar online (Supabase)

- **Server-authoritative**: the edge function `supabase/functions/game` (Deno) runs
  `handleGameRequest` from `packages/shared/src/server/gameService.ts`. It owns the clock and
  randomness; clients only send commands (`server/protocol.ts` zod schemas). Requests: actions
  `listUniverses`, `createUniverse`, `joinUniverse`, `universeInfo`, `load`, `newWorld`,
  `import` (one-time local save import, checked by `isPlausible`), `command`.
- The function imports `supabase/functions/_shared/kiwar-shared.js`, an esbuild bundle of the
  shared package: **run `pnpm build:functions` after any shared change** (a test guards
  freshness). `supabase/functions/game/repository.ts` implements `GameRepository` with
  supabase-js; `createMemoryRepository()` is the in-memory version for tests and the mock.
- Chantier 05: `pickFace` (a newcomer moves to the free face of their kiwi while pristine,
  `faceTaken`, `repo.moveMember`) and `twin` snapshots of a friend on the other half (layout
  only) in load / join / universeInfo / pickFace responses — see `kiwar-world`.
- Stored games are migrated on read (`migrating(repo)` → `migrateState`).
- **Anti-cheat (chantier 07)**: every response goes through `publicState` (no `aliens`: the real
  alien garrisons); the server draws garrison seeds itself (`ensureAliens` in
  `withScopeTargets`, imports re-drawn) and resolves landed ships on `load`. Players cannot
  read `games` at all (no select policy). See `kiwar-expeditions`.
- Rate limit: 40 commands / 10 s (`command_log`).
- **SQL**: `supabase/migrations/` — `games`, `command_log`, `admins`, `universes`,
  `universe_members`, `audio_assets` / `audio_bindings` + Storage bucket `audio` (see
  `kiwar-audio`; `public.is_admin()` helper for admin-only policies), `chat_messages`
  (+ trigger setting the author name from the membership, flood limit 5 msgs / 10 s), `chat_reports`, realtime publication. RLS everywhere; game rows are
  written by the function only (service role).
- **Tests**: `pnpm test:db` (local Postgres + `supabase/tests/supabase_stub.sql` auth stub +
  `rls_test.sql`). Start Postgres first: `pg_ctlcluster 16 main start`.
- **Mock**: `pnpm mock:supabase` (port 54321: anonymous auth, `game` function through the real
  shared service, minimal PostgREST for chat and audio tables, Storage for the `audio` bucket,
  `rpc/is_admin` always true, no realtime) + `pnpm dev:online` (client on 5174).
  `/__mock/delay?ms=` changes the latency.
- Universes (playtest fixes): **one kiwi per player** — `assignFace` gives the first kiwi nobody
  lives on (Kiwisu), the twin half stays alien; `kiwiCount(members)` = one per player (+1 when
  every face is taken: older universes keep their pairs). Invite code 8 chars, ≤ 8 players,
  ≤ 5 universes per player; expedition targets are every alien face (own twin at distance 0).
- `createUniverse { fromSolo: true }` moves the online solo colony into the new universe as
  kiwi 0 (`moveSoloInto`; refused while pristine): same state re-keyed, `created_at` set so the
  calendar is unchanged, member `planet_seed` = the colony seed (`planetSeedOf(info, k)` gives
  the seed of any kiwi: use it, never `kiwiSeed` directly), then the solo slot starts over.
- **Chantier 14**: `joinUniverse { fromSolo: true }` reuses `moveSoloInto(…, members)`: the
  colony takes the first free kiwi (`assignFace`), keeps its seed/face, its twin's intel,
  victories and garrison are re-keyed (`rekeyTwin`: `aliens:0:` → `aliens:<k>:`), friends and
  deliveries reset, calendar = universe's (`withScopeTargets`), 48 h arrival shield
  (`shieldArrival`, `THREATS.importShieldMs`), member `imported: true` (`imported_at`).
  Refusals: `importsClosed` (host setting), `alreadyMember`, pristine solo (`invalidRequest`),
  `shipAway`. `universeSettings { universe, allowImports }` (host = `UniverseInfo.hostId`, from
  `universes.created_by`; `repo.setAllowImports`). Ally snapshots carry
  `power: ColonyPower` (`colonyPower(state)`: age, Nest, kiwis, defense, shieldUntil).
  The Supabase repository falls back to the pre-chantier-14 columns on `42703`/`PGRST204`
  (function deployed before the migration): keep that pattern for future column additions.
- Deliveries: the `command` handler writes a `sendCargo` gift into the recipient's game (see
  `kiwar-expeditions`); snapshots carry `friendId` and `room`. Mock: `/__mock/clock?ms=`
  moves the server clock forward.
- Responses with a universe carry `allies: AllySnapshot[]` (every other player's layout, seed
  and kiwi; never stocks) next to `twin` (`neighboursOf`). Client: see `kiwar-world`.
  Every colony of a universe shares its calendar: the repository reads `created_at`
  (`UniverseRow.createdAt`), `universeGame` / `withScopeTargets` set `calendarStart`
  (`calendarStartFor`). The memory repository takes `createdAt` from the service.
- Client robustness: sign-in 15 s / calls 20 s timeouts (`onlineBackend.withTimeout`), server
  states go through `migrateState` in `acceptServer`, the cache fallback never re-throws (it is
  dropped), `boot()` errors and an empty game show `BootScreen` (retry / play solo), panels sit
  in `Guard` error boundaries. The local save import and the first-visit intro are solo only.
- **Guest transfer** (hotfix, October 2026): `guestTransfer { guestToken, keep? }` — the
  edge function resolves the token through `ServiceContext.guestUserOf` (valid, anonymous, not
  the caller; the mock does the same); without `keep` a preview (`transfer`:
  `GuestTransferPreview`), `keep: 'guest'` swaps the two solo states (`soloFor` re-keys
  `playerId` / `universeId`), never deletes. Client: `game/authRedirect.ts` (redirect errors
  read before `createClient`, the guest stash `kiwar.guestTransfer` written before
  `signInWithGoogle` / `signInWithEmail`), `GameController.offerGuestTransfer` / `keepColony`,
  `ui/components/AccountNotices.tsx`. `identity_already_exists` on a guest signs in to that
  account automatically (`shouldAutoSignIn`, once per tab); `kiwar.lastAccount` drives the
  "Sign back in" button. The mock cannot run OAuth: test it with unit tests
  (`packages/shared/test/guestTransfer.test.ts`, `apps/client/test/authRedirect.test.ts`).
- Client side: `game/onlineBackend.ts` (auth: anonymous guest, link Google / magic link),
  `game/onlineConfig.ts` (env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), `game/chat.ts`.
- Owner setup guide: `docs/SUPABASE_SETUP.md` (keep it in sync with new migrations/env vars).
- **SQL delivery**: `supabase/setup.sql` = all migrations concatenated (`pnpm build:sql`, guarded
  by a test) for a fresh project. Every schema change = a new migration + its full SQL given to
  the owner, ready to paste, with the run order (the owner has no CLI workflow yet). Storage
  buckets and their policies are created in SQL too (`storage.buckets`, `storage.objects`
  policies), so the owner never has to click through the dashboard.
- **Deployment**: `.github/workflows/deploy-functions.yml` deploys the `game` function on every
  push to main touching `supabase/functions/**` (secrets `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF`; skipped when missing). The owner has no local clone: never ask them to
  run CLI commands; SQL goes through the SQL Editor, functions through this workflow.
- **Chantier 19, second half**: `games.colony` (0 home, 1 sister; migration
  `20261027000000_linked_colonies.sql`, unique per user, universe and colony). `findGame` /
  `create` take the colony (the Postgres repository falls back to home colonies on a missing
  column: `legacyGames`); `load` / `command` take `colony`; `linkColonies` keeps the two rows
  linked (founding, deliveries, shared research; sister row written first); responses carry
  `sister`; ally sisters (`AllySnapshot.sister`, friend `ally:<uid>:1`, `colonyOfFriend`).
  Mock: `/__mock/conquer`. See `kiwar-colonies`.
- **Chantier 19** (`kiwar-colonies`): `load` advances to `hiddenDue(state, now)` (landed
  ships **and** due counter-attacks of the siege), the client polls while
  `awaitingServer(state, now)`; `import` calls `resetSiege` (a local siege cannot be checked).
  The siege truth is derived from the garrison seed: nothing new to strip. No SQL change.
- **Chantier 59**: `allyVillage { universe, kiwiIndex, face }` returns `village` = another
  member's colony advanced to now **in memory only** (≤ `VILLAGE_ADVANCE_MAX_MS` 12 h of lag,
  never saved) through `villageView` (resources zeroed, `intel` / `faceViews` emptied, no
  `aliens`). `AllySnapshot.twin` carries their public view of their twin (`allyTwinOf`).
- **Stored-state validation (hotfix, October 2026)**: a stored game that fails
  `gameStateSchema` makes `findGame` throw → `internal` for that player only (and for every
  member whose load lists them in `neighboursOf`). A new queue kind or field must be accepted
  by the schema: round-trip a state using it through `migrateState` in its test (the canal
  queue items with `targetLevel: 0` locked players out). The client shows the server's code
  (`ServerFailure`, `failureCode`), never "No connection" for a refusal.
- **Chantier 39** (`kiwar-civ`): the alien civilisation lives inside `aliens` (stripped by
  `publicState`); `hiddenDue` also lists a wave due to be announced (only the server knows the
  civilisation's power and the wave's parcel), and `awaitingServer` includes `waveAwaited`.
  Leak tests scan for `"civ":{`, `"keys":[`, `"royalSeen"`, `"fights":[`. No SQL change.
