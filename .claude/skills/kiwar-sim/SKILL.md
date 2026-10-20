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
  Since chantier 08 the map can change at run time: `faceMapOf(state)` applies the tiles the
  Kikiwiwis reshaped (`state.terraform`); any cache keyed on the map must include
  `terraformKey(state)` (see `kiwar-titans`). Obstacles are in `state.obstacles`.

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
  harvest (`harvestOf`, statuses ok/depleted/storageFull/idle), UI views; chantier 12:
  `nearestDepotOf` (depot by walk) and `pathLogisticsChanges` (what a path stroke does to
  each producer's efficiency, same distances as the harvest); chantier 16: `catchmentPlan`
  (tiles a producer would harvest on a tile, tiles in reach kept by others with their owner,
  deposit) for the placement preview.
- `sim/expeditions.ts` — launch, forecast, arrival/return resolution (chosen crew, weighted
  losses, memorial).
- `sim/aliens.ts`, missions, intel, ships — chantier 07: see the `kiwar-expeditions` skill.
  **Never put the real state of an alien face anywhere but `state.aliens`** (stripped by the
  server); arrivals without it are not events.
- `data/cycles.ts`, `data/needs.ts`, `sim/calendar.ts`, `sim/needs.ts`, `sim/rest.ts` —
  chantier 04 (calendar, seasons, hunger, rest, morale): see the `kiwar-cycles` skill.
- `data/threats.ts`, `sim/threats.ts`, `sim/sky.ts` — chantier 06 (predator waves, incidents,
  turrets, garrison, shelter, repairs, meteorites): see the `kiwar-threats` skill. Threat and
  sky draws use `withThreatRng` (their own stream), never the colony RNG.
- `data/comets.ts`, `sim/comets.ts` — chantier 13 (comets, stardust in `state.stardust` as raw
  integer units apart from `resources`, job `stardust`, blessings, star techs, fuel): see the
  `kiwar-sky` skill. Anything paid in stardust uses `payStardust` / `refundStardust`.
- `data/ages.ts`, `data/research.ts`, `sim/research.ts` — chantier 08 (Library, research
  points, technologies, `ageOf` = monument level, levels 4–6 via `withAgeLevels`): see the
  `kiwar-ages` skill. Anything that grows with the age reads `ageOf(state)`; technology bonuses
  come from `techEffects(state)`.
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

## Describing levels and build checks (chantier 11)

- `sim/describe.ts`: `describeLevel(type, level, state?)`, `describeUpgrade`, `describeTech` —
  the numbers the UI shows; add a `LevelStatId` / `TechStatId` (+ FR/EN `levelStats.*` /
  `techStats.*` and an icon in `StatChanges.tsx`) when a level or tech gains a new kind of
  number.
- `buildLock` (tile-independent build conditions), `siteError` (tile conditions) and
  `upgradeLock` are called by the `build` / `upgrade` commands: put any new build or upgrade
  condition there, not inline in `execute`, so the building tree, placement mode and level
  badges follow. `buildableTiles` lists where a type can go. `test/describe.test.ts` checks them
  against `validateCommand`.

## Gotchas

- **Replace `state.paths` and `state.terraform`, never mutate them in place** (`s.paths = [...]`,
  `s.terraform = { ...s.terraform, [k]: kind }`): `pathsKey` / `terraformKey` (territory.ts)
  cache their key strings on the object (perf pass of October 2026). `modifiers(v)` returns a
  frozen shared object (cached by trait, Kikiwiwi, class and level): do not write to it.
- **Flows can be negative** (meals): `computeFlows` returns net rates; a stock reaching zero or
  its cap is an event; a full stock harvests only what is eaten. Anything that changes a rate
  (calendar, hunger stage, beds, morale, mourning) must be an event — see `kiwar-cycles`.
- Tests that expect exact production must include `presence`, `moraleWork`, the hour and the
  season (`at(state, season, hour)` in `test/cycles.test.ts`) and the meals (`consumption`).

- **Integer progress**: anything that accumulates per kiwi over time (XP, practice) uses
  integer raw units and integer rates so small steps equal one big step exactly; the offline
  tests compare villagers with `toEqual` (and the RNG state).
- Jobs since chantier 06: `guard` (posted against predators) and `injured { until }`.
- **Planning at the loop top** (`planWave`, `planMeteor`) is safe only because it acts when
  nothing is planned, a condition that changes at events; anything planned at game creation
  must not draw from an RNG (advancing by 0 ms must leave the state unchanged).
- A new `Job` kind must be handled in `ratesOf` (kiwis.ts), `availableCrew`, the renderer's
  `think`/`workTile`, `jobRank`/`useJobLabel` in the village screen, and building removal.

- Chantier 09 (`kiwar-rpg`, `sim/posts.ts`): `returnHome` also runs after every successful
  command (inside `applyCommand`) and at each loop iteration; `redirectFull` only at a
  `storageFull` event or a construction end. Anything new that moves kiwis between workplaces
  must keep `homeJob` / `locked` in mind.
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
