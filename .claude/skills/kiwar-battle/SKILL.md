---
name: kiwar-battle
description: Kiwar battle engine (chantier 36) — the pure deterministic engine (`simulateBattle(setup, seed) → BattleLog`), unit data (weapons, predators, kiwi stat factors, postures), the AI by roles (raider, guard, militia, turret), the compact journal and its codec, waves played as battles (squads and gates at the announcement, `waveSetup`, `battleOutcome`, the strike, the three practice battles of the forecast), the 3D show (`render/battle/`: timeline, BattleShow, gate markers), the battle bar and unit card, the held outcome of a live wave. Use when touching battles, waves' resolution or forecast, unit profiles, the show or its UI, and for the landings of chantier 40.
---

# Kiwar battle (chantier 36)

Load `kiwar-sim` (determinism, exact offline) and `kiwar-threats` (waves, sectors, turrets,
garrison) with it; `kiwar-client` for the show. One engine serves the waves at home (here) and
the landings on the twin (chantier 40).

## Golden rules

- **Pure and deterministic**: `simulateBattle(setup, seed)` reads nothing but its setup (plain
  data, no `GameState`) and its seed (`createRng('battle/' + seed)`). Same setup + seed = same
  journal on the server, the phone and the bot (test in `test/battle.test.ts`).
- **The journal is what happened.** The game applies `log.result`; the client replays the
  journal and **never recomputes** a battle. Online, the server's advance computes it (hidden
  data stay server-side for the landings of chantier 40).
- **Budgets**: 60 against 60 ≈ 16 ms and ≈ 15 kB of JSON (test). Five journals stay in the
  reports (`THREATS.history`): the threats JSON stays < 150 kB (test). `cloneState` shares the
  journals (they are never mutated).
- **Repairable at home**: fallen kiwis are hurt (`injured`); one death at most, only on a real
  defeat (`lethalWave`: threat > `deathRatio` × defense sums, not sheltered, > `minKiwis`), and
  it is the first kiwi that fell. At most `THREATS.maxDamaged` buildings are damaged (the
  engine spares the others: `setup.maxDamaged`); Nest, camps and the monument never are.
- Cute impacts only (stars, feathers, sparks, puffs, gold), never blood.

## Data (`data/units.ts`)

- `WEAPONS` (damage, range in tiles, reload s, melee / ranged / area, accuracy, hitsGround,
  hitsAir): kiwis `beak`, `mace` (builder), `sword` (warrior), `fireball` (mage: area, reaches
  bats), `sling` (scout), `musket` (warrior with firearms), `stomp` (Kikiwiwi: area); predators
  `claw`, `bite`, `slam`, `dive`, `spit`; turrets `seedShot` / `skyShot` (damage set from the
  turret's defense × `TURRET_SHOT` × tech, range `turretRange`, shots = ammo × seed share).
- `ENEMIES`: `soldier`, `scout` (fast thief, never fights back), `brute` (2 places, armour),
  `diver`, `spitter` (hunts kiwis): hp, armour, speed, dodge, size, power (threat points),
  carry, fightsBack, huntsKiwis. `WAVE_UNITS` splits a wave's power by kind and age.
- `KIWI_UNIT`: stat factors — Strength → damage, Endurance → hp, Agility → speed and dodge,
  Dexterity → aim of ranged weapons, Spirit → fireball damage; per level; √`modifiers.fight`;
  militia (kiwis at work) peck at ×0.8, stay within 1 tile and run home under 40 % hp.
- `BATTLE`: dt 0.5 s, maxS 240, tileCap 3, leash by posture (`cautious` 3 tiles from the post,
  `bold` anywhere), splash, grab, carry (a pack carries 1.2 × what lies in the open), retreat
  under 30 % power, unstick 2 s, gather 2 s (a pack waits at its gate), maxGround 36 / maxAir 24, building hp 30 + 10 × level.

## Engine (`battle/`)

- `types.ts`: `BattleSetup` (tiles with walk cost, exits, buildings with hp / loot / priority,
  units, orders per side, maxDamaged), `BattleUnitSetup`, `BattleResult` (held, lootable, loot
  by building, damaged, fallen / fled refs, attackers fallen / escaped, reached, struck tiles,
  shots by turret), `BattleLog` (`units` and `buildings` as tuples, `events` string), `EV` codes
  and `EV_ARGS`, `tileCode` / `tileOfCode` (q, r packed; independent of the map's tile order).
- `simulate.ts`: grid from the setup (building tiles are walls), lazy Dijkstra fields per
  building and to the exits, ground units take places on tiles (squeeze through or step aside
  after `unstick`), bats fly straight. Roles: **raider** (fight back if engaged; spitters hunt
  kiwis; else the building with the best (3 + priority if it can still carry loot, + priority if
  it can break it) / (1 + walk / 4); full or fleeing → nearest exit), **guard** (nearest enemy
  its weapon reaches within leash + range of its post, shooters take bats first), **militia**
  (same, leash 1, flees hurt), **turret** (fixed, ammo, fires at half rate once its building is
  damaged). A raider killed with loot drops it; one that escapes takes it away.
- `codec.ts`: events as base-64 varints (`encodeInts` / `decodeInts` / `decodeEvents`).
- `units.ts`: `kiwiUnit(v, state, role, at, sector)`, `enemyUnit(kind, k, …)` (k scales hp and
  damage by √k), `turretUnit(b, state, ammoShare, index)`.

## Waves as battles (`battle/wave.ts`, `sim/threats.ts`)

- At the announcement (`announce`): `wave.squads = waveSquads(state, sides)` (no draw) and
  `wave.gates = waveGates(state, wave.id)` (hash of the wave: one rampart tile per sector,
  the mean of three draws around its middle, `gateOdds` gives the law; no draw from the colony's streams). Migrated waves get both at
  the strike.
- `waveSetup(state, wave, announced, { luck, sheltered, roughLoot })`: every face tile (rampart
  tiles walkable at cost 3 for the climb down), all buildings (`state.buildings` order = setup
  order), loot = `lootShare` × (warehouse reserve + its share of the unprotected stock), packs
  round-robin over the free rampart tiles near their gate (`packWidth`), staggered entries,
  `hold` (the pack gathers at its gate until its last member is in + `gather`: the turrets and
  guards there get their chance),
  turrets facing the threat, guards at posts in their sector (pin, else `defenseOf().guards`)
  sorted by distance to the gate, militia next to their workplace (none during a shelter).
- `strike`: luck and a seed drawn from `withThreatRng`, `waveBattle`, `battleOutcome` (victory =
  nothing damaged and loot ≤ `THREATS.holdLoot` (35 %) of `lootable`; severity = `reached`),
  then loot per building (reserve first), damage, trampled paths (struck tiles that were paths,
  ≤ `maxPathsLost`), fallen → injured / one death, seeds = shots fired, report with `log`.
- `forecastWave`: three practice battles at luck 1.15 / 1 / 0.85 with seeds `wave.id/trial/i`
  (never the strike's), loot rounded to two digits; odds likely (held at bad luck) / uncertain /
  unlikely; `expected` = the average battle; cached on `JSON.stringify(setup minus tiles)` +
  map, paths, season keys (16 entries). **`waveAhead`** gives the cheap part (wave, threat,
  defense, shelter): use it when the battles are not needed (shelter command, the bot).
- `defenseOf(state, threat)` with an announced wave counts a turret for the sectors whose gate
  it reaches (`gateCoverage`); pinned guards (`threats.pins`) go to their sector first.
  `uncoveredGates(state, wave)` lists the packs no turret of the right model reaches.
- Commands `setPosture` and `pinGuard` (`notGuard`); pins of kiwis no longer on guard are
  dropped after a strike. Save v28 (`posture`, `pins`, optional `squads`, `gates`, `log`).

## Client

- `render/battle/timeline.ts` (no three.js, tested): `buildTimeline(log)` → one track per unit
  (steps, strikes, hurts, enter, end, flee) + `damagedAt`; `placeAt`, `hpAt`, `strikeAt`,
  `shownAt`. Duration = fight + 2 s tail.
- `render/battle/BattleShow.ts`: `play(state, report, from)`, `seek`, `speed`, `skip`, `pick`,
  `info(index)`; kiwis through `KiwiRig` (weapon clips peck / mace / sword / spell / sling, hurt,
  fall), predators through `CreatureRig`, projectiles (`SHOTS`), `EFFECTS` (new: `fireball`,
  `loot`), health bars (two instanced quads facing the camera), selection ring. Events crossed
  in play fire impacts; a seek or a jump > 1.5 s fires none.
- `GameRenderer`: a live `waveStruck` (< 20 s) plays from `now − at`; `playBattle`,
  `battleSeek`, `battleSpeed`, `battleSkip`, `battleSelect`, `battleUnit`; a tap picks a unit
  before a tile; the battle's kiwis leave `KiwisView` (`setHidden`), damaged buildings stay
  masked until their blow (`BuildingsView.maskDamaged` / `unmask`); callbacks
  `onBattleStart/Tick/End/Unit` feed `ui/battleStore.ts` (out of the main store).
- `game/battleOutcome.ts`: a live wave's toast, unread badge and victory/defeat sound wait for
  the end of its show (`isLiveWave`). Known leak: the automation may queue a repair at once.
- UI: `BattleBar` (clock, rewind, ×1/×2/×4, skip; unit card: name or kind, side, level, health,
  weapon, equipment to come in 38), "Watch the battle" in each report and the phone menu,
  `WavePlan` (packs by sector), `PostureChoice`, a sector picker per guard, gate hints in
  `WaveActions`; `render/battle/gates.ts` pulses the gates on the rampart.
- Visual checks: a seeded colony (`perfSave.ts`), force `threats.next` to strike in 1.5 s, wait
  for `renderer.battle.report`, `renderer.battleSeek(t)`, `renderer.battle.speed = 0`, focus the
  camera on the enemies of the timeline, screenshot (see the scripts described in the chantier
  document). For the defense window, let the sim announce (`announceAt: now + 500`).

## Bot

- `bot/economy.ts` `bestTile` places turrets where the gates fall most often and no turret of
  that model reaches yet (`gateOdds`).
- `bot/defense.ts`: a prepared bot builds the missing turret next to an uncovered gate (any
  rampart tile within level-1 range), switches the posture to bold while a ground gate stays
  open, reads `waveAhead` for ammo and turrets and the full forecast only when it may shelter.

## Chantier 40 (landings)

Reuse the engine with the attackers as side 1 = our crew and the aliens' buildings as side 0
(or swap the roles of `raider` / `guard`); the retreat threshold is already an order of each
side; keep the journal in the expedition report and replay it with `BattleShow`.
