---
name: kiwar-colonies
description: Kiwar colonisation of the twin face (chantier 19) — the siege (Iron age + a Kikiwiwi), the hidden holds and ferret queen drawn from the garrison's secret seed, deep reconnaissance, assault / reinforce / final / retreat missions, bridgeheads and the `outpost` job, announced counter-attacks resolved by the server, fortification by a Kikiwiwi, the final assault (ground and air), the conquered face, the Siege screen, the 3D siege show; then the second colony — the `found` mission, two linked game states (`colony` 0/1, two `games` rows, two local saves), shared research (`outbox`, `syncColonies`), links (`sister` friend, kiwis in deliveries), the last aliens (wave ramp, ruins, ferret dens, `raidDen`), the sister planet, the colony switch, the bot's siege. Use when touching the siege, bridgeheads, counter-attacks, the queen, the conquered twin, the second colony or anything that must work in both colonies.
---

# Kiwar colonies (chantier 19)

**Chantier 40 retired the siege**: no deep reconnaissance, assault, reinforcement, final,
counter-attack or bridgehead any more (commands refused, `planCounter` / `siegeTick` unplugged
from `advance`, bridgeheads migrated into beacons, see `kiwar-expeditions`). The conquest is
closed until chantier 42 (the queen); a face already conquered stays so and `found` works.
`sim/siege.ts` keeps its code for chantier 42 (counters to reuse for beacon attacks). The
Siege screen only shows the conquered face and the settlers' ship (`siegeVisible` = conquered);
`SiegeParts` and `SiegeShow` are gone (`sectorName`, `fmtRange` live in `LandingParts`). The
bot only founds (`bot/siege.ts`), `pnpm balance:siege` is gone.

Load `kiwar-sim` (exact offline), `kiwar-expeditions` (anti-cheat, missions, intel),
`kiwar-online` (server), `kiwar-titans` (Kikiwiwis) and `kiwar-client` (UI) too.

## State of the chantier

Done (two conversations): siege, final assault, second colony, links, its threats, 3D
staging, the bot's siege. What is left: "Reste" in `docs/chantiers/19-colonisation.md`.

## The truth stays hidden

- `siegeTruth(g)` (`sim/siege.ts`) derives the holds of the 6 outer sectors (`SIEGE.outerSectors`
  = INTEL sectors 6–11), the queen's inner sector (0–5) and her ground / air power from
  `g.seed` (`<garrison seed>/siege`), memoized, **never stored**: no new hidden field, the
  client cannot compute it. Everything grows with `siegeGrowth(g, at)` (the garrison's own
  rate and ×2 cap; game days are short, so the cap is reached by the Iron age).
- Anything that reads it (assault and final landings, counter-attack strikes) runs only where
  `state.aliens[twin]` is: the server online, the client in solo. Reinforcements read nothing
  hidden (`canResolveArrival` lets them through).
- The client knows a fight is due: `counterAwaited` / `awaitingServer` (aliens.ts) make
  `GameController` poll `load`, and `load` advances to `hiddenDue(state, now)` (outbound
  landings + a due counter-attack). Tests scan responses for `"aliens":{` and seeds.

## Data and state

- `data/siege.ts` `SIEGE`: `minAge` 2, bridgeheads 3 max / 2 needed, hold base and spread,
  queen (ground, air, spread, −15 % per bridgehead, −10 % beside her lair, ≤ 90 %),
  `holdBonus` 1.2, counter (20–30 h, 6 h notice, share 0.5–0.9, +10 % per counter up to ×2),
  `fortify` (12 h, 400 juice, ×1.5), `fallLosses` 0.5–0.9.
- `GameState.siege: SiegeState` (save v22): `bridgeheads` ({ sector, since, holders,
  fortified, fortifyUntil?, fortifierId? }), `counter` ({ id, sector, announceAt, at,
  announced } — public), `counters`, `lastCounterAt`, `reports` (5), `conqueredAt`.
- `IntelReport.siege?: SiegeIntel` ({ seen, holds: { [sector]: DatedRange }, queen? }):
  merged by `recordIntel` (raids and recons keep it) and `recordSiegeIntel`; aged by
  `siegeView` / `ageRange` like the defense.
- `Expedition.sector / holders / bringBack`, `ExpeditionResult.bridgehead / sides /
queenFallen`, `MISSION_KINDS` (raid, recon, assault, reinforce, final, retreat; `retreat`
  is never launched: `invalidMission`).
- Job `outpost { sector }`: away (no bed in `rest.ts`, not the mayor, no skills, no garrison,
  not in `availableCrew`), but counted in the colony's consumption (they eat its stock).
  Removing villagers calls `forgetHolders` (inside `removeVillagers`): a bridgehead left
  empty is dropped (and the counter with the last one).

## Rules

- `siegeLock(state)`: unknownTarget (no distance-0 target) / conquered / ageTooLow /
  needsKikiwiwi. `assaultLock(state, sector)`: + notASector, sectorUnseen (intel.sectors),
  bridgeheadHere, bridgeheadLimit (bridgeheads + assaults in flight). `finalLock`: +
  queenUnknown, needBridgeheads, needFortified. `fortifyLock`: noBridgehead,
  alreadyFortified, fortifying, notAKikiwiwi (no Kikiwiwi holder), notEnoughResources.
  `siegeLaunchCheck` in `commands.ts` applies them to `launchExpedition`; the return weight
  (`forecast.returnWeight`) must fit the hold too.
- Deep reconnaissance: `resolveRecon` calls `deepRecon` when the siege is open and the target
  is the twin (draws only then).
- Landings (`resolveSiegeLanding`, called from `resolveArrival` after the broken / gone
  checks): assault (raid-like fight vs the hold; a victory posts the surviving holders, the
  others hit come home wounded; the exact hold is recorded), reinforcement (crew joins,
  `bringBack` boards, empty bridgehead abandoned, fortification stops if its Kikiwiwi
  leaves), final (crew + every holder, `assaultSides` with `fighterSides` = guard power /
  `GARRISON.power` × hunger; victory needs both sides; conquest brings every holder home and
  reveals all sectors).
- Counter-attacks: `planCounter` at the loop top (hash RNG `<seed>/<face>/siege/<n>`, no state
  RNG: big step = small steps), `nextSiegeEvent` / `siegeTick` (announce, fortification end,
  strike with the truth). A fallen bridgehead sends its survivors home with `sendHome` (a
  `retreat` expedition, launchpad `none`, rations given).
- Forecasts for the UI (public only): `counterForecast`, `finalForecast`, `assaultEnemy`,
  `forecastExpedition().final / returnCrew / returnWeight`.
- Imports: `resetSiege` (server `import` action).

## Client

- `ui/components/SiegeModal.tsx` (`siegeVisible`, conditions, steps, `CounterCard`,
  `SectorPanel`, reports, `CounterBadge`), `SiegeParts.tsx` (`SiegeMap` — wedges in
  `hexToPixel` space, slice k spans angles kπ/3…(k+1)π/3 as `sectorOf`; `sectorName` with
  `siege.slices.*`; `HoldersPicker`, `BringBackPicker`, `FinalLines`), `SiegeShow.tsx` (2D
  show from `uiStore.siegeShow`, set by `game/events.ts` for fights < 20 s old).
- Planner: `uiStore.siegePlan` (`actions.planSiege({ mission, sector? })` picks a free
  launchpad); the mission switch and target cards hide, the default crew follows the
  mission (final: 75 % of the seats, one Kikiwiwi).
- `render/twin.ts`: `TwinOptions.siege` → flags on bridgeheads (`sectorMiddle`), no dens once
  conquered; `startGame.showTwin` keys on bridgeheads and conquest. The twin's place belongs
  to chantier 24 (`render/space.ts`, see `kiwar-world` "Map of space"): bring it closer for
  the siege show with `renderer.setTwinApproach(t)`; the sister colony sits at the twin's
  place (`setTwin(map, { fog: false, friend })`); `actions.travelTo('twin')` flies there.
- Sounds `siege.warning|victory|defeat|queen` (`audio/catalog.ts`, `/admin` labels).
- Screenshots: push a monument level 2, a launchpad level 3, kiwis (clone `villagers[0]`), a
  Kikiwiwi, `intel[twin].siege`, bridgeheads with `outpost` holders and an announced counter
  on `controller.state`, then a `debugGrant` with `resources`; open `{ modal: 'siege' }` or
  `actions.planSiege(...)`; `uiStore.setState({ siegeShow: { kind, id } })` for the show.

## Balance

`pnpm balance:siege [--seeds 2] [--days 12] [--biomes …] [--trace]`
(`tools/balance/src/siege.ts`): the bot plays the whole siege; one line per run with the
hours of iron, Kikiwiwi, siege open, first bridgehead, conquest, founding, sister Nest 3 and
Industry, plus assaults, counters, finals and the sister's kiwis (`--trace`: a line every 12
game hours). Reference: see `kiwar-balance` "Siege".

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
- **3D siege show** (`render/siegeFx.ts`, `GameRenderer.playSiege(kind, sector)` from
  `game/events.ts`): camera up to 2.4 × the framing, twin approach 1, bolts / flashes / crown /
  clouds / smoke, back at 5 s; `SiegeShow` becomes a caption (`in3d`); while visiting a
  planet the 2D card plays alone. `TwinView.worldCenter` / `sectorWorld`.
- Screenshots: see the scratch scenario in the chantier doc: push a monument level 2, a
  launchpad level 3, kiwis and `siege.conqueredAt` on `controller.state`, `debugGrant`, then
  dispatch the `found` launch and `setTimeScale(20000)` until `uiStore.sister`.

### Bot

- `tools/balance/src/bot/siege.ts` `siegeOrder` (in `decide` before expeditions; raids pause
  while besieging): fortify, shore up a bridgehead before a counter it would lose, final when
  `likely`, post the Kikiwiwi, assaults on the weakest known holds (× 1.15 margin, holders all
  but a quarter), the third bridgehead beside the queen, deep recon until the queen and 3
  holds are known; then `found` (6 weakest non-key kiwis, 30 % of stocks up to the Nest 1).
- `runBot` plays the sister with the same `decide` (no siege, no expeditions; `ageDecision`
  never picks research in a sister), `linkOrder` (`bot/colonies.ts`) sends home's surplus,
  `deliverToSister` + `syncColonies` each round. Milestones `siegeOpen`, `bridgehead`,
  `conquest`, `founded`, `sisterNest3`, `sisterWave` (informative).

## The civilisation behind the siege (chantier 39, `kiwar-civ`)

The holds are the outer parcels' garrisons × `SIEGE.hold.share` (1.5; `SIEGE.hold.base` and
`siegeTruth().holds` are gone), the queen lives in the civilisation's royal burrow
(`queenLair(g)`: it may move while unseen and beside a bridgehead, never once
`intel.siege.queen` is known) and grows with its parcel (`siegeGrowth`). Bridgeheads are the
civilisation's "beacons" until chantier 40: its key buildings flee them. Assaults, finals and
counter-attacks record fights, burns and defeats.
