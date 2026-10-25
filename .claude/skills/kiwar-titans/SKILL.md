---
name: kiwar-titans
description: Kiwar obstacles and Kikiwiwis (second half of chantier 08) — rocks, stumps and meteorite wrecks blocking tiles, clearing stumps through the queue, the laboratory against nature and the infusion (risk, failure), the Kikiwiwi (modifiers, ground + air garrison, juice upkeep and weakness, one per ship, cap per age), titan works (smash, spring, terrace, flatten) and reshaped tiles in the map (`state.terraform`, `faceMapOf`). Use when touching obstacles, the laboratory, Kikiwiwis, terraforming or anything that changes the map at run time.
---

# Kiwar obstacles, Kikiwiwis and titan works (chantier 08, second half)

Load `kiwar-sim` (deterministic, exact offline), `kiwar-ages` (techs, ages), `kiwar-rpg`
(kiwis, jobs, modifiers), `kiwar-client` (models, sheets).

## Obstacles

- `data/obstacles.ts`: `OBSTACLE_KINDS` stump | rock | wreck; `OBSTACLES[kind]` (tiles, count
  per face, loot, `clearedBy` kiwis | titan), `OBSTACLE_RULES` (rho 0.38–0.9, `clearMs`,
  `clearCost`, `maxWrecks` 4).
- `state.obstacles: Obstacle[] { id: '<kind>:<q>,<r>', kind, q, r, loot }` (save v15). They live
  in the **state**, not in `generateFace` (maps stay bit-identical). `generateObstacles(map,
taken)` draws them from `<seed>/<face>/obstacles` (never the colony RNG), always on the
  **generated** map; the **classic** biome has none (test helpers use classic: existing tests
  are unaffected; obstacle tests use the drawn biome). Older games: only on free tiles
  (`obstaclesForOldGame` in `save.ts`).
- They block `build`, `gather`, `buildPath` (`obstacle`), meteorite landings and the bot's
  `bestTile`; walking is not blocked (cosmetic). A crater fading away (or dropped by
  `METEORS.max`) leaves a wreck if the tile is free (`leaveWreck`, event `wreckLeft`).
- `clearObstacle { q, r }` (stumps only, else `needsKikiwiwi`): queue item `kind: 'clear'`
  (`buildingType: 'camp'`, unused), a builder does it, `removeObstacle` credits the loot up to the
  storage (event `obstacleCleared { by }`). Construction sites skip the scaffold for it.
- `isPlausible` → `plausibleObstacles` (ids, generated subset, wrecks capped, loot ≤ table).

## Laboratory and infusion

- Techs (branch `unnatural`): `juiceInfusion` (Iron, opens the lab), `titanWorks` (Iron,
  terraforming), `greenBlood` (Industry: power × 1.25, upkeep × 0.75, risk −10 pts). Effects in
  `techEffects`: `laboratory`, `terraform`, `kikiwiwiPower`, `kikiwiwiUpkeep`, `infusionRisk`.
- Building `lab`: one per colony (`labExists`), outside the building cap, levels 1–3
  (`requiresAge` 2/2/3: `build` now checks level 1's age, `ageTooLow`), `techMissing` without
  the tech. No levels 4–6.
- `data/kikiwiwi.ts` `KIKIWIWI`: min level 5, cost, duration by lab level, risk (base 40 %,
  −2 pts per Endurance above 5, −1 per level, −8/−16 by lab level, bounded 5–60 %), failure
  (injured 24 h, −1 Strength and Endurance), `capByAge` [0, 0, 1, 2], modifiers, affinity,
  upkeep, `weakPower`, `perShip`.
- `transform { villagerId, labId }`: job `transform { labId, until, risk, paid }` (risk fixed at
  the start, shown in the UI); `finishInfusions` draws with the colony RNG at `until` (advance
  event): `kikiwiwiBorn` or `infusionFailed`. Demolishing the lab refunds. Errors: notALab,
  alreadyKikiwiwi, levelTooLow, kiwiBusy, labBusy, kikiwiwiLimit.

## The Kikiwiwi

- `Villager.kikiwiwi?: { since }` (save v16). `modifiers(v)` applies `KIKIWIWI.modifiers`
  (fight ×4, exposure ×0.3, weight ×5, rations ×3). It keeps its class and skills.
- **Never a worker**: `autoAssign`, `idleByPower`, `pickBuilder` skip it; head-count crews
  (`crewOf(state, n)`) never board it; `oneKikiwiwi` on launch.
- `titanPower(state, v)` = green blood × (0.5 if the juice stock is empty): garrison
  (`guardPower`, affinity ground 1 / air 1 whatever the class) and militia. Raids use
  `strengthOf(state, …)` (green blood only: it carries its rations).
- Upkeep: `kikiwiwiUpkeep(state)` is added to `consumption(state).juice` (so `netRates`,
  `storageFullCheck` and `computeFlows` see it). An empty juice stock is already an event, so
  the weakness changes only at events. Running dry also feeds the colony hunger gauge.

## Titan works and reshaped tiles

- `data/titan.ts`: `TITAN_WORK_IDS` smash | spring | terrace | flatten, `TERRAFORM` (tiles,
  juice, duration), `SMASH` by obstacle kind, `TITAN.maxTerraform` [0, 0, 4, 8], terrace rise.
- `titanWork { villagerId, q, r, work }`: Kikiwiwi idle or on guard, not weak
  (`kikiwiwiWeak`), the tile free (`titanAt` blocks build/gather/path/clear), `canReshape`
  (land type, nothing on it, no crater, a spring never cuts the land: `splitsLand`, which
  since chantier 35 calls the shared `cutsLand` with the big buildings' walls),
  `terraformLeft`. Job `titan { work, q, r, until }` (XP like a guard), event in `advance`
  (`finishTitanWorks`: `titanDone`, `terraformed`). Errors: notAKikiwiwi, kikiwiwiWeak,
  notReshapable, terraformLimit, titanAtWork, techMissing, noObstacle.
- `state.terraform: Record<HexKey, 'spring' | 'terrace' | 'flatten'>` (save v17).
  **`faceMapOf(state)` applies it** (`applyTerraform`: spring → juice, terrace → no flood and
  raised, flatten → flesh); key = generated key + `terraformKey(state)`. Everything must use it:
  `advanceInPlace` re-reads the map after a titan event, `applyCommand` replaces `ctx.map` when
  tiles were reshaped, the server's `mapFor` is `faceMapOf`, walk and bed caches key on
  `terraformKey`. The generated map (`faceMapOf({ seed, face, params })`) stays the reference
  for obstacle generation and import checks (`plausibleTerraform`). A reshaped tile's deposit
  starts over full (`delete state.deposits[key]`) and pools are synced.

## Client

- `render/obstacles.ts` `ObstaclesView` (stumps, boulders, glowing wrecks; props cleared under
  them; also on ally planets via `TwinSnapshot.obstacles`). Tile sheet `ObstacleSection`.
- `render/buildingModels.ts` `lab` (vats, pipes, lightning coil, ambient rigs).
  `ui/components/LabInfo.tsx` (kiwi picker with risks, vat countdown, cap).
- `render/kikiwiwi.ts` `TitansView`: one group per Kikiwiwi, posed every frame from its agent in
  `KiwisView` (whose instanced body is skipped), veins pulse (dim when weak), drops, stomps on
  `build`/`work` activity. `TITAN_SIZE` 1.6, slower walk. Portrait `titan` prop, `badge-titan`,
  `TitanSection` in the kiwi sheet; `garrison.standDown`.
- `ui/components/TitanWorks.tsx` in the tile sheet (smash or reshape, Kikiwiwi choice, cost,
  tiles left). The agent walks to the tile and stomps (`job.kind === 'titan'`).
- **Reshaping redraws the face in place**: `GameController.emitState` sends `onWorld` when
  `faceMapOf(state)` changes; `startGame` compares `terraformKey` and calls
  `renderer.reshape(map)` (setFace with `keepView`: camera, visit and selection kept, twin
  rebuilt). Ally planets apply `AllySnapshot.terraform`.
- Screenshots: set `s.buildings[0].level = 4`, push a monument level 2, push techs and
  `v.kikiwiwi = { since }` on `controller.state`, then `debugGrant`; `setTimeScale(4000)` ends a
  titan work in seconds. Restart Vite if a new shared export is "missing" (stale module graph).

## Stardust (chantier 13)

An infusion also costs `KIKIWIWI.stardust` (10), stored as the transform job's `paidDust` and
refunded with `paid` when the lab is demolished, and given back alone when the infusion fails.
The bot waits for it and for the next monument's stardust.

## Balance

- Bot: `titanOrders` (infusion of the safest level-5+ non-mayor when the juice allows it, then
  the Kikiwiwi guards and smashes rocks and wrecks), `labDecision` (lab when known, a stump when
  the queue is idle), `bestTile` skips obstacles. Milestones `lab`, `kikiwiwi`;
  `pnpm balance:ages` prints them.
- Reference (end of chantier 08): laboratory 123–134 h, first Kikiwiwi 144–166 h, Industry
  182–208 h for the active bot (2 seeds × 6 biomes × 12 days). Tune `KIKIWIWI.cost`, the bot's
  `JUICE_RESERVE`, lab costs and the `unnatural` tech costs.

## Alien traces (chantier 19, second half)

Obstacle kinds `ruin` (cleared by kiwis, loot) and `den` (`clearedBy: 'titan'`: a Kikiwiwi's
smash, or the guards' `raidDen`) are placed only on a sister colony (`generateTraces`, count 0
in `OBSTACLES`); `SMASH` has their costs. Each den standing makes the sister's waves 15 %
stronger. See `kiwar-colonies`.

## Fortifying a bridgehead (chantier 19)

A Kikiwiwi posted on a bridgehead of the twin (job `outpost`, sent by a reinforcement)
fortifies it: `fortifyBridgehead { sector }` (12 h, 400 juice, no terraform quota). The final
assault needs one fortified bridgehead. See `kiwar-colonies`.

## Juice canals (chantier 45)

- Builders, not Kikiwiwis: `data/canals.ts` `CANALS` (cap 3/6/10/15 by age, 80 pulp + 40
  fibre, 1 h, deposit × 0.4), `sim/canals.ts` (`canalError`, `fillError`, `canalCap`,
  `canalCount`, `canalsLeft`, `canalDuration`, `finishCanal`). Commands `digCanal` /
  `fillCanal` push queue items `canal` / `fill` (`buildingType: 'camp'`, unused) that hold
  their tile (`siteTiles`), completed in `completeConstruction` (the `advance` loop re-reads the
  map after constructions).
- A canal is `state.terraform[key] = 'canal'` (`TerraformTile` = `TerraformKind | 'canal'`):
  `applyTerraform` makes it juice with `Tile.canal`, and `canalFloods` makes the flesh around
  floodable in a flooding biome (never a terrace). `terraformLeft` (Kikiwiwis) ignores canals;
  `plausibleTerraform` (exported) checks both quotas.
- Never cut the land: `canalError` runs `cutsLand` on the queued canals + this tile (and, in a
  flooding biome, + the new floods with the old ones blocked), keeps a shore for buildings in
  the juice, refuses `wouldFlood` when a new floodable tile holds a building or a site.
- Fertile banks: `BANKS` (`data/territory.ts`), `isBank`, `mapTileDeposit` (deposits read on
  their map: a canal or a spring makes banks by itself).
