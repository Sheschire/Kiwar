---
name: kiwar-threats
description: Kiwar threats and gifts from the sky (chantier 06) — predator waves (ferrets on the ground, bats in the air), small incidents, damage, repairs, shelter, seed turrets and the garrison, the shared wave forecast, meteorite deposits, the threat HUD, defense screen, wave show and sounds. Use when touching waves, defenses, incidents, meteorites or their UI.
---

# Kiwar threats (chantier 06)

Load `kiwar-sim` too: everything is deterministic and exact offline. Owner's rules: big waves
are announced 8–12 h ahead, incidents come without notice but stay minor, power grows with the
colony × play time (× expedition victories: the aliens strike back), beginners are protected,
**a colony is never razed**.

## Data

- `data/threats.ts`:
  - `THREATS` — protection (24 h of play **and** a level-2 Nest), interval 20–28 h, notice
    8–12 h, shield 24 h after a defeat, power (`basePower` × `nestFactor` × (1 + `perDay` ×
    days, capped `maxDays`) × (1 + `perVictory` × victories, capped)), `airShare` night/day,
    `season` (winter ferrets, summer bats), `spread` (announcement) and `luck` (strike),
    `militia`, deaths (`deathRatio` 2×, `minKiwis` 4, `maxDeaths` 1), injuries (share, 2–6 h),
    loot share of the unprotected stock, `protectedShare` (Nest 30 %, Warehouse 60 % of their
    storage), `maxDamaged`, `maxPathsLost`, `damagedWork` 0.5, repair cost/time shares.
  - `TURRETS.max` by Nest level (2/4/6), `GARRISON` (power, class affinities: warrior ground
    only, mage and scout reach the bats, others weak on the ground and nothing in the air;
    guards are 1.5× more exposed), `SHELTER` (45 min before → 15 min after), `INCIDENTS`
    (first at 4 h, then every 5–11 h: thief, bat, storm), `METEORS`.
- Biomes multiply ferrets/bats (`BIOMES[b].threats`, chantier 05).
- Turrets are buildings (`buildings.ts`): `seedTurret` (ground) and `skyTurret` (air), skin
  tiles only, `defense` + `ammo` per level; `isTurret`, `TURRET_TYPES`.

## State (save v10 threats, v11 sky)

- `GameState.threats`: own RNG stream (`withThreatRng`, never the colony's `rng`: adding draws
  must not change hatching or level-ups), `next` (`PlannedWave`: planned → announced with
  ground/air), `lastWaveAt`, `shieldUntil`, `shelterUntil`, `nextIncidentAt`, `waves`,
  `reports` (5) and `incidents` (8). `newThreats` draws nothing (first incident at a fixed time).
- `GameState.sky`: `next` fall (first one planned in `newSky` without a draw, so that advancing
  by 0 ms changes nothing), `falls`, `lastFallAt`, `meteors` (craters: stock, max, expiresAt).
- `Building.damaged`, jobs `guard` and `injured { until }`, memorial cause `predator`, queue item
  kind `repair` (`pendingUpgrade` returns upgrades **and** repairs).

## Simulation

- `sim/threats.ts`: `wavePower`, `waveMix`, `defenseOf(state, threat?)` (turrets × ammo share,
  damaged at half; garrison `guardPower`; militia of working/idle kiwis; with a threat only the
  turrets facing it count and need seeds), `protectedStock`, **`waveOutcome`** (severity =
  unstopped threat / total; damage, loot, injuries, deaths, trampled paths) used by both
  **`forecastWave`** (UI, average luck, odds likely/uncertain/unlikely) and the strike.
- `advance.ts` loop: `planWave(s)` and `planMeteor(s)` at the top of every iteration (they act
  only when nothing is planned, which changes only at events, so big step = small steps);
  `nextThreatEvent` / `threatTick` (announce, strike, incident, shelter end), `nextInjuryEnd` /
  `healInjuries`, `nextSkyEvent` / `skyTick`. The strike spends the seeds (`ammoUsed`), loots,
  damages (weighted by level, never the Nest or camps), injures (weighted by exposure, guards
  more), kills at most one kiwi on a lethal wave, sets the shield on a defeat.
- `workforce` returns 0 during a shelter and × `damagedWork` for a damaged building.
- Meteorites (`sim/sky.ts`): `meteorRate(m, harvests)` — a camp on the crater picks it at the
  camp rate of its resource, a producer of the same resource reaching it takes
  `producerShare` of its base rate, on top of their usual harvest; `computeFlows` drains it like
  a pool (dry-out time in `nextChange`), `accrue` integrates it. No climate, no regrowth.
- Commands: `shelter` (`noWaveSoon`, `alreadySheltered`), `repair` (`notDamaged`,
  `alreadyRepairing`), `setGarrison { villagerIds }` (exact list; relieved guards go back via
  `autoAssign`), turret placement (`notOnRampart`, `turretLimit`; `isRampart`, `turretCount`,
  `turretLimit` in selectors; turrets are outside `buildingCount`). `isPlausible` checks the
  turret cap.
- Tests: `test/threats.test.ts` (protection, notice and interval, passive week never razed,
  big step vs small steps — pool stocks compared within rounding, forecast vs resolution,
  shelter, repair, injuries, incidents, turrets and ammo, affinities, a defended colony wins,
  meteorites with a camp, migrations v9 → v10 → v11).

## Client

- `ui/components/DefenseModal.tsx`: `ThreatBadge` (in `.badge-stack` under the top bar with
  the speech and hunger badges: countdown + odds, shelter, unread report) and `DefenseModal`
  (side cards with breakdown, seeds, expected losses, shelter button, garrison picker, last
  reports, incidents). Shield button in `TopBar`; store `modal: 'defense'`, `unreadWave`.
- Kiwi sheet: Garrison section (`VillageModal.tsx`). Tile sheet: turret defense/ammo/cap,
  rampart-only build options, `RepairBox`, `MeteorLine` (crater or incoming star).
- Render: turret models (`buildingModels.ts`), damaged badge + smoke (`buildingLife.ts`),
  guards stand by a turret and everybody hides in the Nest during a shelter (`render/kiwis.ts`),
  `render/meteors.ts` (star over a target ring, crater with glowing rock), `render/predators.ts`
  (`PredatorShow`: played by `GameRenderer` when a `waveStruck` arrives live, from the report).
- Toasts in `game/events.ts`, offline summary lines (waves, meteorites, incidents), sounds
  `threat.warning|strike|victory|defeat`, `turret.fire` (via `renderer.onTurretShot`),
  `meteor.fall`. i18n: `threats`, `defense`, `garrison`, `sky`, `buildings.seedTurret|skyTurret`.
- Screenshots: force a wave with `controller.state.threats.next = { id, announceAt: now - 1,
at: now + 3000, announced: true, ground, air }` then a `debugGrant` dispatch; the show plays
  when it strikes. A crater: push into `controller.state.sky.meteors`.

## Balance

- Bot (`tools/balance/src/bot.ts`): repairs first, one turret of each model after the Nest 2
  (more or upgraded after a lost wave), guards posted 40 min before a strike to close the gap
  (bats first), shelter when deaths or several injuries are still expected. `RunResult.final`
  has `waves`, `wavesLost`, `predatorDeaths`, `meteors`; the report adds a table per biome.
- To retune: `THREATS.basePower`/`perDay`/`nestFactor` (pressure), turret `defense`/`ammo`,
  `GARRISON.power`, `METEORS.stock`. Check the milestones stay within ±10 % between biomes.
