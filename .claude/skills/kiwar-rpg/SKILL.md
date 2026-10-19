---
name: kiwar-rpg
description: Kiwar individual kiwis (chantier 03) — stats, traits, shiny, levels and XP, masteries, worker power, expedition strength and weighted losses, memorial, School, classes, skills, outfits, village screen. Use when touching anything about a single kiwi, classes or skills, or the village screen.
---

# Kiwar RPG (individual kiwis)

Load `kiwar-sim` too: everything here lives in the deterministic shared simulation.

## Data (`packages/shared/src/data/`)

- `kiwis.ts` — `STAT_IDS`, `TRAITS` (modifiers), `SHINY_COLORS`, `MASTERY_IDS`, `KIWI` (stat
  bounds, shiny 1/512, trait 30 %, XP per hour by activity, expedition XP, rank bonus, Dexterity /
  Strength bonuses, fight and exposure coefficients, auto-stat weights), `xpForLevel`,
  `masteryHours`, `XP_SCALE` / `PRACTICE_SCALE`, `MEMORIAL_MAX`, `KIWI_NAME_MAX`.
- `classes.ts` — `CLASSES` (school level, min kiwi level, cost, training time, unique, modifiers,
  three skills at 5 / 10 / 20), `SKILLS` (numbers of colony / crew / active effects, retrain ×2),
  `SCHOOL` (slots, speed). The School itself is in `buildings.ts`.

## Simulation (`sim/kiwis.ts` and friends)

- `Villager`: `stats`, `trait`, `shiny`, `level`, `xp` (raw integer), `statPoints`, `mastery`
  (raw integer practice), `history`, `classId`, `skillReadyAt`. Job `train` (schoolId, classId,
  until, paid). `GameState.memorial`, `GameState.speechUntil`. **`cloneVillager` must copy every
  nested object** (stats, mastery, history, skillReadyAt, train job's paid).
- `rollKiwi(rng)` / `newKiwi(roll)` at hatching (`addVillager`, state RNG: name then stats).
- `modifiers(v)` = trait × class × unlocked passive skills (keys: xp, practice, harvest, build,
  fight, exposure, rations, weight). `hasSkill(v, id)`.
- Powers: `workerPower(v, resource)`, `builderSpeed(v)`, `kiwiStrength(v)`, `kiwiExposure(v)`;
  `workforce(state, b, workers)` (× `colonyBonus` = mayor + speech) feeds `harvestOf` instead of
  the head count; `regenBonus(workers)` (mages' Green thumb) multiplies the pool regrowth.
- **Exactness**: `ratesOf` gives integer raw units per ms (XP, practice). `nextKiwiEvent` is the
  next level-up / rank-up time (ceil); `accrueKiwis` runs inside `accrue` and processes level-ups
  at the interval end (`levelUps`: odd level → RNG stat weighted by the job, even → a point).
  Training ends (`finishTrainings`) and `speechUntil` are `advance` events too. Never accrue
  progress with floats; never change a power outside an event or a command.
- `grantXp` (expedition lumps, in points) — called in `resolveReturn` with the events array.
- Expeditions (`sim/expeditions.ts`): `crewOf(state, number | ids)`, `crewWeight`, `rations`
  (per kiwi), `strengthOf` (sum + Scouting), `travelTime(target, pad, crew)` (Tailwind),
  `lossShare`, `drawLosses` (weighted, no replacement), forecast `crew` / `expectedLosses` /
  `risk`, `removeVillagers` → memorial. Roster entries carry level, shiny and class.
- Commands: `renameVillager` (`cleanKiwiName`), `spendStatPoint`, `train`, `useSkill`
  (rain, speech), `launchExpedition.crew` = ids or a count. Demolishing a School refunds its
  trainees. Errors: unknownVillager, invalidName, noStatPoint, statMaxed, invalidCrew,
  notASchool, classLocked, levelTooLow, alreadyThisClass, kiwiBusy, mayorExists, schoolFull,
  skillLocked, skillCooling, notHere.
- Saves: v3 → v4 (stats from `hash(seed/id/kiwi)`, memorial), v4 → v5 (classes, speech).
  `isPlausible` checks kiwis of imported saves (`plausibleKiwi`).

## Client

- `ui/components/VillageModal.tsx` — list, memorial, `KiwiSheet` (radar `StatRadar`, rename,
  follow, workplace, `ClassSection` with courses and skills), `FollowBadge`, `useJobLabel`.
- `KiwiPortrait.tsx` — SVG portrait (shiny colours, class outfits). `ExpeditionModal.tsx` —
  `CrewPicker`. `ReportModal.tsx` — roster. `TilePanel.tsx` — `SchoolInfo`. `App.tsx` —
  `SpeechBadge`.
- `render/kiwis.ts` — shiny tint (instance colour), size from Strength + Endurance, one
  instanced outfit mesh per class, highlight ring (`setHighlight`), trainees walk to the School.
  `GameRenderer.followKiwi` / `highlightKiwi`; any camera gesture (`controlstart`) ends a follow.
- Actions: `openVillage(kiwiId?)`, `showKiwi`, `closeVillage`, `followKiwi`. Store: `kiwiId`,
  `villageTab`, `followId`. Tapping a kiwi in 3D opens its sheet (and it speaks).
- Sounds: `kiwi.levelUp`, `kiwi.mastery`, `kiwi.shiny` (synth presets levelUp / mastery / shiny).
- Screenshots: mutate `controller.state` (level, xp = `xpForLevel(l) × XP_SCALE`, shiny,
  classId) **right before** a `debugGrant` dispatch (the state object is replaced by every
  command), then `actions.openVillage(id)`.

## Add a class, a skill or a trait

1. Data in `classes.ts` / `kiwis.ts` (ids are zod enums in the save and the protocol: adding one
   is fine, renaming one needs a migration).
2. Passive effect → `modifiers`; anything else → where it applies (colony: `colonyBonus`; crew:
   `strengthOf` / `travelTime`; active: `useSkill` + `cooldownMs`; timed effects need an
   `advance` event).
3. FR + EN in `classes`, `skills`, `traits`; outfit in `createOutfitGeometry` and
   `KiwiPortrait`.
4. Tests in `test/kiwis.test.ts`, `test/classes.test.ts`, `test/expeditions.test.ts` (always
   one big step vs small steps), then `kiwar-balance` (milestones kiwi5, kiwi10, mayor).
