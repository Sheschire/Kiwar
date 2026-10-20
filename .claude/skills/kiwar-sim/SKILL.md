---
name: kiwar-sim
description: Architecture of the Kiwar shared simulation (packages/shared) and the step-by-step recipe to add or change a game mechanic — data, state, schema migration, commands, protocol, advance events, tests. Use for any gameplay/rules change.
---

# Kiwar shared simulation

## Principles

- **Deterministic and pure.** ESLint forbids `Math.random`, `Date.now`, DOM globals and
  three/preact imports in `packages/shared/src`. Time is passed in (`now`), randomness comes
  from the state's seeded RNG: `withRng(state, (rng) => …)` (sfc32, `rng/rng.ts`).
- **Ogame model, exact offline.** `advance(state, now)` jumps from event to event; between two
  events every rate is constant and production is integrated exactly. Anything that changes a
  rate on its own (deposit runs dry, storage fills, construction ends, egg hatches, expedition
  lands…) must be an event in `advanceInPlace` (`sim/advance.ts`): add its time to `nextEvent`.
  The test "same result in one big step or many small ones" must keep passing.
- **Same rules everywhere.** Client (optimistic), server (`server/gameService.ts`), balance bot
  and mock all call `applyCommand(state, cmd, { now, map })`. UI previews reuse the very same
  functions as the simulation (e.g. `forecastExpedition`, `catchmentPreview`, `buildingHarvest`).
- The face map is regenerated from the seed: `generateFace(seed, face, params)` (`params.biome`
  matters: always pass `state.params`); inside the sim use the memoized `faceMapOf(state)`
  (`sim/territory.ts`). Climate is `climateOf(face, biome)`, season effects take the biome.

## Map of the code

- `data/` — tunable tables: `kiwis.ts` and `classes.ts` (chantier 03), `buildings.ts` (levels, costs, production, `maxLevelOf`),
  `territory.ts` (DEPOSITS, HARVESTS, CATCHMENT_RADIUS, LOGISTICS, PATHS, CAMPS),
  `expeditions.ts`, `hatching.ts`, `objectives.ts` (tutorial), `faceProfiles.ts` (face biases,
  climate multipliers), `biomes.ts` (chantier 05, see `kiwar-world`), `start.ts`, `tiles.ts`.
- `worldgen/generateFace.ts` — hex disc (axial, pointy-top, radius 12), tile types heart / ray /
  seedRing / flesh / grove / juice / skin, richness 0.8–1.25.
- `sim/state.ts` — `GameState`, `newGame`, `cloneState` (**must deep-copy every new field**),
  `SCHEMA_VERSION`.
- `sim/selectors.ts` — read-only helpers (capacity, rates, costs, objective progress…).
- `sim/advance.ts` — event loop, `computeFlows`/`accrue`, constructions, hatching, autoAssign.
- `sim/commands.ts` — `Command` union, `COMMAND_ERRORS`, `applyCommand` (advances to `now`
  first, then executes on a copy; failures throw `fail(code)`), `validateCommand` (dry run for
  the UI).
- `sim/territory.ts` — deposits, catchment claims (`computeClaims`, oldest building first),
  pools (`syncPools`, `releasePool`), logistics (`depotDistances`, Dijkstra, memoized),
  harvest (`harvestOf`, statuses ok/depleted/storageFull/idle), UI views.
- `sim/expeditions.ts` — launch, forecast, arrival/return resolution (chosen crew, weighted
  losses, memorial).
- `data/cycles.ts`, `data/needs.ts`, `sim/calendar.ts`, `sim/needs.ts`, `sim/rest.ts` —
  chantier 04 (calendar, seasons, hunger, rest, morale): see the `kiwar-cycles` skill.
- `sim/kiwis.ts` — individual kiwis (stats, XP, masteries, powers, classes, skills): see the
  `kiwar-rpg` skill. Production uses `workforce` (summed worker power), not the head count.
- `save/save.ts` — zod schema of the state, `MIGRATIONS[n]` (n → n+1), `migrateState`.
- `server/` — `protocol.ts` (zod request + **command schemas**), `gameService.ts` (actions,
  rate limit, `isPlausible` anti-cheat for imports), `universes.ts`.

## Recipe: add a mechanic

1. **Data** in `data/<topic>.ts`, export it from `src/index.ts`.
2. **State**: new fields in `GameState` (or `Building`…), initialise in `newGame`, deep-copy in
   `cloneState`.
3. **Schema**: bump `SCHEMA_VERSION`, add the zod fields in `save/save.ts`, add
   `MIGRATIONS[old]` filling defaults. Server reads stored games through `migrating(repo)`.
4. **Commands**: extend `Command`, add error codes to `COMMAND_ERRORS`, implement in `execute`.
   Add the zod schema in `server/protocol.ts` (otherwise the server rejects the command as
   `invalidRequest`). Update `isPlausible` if imports could carry the new data.
5. **Time**: if it changes rates or happens at a time, make it an `advance` event.
6. **Tests** in `packages/shared/test/` (helpers: `setup`, `findTile`, `run`, `rich`, `T0`):
   behaviour, offline equivalence (big step vs small steps), migration, command errors.
7. `pnpm build:functions`, then client (`kiwar-client`): every new error code and building type
   needs FR + EN strings (TypeScript enforces it), a 3D model for new buildings.
8. Balance (`kiwar-balance`) and `docs/DECISIONS.md`.

## Gotchas

- **Flows can be negative** (meals): `computeFlows` returns net rates; a stock reaching zero or
  its cap is an event; a full stock harvests only what is eaten. Anything that changes a rate
  (calendar, hunger stage, beds, morale, mourning) must be an event — see `kiwar-cycles`.
- Tests that expect exact production must include `presence`, `moraleWork`, the hour and the
  season (`at(state, season, hour)` in `test/cycles.test.ts`) and the meals (`consumption`).

- **Integer progress**: anything that accumulates per kiwi over time (XP, practice) uses
  integer raw units and integer rates so small steps equal one big step exactly; the offline
  tests compare villagers with `toEqual` (and the RNG state).
- A new `Job` kind must be handled in `ratesOf` (kiwis.ts), `availableCrew`, the renderer's
  `think`/`workTile`, `jobRank`/`useJobLabel` in the village screen, and building removal.

- Rich test states (`rich()`) exceed storage: harvesting pauses when storage is full, so reset
  resources when testing rates.
- `buildingCount` excludes the Nest and camps (building cap).
- Building richness no longer multiplies the harvest rate (it sizes deposits).
- Prefer constants from `data/` in tests over hard-coded numbers (balance changes often).
- **Removing a building** (`demolish`, alias `dismantle`): refund (`demolitionRefund`, 25 % via
  `DEMOLITION`), `releasePool` then `syncPools`, clear `returnTo` of builders, set its workers
  idle + `autoAssign`. Any new building-removal path must do the same. `demolitionPreview`
  feeds the confirmation UI.
- **No dead end**: `test/demolition.test.ts` plays random colonies, demolishes everything and
  checks seeds and juice come back. Keep it passing when changing costs, the Nest's passive
  income, tile rules or demolition refusals.
