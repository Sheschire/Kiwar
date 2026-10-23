---
name: kiwar-sky
description: Kiwar comets and stardust (chantier 13) — the comet calendar, stardust tiles and their pickers (job `stardust`), the separate stardust stock (raw integer units, cap 50), blessings (heal, redistribute, +1 stat), the star egg and the golden shiny, the Stars research branch, stardust fuel for the ship, stardust costs of the Iron/Industry monument and of the Kikiwiwi, the comet in the sky and the dust sparkles. Use when touching comets, stardust, blessings, star techs, fuel or anything paid in stardust.
---

# Kiwar comets and stardust (chantier 13)

Load `kiwar-sim` too (deterministic, exact offline). Meteorites (the other gift from the sky)
are in `kiwar-threats`. Owner's answers: a comet every 3–5 days, one per face (never shared in
a universe), stock cap 50, stardust needed by the monument only for Iron and Industry, a new
golden shiny only from the star egg, pickers sent by hand (a "send the most dexterous" button;
chantier 15 may automate temporary posts).

## Data (`data/comets.ts`)

- `COMETS`: first comet at 36 h (`firstMs`, announced `firstNoticeMs` = 9 h before, no draw at
  creation), then `intervalMs` 72–120 h, notice 6–12 h, `passMs` (cosmetic tail after the
  passage), `lifeMs` 24 h on the ground, 1–3 tiles of `landTypes`, `stock` 20 × `ageFactor`.
- `STARDUST`: cap 50, 3 slots per tile, an average kiwi picks one point per 30 min, +5 % per
  Dexterity point above 5. `STARDUST_SCALE` raw units per point; `dustPoints(raw)`.
- `BLESSINGS` (heal 3, respec 6, +1 stat 10 at most 3 per kiwi, star egg 15, golden shiny 1/8),
  `FUEL` (5 stardust, travel × 0.75, reliability +0.15).
- Costs elsewhere: `LevelDef.stardust` (monument level 2 = 15, level 3 = 25), `KIKIWIWI.stardust`
  (10, given back when the infusion fails), `TechDef.stardust` (star techs 8–15).

## State and simulation

- `state.stardust` (raw integer units; **not** a `ResourceId`: no storage, loot, cargo,
  demolition refunds), `state.comets` { `next` (id, announceAt, at, announced), `lastAt`,
  `passes`, `patches: DustPatch[]` (stock/max raw, landedAt, expiresAt) }. Save v19 (comets),
  v20 (blessings, star eggs: optional `Villager.blessings`, `Egg.star`, `QueueItem.paidDust`,
  transform job `paidDust`).
- `sim/comets.ts`: `planComet` (loop top, own stateless stream `cometRng` = seed/face/comet number, never the threat stream: comets must not reshuffle the waves; interval ×
  `techEffects.cometInterval`), `nextCometEvent` (announcement, passage, a patch running out —
  ceil of stock / rate —, expiry, the cap), `cometTick` (tiles drawn **at the passage** (`cometRng(s, "tiles")`): free
  land, no building/queued build/crater/obstacle/patch, not flooded), `accrueStardust` (integer
  rate × dt, clamped by the patch stock and the cap; the steps always end at those events, so
  one big step = small steps exactly), `releasePickers` (back to `returnTo` if it has room,
  else `autoAssign`). Pickers stop during a shelter (`patchRate` = 0).
- Job `{ kind: 'stardust', patchId, returnTo }`: XP like a guard (`ratesOf`), work site for the
  beds (`rest.ts`), `jobBoard().pickers`, renderer walks there and works (no night rest).
- Commands: `collectStardust { patchId, villagerIds }` (exact list ≤ 3, `[]` calls them back;
  unknownPatch, patchFull, kiwiBusy, kikiwiwiNoWork, stardustFull), `bless { villagerId, kind:
heal | respec | stat, stat? }` (notInjured, blessingLimit, statMaxed, notEnoughStardust),
  `hatchEgg { star }`, `launchExpedition { fuel }`, `setResearch` pays a star tech's dust when
  chosen and refunds it when abandoned (`refundTechDust`), `upgrade` pays `LevelDef.stardust`
  (refunded on cancel), `transform` pays `KIKIWIWI.stardust` (refunded if the lab is
  demolished). Helpers `payStardust` (whole points) / `refundStardust` (up to the cap).
- `upgradeLock` returns `notEnoughStardust` (badges, building tree). `bestDustCrew` picks the
  "send the most dexterous" crew (locked workers are never borrowed).
- Star egg: `addVillager(state, at, star)` makes one extra colony-RNG draw only for star eggs;
  `KIWI_COLORS` = `SHINY_COLORS` + `star` (zod enums use `KIWI_COLORS`; `rollShiny` keeps the
  four natural colours).
- Stars branch (`TECH_BRANCHES` + `stars`): `clearNights` (`nightWork(state)` replaces
  `CYCLES.nightWork` in the harvest and the research), `starWatch` (`waveNotice` ms added in
  `planWave`), `cometLure` (`cometInterval`), `starIron` (`meteorStock`). Calendar effects apply
  from the next planning (exact offline). `describeTech` shows them (`TECH_STATS`).
- Anti-cheat (`isPlausible` → `plausibleStardust`): passes ≤ what the play time allows,
  stardust ≤ passes × the richest comet, patches consistent, golden shinies ≤ passes.
- Tests: `test/comets.test.ts`, `test/blessings.test.ts`, `test/stars.test.ts`, fuel in
  `test/expeditions.test.ts`, lab refund in `test/kikiwiwi.test.ts`.

## Client

- `render/comets.ts` `CometsView`: chantier 32 — the comet is an **object of the map of
  space**, never placed from the screen: `cometPath(at, k)` (`render/space.ts`, pure, tested)
  gives its head and flight direction (an arc of `COMET_SPAN` 140° round home at
  `COMET_DISTANCE` 340, height `COMET_LOW` 20 + `COMET_RISE` 26 mid-way, start azimuth drawn
  from its passage time), k from its announcement to `at + passMs`. Head: a sprite
  (`HEAD_SIZE` 16 world units); tail: a quad of `TAIL_LENGTH` 120 along the flight, turned
  towards the camera around that line (`makeBasis`). Brighter at night (`setNight`). While it
  is in the sky and off screen, `arrow()` (`edgeArrow`, insets clear of the top bar, badges
  and thumb bar) → `onCometArrow` → viewStore `cometArrow` → `CometArrow.tsx` (golden arrow
  on the edge); a tap calls `actions.lookAtComet` → `CameraRig.lookToward` (turn + zoom out
  to the space view, where comets fly). Dust tiles: `Points` of golden four-point stars (dark
  edge, readable by day) that rain down when they land, thin out with the stock, and a glow.
- UI: `StardustChip` in the top bar (shown once a comet passed), `CometBadge` in the badge stack
  (countdown, then dust left; a tap selects the richest tile with room), `DustSection` in the
  tile sheet (above the deposit), `BlessingSection` in the kiwi sheet, star egg pill beside the
  egg, fuel checkbox in the expedition planner, `Cost` takes `stardust`/`haveDust`, dust price
  on tech cards, `StardustIcon` (+ glyphs `stardust`, `night`, `comet`). Golden shiny: portrait
  sparkles, `SHINY_HEX.star`, `.shiny-star`. Halos pulse through an `::after` opacity (the perf
  pass forbids animated box-shadows).
- Toasts (`comet.*`), offline summary (`comets`, `stardust`), sounds `comet.seen` (synth
  `cometSeen`) and `comet.pass` (synth `comet`).
- Screenshots: set `controller.state.comets.next = { id, announceAt: now − 6 h, at: now + 1 h,
announced: true }` (the comet fades in over 15 min of game time after `announceAt`; at the
  default zoom it is off screen: click `.comet-arrow` and wait ~30 s headless for the camera),
  push
  patches (`stock`/`max` in raw units: `180000000` per point), set `stardust`, then a
  `debugGrant` dispatch. Night: move `calendarStart` so `(now − start) mod 2 h ≈ 1 h 50`.

## Balance

- Bot (`tools/balance/src/bot.ts`): `cometOrders` sends `bestDustCrew` to every tile as soon as
  it falls, heals wounded kiwis with the surplus above `dustReserve` (the next monuments and a
  Kikiwiwi); `titanOrders` waits for the Kikiwiwi's dust **plus** the next monument's (`nextMonumentDust`:
  the age first). `RunResult.final` has `comets`,
  `dustPicked`, `stardust`; the report's predators table shows them.
- To retune: `COMETS.stock`/`intervalMs`/`firstMs`, the monument and Kikiwiwi dust costs. Check
  `pnpm balance:ages` (Iron and Industry must stay reachable within a few comets).

## Chantier 15

Stardust tiles are filled on their own (`fillStardust` in `sim/tasks.ts`, `kiwar-tasks`): the
most dexterous kiwis borrowed from the harvest, until the stock is full; in manual mode
(`automation.stardust` off) the tile sheet keeps the "send" / "call back" buttons.
`releasePickers` uses `sendBackAll`.
