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
  hunger stage (`hungerChanged`), death (`starved`, cause `famine`), mourning end.
  `storageFullCheck(state, gross?)` is consumption-aware; `netRates` for the UI.
- `sim/rest.ts` — `bedsOf` (greedy nearest free bed to `workSite`, memoized on a cheap key:
  homes, jobs, paths, season), `presence` (rest share × walk), `moraleOf` / `moraleWork`
  (food stage, comfort, mayor's Charisma/Organisation, speech, mourning, season; cap ±20 %;
  a kiwi without a bed is never "near its work"), `missingBeds` (kiwis sleeping outside and
  the presence lost, chantier 12: village morale card and home sheets, `MissingBedsLine`), `kiwiRhythm` (cosmetic: sleep at night for
  60 % of kiwis, work/rest by day, fatigue 0–1). `workforce` = Σ power × presence × colony bonus
  × hunger work × morale.
- Any new factor of work must change only at an event (or a command); if it depends on a stock
  level, use a threshold that is an event (see the hunger stage), never "stock > 0".

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
