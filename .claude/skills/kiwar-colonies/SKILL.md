---
name: kiwar-colonies
description: Kiwar conquest of the twin face (chantiers 19 and 42) — attacks on our beacons (announced, fortify from home, a guard posted by ship, battle), the ferret queen out of the depths once the 12 parcels are lit, the final battle (a giant unit in phases), the conquered face, the conquest screen; then the second colony (chantier 19) — the `found` mission, two linked game states (`colony` 0/1, two `games` rows, two local saves), shared research (`outbox`, `syncColonies`), links (`sister` friend, kiwis in deliveries), the last aliens (wave ramp, ruins, ferret dens, `raidDen`), the sister planet, the colony switch. Use when touching beacons' defence, the queen, the conquered twin, the second colony or anything that must work in both colonies.
---

# Kiwar colonies (chantiers 19 and 42)

**Chantier 42 rebuilt the conquest on the landings of chantier 40**: chantier 19's siege
(bridgeheads, counter-attacks, deep reconnaissance, assault and final missions, the 3D siege
show) is gone, its save fields too (v35: `siege` = `{ conqueredAt }`). What is left of
`sim/siege.ts`: `twinTarget`, `isConquered`, `queenTruth` (the queen's base power and her
starting parcel, drawn from `<garrison seed>/siege` with the old draws kept), `resetSiege`.

Load `kiwar-sim` (exact offline), `kiwar-expeditions` (landings, anti-cheat), `kiwar-civ`
(the civilisation), `kiwar-battle` (the battles), `kiwar-online` (server) and `kiwar-client`.

## Attacks on our beacons (`data/beacons.ts`, `sim/beacons.ts`, `battle/beacon.ts`)

- `BEACONS`: from the civilisation's Iron age (`minCivAge` 2, public date `attacksFrom`), one
  attack per face every 20–30 h, announced 6 h ahead, strength = the parcel it comes from ×
  0.5–0.9 × (1 + 0.1 per attack, ≤ ×2); tower hp 30 (fortified 160); fortification = two
  turrets (ground + sky) of the **first level of our age** (`fortLevel` = 3 × age + 1), paid
  like those levels × 0.5 (resources and iron, `fortifyCost`), 4 h; `maxGuards` 12; 5 reports.
- Public state on `FaceView` (save v35 fields, optional): `Beacon.guards` / `orders` / `fort` /
  `fortifying`, `attack` (`BeaconAttack`: id, `sector` and `origin` null until announced,
  `announceAt`, `at`, `announced`), `attacks`, `lastAttackAt`, `reports` (`BeaconReport` with
  the journal).
- **Planning** `planBeaconAttacks` at the loop top (no RNG of the colony: `<seed>/<target>/beacon/<n>`),
  base = max(last attack, oldest beacon, `attacksFrom`). **Announcement and strike need the
  truth** (`nextBeaconEvent` skips them without; `beaconAwaited` joins `awaitingServer`,
  `beaconsDue` joins `hiddenDue`): the civilisation picks the beacon beside a standing barracks
  (else beside a free parcel, secret tie-break), the origin (that barracks, else the strongest
  free neighbour, else any barracks, else the royal parcel: "the queen's tunnels"). If its
  real age is below Iron it skips (`lastAttackAt` = now).
- **Strike** `beaconSetup` (the parcel and its margin, our side 0 at home: the tower
  `TOWER` = building 0, its turrets, the guard as `guard`s with the beacon's orders; aliens as
  side-1 raiders with a token `carry` 1 so they stay on the tower, entering from the origin's
  side); the engine's **home-side retreat** (`orders[0].retreatBelow`: the guard leaves at once
  when its share standing drops under it). Held = tower not damaged (`beaconHeld`). No guard and
  no fort: falls without a battle. Fallen guards die (gear lost if the beacon falls); the ones
  who fled, or survivors of a fall, fly home (`sendHome`: a `retreat` expedition from the
  launchpad `none`, rations given). A fall removes the beacon and its parcel view (fog);
  `recordFight` for the attackers' losses, `recordDefeat` for a fall.
- **Guards**: mission `guard` (`guardLock`: notASector / noBeacon / invalidCrew / crewTooLarge /
  invalidOrders; crew 0 allowed with `bringBack`), nothing hidden (`canResolveArrival`),
  `landGuard` posts the crew (job `outpost { sector, targetId }`), sets the orders, boards the
  relieved; a breakdown delays it like a landing. `forgetGuards` in `removeVillagers`.
- Commands `fortifyBeacon { targetId, sector }` (`fortifyLock`, errors `noBeacon`,
  `fortifying`, `alreadyFortified`), `launchExpedition { mission: 'guard', sector, bringBack?,
orders? }`. Events `beaconAttackAnnounced`, `beaconAttacked { held, fought, dead }`,
  `beaconFortified`.
- **Forecast** `beaconForecast(state, target, sector, origin, now, guards?)` (public: the
  origin's view grown on the schedule, or the public guess; three practice battles with public
  seeds; `bare` when nothing defends it).
- The server's `load` resolves hidden moves **until none is due** (an announcement makes the
  strike due).

## The queen (`sim/queen.ts`, `battle/queen.ts`, `SIEGE.final`)

- **Out**: `emergeQueen` (truth side) when a landing lights the twin's 12th beacon
  (`resolveLanding` → `result.queenOut`, event `queenEmerged`); `FaceView.queen` (`QueenView`:
  sector = royal parcel, `since`, `at`, age, ground / air = `queenTruth` × her parcel's growth,
  escort = her parcel's garrison, `wounds`). Refreshed daily (`refreshQueen` in `civTick`); she
  stays out whatever happens to the beacons; `civ.royalSeen` set (the burrow stops moving).
  Before that, the royal burrow keeps fleeing our beacons (`civEyes` no longer reads a "queen
  seen").
- **Final battle**: mission `final` on the twin (`finalLock`: queenHidden / landingThere /
  invalidOrders; the launch sets `sector` = her parcel), resolved where the truth is
  (`resolveFinal`). `queenSetup`: the centre (radius 7), the ship on her parcel's edge, the
  crew as `assault`; the queen (body `queen`, `royalSlam` area weapon; `SIEGE.final`: hp 450 ×
  √(ground / 24) × √level, blows × √(√(ground / 24)) × 0.4, × (1 − wounds)); her power never
  under the civilisation's full growth (`floorH` 336 h: a queen out early is as strong as a
  late one); 15 % of her parcel's garrison beside her; **phases** through the engine's `wake`
  (bats = 0.3 × her air power under 75 %, elite ferrets = 0.2 × her ground power an age ahead
  from the tunnels under 50 %) and `rage` (under 25 %, blows × 1.6, speed × 1.4); `leader` =
  the queen: her fall routs her side (victory). `maxS` 480.
- **Victory**: `conqueredAt`, every parcel revealed and beaconed (`revealAll`), guards board the
  ship, her treasure (face loot × age × 4, hold-limited), XP × 2 and veterans; attacks stop
  (`attackable`), the civilisation stops (`civTick`), `found` opens. **Retreat / defeat**:
  `wounds` = 1 − (1 − old) × `leaderLeft`, **at most 50 %** (`maxWounds`: no wearing her down
  battle after battle), healing linearly over 72 h (`queenWounds`); a defeat loses the ship.
- **Forecast** `finalForecast` (in `forecastExpedition().landing`): three practice battles at
  luck 0.85 / 1 / 1.15 of her public view grown on the schedule from her floor (`finalInput`);
  `queenLeft` = what the middle one would leave of her (shown in the planner).

## Client

- `SiegeModal` is the conquest screen (`siegeVisible`: a beacon on the twin or conquered;
  `attackAnnounced` pulses the top-bar button `.has-alarm`): beacons n/12, `AttackLine`, the
  map + `ParcelPanel` (with `BeaconDefense`), "Land on this parcel", `QueenPanel`,
  `BeaconReports` (2D `LandingReplay ours={0}`); once conquered, `FoundSection`.
- `BeaconParts.tsx`: `AttackLine`, `BeaconDefense` (attack, forecast, guard, orders, fort, cost;
  Fortify / Send a guard / Relieve the guard), `BeaconReports`, `QueenPanel`.
- Planner (`ExpeditionModal`): `siegePlan.mission` `guard` (beacons only on the map,
  `BringBackPicker`, `OrdersPicker guard`, `GuardForecast`) and `final` (`QueenPanel planning`,
  the crew, orders, `LandingForecastLines`).
- `render/twin.ts` `TwinOptions.queen`: the queen (a `CreatureRig` ferret, scale 5, a gold
  crown, a dark lair) at the centre; `riseQueen` (4.5 s climb, trembling);
  `GameRenderer.playQueenRise` waits for a landing on show; `events.ts` flies to the twin on a
  fresh `queenEmerged`. The final battle plays through `playLanding` (`watchableTarget` takes
  `final`; no fog closing). `landingWatch.tellOutcome`: the queen's own toasts, the victory
  opens the conquest screen. Sounds: `siege.warning|victory|defeat|queen` (beacon attacks, the
  queen's rise and fall).
- Screenshots: a save from `perfSave.ts`, then on `controller.state` set `faceViews[twin]`
  (beacons with guards / fort, an announced `attack`, `reports`, a `queen`) — **after** the
  last `dispatch` (the state object is replaced) — and open `{ modal: 'siege' }` or the
  planner with `siegePlan: { mission: 'guard' | 'final', ... }`.

## Balance

`pnpm --filter @kiwar/balance conquest [--seed s] [--face f] [--days 21] [--casual]`
(`tools/balance/src/conquest.ts`): one line per game day (age, civilisation's age, kiwis,
beacons / forts / guards, attacks, the queen and her wounds) and a summary line (iron,
industry, first beacon, centre, queen out, conquest, founded, landings, finals, attacks held,
guards lost). Run four as background processes (≈ 4 cores). Reference: see `kiwar-balance`
"Chantier 42".

## The second colony (second half)

### Two linked states

- `GameState.colony: ColonyLink` (save v23) — `index` 0 (home) / 1 (sister on the twin face),
  `founding` (home only: settlers landed, sister still to create), `foundedAt`.
  `isSister`, `hasSister` (`sim/colonies.ts`). The sister is an ordinary `GameState`: same
  seed, `otherFace`, `twinParams`, same `calendarStart`, `createdAt` = landing, same
  player/universe/kiwi ids, **no targets and no `aliens`**, tutorial done
  (`objectiveIndex = OBJECTIVES.length`), `threats.shieldUntil` = landing + 48 h.
- **Founding**: mission `found` (`launchExpedition { mission: 'found', crew: ids, freight }`,
  `foundLock`: unknownTarget / notConquered / alreadyFounded; `minCrew('found')` =
  `COLONY.minSettlers` 5). `canResolveArrival` lets it through (nothing hidden).
  `landSettlers` (from `resolveArrival`) puts `settle(v)` copies and freight + provisions left
  into `home.colony.founding`, `emigrate`s them (no memorial, no mourning), the ship flies
  back empty (`returnCrewOf` = []).
- **Materialisation** is outside `advance`: `takeFounding(home)` → `newSister(home, f)` (pure:
  Nest 1, settlers with new ids, freight up to the storage, up to `COLONY.maxHuts` level-1 huts
  at distance 2 for the settlers the Nest cannot house, traces) and `home.colony.foundedAt`.
  Callers: the server's `linkColonies`, `GameController.linkLocal`, the bot's `runBot`.
- **Shared research**: in a sister `accrueResearch` fills `research.outbox`,
  `nextResearchEvent`/`researchTick` do nothing; `setResearch` fails `sharedResearch` (the
  client/server apply it at home). `syncColonies(home, sister)`: `receiveResearch(home,
outbox)` (current tech or bank), the sister copies `done`/`current`. Each state keeps its own
  time (a tech reaches the sister at the next sync). `colonyNeedsSync`. Ages stay per colony.
- **Links**: `SISTER_FRIEND` ('sister', owner `colony:<face>`, twin flight) is in `friends`
  of both (`linkSister`; the server's `withScopeTargets` adds it). `sendCargo { villagerIds }`
  (sister only, available kiwis, one kept home, one Kikiwiwi, `crewWeight` in the hold): kiwis
  leave (`emigrate`), travel in `Shipment/Delivery.villagers`, land idle with new ids
  (`settlersArrived`). `deliverToSister(sender, receiver)` hands over once (`delivered` flag),
  landing at `max(arriveAt, receiver.now)`. Delivery ids `c<colony>:<shipment>`.
- **Last aliens**: `sisterThreat(state, at)` in `wavePower` (ramp `COLONY.rampStart` 0.5 → 1
  over `rampMs` 96 h, × (1 + 0.15 × dens standing)). Obstacles `ruin` (kiwis clear it, loot)
  and `den` (titan smash, or `raidDen { q, r }`: the guards' ground power ≥ `COLONY.denPower`
  × `GARRISON.power`, foreseen by `denRaidForecast`, the weakest guards hurt 6 h), drawn by
  `generateTraces` from `<seed>/<face>/traces` (public: the face is ours).

### Online

- Migration `20261027000000_linked_colonies.sql`: `games.colony` 0/1, unique (user, universe,
  colony). `GameRepository.findGame/create(…, colony)`; the Postgres repository falls back to
  home colonies until the column exists (`legacyGames`).
- `load`/`command` take `colony`; `linkColonies(ctx, repo, scope)` (after hidden landings on
  load, after every command when linked): creates the sister row from a founding (re-using a
  stale row), hands ships over both ways, syncs research, writes the **sister first** (points
  never counted twice; a conflict may lose one batch). Responses carry `sister` (layout).
  `setResearch` from colony 1 is applied to the home row. A sister row with `foundedAt` 0 at
  home is stale (new world, moved colony) and ignored.
- Allies: `AllySnapshot.sister` (layout + `friendId` `ally:<uid>:1` + `room`); a delivery to
  `ally:<uid>:1` is looked up (`allySisterFriend`) and written to colony 1
  (`colonyOfFriend`). `moveSoloInto` and `guestTransfer` move the sister row too; `import`
  drops any local sister (`colony` reset).
- Mock: `GET /__mock/conquer` gives every home colony a conquered twin, Iron age, a launchpad
  and kiwis (online visual checks).

### Client

- `GameController`: `colony` per universe (`kiwar.colony`), local saves `kiwar.save.v1` (home)
  - `kiwar.save.v1.sister`; the colony off screen (`other`) is advanced every 5 s (its events
    wait for the switch summary, only `researchDone` is shown), `linkLocal` after every tick and
    command; `switchColony(i)`; online polls `load` while a founding is pending;
    `listener.onColony(colony, sisterSnapshot)` → store `colony`, `sister`.
- `startGame.showTwin`: the sister snapshot is drawn lit at the twin's place, named "Your
  <face> colony" (`twinOwner`); `VisitBanner` "Play this colony"; `ColonySwitch` (top bar),
  menu entry; `SiegeModal` `FoundSection`; planner `found` (`FreightPicker`, no map, no
  rations back); `DeliveryPlanner` kiwi picker for the sister, `friendName`; ruins and dens
  in `render/obstacles.ts`, `DenRaid` in the tile sheet; the research summary of a sister.
- Screenshots: see the scratch scenario in the chantier doc: push a monument level 2, a
  launchpad level 3, kiwis and `siege.conqueredAt` on `controller.state`, `debugGrant`, then
  dispatch the `found` launch and `setTimeScale(20000)` until `uiStore.sister`.

### Bot

- `bot/beacons.ts` (in `decide` before new landings): `beaconOrder` fortifies the threatened
  beacon, sends a guard if the forecast still says it falls and a guard would hold it with ≤ 1
  dead (landing before the strike), brings the guards home once nothing threatens;
  `finalOrder` sends the biggest crew it can pay (a Kikiwiwi, a bat-hitter) when a practice
  battle is won or the middle one would leave her under 15 % (not within 12 h of the last
  final). The landing bot (`bot/expeditions.ts`) retreats at 30 % lost and boards a Kikiwiwi. `bot/siege.ts` `siegeOrder` founds once conquered (6
  weakest non-key kiwis, 30 % of stocks up to the Nest 1).
- `runBot` plays the sister with the same `decide` (no expeditions; `ageDecision` never picks
  research in a sister), `linkOrder` (`bot/colonies.ts`) sends home's surplus,
  `deliverToSister` + `syncColonies` each round. Milestones `queenOut`, `conquest`, `founded`,
  `sisterNest3`, `sisterWave` (informative); `final.finals`, `beaconAttacks`, `beaconsHeld`,
  `guardDeaths`.

## Chantier 46: wounded on a field we hold

- A final battle won brings its fallen home wounded (`result.injured`), like a landing won.
- A beacon held: its fallen guards fly home wounded (`sendHome(…, hurt)`, the retreat ship's
  `result.injured`), `BeaconReport.hurt` (names), event `beaconAttacked.hurt`; a fallen beacon
  still kills. `BeaconForecast.expectedHurt` (middle trial held) vs `expectedDead`.
- Bot: `bot/beacons.ts` `provisionsFor` adds the return crew's rations (`returnSurplus`): a
  guard ship sent with 0 crew to fetch a guard took no food and the relieved starved (half of
  the "deaths" of the act III conquest probe). `SIEGE.final` hp 900, damage 0.5 (was 450 /
  0.4): the conquest came on days 7–12.
