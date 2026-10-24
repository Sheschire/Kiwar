---
name: kiwar-cycles
description: Kiwar needs and cycles (chantier 04) — calendar (day/night, seasons), season and night effects, hunger and famine guard rails, negative flows, fatigue/beds/rest, morale, sky/season/weather rendering, HUD clock. Use when touching time-of-day or season rules, food consumption, rest, morale, or their visuals.
---

# Kiwar needs and cycles

Load `kiwar-sim` too: everything here is deterministic and must stay exact offline.

## Data

- `data/cycles.ts` — `SEASONS`, `CALENDAR` (day 2 h, night 20 min / 15 min in summer since chantier 12, 12 days a
  season, `startOffsetMs` 20 min), `calendarStartFor(createdAt)`, `SEASON_MS`, `YEAR_MS`,
  `CYCLES` (night work ×0.4, per-season harvest / regen / walk / blocked tiles / hatching),
  `seasonHarvest`, `seasonRegen`, `seasonEffects` (all take the biome since chantier 05: a
  biome makes a season harsher or milder, never longer; see `kiwar-world`).
- `data/needs.ts` — `NEEDS` (meals per kiwi, appetite by season, gauge weights, stages, work by
  stage, recovery, death relief, guard rails, warn time), `HUNGER_SCALE`; `REST` (base rest
  share, Endurance, season, commute per step, no bed, min presence, cosmetic cycle); `MORALE`.

## Simulation

- `sim/calendar.ts` — `calendarAt(start, t)` (season, year, day, night, nightAt, dawnAt,
  seasonEndsAt, next), `nextCalendarChange` (nightfall or dawn: an `advance` event),
  `seasonOf`, `isNight`. `GameState.calendarStart` (save v6); universes: `UniverseRow.createdAt`
  → `universeGame` and `withScopeTargets` align every colony on the universe's calendar.
- Season change (`calendarTick` in `advance.ts`): `rebaseFreeDeposits` then `seasonChanged`.
  `freeDepositStock` regrows at the season of `d.at` — keep the rebase if you touch regrowth.
- `territory.ts`: `harvestOf` multiplies demand by `cycleHarvest` (night × season harvest) and
  regen by `seasonRegen`; `Harvest.cycle` is shown in the tile sheet. `tileWalkCost(type, path,
season)` (paths always clear) is shared with the client A*; `walkDistances(state, map,
sources)` is the memoized season-aware Dijkstra (`depotDistances` uses it), `distanceIn`.
- `sim/needs.ts` — `consumption` (kiwis at home, × `modifiers.appetite`), hunger gauge (`state.hunger`, integer,
  `hungerRate`, `nextHungerEvent`, `hungerCap` when nobody may die), `canStarve`,
  `pickStarving` (RNG, low Endurance first), `foodLeftMs`.
- `advance.ts` `computeFlows`: gross production (one `buildingHarvest` per building, never-full)
  − meals = net `rates`; a full stock the meals do not outpace stays full and its producers
  harvest only what is eaten (`share`, pools drain); an empty stock with a negative net is pinned
  at 0 and its missing share feeds the gauge. Events: fill, empty (`foodRanOut`), deposit dry,
  hunger stage (`hungerChanged`), death (`starved`, cause `famine`), a memory's end.
  `storageFullCheck(state, gross?)` is consumption-aware; `netRates` for the UI.
- `sim/rest.ts` — `bedsOf` (greedy nearest free bed to `workSite`, memoized on a cheap key:
  homes, jobs, paths, season), `presence` (rest share × walk), morale per kiwi (chantier
  43, see below), `missingBeds` (kiwis sleeping outside and
  the presence lost, chantier 12: village morale card and home sheets, `MissingBedsLine`), `kiwiRhythm` (cosmetic: sleep at night for
  60 % of kiwis, work/rest by day, fatigue 0–1). `workforce` = Σ power × presence × colony bonus
  × hunger work × morale.
- Any new factor of work must change only at an event (or a command); if it depends on a stock
  level, use a threshold that is an event (see the hunger stage), never "stock > 0".

## Chantier 43: morale per kiwi, the Town Hall, the campfire

- **Gauge 0–100 per kiwi** (neutral 50, `MORALE` in `data/needs.ts`): `colonyMood(state)`
  (age base 60/50/45/40, fed +10 / hungry −20, season ±5, mayor and bards in points ×100,
  old speech +3, `leisureHomes`) + per kiwi (`kiwiMorale(state, v, beds, mood)`): bed near
  its work +5 / outside −10, leisure within reach of its bed +8 (`LEISURE`, hex distance from
  the home's anchor), temper (`MORALE.trait`, bard line +5), memories. Clamped 0–100.
  `moraleFactor(points)`: ×0.7 at 0, ×1 at 50, ×1.15 at 100 (linear on each side);
  `kiwiMoraleWork` multiplies **each kiwi's** power in `crewWork`, `researchPerHour` and
  `forgeRate` (pass one `colonyMood` per loop; never per kiwi). `moraleOf(state)` is the
  colony summary (average, work, `low` = sulking below `MORALE.sulk` 20, average parts).
- **Memories** (`Villager.memories`, one per kind, `addMemory` keeps the stronger value and
  the later end): `mourning` −15 / `grief` −25 (hut mates or crew mates of a dead kiwi, from
  `removeVillagers` → `closeMates`), `speech`, `vigil`. Each kind has `value`, `ms` (longest)
  and `best` (anti-cheat `plausibleKiwi`). `nextMemoryEnd` is an `advance` event,
  `fadeMemories` prunes. `state.mourningUntil` is gone (save v36).
- **Speech** (`sim/speech.ts`, `SPEECH`): `giveSpeech` (Town Hall + mayor at home, cooldown
  `speechCooldownMs(level)` 24/18/12 h, refused within `gatherMs + GARRISON.autoLeadMs` of a
  wave: `waveSoon`); `state.speech = { until, readyAt }` (save v37); while gathering,
  `gathered(state)` (also the shelter) stops harvest, research, forge, craters, stardust.
  Every kiwi at home gets a `speech` memory (+12, +1 per mayor Charisma above 5, Festival ×2)
  for `speechEffectMs(level)` (8 h → 12 h). The mayor's `speech` skill is gone; the old
  `speechUntil` still ends normally.
- **Campfire** (`CAMPFIRE`, 1 tile, Nest 3, outside the cap, copies ×1.6, one level): a
  leisure; at nightfall (`calendarTick`) `holdVigils` gives the free kiwis sleeping within
  reach a `vigil` memory (+8) until the next nightfall (event `vigil`); `consumption` counts
  their meals ×0.9 at night (`suppedTonight`).
- **Town Hall** (`townHall`, 3 tiles, unique, outside the cap, levels 1–12, level stats
  `speechMemory`, `speechCooldown`). A new building outside the cap needs its branch in
  `buildLock` (the generic branch checks the cap) and `buildingCount`.

## Chantier 44: decorations, games, the cabaret, the fireworks

- **Village life** (`isVillageLife` in `data/needs.ts`: a type in `BEAUTY` or `LEISURE`): one
  tile, one level, outside the building cap (`buildingCount`, the `buildLock` branch), no
  sign and no age dressing (`partsOf`), no level badge (`maxLevelOf` 1). Decorations
  (`DECOR_TILES` flesh/ray/heart/skin, ×1.4 a copy): `lanterns`, `flowerBed`, `vineArch`
  (Eden), `fountain`, `mayorStatue` (Stone, unique: `statueExists`). **Beauty** is common:
  `beautyOf` (+1 each, statue +3, capped `MORALE.beauty` 8) is a part of `colonyMood`.
- **Games** (`swing` Eden; `skittles`, `skipPond`, `slide` Stone; ×1.6 a copy) are leisures of
  radius 3. `colonyMood.leisureHomes` is a **map** home → points: first kind +8
  (`MORALE.leisure`), each other kind +3 (`leisureMore`), at most +14 (`leisureMax`); two
  copies of one game count once.
- **The cabaret** (`cabaret`, Iron, Nest 7, 3 tiles, unique, outside the cap) and **the
  fireworks cannon** (`fireworks`, Iron, Nest 7, unique, outside the cap, skin allowed) live in
  `sim/village.ts`. `state.village = { cabaretOpen, fireworksNight, lastShow? }` (save v38).
  At nightfall (`calendarTick`, after `holdVigils`) `openCabaret` takes `CABARET.juice` (60)
  if open and in stock and gives the free kiwis sleeping within `CABARET.radius` (6) a
  `cabaret` memory (+12) until the next nightfall (events `cabaret` / `cabaretShut`);
  command `setCabaret { open }`. `fireFireworks { pattern }` (`FIREWORKS`: bouquet / kiwiFruit
  / kiwiBird, seeds + juice, 0/3/8 stardust, +6/+10/+15 for 6/8/12 h): night only
  (`notNight`), once a night (`fireworksDone`, `fireworksNight` = that night's `nightAt`),
  every kiwi at home gets a `fireworks` memory; `fireworksLock` for the UI.
- Bot (`tools/balance/src/bot/village.ts`): one game of each kind where it reaches the most
  beds, decorations until the beauty cap (two of each), the cabaret, the cannon, and
  `fireworksDecision` at night (stock ×3, stardust above `dustReserve`).

## Client

- `render/dayCycle.ts` (chantier 23: two strings of keys along the sun's elevation, `MORNING`
  rosy and `EVENING` golden: noon 1, high 0.6, golden 0.3, sunrise/sunset 0.02, blue hour
  −0.22, night −0.55, smoothstep between keys; sun height 0.34 + 0.92 × elevation, the moon
  takes over below −0.1; `rim`/`rimDir` = a warm shadowless back light, `Lighting.rim`, off in
  Low; tune with `scripts/lightSheet.mjs`), light direction, `lighting.applySky`,
  `environment.setSky`, fog colour, `seasonLook.ts` (`seasonUniforms`: tint, snow, night;
  `withSeasonLook(material, {tint, snow})` patches terrain, props, paths, buildings),
  `water.setIce`, `weather.ts` (shader points: rain, snow, leaves, fireflies; `weatherOf(c)` per
  day; home glows), all driven from `GameRenderer.updateCycles()`; shadows refresh when the sun
  moves ~1°. Night look: `uNight` desaturation. Lamps (windows, halos, lanterns) follow
  daylight 0.85 → 0.35 (`updateCycles`).
- 3D kiwis (`render/kiwis.ts`): `thinkRest` sends resting / sleeping kiwis to their bed and hides
  them inside (`agent.inside`); the A* takes the season.
- Chantier 43 client: `NeedsWidgets.tsx` `MoraleGauge`, `KiwiMoraleSection` (kiwi sheet),
  mini gauge and "sulks" in `KiwiNeedsLine`, `MoraleCard` (average and parts);
  `TownHallInfo.tsx` (`TownHallInfo`, `CampfireInfo` — also the games' sheet —, chantier 44
  `CabaretInfo`, `FireworksInfo`); memo `kiwiMorales` (ui/derived);
  3D: `KiwisView.thinkSpeech` (rows before the hall's door, `crowdSpot`), `thinkVigil` +
  `assignCampers` (first half of the night, a circle round the fire); campfire halo in
  `weather.sync`; models in `render/models/village.ts`; sound `speech.crowd`. Chantier 44:
  `thinkPlay` + `assignPlayers` (half of the kiwis with a game near their bed play there when
  they rest by day or have no post; `PLAY_CLIPS`), `thinkCabaret` (guests walk in at dusk,
  first half of the night); `ALWAYS_LIT` halos in `weather.ts` (campfire, lanterns,
  fountains, the cabaret in red), `litBuildings` lights the cabaret on its evenings;
  `render/fireworks.ts` (`FireworksView`: one additive `Points`, rockets, sparks, camera-facing
  shapes; `showHeight` keeps the show on screen; `seek(t)` for screenshots), started by
  `GameRenderer.syncFireworks` when `village.lastShow` is < 20 s old, a sign of life in
  `drawFrame`; sounds `cabaret.music` (loop, `cabaretEvening` in `gameAudio.ts`) and
  `fireworks.burst` (`renderer.onFireworksBurst`).
- UI: `ClockChip.tsx` (dial, season, countdown, effects tooltip), `TopBar` (net rates, low-food
  pulse, meals in tooltips, morale line), `App.tsx` `HungerBadge`, `TilePanel` (cycle notes,
  beds used), `NeedsWidgets.tsx` (`RestSection` in the kiwi sheet, `MoraleCard` in the village),
  `OfflineModal` (food ran out, starved). i18n: `cycles.*`, `needs.*`.
- Audio: `colony.hunger`, `ambience.night` (synth crickets); `gameAudio.ts` sets
  `audio.context.timeOfDay/season` from the calendar.
- Screenshots at a given time: in the actions, `controller.state.calendarStart =
controller.state.now - offset` then dispatch a `debugGrant` (offsets: 1 h noon, 1 h 45 night,
  `3 × 24 h + 1 h` winter noon). Weather: monkeypatch `renderer.weather.update` to force a layer.
  Restart the dev server if Vite serves a stale module (missing export at load).

## Balance

- Production was ×1.25 to compensate nights and rest. Bot: `canFeedOneMore` before hatching,
  meals subtracted in the bottleneck, huts where producers walk the most to a bed; options
  `fullHorizon`, `activeMs` + `sessionEveryMs` (occasional player). `RunResult.final.starved` /
  `maxHungerH`. Test: twice-a-day player crosses the first winter with no famine death.
