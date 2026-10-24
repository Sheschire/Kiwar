---
name: kiwar-civ
description: Kiwar alien civilisation (chantier 39) — its own clock (ages on fixed dates from the colony's start), the 12 parcels (weak edge, centre ×2–3), garrisons by kind, level and gear, buildings on their parcels, key buildings (royal burrow, barracks, stores) hidden by a daily AI that flees our beacons, impacts (burns, defeats, fights), waves drawn from the civilisation and announced from a barracks parcel (the announcement waits for the server online), the old missions wired to the parcels, the public estimate and the client card. Use when touching `state.aliens[*].civ`, `sim/civ.ts`, `data/aliens.ts`, wave power, raids / recon / siege strength, and for the landings of chantier 40.
---

# Kiwar alien civilisation (chantier 39)

Load `kiwar-expeditions` (anti-cheat rule), `kiwar-colonies` (siege), `kiwar-threats` and
`kiwar-battle` (waves), `kiwar-online` (server) with it. Owner's rules: its own clock, the same
dates for everybody; our burns slow it, our defeats feed it; its waves follow its power; no
hidden per-player difficulty; hidden data only on the server (the client in solo).

## Data (`data/aliens.ts`)

- `CIV`: `ageAtH` [0, 24, 96, 288] (hours of development: Stone day 1, Iron day 4, Industry
  day 12), `leadPerDistanceH` (faces further away in a universe are older), `outerSpread`,
  `innerMultiple` [2, 3], `ageMultiple` [1, 1.25, 1.6, 2.2] and `perDay` 0.12 up to
  `maxDays` 14 (garrison growth), `burn` (sector −24 h, civilisation −6 h, caps, key
  buildings down `keyMs` 36 h), `defeat` (+4 h + 2 h per kiwi lost, cap 120 h), `rebuildMs`
  12 h, `fightLoss` (victory 0.6, defeat 0.3 × closeness), `tickMs` (a game day), `keys`
  (barracks 2–5, stores 1–2 by age; one royal burrow), `buildings`, `barracksFloor` 0.6,
  `waveAge`, `level`, `ring`.
- `ALIEN_BUILDINGS` (burrow, roost, workshop, totem, barracks, store, royal), `CIV_KEYS`,
  `ALIEN_GEAR` (weapon / armour family per enemy kind), `ALIEN_MIX` (kinds per side).

## State (hidden, in the garrison)

`AlienGarrison.civ?: CivState` — `lead`, `hours` (net hours from defeats and burns), `sectors`
(per parcel), `fights` (recent, regrow over `rebuildMs`), `keys` ({ kind, sector, readyAt? }),
`day` (last daily look), `royalSeen`, `log` (12 impacts). Optional in the save (no version
bump): `drawGarrison` creates it, `ensureAliens` gives older garrisons one (`day` = today),
`civOf(g)` falls back to a fresh one for reading, `liveCiv(g)` creates it in place before
recording. `publicState` strips `aliens`, so the civilisation never leaves the server; tests
scan every answer for `"civ":{`, `"keys":[`, `"royalSeen"`, `"fights":[` (`aliens.test.ts`,
`civ.test.ts`).

## Pure functions (`sim/civ.ts`)

- `civAt(g, at, civ?)` → `{ age, hours, sectors: { sector, inner, age, power }[] }`: power =
  `g.defense` × parcel weight (`civShape(seed)`: outer mean 1, inner × 2–3) ×
  `growthOfHours(sector hours)` × (1 − recent fight losses). Hours = time since `g.since` +
  lead + impacts. Nothing runs step by step: exact offline.
- `outerPower(view)` (the old raids' defense = `alienDefense`), `sectorUnits(sector,
ferretShare)` (kinds, level, gear tier: outer from the Stone age, centre one tier ahead),
  `civBuildings(g, civ, view, at)` (ordinary buildings per parcel + standing keys, tiles by
  hash inside the parcel; water is snapped on screen with `landTileNear`), `seenStructures`
  (dens and roosts for the old twin view).
- Impacts: `recordBurn` (parcel and civilisation hours, key buildings of the parcel down),
  `recordDefeat(civ, at, dead, sector?)`, `recordFight(civ, sector, at, share)`;
  `standingBarracks(civ, at, beacons)`.
- Geometry: `isInner` (sectors 0–5), `sliceOf`, `otherRing`, `neighbourSectors`, `sliceGap`.

## The AI that hides (daily)

`nextCivEvent` / `civTick` in the `advance` loop (only where the truth is held; not after the
conquest): `planCiv(g, civ, at, civEyes(state, id))` — beacons (the twin's bridgeheads until
chantier 40), parcels seen (`intel.sectors`), `royalSeen` (the siege's queen known).
`exposureOf` (3 beacon, 2 beside, 1 seen); keys on or beside a beacon move to a less exposed
free parcel (`bestSector`: centre first, far from beacons, secret daily tie-breaker), burnt
ones are rebuilt in the best place, new ones of an age go where we looked least; the royal
burrow (inner only) never moves once seen. One key per parcel.

## Waves (`civWave`, `sim/threats.ts`)

- `wavePower(state, at, waveId)` = base × Nest × our age × `civWave().factor` × wealth ×
  sister ramp. `civWave` = (1 + `THREATS.perDay` × development days) × barracks standing
  (0.6 → 1) × `CIV.waveAge`; without a civilisation (`waveCivTarget` null: a sister, a twin
  held by a friend, a conquered face) the old days of play × provocation.
- `PlannedWave.origin`: a standing barracks parcel (secret tie-breaker per wave), else the
  strongest free parcel. Set at the announcement.
- **The announcement needs the truth** (`canAnnounceWave`): `nextThreatEvent` skips it
  without; `waveAwaited` joins `awaitingServer` (the client polls `load`), `hiddenDue` lists
  the due announcement (the server's `load` advances to it). The strike then runs on the
  client as before. A test that is not about waves but advances a public state past a wave
  must clear `threats.next` (see `aliens.test.ts`).

## The old missions (until chantier 40)

- Raid: defense = outer garrison + `g.reinforce` × victories (the edge musters: without it the
  bot farmed 8–18 raids a run, 15× the loot); lands on `raidSector` (an outer parcel we do not
  hold); victory → `recordFight` + `recordBurn` (`result.sector`, `burnt`), defeat → fight ×
  closeness + `recordDefeat`. The waves lost the provocation term (the civilisation replaces
  it).
- Recon: `seenStructures` of the parcels seen, `IntelReport.civAge`; a scout lost feeds them.
- Siege: `holdStrength` = parcel garrison × `SIEGE.hold.share` 1.5; the queen lives in the
  royal burrow (`queenLair` / `royalSector`; `siegeTruth` keeps the queen's base power and her
  starting parcel, its old hold draws skipped) and grows with its parcel (`siegeGrowth`);
  assaults burn a parcel they take, finals and fallen bridgeheads feed, a held counter-attack
  costs the parcel a fight.
- Intel ageing: `scheduleGrowth(state, distance, from, to)` (the public schedule, no impacts).

## Public estimate and client

`civEstimate(state, now)` (public only): age seen by the last report, likely age now on the
schedule (a delay seen is kept), next age date, the announced wave's parcel.
`ui/components/CivCard.tsx` in the defense window and in the expedition planner (twin);
the raid report says which parcel burnt or fed them (`civ.burnt` / `civ.fed`). i18n `civ.*`.

## Bot

`RunResult.final.civAge`, `civAtAges` (its age when we reached Stone / Iron / Industry),
`civWave`; the waves table of the ages section adds a civilisation table by profile.

## Chantier 40 (landings, done)

Landings fight `sectorUnits` of one parcel (and 25 % of a neighbouring standing barracks)
with the battle engine; a victory burns (`recordBurn`) or loots (`recordFight` only) and plants
a beacon (`state.faceViews`, read by `civEyes`: key buildings flee beacons, parcels seen count
as seen); a beacon over a barracks parcel takes it out of `standingBarracks` (weaker waves);
defeats call `recordDefeat(civ, at, dead, sector, extraH)` (ship 4 h, 1 h per piece of gear).
`civTick` refreshes the beacons' views daily (`refreshBeacons`). `civEstimate` reads the latest
parcel view before the old report. The old raid / recon / siege paths of "The old missions"
above are no longer reachable.
