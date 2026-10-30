---
name: kiwar-tasks
description: Kiwar automation (chantier 15) — tasks filled with the best kiwis (constructions by Strength, research by Spirit, meteorite craters and stardust by Dexterity, repairs, garrison), borrowing from the harvest and sending kiwis back (`lent`, `returnTo`), constructions in parallel by Nest level, the meteorite post and its drill, the dispatcher's exactness rules, the Automation panel (`state.automation`, `setAutomation`, `assignBuilder`, `taskNeeds`). Use when touching who goes where on their own, the construction queue, the Library staffing, craters, auto repairs or the auto garrison.
---

# Kiwar tasks and automation (chantier 15)

Load `kiwar-sim` (exact offline) and `kiwar-rpg` (assignment, `posts.ts`) too. The owner's
rule: "the system is smart and automated so the player does not have to manage everything,
but can switch any automatism off to optimise by hand".

## Data

- `data/jobs.ts`: `AUTO_TASKS` (build, research, meteor, stardust, repair, garrison,
  redirect — the chantier 09 move away from a full stock), `TASKS.buildSlots` (constructions
  at once by Nest level 0–12: 1/1/2 in the Eden, 2 in the Stone age, then 3; chantier 30). The
  reserves of the warehouses are never collected by the automation (player only).
- `data/threats.ts`: `METEORS.slots` (3), `METEORS.rates` (per average kiwi per hour, a
  level-1 workplace's rate), `METEORS.drill` (×1 / 1.5 / 2 / 2.5 by age);
  `GARRISON.autoLeadMs` (40 min), `GARRISON.autoShare` (at most half the colony).
- `data/research.ts`: tech `meteorDrill` (Stone, economy, 300 pts, Library 2; effect
  `meteorDrill`, an unlock in `describeTech`).

## State (save v21)

- `GameState.automation: Record<AutoTask, boolean>` (all true; `defaultAutomation()`).
- School / training camp courses (October 2026): `train` takes any kiwi at home (idle, work,
  guard, crater, stardust, a site): `leaveSite` puts a builder's site back in the queue with its
  time left (at speed 1, the next builder divides it again), `borrow` gives the job's
  `returnTo`, and `finishTrainings` (or a demolished School) calls `sendBack`.
- `Villager.lent?: BuildingId | null`: borrowed for a task without its own memory (research at
  the Library, the garrison) — the workplace to go back to (null: none). `forgetLent` drops it
  as soon as the kiwi does anything else; `assignKiwi` and `setGarrison` (newly posted) drop it
  (placed by the player = stays). `returnHome` leaves lent kiwis, builders, miners and pickers
  alone.
- Job `meteor { meteorId, returnTo }` (XP and mastery like a workplace of the crater's
  resource; `workSite`, bed keys, renderer `workTile`).

## `sim/tasks.ts`

- Task levels (`taskLevel`): garrison 0 > build 1 > research 2 (Library workers) > pick 3
  (craters, stardust) > harvest 4 > idle 5. `canBorrow(state, v, to)`: lower level only, never a
  Kikiwiwi, never a locked kiwi unless idle, never a kiwi drilling at the training camp except for
  the garrison. `canReassign(v)` (idle, work, guard, meteor, stardust, build) is what the player
  can move with `assignKiwi` (a builder leaves its site through `leaveSite`). `borrow(v)` returns the home (lent, the job's
  `returnTo`, or the workplace). `sendBack` / `sendBackAll` (kiwis with a home first, so that a
  kiwi looking for work does not take the place of one coming home). `bestFor` = best power,
  idle first on ties.
- Constructions: `buildSlots`, `startedItems`, `nextConstructionEnd` (several sites can end at
  once: `advance` completes every item ending then; `completeConstruction` removes the item by
  id), `waitingForBuilder` (items with a place and no builder: the "waiting for a builder"
  status), `pickBuilder` (fastest priority builder at home/work, else the strongest borrowable,
  idle first on ties), `startItem` (duration ÷ `builderSpeed`, fixed at the start),
  `startConstructions`. **A site never starts without a kiwi.**
- `fillResearch`: with `research.current`, the Library's free places take the best
  `researchPower` (lent); without it, lent researchers go back. Kiwis placed by the player stay
  (banked points). `idleByPower` sorts the Library's "+" by Spirit.
- `fillCraters`: miners leave an empty or vanished crater; free places of a crater whose
  resource is below its cap take the best `workerPower(v, resource)`. `releaseFullCraters` runs
  at a `storageFull` event (in the `advance` loop, before `redirectFull`). `fillStardust` (the
  chantier 13 pickers, `pickRate`), stops at the stardust cap.
- `orderRepairs`: a damaged building orders and pays its repairs when affordable and the queue
  has room, inserted before the sites not started.
- `fillGarrison`: from `autoGarrisonAt` (an `advance` event, wave.at − 40 min) to the strike,
  greedy posting of the kiwi that stops the most of what still breaks through at bad luck
  (`sectorClash` with threat × (1 + `THREATS.luck`)), builders stay, nothing during a shelter;
  outside the window lent guards go back.
- `dispatchTasks` order: forgetLent, garrison, repairs, constructions, research, craters,
  stardust. `taskNeeds` = what each task waits for (the panel's badges).

## Exactness rules (read before adding a task)

- `dispatchTasks` runs **after every event of the `advance` loop and after every successful
  command** (`applyCommand`), **never at the start of an `advance` call** (call times differ
  between one big step and many small ones).
- So everything it reads must change only at events or commands. A stock reaching its cap is
  an event; a stock **leaving** it is not (eating) — test "at the cap", never `storageFull`
  (which depends on the gross rates, i.e. on the miners the dispatch itself moves: it
  oscillated and broke "big step = small steps"). Affordability (repairs) is read at events.
- A new task: its level in `RANK`/`taskLevel`, a fill function in `dispatchTasks`, its release
  at the event that ends it, a toggle in `AUTO_TASKS` (+ FR/EN `automation.tasks.<id>`), its
  count in `taskNeeds`, tests "big step = small steps" in `test/tasks.test.ts`.

## Meteorite post (`sim/sky.ts`)

- `meteorRate(state, m)` = `METEORS.rates[res]` × `crewWork(miners)` (presence, hunger,
  morale, speech; 0 in a shelter) × logistics from the crater to the nearest depot ×
  `cycleHarvest` × `drillFactor`; no climate. Producers nearby no longer take from it; nothing
  is built on a crater (`siteError` → `onCrater`, camps too). `minersOf`, `bestMeteorCrew`,
  `canMine`; command `collectMeteor` (manual mode; `unknownCrater`, `craterFull`).
  `grossRates` / `productionRates` (and the client's `perState`) include the craters.
- `jobBoard(state).meteors` (Posts tab line "Meteorite").

## Chantier 38 (skill `kiwar-forge`)

- Tasks `forge` (`fillForge`: smiths by `forgePower`, lent, level `research` like the Library;
  back when the queue empties) and `equip` (`equipGear`, last in `dispatchTasks`; the weapon
  of another line goes back even in manual mode).
- Craters: `craterWorth` (iron with room, or the resource below its cap) replaces "stock > 0";
  `releaseFullCraters(state)` releases the craters no longer worth it; the automation sends at
  most `METEORS.autoShare` (a quarter) of the colony to the craters.

## Chantier 43

- The Speech's gathering (`gathered(state)` in `sim/speech.ts`: the shelter or
  `state.speech.until`) stops every rate the tasks feed (harvest, research, forge, craters,
  stardust) but moves nobody: the dispatcher is unchanged, the crowd is drawn by the client.
- Each kiwi works at its own morale (`kiwiMoraleWork`): `bestFor` still compares raw powers.

## Commands

`setAutomation { task, on }`, `assignBuilder { queueItemId, villagerId }` (manual builder;
`alreadyStarted`, `noBuildSlot`, `kiwiBusy`), `collectMeteor`. `assignKiwi` also moves miners
and pickers.

## Client

- `QueuePanel`: sites at once, "waiting for a builder" (auto) or "Manual: choose" with
  `BuilderPick` (strongest kiwis); `TilePanel` `Progress` shows the same.
- `MeteorSection.tsx` (crater sheet: stock, fade, empty-in, miners, drill, auto/manual hint,
  manual buttons); the build list is hidden on a crater. `DustSection` hides its buttons in
  auto mode.
- `AutomationPanel.tsx`: village tab `auto` (store `villageTab`), one switch per task, badge
  "N waiting" for manual tasks (`taskNeeds`), a dot on the tab (`manualNeeds`).
- `render/meteors.ts`: the drill (tripod + turning bit, colours by age) on worked craters once
  researched; `render/kiwis.ts`: miners carry their loads to the depot like workers.

## Balance

The bot (`tools/balance`) relies on the automation: no more research staffing, garrison
posting, stardust pickers or repairs of its own (it still shelters, places turrets, builds).

## Chantier 45

Queue items `canal` / `fill` (juice canals, `sim/canals.ts`) are constructions like the others
for the dispatcher (`startItem`, builders, `buildSlots`); they hold their tile and draw a
stake only. `has(type)` in the bot matches `buildingType 'camp'` for them (as for stumps).

## Chantier 48: the mines (skill `kiwar-depths`)

Job `mine` (task level `pick`, `borrow` / `returnTo` like a crater), automation `mine`
(`fillMines` in `dispatchTasks`, a fifth of the colony at most, released when the door
closes or the resource is at its cap), command `postMiners`. The auto garrison reads
`comingWave` (an upwelling too).
