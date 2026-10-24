---
name: kiwar-threats
description: Kiwar threats and gifts from the sky (chantier 06) — predator waves (ferrets on the ground, bats in the air), small incidents, damage, repairs, shelter, seed turrets and the garrison, the shared wave forecast, meteorite deposits, the threat HUD, defense screen, wave show and sounds. Use when touching waves, defenses, incidents, meteorites or their UI.
---

# Kiwar threats (chantier 06)

Load `kiwar-sim` too: everything is deterministic and exact offline. Owner's rules: big waves
are announced 3–6 h ahead (chantier 31; 8–12 h before), incidents come without notice but stay minor, power grows with the
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
- Chantier 08: `THREATS.ageFactor` and `METEORS.ageFactor` (by `ageOf`), Nest factors and
  `TURRETS.max` extended to Nest 6; technologies scale turrets (`turretDefense`), guards
  (`guardPower(v, state)`: slingshots, firearms → warriors reach the bats) and injuries
  (armour). The monument is never damaged. See `kiwar-ages`.
- Chantier 08 (second half, `kiwar-titans`): a Kikiwiwi on guard reaches ferrets and bats
  (affinity 1 / 1, × `titanPower`: half when the juice is empty); fading craters leave wrecks
  (obstacles); meteorites never land on an obstacle.
- Turrets are buildings (`buildings.ts`): `seedTurret` (ground) and `skyTurret` (air), skin
  tiles only, `defense` + `ammo` per level; `isTurret`, `TURRET_TYPES`.

## Sectors and range (chantier 12)

- `data/threats.ts`: `SECTOR_IDS` (front, left, right), `FRONT_AZIMUTH` (π: the alien planet,
  shared with the client's `render/front.ts`; direction (sin a, cos a) in `hexToPixel`
  coordinates = world (x, z)), `SECTORS` (front ±60°, shares ground 60/20/20 and air
  40/30/30, `overflow` 0.5, `range` by level 3/4/5 then 5, `skyRangeBonus` +1).
- `sim/threats.ts`: `rampartSectorOf(h)` (angle around the heart; d > 0 = left, i.e. the
  left of the default camera looking at the front), `rampartSectors(map)` and
  `turretCoverage(map, type, level, h)` (share of covered rampart tiles per sector, memoized
  per map object), `coveredRampart` (3D rings), `turretRange`, `sectorThreat`,
  **`sectorClash(threat, defense.sectors)`** (excess per sector; half of it turns to the least
  defended _other_ flank where the spare defense can stop it).
- `defenseOf` returns `sectors` and `guards` ({id, sector}): turrets split by coverage (ammo
  share and tech applied), militia fills the ground gaps first (rest by the ferret shares),
  then each guard goes to the sector with the biggest gap it can fill (else the thinnest
  margin). Without a threat, an even threat {1, 1} is used for the allocation.
- `waveOutcome(state, threat, defense: Defense, sheltered)` uses the clash (`through`) for
  the severity; `forecastWave` odds use the same clash at ±luck. `WaveOutcome.sectors` for
  the UI. Reports keep totals only (no save change).
- Consequence for tests and the bot: an undefended flank always leaks a little. Test helpers
  `middleOf` / `rampartAt` in `threats.test.ts` place turrets by sector.

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
  turrets facing it count and need seeds), `protectedStock`. Since chantier 36 the outcome
  comes from a battle (`battleOutcome`, `forecastWave`, `waveAhead`: see `kiwar-battle`).
- `advance.ts` loop: `planWave(s)` and `planMeteor(s)` at the top of every iteration (they act
  only when nothing is planned, which changes only at events, so big step = small steps);
  `nextThreatEvent` / `threatTick` (announce, strike, incident, shelter end), `nextInjuryEnd` /
  `healInjuries`, `nextSkyEvent` / `skyTick`. The strike spends the seeds (`ammoUsed`), loots,
  damages (weighted by level, never the Nest or camps), injures (weighted by exposure, guards
  more), kills at most one kiwi on a lethal wave, sets the shield on a defeat. A solo colony
  joining a universe gets a 48 h shield too (`shieldArrival`, chantier 14, see `kiwar-online`).
- `workforce` returns 0 during a shelter and × `damagedWork` for a damaged building.
- Meteorites (`sim/sky.ts`): since chantier 15 a crater is a **temporary post** (job `meteor`,
  `METEORS.slots` places; see `kiwar-tasks`): `meteorRate(state, m)` = rate × miners' work ×
  logistics × hour/season × drill; no camp on a crater and no producer share any more;
  `computeFlows` drains it like a pool (dry-out time in `nextChange`), `accrue` integrates it.
  No climate, no regrowth.
- Chantier 15: automatic repairs (`orderRepairs`) and garrison (`fillGarrison`, 40 min before a
  strike, an `advance` event `autoGarrisonAt`; lent guards go back after it) in `sim/tasks.ts`.
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
  guards patrol their sector and everybody hides in the Nest during a shelter (`render/kiwis.ts`),
  `render/meteors.ts` (star over a target ring, crater with glowing rock), `render/predators.ts`
  (`PredatorShow`: played by `GameRenderer` when a `waveStruck` arrives live, from the report).
- Toasts in `game/events.ts`, offline summary lines (waves, meteorites, incidents), sounds
  `threat.warning|strike|victory|defeat`, `turret.fire` (via `renderer.onTurretShot`),
  `meteor.fall`. i18n: `threats`, `defense`, `garrison`, `sky`, `buildings.seedTurret|skyTurret`.
- Chantier 34: the wave show poses ferrets and bats with `CreatureRig`
  (`render/anim/creatures.ts`: clips run/bite/hit/hurt/fall and flap/dive/spit/hurt/fall,
  look by `ageOf`), stars where one is hit, feathers where one bites (`particles.effect`);
  `PredatorShow.playing` stays true while its particles live. 3D guards make a round in
  their own sector (`defenseOf(state).guards`, see `kiwar-client`). Quick look without a
  wave: `renderer.predators.play(state, { id, victory: false, severity: 0.45, threat:
{ ground: 7, air: 5 } })` then `predators.update(0.05)` × N.
- Chantier 12: `SectorTable` in the defense modal (also without a wave, via
  `ui/derived.ts` `defenseNow`), the badge names the weak sector, `TurretReach` (range and
  sectors) in the turret sheet and build option, `render/sectors.ts` colours (front orange,
  flanks yellow) for the range ring (`SelectionView.setCatchment(tiles, colors)`) and the
  placement tiles; `predators.ts` picks a sector by the shares, ferrets from its rampart,
  bats from the sky above it.
- Screenshots: force a wave with `controller.state.threats.next = { id, announceAt: now - 1,
at: now + 3000, announced: true, ground, air }` then a `debugGrant` dispatch; the show plays
  when it strikes. A crater: push into `controller.state.sky.meteors`.

## Waves awakened (chantier 31)

- `THREATS`: protection 7 h of play (+ Nest 2), interval 12–18 h, notice 3–6 h (`starWatch`
  +2 h), `perDay` 0.12. `wealthFactor(state)` (`THREATS.wealth`): 1 + 0.4 × storage filled
  (stock + reserves over the capacity, ≤ 2) + 0.25 × ln(1 + building levels / 10) + 0.15 ×
  ln(1 + kiwis / 5), read at the announcement (exact offline: an event).
- Loot: `WaveOutcome.lootReserve` — the warehouse reserves are not protected and are taken
  first (warehouse after warehouse, `reserveHolders` order), then the stock above
  `protectedStock`. Bringing the reserves back (`collectAll`) before the strike moves them
  into the stock, partly protected: the main answer of the notice.
- `stats.wavesHeld` counts the waves repelled (objectives of chantier 31).
- Defense window: `WaveActions` ("Before the strike": bring back, seeds short, guards, a
  turret more, repairs) above the shelter box; the next step of the objectives panel points
  to the defense when the forecast is not `likely`.
- Bot: `play.prepared` (attentive) reads the forecast for turrets and shelter; the occasional
  profile only reacts to a lost wave. `RunResult.final.wavesHurt` / `waveLoot`, table
  "Waves by profile" in the ages section of the report.
- Long tests that are not about waves: clear `threats.next` and set `shieldUntil` far ahead
  (the first wave now comes at 7 h).

## Meteoric iron (chantier 38)

Craters now hold mostly **meteoric iron** (skill `kiwar-forge`): `Meteor.iron` / `ironMax`,
`meteorStock` × `IRON.resourceShare` for the old gift, iron rates read in `computeFlows`,
`craterWorth`, at most a quarter of the colony sent by the automation, wrecks give iron, a
star always lands on a free tile when one exists. Turrets from level 3 cost iron.

## Comets (chantier 13)

The other gift from the sky, comets and their stardust, is in the `kiwar-sky` skill (their
own RNG stream). Star techs: `starWatch` adds `techEffects.waveNotice` to the wave notice in
`planWave`, `starIron` multiplies `meteorStock`. Dust tiles never land on a crater, and the
pickers stop during a shelter.

## Balance

- Bot (`tools/balance/src/bot.ts`): repairs first, one turret of each model after the Nest 2,
  then (chantier 12) a new turret of the leaking model when the announced wave would break
  through somewhere at bad luck and a sector has no turret of that model (else an upgrade),
  placed where `turretCoverage` × share / existing defense is best; guards posted 40 min
  before a strike one by one, each time the kiwi that stops the most of what breaks
  through; shelter when deaths or several injuries are still expected. `RunResult.final`
  has `waves`, `wavesLost`, `predatorDeaths`, `meteors`; the report adds a table per biome.
- To retune: `THREATS.basePower`/`perDay`/`nestFactor` (pressure), turret `defense`/`ammo`,
  `GARRISON.power`, `METEORS.stock`. Check the milestones stay within ±10 % between biomes.

## Waves played as battles (chantier 36)

Since chantier 36 the strike and the forecast go through the battle engine — see the
`kiwar-battle` skill. In short: `waveOutcome` is gone; `battleOutcome(state, threat, defense,
sheltered, log)` reads a journal; `strike` applies `log.result` (loot where it was taken,
damaged buildings, trampled struck paths, fallen kiwis hurt, one death at most on a real
defeat via `lethalWave`); `forecastWave` runs three practice battles (cached) and `waveAhead`
is its cheap part. At the announcement a wave gets `squads` and `gates` (one rampart tile per
sector where its pack comes in); with an announced wave `defenseOf` counts a turret only for
the sectors whose gate it reaches (`gateCoverage`), pinned guards (`threats.pins`) first. The
old `PredatorShow` is replaced by `render/battle/BattleShow.ts`. Victory = nothing damaged and
at most `THREATS.holdLoot` of what lay in the open carried away. During a shelter the guards
still fight (and may be hurt); the other kiwis are not in the battle.

## Counter-attacks of the siege (chantier 19)

The aliens of the twin strike our bridgeheads there (not the colony): announced 6 h ahead,
strength hidden, resolved by the server — see `kiwar-colonies`. They never touch the colony's
waves (own schedule, hash RNG).

## The last aliens (chantier 19, second half)

`wavePower` × `sisterThreat(state, at)`: in a sister colony waves start at ×0.5 and reach
full power 96 h after the founding (`COLONY.rampStart`, `rampMs`), × (1 + 0.15 × ferret dens
standing); `newSister` sets a 48 h shield. Dens fall to `raidDen` (guards, foreseen) or a
Kikiwiwi. See `kiwar-colonies`.
