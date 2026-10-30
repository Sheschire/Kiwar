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
- `classes.ts` — `CLASSES` (stat, tier, parents, school level, min kiwi level, cost, training
  time, unique, modifiers, its own skills), `SKILLS` (numbers of colony / crew / active effects,
  retrain ×2), `SCHOOL` (slots, speed), `CLASS_RULES`, `CAMP` (chantier 37, see below). The
  School itself is in `buildings.ts`.

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
- Chantier 04: the mayor's Charisma and Organisation are morale (`mayorMorale`; chantier 43:
  in points ×100 of the per-kiwi gauge); `colonyBonus` is only the old Speech now (chantier
  43: the Speech is given at the Town Hall, `sim/speech.ts`, not a skill any more).
- Chantier 43: `Villager.memories` (copied by `cloneVillager`); each kiwi works at its own
  morale (`kiwiMoraleWork`); the kiwi sheet's Morale section. Traits: `modifiers.rest` (Early bird 0.75, always
  sleeps at night) and `modifiers.appetite` (Glutton 1.5 at home, starves last). The client
  voice pitch comes from the stats (`kiwiVoicePitch`).
- Chantier 04: Endurance shortens rest (`presence` in `sim/rest.ts`) and protects from famine
  (frailest starve first); `workforce` also multiplies by presence, hunger and morale; any loss
  leaves a memory (chantier 43: `mourning` for all, `grief` for hut and crew mates; see
  `kiwar-cycles`).
- **Exactness**: `ratesOf` gives integer raw units per ms (XP, practice). `nextKiwiEvent` is the
  next level-up / rank-up time (ceil); `accrueKiwis` runs inside `accrue` and processes level-ups
  at the interval end (`levelUps`: odd level → RNG stat weighted by the job, even → a point).
  Training ends (`finishTrainings`) and `speechUntil` are `advance` events too. Never accrue
  progress with floats; never change a power outside an event or a command.
- Chantier 06: job `guard` (XP `KIWI.xpPerHour.guard`, defends by `kiwiStrength` × class
  affinity, see `kiwar-threats`) and `injured` (hurt by a wave, back to work at `until`);
  memorial cause `predator`. The kiwi sheet has a Garrison section.
- Chantier 08: mastery `research` (practised at the Library), modifier `research` (mage × 1.2,
  dreamer × 1.15), `researchPower(v)` in `sim/research.ts` (Spirit); `ratesOf` maps a workplace
  to its mastery with `workMastery`. See `kiwar-ages`.
- Chantier 08 (second half, `kiwar-titans`): `Villager.kikiwiwi`, jobs `transform` (in the
  laboratory's vat) and `titan` (titan works); `KIKIWIWI.modifiers` in `modifiers(v)`;
  Kikiwiwis never take a workplace (`autoAssign`, `idleByPower`, `pickBuilder`).
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

## Chantier 13 (`kiwar-sky`)

- Job `stardust { patchId, returnTo }` (picking stardust; XP like a guard, Dexterity speeds it).
- `bless`: heal an injured kiwi, redistribute every stat (all back to 1, points to place),
  +1 for good (`Villager.blessings` ≤ 3). Star egg (`hatchEgg { star }`): golden shiny `star`
  (`KIWI_COLORS`; `SHINY_COLORS` stays the four natural colours drawn at hatching).

## Assignment (chantier 09, `sim/posts.ts`, `data/jobs.ts`)

- `postKind(state, b)` (a resource, `'research'` for the Library, null if no slots),
  `kindPower(v, kind)` (`workerPower` / `researchPower`), `averagePower`, `affinity(state, v,
kind)` = power / colony average (Kikiwiwis aside), `weakestWorker(state, b)`.
- `kiwiPosts(state, v)` feeds "Assign to…" (yield, affinity, swap, `ideal`); `jobBoard(state)`
  the Posts tab (rows by kind: workers/slots, output, status full/depleted/night/empty, plus
  guards, builders, kiwis without a post, free places); `staffing(state)` the cheap top-bar
  counts (memoized in the client `ui/derived.ts`).
- Commands: `assignKiwi {villagerId, buildingId | null, replace?}` (a full building swaps with
  `replace` or the weakest worker; the swapped kiwi takes the newcomer's former workplace or
  `autoAssign`; refuses `kiwiBusy`, `kikiwiwiNoWork`); `setKiwiFlags {villagerId, locked?,
builderPriority?}`. `assignWorkers` (−/+) still exists (bot, building sheet, job board).
- `Villager.locked` (never borrowed as a builder, never redirected), `builderPriority`
  (`pickBuilder` takes the fastest one at home, idle or at work, before idle kiwis),
  `homeJob` (workplace left because its stock was full). Save v18.
- Full stock: `redirectFull` runs when a `storageFull` event happened in the loop iteration
  (or at a construction end, new places): unlocked harvesters leave for the free producer with
  the best affinity whose stock is not full; one stays per building if the colony eats the
  resource. `returnHome` (state-based, idempotent) runs at the start of `advanceInPlace`, after
  every loop iteration and after every successful command: below `JOBS.returnBelow` (90 %) of
  the storage they go back if there is room, and forget `homeJob` in any case; a kiwi not at
  work (except builders) or placed by the player forgets it too. The 90 % crossing by eating
  is an advance event (`awaitedResources` in `computeFlows`). Player commands never trigger a
  redirection (a kiwi placed on a full stock stays).
- `autoAssign` → `autoPlace`: best `affinity − JOBS.ratioWeight × staffing ratio`, a full
  stock only as a last resort; idle kiwis never take the Library on their own.
- Chantier 15 (`kiwar-tasks`): the automation borrows kiwis for tasks (builders by Strength,
  researchers by Spirit while a tech is chosen, crater miners and stardust pickers by
  Dexterity, the garrison) and sends them back (`Villager.lent`, the jobs' `returnTo`);
  `pickBuilder` moved to `sim/tasks.ts`; `builderPriority` still wins; `locked` kiwis at work are
  never borrowed. `assignKiwi` also moves miners and pickers and drops `lent`.
- Events `kiwisRedirected` / `kiwisReturned {resource, count}` (toasts).

## Chantier 37 (classes by stat, training camp, tiers)

- `data/classes.ts`: `ClassDef.stat` (+ `stat2` for tier 3), `tier` 1–3, `parents`, `age`,
  `grows` (the modifier that grows with the stat: +2 % per point above 5 and +3 % per class
  rank above 1, `classGrowth`; lower-is-better keys divide), `schoolLevel` = level of the
  School (tier 1) or the camp (tiers 2–3). 19 classes: tier 1 builder, scout, warrior, mage,
  gatherer, bard, mayor; tier 2 (`advanced(...)`) architect, navigator, champion, archmage,
  herbalist, minstrel; tier 3 (`master(...)`) engineer, paladin, druid, ranger, titan, oracle.
  `CLASS_RULES` (statMin by tier 6 / 10 / 12, growth, promoteRank 3, rankBonus), `CAMP`
  (rank hours, drill speed by camp level, wave / expedition practice, drill appetite, camp
  retrain × 1.25). **`classSkills(id)`** = own + parents' skills (a master keeps both lines);
  **`inLine(id, root)`** = the class is `root` or comes from it — use it, never
  `classId === 'bard'`, for any rule of a base class (morale, travel, aura).
- `Villager.classXp` (raw practice, `PRACTICE_SCALE`/h; save v30), `classRank(v)` 1–5,
  `classRankProgress`, `drillRate`; drill = a `work` job at a `trainingCamp` (manual
  workplace, classed kiwis only: `wrongClass`), accrued in `accrueKiwis`, rank-ups are
  `nextKiwiEvent` times (`classRankUp` event); `grantClassXp` for waves (in `strike`, guards
  1.5 h, militia 0.5 h) and expeditions (`resolveReturn`). A new class (or promotion) resets
  `classXp`; a promotion keeps the skill cooldowns.
- `trainLock(state, v, classId, place)` (School or camp) → `classLocked`, `levelTooLow`,
  `statTooLow`, `rankTooLow`, `wrongClass`, `alreadyThisClass`, `kikiwiwiNoWork`;
  `trainingCost(v, classId, place)`, `trainingDuration(place, classId)`. The `train` command
  takes a School or a camp in `schoolId`.
- Effects: mage research × 1.5, gatherer harvest × 1.3 (Green thumb moved to it), warrior
  `repair` × 1.5 (`repairSpeed`, `itemSpeed`, `pickBuilder(state, item)`), scout crew travel
  × 0.9 (navigator 0.8), Agility +1 % harvest (`KIWI.agilityCarry`), bards' morale
  (`bardMorale`, `moraleOf().bards`, cap 5 %), engineer ship mending, ranger raid loot, druid
  Rain 50 % and Green thumb × 3, oracle notice + 1 h (`planWave`). Kikiwiwi: no class
  (cleared at the infusion, save v29), risk lowered by Strength too.
- Client: `ClassCourses.tsx` (`classRequirements` green/red, `ClassRank`, School courses,
  camp promotions and changes), `ClassTree.tsx` (folded tree in the kiwi sheet),
  `CampInfo.tsx` (camp sheet), `render/models/training.ts` (camp model + `trainingGrounds`
  in `spread.ts`), tier outfits = first ancestor's + cape/collar (`tierParts`, `CAPES` in
  `kiwiRig.ts` and `KiwiPortrait.tsx`), clips `dagger` / `sing`, props `dagger` / `lute`;
  drilling kiwis `thinkCamp` (`render/kiwis.ts`). `?kiwis` shows a Champion (joy) and an
  Oracle (dance).

## Chantier 38 (gear, skill `kiwar-forge`)

- `Villager.gear` (weapon, armour, `kept`): `cloneVillager` copies it; a new line gives the
  weapon back (`equipGear`), a death at home gives everything back (`removeVillagers` →
  `returnGear`). Weapons by family (`CLASS_FAMILY`): a new class needs an entry there.
  `GearSection.tsx` in the kiwi sheet; gear parts in `kiwiRig.ts`.

## Client

- Chantier 09: `VillageModal.tsx` tabs kiwis / posts (`JobBoardView`, `BoardLine`,
  `KiwiChips`) / memorial; `SheetNavigator` (◀ ▶ and a touch swipe in the order of
  `villageSort` from the store); `PostPicker` ("Assign to…" inline under the actions row);
  `KiwiFlags` (lock / priority builder toggles), `FlagIcons`, `RedirectNote`. `TilePanel`
  `WorkerList` ("Replace by…"). Top bar: `.chip-idle` pill (`actions.openPosts()`) and the
  harvesters under each resource chip.
- `ui/components/VillageModal.tsx` — list, memorial, `KiwiSheet` (radar `StatRadar`, rename,
  follow, workplace, `ClassSection` with courses and skills), `FollowBadge`, `useJobLabel`.
- `KiwiPortrait.tsx` — SVG portrait (shiny colours, class outfits). `ExpeditionModal.tsx` —
  `CrewPicker`. `ReportModal.tsx` — roster. `TilePanel.tsx` — `SchoolInfo`. `App.tsx` —
  `SpeechBadge`.
- `render/kiwis.ts` — shiny tint (instance colour), size from Strength + Endurance, highlight
  ring (`setHighlight`), trainees hold a lesson at the School (chantier 34, see
  `kiwar-client`). Outfits: `outfitParts` in `render/anim/kiwiRig.ts` (pieces flagged head or
  body, one instanced mesh each per class); each class has a move in `CLASS_CLIP`
  (`kiwis.ts`).
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
3. FR + EN in `classes`, `skills`, `traits`; outfit in `outfitParts` (`render/anim/kiwiRig.ts`), its
   move in `CLASS_CLIP` (`render/kiwis.ts`) and `KiwiPortrait`.
4. Tests in `test/kiwis.test.ts`, `test/classes.test.ts`, `test/expeditions.test.ts` (always
   one big step vs small steps), then `kiwar-balance` (milestones kiwi5, kiwi10, mayor).

## Chantier 48: the spelunker (skill `kiwar-depths`)

Seventh master (`spelunker`: Endurance + Dexterity, from champion or herbalist), weapon
`pick`, mace family; `SKILLS.spelunkerSelf` / `spelunkerCrew` in `hazardFactor`, the lantern
of a delve won. Job `mine` (miners below: no militia, no evening).
