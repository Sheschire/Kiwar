---
name: kiwar-orbit
description: Kiwar orbit (chantier 53) — the kiwais, small planets launched at the Age of the stars from the orbital yard; small maps apart from the face (`sim/sites.ts`, reused by the trading posts of chantier 54), `state.orbit` (kiwais with their own modules, the shuttle), the four kinds (star harvest, greenhouse, observatory, dock), modules and panels, job `orbit` and the shuttle, breakdowns (public wear, service, repairs up there) and comet swarms (shield, evacuation), the Orbit screen and the kiwais in the sky, the bot in orbit. Use when touching anything in orbit, a small map, the shuttle, the yard, or a mechanic that must not mix a small map with the face.
---

# Kiwar orbit (chantier 53)

Load `kiwar-sim` (determinism, exact offline), `kiwar-sky` (comets: the swarms ride on them)
and `kiwar-client` with it. Everything in orbit is **public**: nothing is hidden, the client
resolves it as well as the server.

## Small maps apart from the face (`sim/sites.ts`)

- **Owner's choice (6 November 2026): modules apart.** A kiwai keeps its own `modules`; they
  are **never** in `state.buildings`. The face's `occupancy`, `faceMapOf`, `buildingAt`, the
  beds, the harvest… never see the orbit, and a small map never sees the face. Test:
  `test/orbit.test.ts` ("never mixes a kiwai with the face", "leaves the surface unchanged").
- `smallMap(key, radius, rocks)` (memoized): a hex disc drawn from a public seed — the centre
  is the `pad`, 2–3 `rock`s on the outer ring (never side by side), the rest `ground`.
  `siteTile`, `thingAt(things, h)`, `siteSpotError(map, things, h)` (`offSite`, `rock`, `pad`,
  `tileOccupied`), `freeSpots`. **Chantier 54's trading posts reuse this** (a post is a small
  map with its own things, like a kiwai).
- `kiwaiMapOf(state, kiwai)` = `smallMap('<seed>/<face>/kiwai/<id>', ORBIT.radius 2, ORBIT.rocks)`.

## Data (`data/orbit.ts`, `ORBIT`, `MODULES`)

- `KIWAI_TYPES`: `harvest` (stardust into its own tank), `greenhouse` (juice and fibre, no
  season, no night), `observatory` (research points; comets and upwellings announced
  `noticeMs` 4 h earlier while it works), `dock` (ship trips × 0.85 per staffed berth, floor
  0.7: `travelFactor` and `deliveryTime`; the wormholes of chantier 54 start here).
- `MODULE_TYPES`: `habitat` (2 kiwis, never wears), `panel` (+25 % to each work module next to
  it, two at most), work modules `sensor` (harvest, observatory), `dome` (greenhouse), `berth`
  (dock) with 2 places each. `WORK_MODULE[type]`, `moduleFits`. Costs in resources + crystal +
  iron, assembled at the yard in 2–3 h (no builder, no queue).
- Yard (`orbitalYard`, a building of 3 tiles, levels 1–3 = the age's 13/14/15, Nest 13/14/15,
  outside the building cap, one per colony, `yardExists`, cannot be demolished while kiwais
  are in orbit: `yardInUse`): `ORBIT.kiwais` 1/2/3, `moduleSlots` 3/4/5. Level stats
  `kiwais`, `moduleSlots`.
- `launch` (by kiwais already launched): giant seeds 2/3/4, crystal 60/90/120, iron 30/45/60,
  stardust 10/15/20, 12/18/24 h. `shuttle` 30 min, 4 seats each way. `dust` 0.1 point per hour
  of an average kiwi, tank 20. `greenhouse` share 0.5 of a level-13 worker of the juice well and
  of the fibre workshop (each); `observatory` share 1 of a researcher at the Library 13.
  `wear` gap 20–40 h, notice 6 h, service 2 iron, repair 3 h at Dexterity 5. `swarm` shield 4
  stardust, 2 modules hit, wounds 6 h. All hypotheses: measure with the bot.

## State (save v43)

- `state.orbit = { kiwais, shuttle, launched }` (`cloneOrbit`). `Kiwai` { id, type, place,
  launchedAt, readyAt, modules, dust (raw stardust units), wear { n, at, moduleId }, shield? }.
  `OrbitModule` { id, type, q, r, readyAt, broken?, repairAt? }. `Shuttle` { kiwaiId, leftAt,
  upAt, backAt, up, down, cargo, docked? }. A kiwai is never lost (`launched` = kiwais).
- Job `{ kind: 'orbit', kiwaiId, returnTo, aboard?: 'up' | 'down' }`: away like an outpost
  guard (no bed, no militia, no evening, no speech, not the mayor nor a bard at home; gear
  locked; `canSup` false) but **fed from the colony** (`homeKiwis` keeps it). Up there they
  sleep in their habitat: `ORBIT_BED` (distance 0) for presence and morale. XP: work (mastery
  juice in a greenhouse, research in an observatory), none while `aboard`. `taskLevel` null:
  the automation never moves them; `posts.ts` keeps their `homeJob`.

## Simulation (`sim/orbit.ts`)

- Commands: `launchKiwai { kiwaiType }` (`launchLock`: `noOrbitalYard`, `kiwaiLimit`, the four
  stocks), `buildModule { kiwaiId, moduleType, q, r }` (`moduleLock`: `kiwaiNotReady`,
  `moduleNotFit`, `moduleLimit`, the spot, the costs), `removeModule` (25 % back,
  `habitatInUse`), `sendShuttle { kiwaiId, up, down }` (`shuttleLock`: `shuttleBusy`,
  `shuttleFull`, `notInOrbit`, `noHabitat`, `canFly`), `serviceKiwai` (`nothingToService`),
  `raiseShield` (`noSwarm`, `shieldRaised`). Zod schemas in `protocol.ts`.
- Work: `kiwaiWork(state, kiwai, resource?)` — the crew (not aboard) sorted by `orbitPower`
  (Dexterity for harvest and dock, `workerPower` in a greenhouse, `researchPower` in an
  observatory) fills the working work modules' places (best panel bonus first) × presence ×
  morale × hunger. `greenhouseRates` enter `computeFlows` like the galleries;
  `observatoryResearch` is added in `researchPerHour` (no night, no gathering); the harvest's
  integer rate `kiwaiDustRate` is computed in `computeFlows` (`Flows.orbitDust`, the tank
  filling is a `nextChange`) and accrued by `accrueOrbit`.
- Events (`nextOrbitEvent` / `orbitTick`, in `advanceInPlace`): a kiwai ready (`kiwaiReady`),
  a module assembled (`moduleReady`), the shuttle docks (`shuttleDocked`: arrivals, tank into
  the cargo, repairs start) and lands (`shuttleBack`: the kiwis coming down `sendBackAll` to
  their `returnTo`, the dust credited up to the cap — the rest goes back to the tank), a wear
  notice (`wearAnnounced`), a breakdown (`moduleBroken`), a repair (`moduleRepaired`).
- **Breakdowns are public**: `planWear` draws each kiwai's next one from a stateless stream
  (`<seed>/<face>/kiwai/<id>/wear/<n>`) at an orbit event (never at the loop top: nothing to
  plan at creation), at least `noticeMs` ahead, on one working module that `wears`. A service
  bumps `n` and draws again from now. A broken module stops; `startRepairs` gives each broken
  module a `repairAt` in turn (`repairTime`: `repairMs × 5 / best Dexterity` up there) when a
  breakdown happens with a crew aboard or when the shuttle docks with kiwis; nobody left up
  there (`flyShuttle`) stops the repairs.
- **Swarms**: `swarmStrike` runs inside `cometTick` at each passage (before `passes++`): a
  kiwai shielded for that comet (`shield === comet id`) holds; otherwise up to `hits` working
  modules break (stream `<seed>/<face>/comet/<passes>/swarm/<kiwaiId>`) and the crew up there
  comes down `injured` (pods: no shuttle needed). The shuttle's kiwis (`aboard`) are spared.
  `comingSwarm(state)` = the announced comet.
- `plausibleOrbit` (anti-cheat of imports): kiwais = launched ≤ the yard's cap, distinct
  places, modules fit and stand on free ground of their own map, tanks ≤ cap, orbit jobs on
  existing kiwais, `aboard` only with the shuttle of that kiwai.
- Objective `starsKiwai` (condition `kiwais { count, modules }`), league feat `firstKiwai`
  (rare, group `ages`).
- Tests: `test/orbit.test.ts` (maps, no mixing, save), `orbitLaunch.test.ts`,
  `orbitCrew.test.ts` (modules, shuttle, crew rules, each kind, exact offline),
  `orbitRisks.test.ts` (breakdowns, service, repairs, swarms, evacuation, exact offline).
  Helpers: `starsColony`, `yardColony(level)` in `test/helpers.ts`; `kiwaiReady(type)`,
  `sendUp` in `test/orbitHelpers.ts` (comets pushed far away: a test that wants a swarm brings
  one with `comets.next`).

## Client

- `render/space.ts` `kiwaiPlace(place)`: fixed places behind us (`FRONT_AZIMUTH + π` ± 34°,
  `KIWAI_DISTANCE` 42, `KIWAI_HEIGHT` 13), never near the twin. Test in `test/space.test.ts`.
- `render/orbitView.ts` `OrbitView` (owned by `GameRenderer.orbit`, created in `setFace`,
  synced in `setGameState`, updated each frame — a climbing kiwai or the flying shuttle is a
  sign of life, `orbitMoving`): a kiwai is a green-bronze sphere **cut at the top**
  (`SphereGeometry` from `CUT_THETA`, or the skin hides the map), its small map on the cut,
  modules as primitives (transparent while assembling, dark red and tilted when broken), a
  shield bubble; turned towards home and leaned by `KIWAI_TILT` (positive: the cut faces home)
  so the cut shows from the space view; a launching kiwai rises from the yard. `pick(ray)` →
  `onKiwaiTap` (startGame: opens the Orbit screen on it). `lookAtKiwai` turns the camera there.
- `render/models/orbit.ts`: the yard's model (pad, gantry, a kiwai in its cradle, turning
  beacon, booth with its door), grown ×1.35 with its rig pivots and emitters; `spread.ts`
  dresses its two back tiles. Sign and icon `orbitalYard`.
- `ui/components/OrbitModal.tsx` (`modal: 'orbit'`, store `orbitKiwai`): launch (kinds,
  cost), a tab per kiwai, its small map in SVG (tap a ground tile: the fitting modules with
  their cost, or the module's state and "take down"), the output line, crew and shuttle
  (checkboxes up / down, "fetch the stardust"), the wear notice with its service, the swarm
  with shields and evacuation. `orbitVisible` (a yard), `orbitAlarm` (a swarm on an
  unshielded kiwai, a wear announced, a broken module waiting): round button in the top bar
  with `has-alarm`, phone menu entry, the yard's sheet. Toasts `orbit.toast.*`
  (`game/events.ts`). Texts `orbit.*`, errors, `levelStats.kiwais/moduleSlots`.
- Screenshots: push a yard, kiwais (modules, `broken`), orbit jobs and a shuttle on
  `controller.state`, then a `debugGrant` dispatch; `renderer.orbit.update(…)` then
  `rig.controls.setLookAt(...)` for a close-up (the orbit view is reachable as
  `renderer.orbit`).

## Bot (`tools/balance/src/bot/orbit.ts`, mechanic `orbit`)

`yardDecision` (the yard at the stars, then its levels), `orbitOrders` (an attentive bot
raises shields with ≥ 10 dust and services an announced wear; a launch when `launchLock` is
null — greenhouse, harvest, observatory —; modules in order habitat, work, panel beside it,
work, habitat; the shuttle with the best kiwis for the kind up to the room and the places,
never the Library's, Forge's or drill's kiwis; an empty trip when a harvest tank is 60 %
full). Milestones `yard`, `kiwai`; `final.kiwais / orbitModules / orbitCrew`. Probe:
`pnpm --filter @kiwar/balance orbit [--seed] [--face] [--days 28] [--casual]` (one line: the
days of the stars, the yard and the first kiwai, hours a broken module waited, share of the
stars' time with the stardust at its cap).
