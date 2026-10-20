---
name: kiwar-expeditions
description: Kiwar expeditions and the alien faces (chantier 07) — raids and reconnaissance missions, hidden alien garrisons and the anti-cheat rule (the client never gets them), intel reports and their ageing, the face map of a target, ship generations, reliability and breakdowns, the mechanical kiwi bird and its flights, the expedition probe. Use when touching launchExpedition, targets, aliens, intel, ships, the planner/report screens or the twin's fog.
---

# Kiwar expeditions (chantier 07)

Load `kiwar-sim` (deterministic rules), `kiwar-online` (server) and `kiwar-client` (UI) too.
Crew strength, exposure and weighted losses come from `kiwar-rpg`.

## The anti-cheat rule

**The client never receives the real state of an alien face**, only what missions report.

- `ExpeditionTarget` (`state.targets`) is public: id `aliens:<kiwi>:<face>`, owner, kiwiIndex,
  face, distance, travelMs. Public base numbers per distance: `alienDefOf(distance)`
  (`ALIEN_TWIN_FACE`, `alienFaceOnKiwi`) — fine to show as "usual loot".
- The truth: `state.aliens?: Record<targetId, AlienGarrison>` (`sim/aliens.ts`): drawn by
  `drawGarrison(target, seed, since)` around the public numbers (`ALIENS`), seed
  `<alienSeed>/<targetId>`. `newGame({ alienSeed })`: the server passes `ctx.randomSeed()`;
  local games use `localAlienSeed(state)`. `ensureAliens(state, seed)` adds missing ones
  (migrated v11 games have none; `GameController.loadState` calls it in local mode only).
- Server (`gameService.ts`): `handleGameRequest` wraps `handle` and returns
  `publicState(state)` (no `aliens`) in **every** response; `withScopeTargets(ctx, …)` ensures
  garrisons with a server seed; `import` deletes the save's `aliens` and draws new ones; `load`
  advances to the last landed ship (only the server can resolve it) and saves.
- SQL: players cannot select `games` (migration `20261024000000_hide_game_state.sql`): never add
  a read policy back, `state` holds the truth.
- Sim: `canResolveArrival(state, e)` is false when the garrison is missing (and the ship is not
  broken, the face not gone): `advance` skips the arrival (no event), the expedition stays
  `outbound` after `arriveAt` ("waiting for news"); `awaitingReport` lists them and the client
  polls `load` every 5 s, then rebases (`GameController.fetchReports`).
- Anything new that depends on the truth (alien buildings, stocks, raids targeted by aliens…)
  goes into `AlienGarrison` and is resolved at an event the server runs; the client must be
  able to keep simulating without it. Test: `test/aliens.test.ts` scans every response for
  `"aliens":{` and garrison seeds — extend it for new actions.

## Intel

- `state.intel[targetId]: IntelReport` — `at`, `source` (recon | raid), ranges `defense`,
  `ferrets`, `bats`, `victoriesAt`, `sectors` (cumulative, `INTEL.sectors` = 12: 6 slices ×
  inner/outer ring, `sectorOf(q, r)`), `structures` seen (dens = ferrets, roosts = bats),
  `spotted`. `recordIntel` merges (sectors/structures accumulate, numbers replace).
- `intelView(state, id, now)`: aged ranges (max grows with `ALIENS.growthPerDay[1]` per game
  day up to `maxGrowth`, + public reinforcement per victory since), `freshness` fresh/stale/old
  (`INTEL.fresh`/`stale` days). Forecasts use it: `forecastExpedition().defense` is a range or
  null, `odds` `'unknown'` without a report (threats keep `Exclude<Odds, 'unknown'>`).
- A raid records the defense it fought exactly (and the enemy split).

## Missions

- `launchExpedition { mission?: 'raid' | 'recon' }` (zod in `protocol.ts`). `minCrew(mission)`,
  `maxCrew(state, pad, mission)` (recon 1–2), `travelTime(target, pad, crew, mission)` (recon
  × `RECON.travel`).
- Recon (`resolveRecon` in `sim/expeditions.ts`): `reconForecast(crew, ship)` gives quality,
  spot chance, sectors, spread. Draws (colony RNG): spotted, skirmish luck, losses, sector order
  (unseen first), the place of the truth inside each range. Spotted: quality × 0.5, skirmish vs
  `RECON.skirmishShare` of the defense — outmatched: one loss, else one wounded (`result.injured`
  ids → `injured` job on return). No loot, no victory, half XP.
- `ExpeditionResult` extras: `broken`, `spotted`, `sectors` (new this time), `injured`.
- `expeditionArrived` events carry `mission`, `spotted`, `broken` (toasts in `game/events.ts`).

## Kikiwiwis aboard (chantier 08, `kiwar-titans`)

- One per crew (`oneKikiwiwi`), boarded by name only (a head count skips them); weight ×5,
  rations ×3, fight ×4 (× green blood in `strengthOf(state, …)`).

## Ships

- `SHIPS` / `SHIP_IDS` (wood, logs, iron, jet) in `data/expeditions.ts`: reliability, armour
  (raid losses), recon bonus. `shipOf(state)` = `SHIPS[shipIdForAge(ageOf(state))]` plus the
  technologies' armour and recon (chantier 08; keep it the single entry point; the renderer
  uses `shipIdForAge`). Reconnaissance resolution uses the ship bonus too. Travel time takes
  `techEffects(state).travel`, rations `techEffects(state).rations`.
- `shipReliability(ship, crew)`: + best Dexterity (`SHIP_REPAIR`). Breakdown drawn in `launch`:
  `broken`, arrival at half the travel time, empty return, launchpad `damaged` at `returnAt`;
  `launchpadDamaged` refuses launches until the repair queue item ends. The UI hides the
  breakdown until the ship turns back (`ExpeditionsPanel`).

## Stardust fuel (chantier 13, `kiwar-sky`)

`launchExpedition { fuel }` pays `FUEL.stardust`: `travelFactor(state, plan)` (techs × 0.75) in
`forecastExpedition` and `launch`, `shipReliability(ship, crew, fuel)` +15 pts. Checkbox under
the ship line of the planner (shown once a comet passed).

## Client

- `ExpeditionModal.tsx`: mission switch (recon pre-selected while a target is unknown), target
  cards (`IntelLine`: range + age, map n/12), `IntelMap` + `EnemyLine`, crew sorted by
  `reconForecast` quality for recon, recon forecast, ship line. `ReportModal.tsx`: recon /
  broken branches. `IntelMap.tsx`: SVG of the target face from public seeds
  (`targetFaceParams(state, target, universe)`: the universe info, for `planetSeedOf`), seen sectors coloured with
  `tileTopColor`, structures snapped with `landTileNear`.
- Twin half (`render/twin.ts`): `TwinOptions.intel` → fog shader `uSeen[12]` mask + `uInner`;
  seen dens/roosts drawn. `startGame.showTwin` keys on the seen sectors.
- `render/buildingModels.ts`: `bird(p, gen, docked)` (body = `ship` rig on the pad, wings
  `wingL`/`wingR`), `shipModel(gen)` for flights. `render/ship.ts` `ShipsView`: take-off and
  landing over `TAKEOFF_MS` of game time, cruise to the twin's current position
  (`twin.group.position`) or a far sky point, flap per generation, smoke for iron/broken.
- Visual checks: `debugGrant` + `upgrade` Nest + `build` launchpad with `setTimeScale(3000)`,
  then `launchExpedition` with `mission: 'recon'`; open `uiStore.setState({ modal: 'expedition',
expeditionPad })` or `{ modal: 'report', reportId }`; zoom out (`dollyTo(frameDistance × 1.85)`)
  to see the twin's opened clouds.

## Deliveries between allies (multiplayer)

- `sim/deliveries.ts`: `cargoWeight`, `cargoLimit(pad)`, `deliveryTime(state, friend, pad)`,
  `sendShipment`, `nextDeliveryEvent` / `deliveryTick` (an `advance` event: `cargoDelivered`,
  `shipmentReturned`, `cargoReceived { received, lost }`), `deliveryOf(shipment, from, uid)`.
- State (save v14): `friends` (server-set, `universeFriends`, ids `ally:<user id>`,
  `userOfFriend`), `shipments` (our ship; `isLaunchpadBusy` counts them), `incoming`.
- Server: after a successful `sendCargo`, `deliver()` appends the `Delivery` to the ally's
  stored game (version retry). Nothing hidden: deliveries resolve on the client too.
- Client: `ui/components/DeliveryPlanner.tsx` (in `ExpeditionModal`, store `deliverTo`),
  `actions.prepareDelivery(friendId)`, `ShipsView` flights `ship:<id>` (to the ally's planet via
  the `AllyLocator` from `AlliesView`) and visitors `gift:<id>` (90 s approach, 45 s rest beside
  the Nest). Visual check: mock `/__mock/clock?ms=` to jump the server clock; render one page
  at a time (two software-rendered pages starve each other's timers).

## Balance

- `pnpm balance:expeditions [--seeds 300]` (`tools/balance/src/expeditions.ts`): breakdown rate
  per launchpad level, spotted / fallen / wounded scouts, sectors and range width, blind vs
  informed raid wins and losses. Reference (end of chantier 07): breakdowns 28/14/3 %, spotted
  17 %, fallen 1 %, wounded 16 %, 2.9 sectors ±26 %, blind ×6 raid wins 37 %, informed 100 %
  with 13–18 % losses. The colony bot (`pnpm balance`) does not send expeditions.
