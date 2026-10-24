---
name: kiwar-forge
description: Kiwar meteoric iron, the Forge and the gear (chantier 38) — the separate iron stock (raw integer units, cap by Nest), iron in meteorite craters and wrecks, the no-blocking fall guarantee, what iron pays for (levels 7+ including the launchpad's ship generations, monuments, turrets 3+, techs), the Forge (technology, queue, smiths), items by family and tier, the armory, the two slots of a kiwi, the Gear automation, the gear in battle and in `guardPower`, the Forge's sheet, the kiwi's Gear section, gear drawn on the kiwis. Use when touching iron, the Forge, items, gear or anything paid in iron (and for the gear lost on the twin in chantier 40).
---

# Kiwar forge, gear and meteoric iron (chantier 38)

Load `kiwar-sim` (exact offline), `kiwar-tasks` (smiths, gear, craters), `kiwar-battle` (unit
profiles) and `kiwar-client` for the UI. Owner's rules: the Forge arrives in the Stone age;
weapons follow the class lines (a family per line); the player orders, the automation staffs
the Forge and hands pieces out (switchable); craters give mostly iron; never a blocked game.

## Data

- `data/iron.ts`: `IRON` — `cap` by Nest level (13 entries), `crater` (12 × `METEORS.ageFactor`
  × `starIron`), `perHour` (0.2 per average kiwi), `resourceShare` (0.2 of the old crater
  stock), `wreck` (3 × age factor), `guaranteeMs` (72 h), `levels` (iron of building levels
  7+), `turret` (turrets 3+), `own` (monument 30 / 60, camp and Forge level 3; the launchpad's levels 7+ pay the ship
  generations — no cost per flight: tried, it ate the iron income). `IRON_SCALE` raw units per unit, `ironUnits(raw)`.
- `data/gear.ts`: `WEAPON_FAMILIES` (blade, mace, bow, staff), `ARMOR_KINDS` (light, heavy),
  `GEAR_TIERS` (stone, iron, steel), `ITEM_IDS` (`kind-tier`, 18), `CLASS_FAMILY` (every class
  → a family or null: mayor, no class), `ITEMS` (slot, cost, iron, `workH`, tech, damage / hp /
  armor / speed), `FORGE` (smith power +4 % per Strength and Dexterity point, `rate`,
  `armoryMax`), `orderWork(id)`.
- `LevelDef.iron` (set by `withIron` in `buildings.ts` from `IRON.levels` / `turret` / `own`),
  `TechDef.iron` (armor 10, machines 20, firearms 25), tech `forge` (Stone, effect `forge`),
  building `forge` (3 levels Stone/Stone/Iron, footprint 3, `forgeQueue`, `forging`, manual
  workplace).

## State (save v31 iron, v32 forge)

- `state.meteorIron` (raw), `Meteor.iron` / `ironMax` (raw), `sky.next.iron`, `Obstacle.iron`
  (whole units, wrecks), `QueueItem.paidIron`.
- `state.forge = { orders: ForgeOrder[] (id, item, progress raw, paid, iron), armory:
Partial<Record<ItemId, number>> }`; `Villager.gear?: { weapon?, armor?, kept? }`
  (`cloneVillager` copies it). Automation tasks `forge` and `equip`.

## Simulation

- `sim/iron.ts`: `ironCap`, `meteorIronOf`, `addIron` (refunds and wreck loot, up to the cap).
- `sim/sky.ts`: `craterIron`, `meteorIronRate` (integer, the crater's multipliers),
  `meteorIronPerHour`, `craterWorth`, `accrueIron(s, rates, dt, at, events)`. **The iron
  rates are computed in `computeFlows` (`flows.iron`) at the start of the interval**, never in
  `accrue`: `accrue` updates the hunger first, and a stage read at the end of an interval broke
  "big step = small steps". Same for the Forge (`flows.forge`). A crater running out of iron
  and the stock filling are `nextSkyEvent` times; event `ironFull`. A shooting star with no
  preferred free tile lands on any free land (no burn-up).
- `sim/forge.ts`: `forgeOf`, `forgePower`, `smithsOf`, `forgeRate` (integer: presence, night,
  hunger, morale, damage, level speed; 0 in a shelter or without an order), `forgeQueueSize`,
  `forgeLock` (unknownItem, noForge, techMissing, forgeQueueFull, notEnoughIron,
  notEnoughResources), `orderItem`, `cancelOrder` (refund), `nextForgeEvent`, `forgeEta`,
  `accrueForge`, `forgeTick` (event `itemForged`), `storeItem`, `familyOf`, `wearLock`
  (kikiwiwiNoWork, wrongFamily), `equip` / `unequip` / `returnGear`, `equipGear` (weapons of
  another line back to the armory always; with `automation.equip`: guards first, then by
  `kiwiStrength`, best tier, preferred armour heavy for blades / maces / none, light for bows
  and staves; kiwis `kept` or away are left alone), `gearEffect(v)`, `armoryCount`, `itemOpen`.
- `sim/tasks.ts`: `fillForge` (lent smiths by `forgePower` while an order waits, sent back
  when the queue empties; task level `research`, like the Library), `equipGear` at the end of
  `dispatchTasks`; `taskNeeds.forge` / `equip`. Craters: `METEORS.autoShare` (a quarter of
  the colony at most).
- Commands: `forgeItem { item }`, `cancelForge { orderId }` (unknownOrder), `equip {
villagerId, slot, item | null }` (wrongSlot, notInArmory, wrongFamily, kiwiBusy when away;
  taking off by hand sets `kept`). Iron paid by `upgrade` (`payIron`, `upgradeLock` →
  `notEnoughIron`), `setResearch` (refunded with `refundTechDust`). `buildLock('forge')`: forgeExists, techMissing. Demolishing the
  Forge refunds its orders. `removeVillagers` returns the gear to the armory.
- Battle: `kiwiUnit` multiplies a guard's damage by the weapon, everybody's hit points and
  armour by the armour, speed by heavy armour; `guardPower` × damage × √hp.
- Anti-cheat: `plausibleIron` (cap, craters), `plausibleGear` (researched tiers only, queue
  size).
- Tests: `test/iron.test.ts`, `test/forge.test.ts`; `rich()` in the test helpers gives 200
  iron (refund tests set the iron to the cap first: refunds stop at it).

## Client

- `TopBar` `IronChip` (shown once a meteorite fell; tip), `Cost` `iron` / `haveIron`, iron on
  tech cards (`ResearchModal`), `MeteorSection` (iron first,
  `sky.iron`, `sky.ironRate`), `ForgeInfo.tsx` (smiths, queue, catalogue, armory;
  `ItemEffects`), `GearSection.tsx` in the kiwi sheet, `UnitGear` in the battle card (gear read
  from the colony: the journal keeps none). Memos `meteorIronPerHour`, `forgeEta` in
  `ui/derived.ts`. Icons `forge` (anvil) and `iron` in `iconSet.tsx`.
- 3D: `render/models/forge.ts` (`forge(look)`, `forgeYard` in `spread.ts`), craters glow
  `IRON_GLOW` with `SHARDS` (fewer as the iron goes), gear parts in `kiwiRig.ts`
  (`gearGeometry`: light vest, heavy breastplate and pauldrons, weapons on the back; colours
  by tier; `KiwiDraw.weapon` / `armor`; the battle show draws the armour only). Check
  `?kiwis&clips=gear blade-iron,...` and `?sheet&types=forge&age=1`.
- Sound `forge.item` (synth `anvil`), toasts `iron.full`, `forge.forged`, `iron.wreck`,
  offline `offline.iron` / `offline.forged`.

## Bot

`tools/balance/src/bot/forge.ts` (mechanic `forge`): the Forge after the training camp once
its technology is known (`forge` after `masonry` in `TECH_ORDER`), then once per game hour an
order: for each kind (the family of each classed kiwi, its armour) short of pieces of the
best open tier, keeping the next monument's iron and twice the price in stock. `upgradeOk`
waits for a level's iron and keeps `ironReserve(state, b)`: nothing for the monument, the
Nest and the Library (the monument needs the Nest 9: reserving there deadlocked); for anything
else the next monument level's iron (`monumentIron`: through the Stone age and from the
research of a passage on) plus the next Nest and Library levels'. Without it the turrets 3+
ate the iron and the Iron age never came, then the Nest 7 (Library 7, Industry passage) stalled.
The lab is ordered only once `buildLock` allows it (an order that always failed froze the bot). `ageDecision` skips a technology whose iron is missing (a
command that always fails freezes the bot).

## Chantier 40

A kiwi dead on a landing loses its gear (call something else than `returnGear`, which gives it
back); the aliens gain it (impact of chantier 39). Gear is part of the crew's strength there.
