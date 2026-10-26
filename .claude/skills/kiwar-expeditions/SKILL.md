---
name: kiwar-expeditions
description: Kiwar expeditions and the alien faces (chantier 07) — raids and reconnaissance missions, hidden alien garrisons and the anti-cheat rule (the client never gets them), intel reports and their ageing, the face map of a target, ship generations, reliability and breakdowns, the mechanical kiwi bird and its flights, the expedition probe. Use when touching launchExpedition, targets, aliens, intel, ships, the planner/report screens or the twin's fog.
---

# Kiwar expeditions (chantier 07)

**Since chantier 40 the only missions are `land` (the landing) and `found` (the settlers'
ship).** Raids, reconnaissance, assaults, reinforcements and finals are refused
(`invalidMission`); their sections below describe history and the code paths still used by
older saves and reports. Read "Chantier 40: the landing" first.

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

## Victories wound, loot by age (chantier 18)

- In a **victory** the kiwis hit (same `lossShare` count, weighted by exposure) come back
  **wounded** for `EXPEDITIONS.victoryInjuryMs` (6 h, `result.injured`, job `injured` on
  return); only a defeat or starvation on the way back kills. `ExpeditionForecast.woundsOnly`
  (victory expected at the middle of the estimate) switches the planner line to "about n
  wounded, no deaths". Raids used to cost 1.5–2 dead kiwis whatever the crew: never worth it.
- Loot ×8 (twin face 1 920 / 960 / 960 / 1 440) × `lootByAge(state)` (`EXPEDITIONS.lootByAge`
  1 / 1.5 / 2 / 3), applied at resolution; `potentialLoot(state, distance)` for the target
  cards. Garrisons drawn earlier keep their old loot (× the age).

## Launch cost (chantier 31)

`EXPEDITIONS.launchCost`: 40 fibre + 25 juice per kiwi aboard × the ship of the age (wood 1,
logs 2, iron 5, jet 12), a Kikiwiwi counts 3; `found` pays nothing. `launchCost(state, crew,
mission)` → `ExpeditionForecast.launchCost`; `launchExpedition` pays it with the provisions
(`notEnoughResources`). Planner line `.launch-cost` under the provisions. The bot adds it to
the cost of a raid. Chantier 40 (landings) will replace it.

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
  with 13–18 % losses. Since chantier 18 the probe is also a report section
  (`pnpm balance --probe 100`, `tools/balance/src/probe.ts`): breakdowns 35 % at every
  launchpad level (reliability follows the age since chantier 08), informed raids 100 % won,
  0 % fallen, ~17 % wounded. The colony bot sends reconnaissances and raids (`bot/expeditions.ts`,
  see `kiwar-balance`).

## The siege of the twin (chantier 19, `kiwar-colonies`)

Mission `found` (second half): the settlers' ship to the conquered twin (`freight`, no
fight, `landSettlers`, back empty). Deliveries to our own sister colony (friend `sister`) may
carry kiwis (`villagerIds`).

Missions `assault`, `reinforce`, `final` (and the simulated `retreat`) are resolved by
`resolveSiegeLanding` (`sim/siege.ts`); `canResolveArrival` lets reinforcements through
(nothing hidden). A reconnaissance of the twin while the siege is open is a deep one
(`deepRecon`: holds and the queen's lair, `IntelReport.siege`). `recordIntel` keeps the siege
intel. Missions to a conquered twin fail `conquered`. The forecast has `returnCrew`,
`returnWeight` (checked against the hold) and `final`.

## The alien civilisation (chantier 39, `kiwar-civ`)

Each garrison carries a hidden civilisation (`g.civ`, `sim/civ.ts`). `alienDefense` is now the
garrison of its outer ring (`outerPower(civAt(g, at))`) + `g.reinforce` × victories (the edge
musters: without it the bot farmed 8–18 raids a run); `g.growth` is no longer read; a raid lands on an outer parcel
(`raidSector`) and burns it on a victory (`result.sector`, `burnt`), feeds the civilisation on
a defeat. Reconnaissance reports the civilisation's dens and roosts (`seenStructures`) and its
age (`IntelReport.civAge`). `intelView` ages reports with `scheduleGrowth` (public schedule).

## Chantier 40: the landing (`land`)

- **Data** `data/landing.ts` `LANDING`: retreat bounds 0.3–0.8 (default 0.5), default orders,
  breakdown (delay × 1.5, hold × 0.6), ship rebuild (cost × ship, hours 4/6/10/16 by
  generation), unit caps 24 ground / 16 air, help from a neighbouring standing barracks (25 %,
  25 s), loot shares (burn 0.25, loot 1, centre × 2), victory XP × 2, edge spread 25 %, landing
  inset, practice luck 0.85/1/1.15, guess spread, freshness days, defeat hours (ship 4, gear 1
  per piece). `LandingOrders` { posture, priority (`nearest|air|casters|weakest`), retreatAt,
  goal (`burn|loot`) }.
- **Command** `launchExpedition { mission: 'land', sector, orders }` (default mission
  `land`): `landingLock` (`notASector`, `beaconHere`, `landingThere`, `invalidOrders`); the
  twin conquered → `conquered`; any target with a civilisation (other faces of a universe too).
- **Launch** (`launch`): the fee of chantier 31 + rations; a breakdown sets `delayed` (late,
  smaller `cargo`), never `broken`; the launchpad is damaged at the return as before.
- **Resolution** `resolveLanding` (`sim/landing.ts`, only where `state.aliens` is): the
  parcel's truth (`parcelTruth`: `sectorUnits`, every `civBuildings`, help from neighbours with
  a standing barracks), `landingSetup` + `simulateBattle(setup, '<garrison seed>/land/<id>')`,
  `landingOutcome` (victory = field cleared with a survivor; else retreat if someone reached
  the ship; else defeat). Since chantier 46 the fallen of a **victory** come home wounded
  (`result.injured`, 6 h, gear kept, no mourning); in a retreat or a defeat every fallen kiwi
  dies and its gear stays there (`removeVillagers(…, gearLost = true)`). Forecasts:
  `expectedDead` (not a victory) and `expectedHurt` (a victory), `tollOf`.
  - victory: `recordFight` (0.6), burn → `recordBurn`, a beacon (`faceViews[t].beacons`),
    `refreshBeacons`, bestiary, loot (stores × age × goal × ring × ranger, hold-limited),
    `victories[t]++`; survivors get XP × 2 and `veteran++` at the return;
  - retreat: a `retreat` parcel view (units seen), bestiary, `recordDefeat` for the dead;
  - defeat: parcel view deleted (fog), `recordDefeat(…, extraH ship + gear)`, launchpad
    `damaged` + `shipLost` (the repair rebuilds the ship: `repairCost` / `repairDuration`),
    expedition `done` at once.
  - `ExpeditionResult`: `outcome`, `log` (the journal), `beacon`, `seen`, `shipLost`, `burnt`.
- **Public views** `state.faceViews[targetId]` = { beacons, parcels } (save v33): `ParcelView`
  { at, source `beacon|landing|retreat|edge|report`, age, power range, units, buildings }.
  Beacons refresh every game day in `civTick` (`refreshBeacons`, truth needed) with the edge
  of their neighbours (buildings + power ± 25 %). `state.bestiary` (kind → level, best gear,
  seen, first/last). `viewFreshness`. `civEyes` reads the beacons and the parcels seen.
- **Forecast** `landingForecast` (in `forecastExpedition().landing`, public only): `seen`
  (units of a view × `scheduleGrowth`), `edge`, `guess` (public base × growth × 0.75–1.25),
  `formidable` (an unseen centre parcel: no number, odds `unknown`). Three practice battles
  (cached, public seeds `target/trial/sector/i`): likely = won at the strongest guess.
  Chantier 47: the strongest trial also meets `possibleHelp` — 25 % (`LANDING.reinforce`) of
  the strongest estimate of **every neighbouring parcel without our beacon** (a hidden
  barracks may stand there; an unseen centre parcel = public guess × `innerMultiple[1]`);
  `LandingForecast.help` lists them (the planner names them). Without it, landings next to a
  barracks forecast "likely, no death" ended in deadly retreats 26 times out of 30.
  `parcelEstimate` is the shared estimate of one parcel (knowledge, power, three armies).
- **Server**: `load` resolves landed ships (`hiddenDue`), `import` calls `resetLandings`
  (beacons and landings in flight dropped). Tests in `test/landing.test.ts` (outcomes, ship,
  breakdown, leak, server, save, migration v34, import).
- **Migration v34**: old missions in flight turn back with their crew, bridgeheads → beacons
  (holders idle), reports → `report` views (inner sectors × 2–3), conquest kept.
- **Client**: `ExpeditionModal` is the landing screen (`LandingMap`, `ParcelPanel`,
  `OrdersPicker`, `LandingForecastLines` with the "nobody hits the bats" warning,
  `CrewPicker` with veterans) and still the settlers' planner (`siegePlan { mission: 'found' }`;
  `siegePlan { mission: 'land', sector, targetId }` presets a landing). `ReportModal`
  `LandingReport` + `LandingReplay` (2D SVG of the journal through `render/battle/timeline`).
  `BestiaryModal` (store `bestiaryOpen`, phone menu entry). The twin's fog (`TwinIntel`) parts
  over parcels with a view, flags on beacons. Sounds `landing.victory|retreat|defeat`.

## Chantier 42: guards and the final battle (`kiwar-colonies`)

- Missions now: `land`, `found`, **`guard`** (a ship takes kiwis to one of our beacons and
  brings `bringBack` guards home; crew 0 allowed; nothing hidden: `canResolveArrival` lets it
  through; a breakdown delays it like a landing) and **`final`** (the queen's battle on the
  twin, once she is out; the launch sets `sector` to her parcel; resolved where the truth is).
  `retreat` is simulated for guards flying home after a fall or a retreat.
- `forecastExpedition` gives `final` its practice battles in `landing` (`finalForecast`) and the
  guard's `returnCrew` (the relieved). XP × 2 and veterans for a final won too.
- `resetLandings` (import) also idles the guards (`outpost`) and drops guard / retreat ships.
