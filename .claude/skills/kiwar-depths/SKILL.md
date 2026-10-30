---
name: kiwar-depths
description: Kiwar depths under our half (chantier 48, then 49, 50, 52) — the tunnel entrance (technology `spelunking`, Iron), the public network of rooms (`depthsMapOf`) and what they hold from the hidden `depthSeed` (`roomTruth`), delves (mission `delve`, `battle/delve.ts`, hazards, forecast, resolution where the truth is held), galleries and miners (job `mine`, `galleryRate`, automation `mine`), the Grouillants (larva, fruit fly, woodlouse), the spelunker class, upwellings out of the tunnel (`sim/upwell.ts`, the door, `comingWave`), the Depths screen. Use when touching anything below the surface, the tunnel, delves, galleries, upwellings or the spelunker.
---

# Kiwar depths (chantier 48)

Chantier 49 drew the cut in 3D (section "The cut" below). Load `kiwar-sim` (determinism, exact offline), `kiwar-battle` (the engine), `kiwar-threats`
(waves: upwellings are waves) and `kiwar-expeditions` (the anti-cheat rule) with it.

## The rule of the truth

- **Public**: the network. `depthsMapOf(state)` draws it from `seed/face` (memoized): rooms
  `r0…` with `depth` 1–3, `x` across the cut (−1…1), `links` both ways, `entrance` (depth 1).
  Everyone who knows the face draws the same one; the client draws it without the server.
- **Hidden**: what a room holds. `state.depthSeed` (top level, like `aliens`) — the server
  draws it (`newGame` from `alienSeed` + `/depths`; `ensureDepths(state, ctx.randomSeed())` in
  `withScopeTargets` for migrated games), a solo game derives it (`localDepthsSeed` =
  `localAlienSeed/depths`, also `GameController.loadState`). `publicState` deletes it;
  `import` deletes it, calls `resetDepths` (views, galleries, upwelling, delves in flight,
  miners) and draws a new one. `roomTruth(seed, room)` (pure, cached): kind, Grouillants
  (`grouillants(power, level)`), hazard, loot, iron. A sister colony has no depths (its
  `depthSeed` is deleted; `buildLock` refuses the tunnel there; noted for chantier 58).
- **Anything that reads the truth resolves only where it is held**: a delve's arrival
  (`canResolveArrival`: `depthSeed` present), an upwelling's announcement (`upwellAwaited`,
  `upwellDue` in `hiddenDue` / `awaitingServer`). Tests: `test/depths.test.ts` scans the
  server's answers for `"depthSeed"` and `secret-N/depths`.
- Public views `state.depths.views[roomId]`: `source` `delve` (won) > `retreat` > `lantern` >
  `edge` (kind only, heard from a room won next to it); `see()` never downgrades a view.

## Data (`data/depths.ts`, `DEPTHS`)

Rooms per depth, link chances, kind weights by depth (`ROOM_KINDS`: bundle, sap, nest, scree,
raphides), power by depth × spread × `nestPower`, the Grouillants' `mix` and `level`,
hazards (`HAZARD_KINDS` fall / cuts: scree always falls, raphides always cut, nests none,
others `otherChance`; `chance`, `perStat` above 5, `statCap`, `floor`), `travelMs` by depth,
loot and iron by depth and kind, `gallery` (resource by kind, slots and `perMiner` by depth,
`autoShare`, `damagedWork`), `crew` and `door` by tunnel level, `fortify`, `upwell` (first
24 h after the tunnel, interval 36–60 h, notice 6 h, gap 6 h with a surface wave, base,
`perNest`, spread, air share). All hypotheses: measure with the bot.

- The Grouillants: `ENEMY_KINDS` `larva` (body `grub`), `fruitFly` (`fly`, flies),
  `woodlouse` (`louse`, armoured); weapons `gnaw`, `sting`, `shellRam`; `DEPTH_KINDS`.
  **Use `isFlyer(kind)`, never `body === 'bat'`** (bats and flies fly). No gear
  (`ALIEN_GEAR` nulls). Surface waves never draw them.
- `tunnel` building: 1 `flesh` tile, unique, outside the building cap (`buildingCount`),
  from Nest 6, three explicit Iron levels
  (`requiresAge: 2`, iron `IRON.own.tunnel`), `lookOf` age 2 / tier = level; level stats
  `delveCrew`, `doorStrength`. Tech `spelunking` (exploration, Iron, 500) → `depths: true`.

## Delves (`sim/delves.ts`, `battle/delve.ts`)

- Command `delve { roomId, crew (ids), provisions, orders }` (no launchpad: `launchpadId`
  `'none'`, `targetId` `'depths'`, `Expedition.room`); `delveLock`: noTunnel, doorClosed,
  unknownRoom, roomTaken, roomOutOfReach (next to the entrance or a gallery:
  `reachableRooms`), delveThere, invalidOrders, invalidCrew (Kikiwiwis refused), crewTooSmall,
  crewTooLarge (`delveCrewMax` = `DEPTHS.crew[tunnel level]`). One-way `delveTime(room)`.
  `tunnelBusy` refuses the tunnel's demolition while a delve is not back.
- `delveSetup(state, crew, input)`: a radius-4 room, the crew in from `ENTRY` (its exits),
  the Grouillants at the far wall (fliers over the middle), orders as a landing's (role
  `assault`, `clearEnds`), `landingOutcome` reads the journal. **Hazards are in the setup**:
  `hazardHits(crew, hazard, seed)` (a seeded draw per kiwi, chance and harm × (1 − stat
  shield) × `hazardFactor`, floor kept) lowers each kiwi's starting hit points — the journal
  starts from the same wounds.
- `resolveDelve` (from `resolveArrival`, before the target check): victory → a gallery,
  `delve` view, `edge` views of its neighbours, the lantern, loot and `result.iron` (added at
  the return), XP × `LANDING.victoryXp`, veterans; chantier 46's rule (fallen wounded on a
  win, dead with their gear otherwise). `ExpeditionResult` adds `iron`, `hazard { kind,
  strength, hits }`, `gallery`, `lantern`.
- `delveForecast(state, roomId, crew, orders)` (public): units seen, else the depth's
  estimate × 0.75 / 1 / 1.25 (the hardest one a nest when the kind is unknown); the hazard
  seen, assumed from the kind (scree, raphides), or a fall in the hardest trial when unknown
  (`possibleHazard`); `harm` per kiwi; seeds `depths/trial/<room>/<i>`; trials cached.

## Galleries and miners (`sim/mines.ts`)

- Job `mine { roomId, returnTo }`: handled like `meteor` everywhere (`ratesOf` mastery of the
  gallery's resource, `workSite` = the tunnel, bed key, `taskLevel` `pick`, `borrow`,
  `canReassign`, `returnHome`, `train`); **not** militia, not `canSup` (no evening), hidden
  on the map (the cut of chantier 49 shows them). `galleryRate` = `perMiner[depth]` (a share: 0.5 / 0.7 / 0.9) ×
  `minerOutput(resource, tunnel level)` (a worker's yield in that resource's producer at level
  6 + tunnel level) × the miners' power, presence, morale, colony bonus and hunger — no `gathered` stop, no night,
  no season; 0 with the door closed, × `damagedWork` with a damaged door. A flow in
  `computeFlows`, `grossRates`, `productionRates` (no stock to drain).
- Automation `mine` (`fillMines` in `dispatchTasks`, budget `autoShare` of the colony;
  `galleryWorth`: mines open and the resource below its cap). The schema reads `mine` as true
  when missing (the first v39 saves). Command `postMiners { roomId, villagerIds }`
  (galleryFull); `jobBoard().galleries`.

## Upwellings (`sim/upwell.ts`)

- `planUpwell` at the loop top (own RNG stream `withDepthRng`, `state.depths.rng`), once the
  tunnel stands; `planWave` and `planUpwell` both keep `DEPTHS.upwell.gapMs` apart (shifts
  only: the threat stream's draws are unchanged — tested). `nextUpwellEvent`,
  `nextDoorEvent`, `upwellTick` (fortification done, announcement), then `strike` in
  `advance` at `w.at`.
- Announcement (truth): `upwellPower` = base × `THREATS.nestFactor` × (1 + `perNest` ×
  `nestsNear`: nests not taken next to the entrance or a gallery); `PlannedWave.tunnel`,
  squads of Grouillants in the tunnel's sector, `gates[sector]` = the tunnel; event
  `waveAnnounced { tunnel: true }`.
- `strike` serves both: an upwelling draws from the depths' stream, `doorPass` (closed door:
  what exceeds `doorStrength` comes out, else held: `upwellHeld`, no battle, report
  `door: 'held'`; broken: tunnel `damaged`, repaired by the queue); report `from: 'tunnel'`
  in `threats.reports`; never a shield; `depths.upwells`, `lastUpwellAt`. `waveSetup` with
  `wave.tunnel`: the pack comes out of `tunnelMouth` and flees back there, guards stand
  around the entrance, a fortified door adds a seed and a sky turret (`door:0/1`).
- **`comingWave(state)`** (the announced wave due first, surface or tunnel) feeds
  `defenseOf` gates, `waveAhead` / `forecastWave` (with `doorPass` and `heldOutcome`), the
  automatic garrison and `taskNeeds`. Anything new about "the next wave" must read it.
- Commands `setTunnelDoor { closed }`, `fortifyTunnel` (`fortifyDoorLock`, `doorFortifyCost` = half of a
  beacon's fortification, `DEPTHS.fortify.durationMs`, event `doorFortified`).

## The spelunker (`data/classes.ts`)

Master of Endurance + Dexterity (`champion` / `herbalist`), weapon `pick` (melee, reaches the
fliers), mace family. `SKILLS.spelunkerSelf` (0.5) / `spelunkerCrew` (0.75) in
`hazardFactor`; the lantern (`lanternRoom`: a neighbour without units seen, deepest first).

## Client

- `DepthsModal.tsx` (`modal: 'depths'`, `depthsVisible`; top bar, phone menu, the tunnel's
  sheet, the defense screen's link; "See in a cut" opens the 3D cut): `DepthsCut` (SVG half-disc, `roomAt`), `RoomPanel`,
  `RoomActions` (`MinersBox` or `DelvePlanner` with `CrewPicker`, `OrdersPicker delve`,
  `DelveForecastLines`), `DoorBox`, `DelveList`, `DelveReport` (in `ReportModal`,
  `LandingReplay delve`). Texts `depths.*`.
- 3D: `render/models/tunnel.ts`, sign, plans family `ship` ("Ship and depths"). Battles draw
  the Grouillants with the ferret and bat rigs in their own colours (`GROUILLANT_TINTS`,
  `CreatureDraw.tint` / `bare`): their own rigs are for chantier 49.
- Visual check: `?seed=demo`, push a monument level 2, a `tunnel`, `spelunking`, classed
  kiwis, galleries and views on `controller.state`, `debugGrant`, `modal: 'depths'`, click a
  `.cut-room`. A real delve: dispatch `delve`, `setTimeScale(20000)` ~6 s, open its report.

## The cut (chantier 49, `render/depths/`)

- `cutLayout.ts` (pure, tested in `apps/client/test/depthsCut.test.ts`): the section in units
  `s` (−1…1 across) and `t` (0 surface … 1 bottom); `ROW_T` per depth, `ROOM_T` / `LOCULE_T`
  (`roomRadius`), `roomPoints(map)` spreads each row and side (`GAP`) and sets the locules
  (depth 4) on two rings around the core (`LOCULES`, `CUT_ASPECT` for what is round in the
  world), `cutLinks`, `wayTo` (shaft → known rooms → the room), `along`. **A new layer
  (chantier 52's core) needs its own placement in `roomPoints`** (the rows only hold the flesh).
- `cutPaint.ts`: `cutKnowledge` (look per room: fog / heard / seen / gallery, kinds, passages
  known and lit, `loculesOpen` = Industry), `cutSignature` (repaint only on change), `paintCut`
  (canvas ×2 outside low, `KIND_TINTS` — a new room kind needs a tint, `LAKES`, the alpha
  `mask` of the hollows).
- `DepthsCutView.ts`: two faces (`quarterGeometry`), the dome clipped with `clipIntersection`
  (`TerrainView.setDomeClip`, `PropsView.setDomeClip` for the fur), opening 0.9 s
  (`OPEN_ANGLE` 1.05), hollows and floors (instanced, medium/high), lanterns, `worldOf`,
  `floorSpot` (on the ledge in low), `normalOf`, `pickRoom`, `frame`.
- `cutLife.ts`: miners (`minersIn`, clip `dig`, `DIG` rhythm → `onStrike`), carts, delves on
  their way (`hidden` = the delve on show), particles (`dig`, `sap`, `glint`, `steam`).
- `delveShow.ts`: `DelveShow` plays a `delve` journal in its room (flat `FaceMap`, the entry
  turned to the shaft, `unitScale` 1.8, a locule's field in front of its cell).
- `GameRenderer.openCut` / `closeCut` / `cutOpen` / `playDelve` (live: arrived < 60 s while
  the cut is open; `delveFocus` frames the room once open); callbacks `onTiltPast`,
  `onRoomTap`, `onCutChange`; `actions.openCut`, `closeCut`, `watchDelve`; store `cutOpen`,
  `depthsRoom`; `CutBanner`, `WatchDelveButton`; texts `slice.*` (own namespace).
- Check: `?depths[&t=2][&close][&holes=0][&polar=][&azimuth=][&zoom=]`; in game, push a
  `tunnel` and views/galleries on `controller.state`, `actions.openCut()`, wait for
  `renderer.cut.isOpen` and `!renderer.rig.flying` (headless frames are slow). A real delve:
  dispatch `delve` (orders goal `loot` or `burn`), `setTimeScale(20000)` ~4 s, then
  `actions.watchDelve(id)`.

## Bot (`tools/balance/src/bot/depths.ts`, mechanic `depths`)

`spelunking` after `ironAge` in `TECH_ORDER`; `tunnelDecision`; `delveOrder` once an hour
(no delve in flight, no upwelling announced; shallow rooms first; a spelunker and a
fly-hitter first, then the strongest; "likely" with nobody expected dead; retreat at 30 %);
`doorOrder` (close when the door holds the worst luck, fortify if it would help and the
forecast is not likely, open after). Milestones `tunnel`, `delve` (informative); `final`
`delves`, `roomsTaken`, `delveRetreats`, `delveDeaths`, `upwells`, `upwellsLost`,
`upwellsHeld`, `galleries`, `miners`; report table "The depths". Wave counting skips
upwelling reports (`reportsSeen`).

## Next chantiers

49 done (the Grouillants' own rigs are still to draw: `DETTE.md`), 50 (locules: crystal,
giant seeds, actinidine; layer 2 of `DEPTHS.layers`), 52 (core and stem). A new layer adds
rooms to `generateDepths` **after** the flesh's draws (the flesh's network must not move).
