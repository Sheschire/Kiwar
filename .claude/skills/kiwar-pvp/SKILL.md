---
name: kiwar-pvp
description: Kiwar optional PvP (chantier 57) — universes created with `pvp` on, the targets (other members' home colonies, `state.pvp.targets`), protections (beginner, shield, absent, daily cooldown; attacking ends one's own), the command `raidPlayer` (mission `pvp`), the attack written into the target's state (`pvp.incoming`, crew units and seed hidden by `publicState`) and played there as a wave (`raidWave`, `comingWave`, `strike`), the server's two idempotent writes (`announcePvp`, `settlePvp`), the attacker's fate (`applyPvpResult`, landing rules), capped loot, the table `pvp_battles` and the chat lines, the PvP planner and the defence window, the feat `pvpHeld`, the PvP probe. Use when touching anything about players attacking each other.
---

# Kiwar PvP (chantier 57)

Load `kiwar-online` (server, repository, SQL), `kiwar-battle` (the wave engine) and
`kiwar-threats` (waves, defence window) with it. Decisions in `docs/DECISIONS.md` ("Chantier 57").

## Golden rules

- **Only in `pvp` universes** (`universes.pvp`, chosen at the creation: `createUniverse { pvp }`;
  `UniverseRow/UniverseSummary.pvp`). `withScopeTargets` sets `state.pvp.on` and
  `state.pvp.targets` (`pvpTargetsOf`: every other member's **home** colony, id
  `ally:<user id>`; a sister colony attacks nobody and is never a target). Solo: off.
- **The defence never loses a kiwi**: `strike` forces `deaths = 0` for a raid, `forecastWave`
  too. It loses capped reserves/stock, wounded and repairable damage.
- **Every attack is announced** at the departure (the flight is the notice, ≥ 2 h, no
  breakdown) with at least the usual answers: guards on the side, a seed turret at the gate,
  `collectAll`, the shelter (the raid is a `comingWave`).
- **The target's truth stays at the server**: the attacker's responses never carry the target's
  state; the target never gets the crew's units nor the seed (`publicPvp` in `publicState`).
  Extend `test/pvpServer.test.ts` for any new action touching another player's game.

## Data (`data/pvp.ts`, `PVP`)

travel (90 + 60 min × distance, min 2 h), `shieldMs` 24 h, `beginner` (age 1 and 72 h),
`absentMs` 3 days, `cooldownMs` 24 h, `loot` (reserve 0.5, stock 0.1 above `protectedStock`),
`powerSpread` 0.2, `minCrew`, `keepMs`/`keep` (ends kept for the attacker), `activeStepMs`
(1 h refresh of `lastActiveAt`). `PvpGuard` = `beginner | shield | absent`.

## State (save v46)

`state.pvp: PvpState` — `on`, `targets: PvpTarget[]`, `attacked` (we launched: our beginner
protection is over), `shieldUntil`, `lastActiveAt` (server-set), `incoming: PvpRaid[]`
(public: from, owner, departedAt, at, crew, classes, power range, sector, gate, retreatAt,
hold; hidden: `units`, `seed`), `defended: PvpDefense[]` (id, at, held, loot, lost refs,
escaped, log, `turnedBack`), `lastAttackOn`. `stats.pvpHeld`, `Expedition.pvpSector`,
`PlannedWave.pvp` (raid id), `WaveReport.from: 'pvp'` + `by`. The schema accepts `units` as
loose records (written by the server only).

## Simulation (`sim/pvp.ts`)

- `pvpGuardOf(state, now)` (what the server reads on the **target's** state), `GUARD_ERRORS`.
- `pvpLock` / `pvpForecast` / `launchPvp` (command `raidPlayer`: pad, crew, provisions,
  `sector`, orders posture + retreatAt; fee = `launchCost(…, 'land')`); sets `attacked` and
  `lastAttackOn`. Errors `notPvp`, `unknownPvpTarget`, `pvpBeginner`, `pvpShielded`,
  `pvpAbsent`, `pvpCooldown` (FR/EN in `errors.*`).
- `crewUnits` (kiwiUnit side 1 → raider, power 1, hunger), `unitPower` = √(dps × hp),
  `crewPower`; `pvpRaidOf(attacker, e, defender, {id, from, owner, seed, shift})` freezes the
  crew (refs prefixed `<raid id>:`), the range and the hold.
- `raidRaiders(raid, luck)`: the units (truth) or estimated kiwis of the announced classes at
  average stats scaled to the range's middle × luck (the target's forecast).
- `raidWave` / `comingRaid`: the raid as a wave; `waveSetup` places the crew around the gate of
  its side, carry capped by `hold`, PVP loot shares, `orders[1].retreatBelow = retreatAt`,
  `setup.trackLost` (fallen attackers in `result.lost`). `uncoveredGates` and `defenseOf`
  (`sectorThreat` focus) treat it as one ground pack on one side.
- `pvpHeld(raid, log)`: the defence held = nothing damaged and loot ≤ `PVP.heldLoot` of
  min(hold, lootable) — not the wave's 35 % rule; `strike` and `forecastWave` use it.
- `nextPvpEvent` (only raids with units) → `pvpTick` (a shield raised meanwhile turns it back:
  `turnedBack`) → `strike` (pvp branch: shield, `pvpHeld`, `recordDefense(pvpDefenseEnd)`,
  no change to `threats.waves` / `lastWaveAt` / `next`; event `waveStruck { pvp: true }`).
- `pvpDue` / `pvpAwaited` in `hiddenDue` / `awaitingServer`; `canResolveArrival` is false for
  `pvp` ships (only the server tells); `pvpWaiting` lists ships waiting for news.
- `applyPvpResult(attacker, e, end | null)`: null or `turnedBack` → aborted, back home;
  `pvpOutcome` victory (target did not hold) → fallen wounded (`result.injured`), retreat /
  defeat → dead with their gear, defeat → launchpad damaged, `shipLost`.
- `forgetPvp` on imports.

## Server (`server/pvp.ts`, `gameService.ts`)

- `command raidPlayer`: `notPvp` outside a PvP universe; the target's game read for
  `pvpGuardOf`; after the save `announcePvp` (retries, idempotent by raid id `attacker/ship`).
- `load`: `settlePvp` first (for each ship waiting: `resolveAtTarget` advances the target to
  the raid's hour and saves it, then `applyPvpResult` at the arrival + an `expeditionArrived`
  event `mission: 'pvp'`); then the usual hidden loop (the target's own load plays its raids).
- `notePvpBattles` writes `pvp_battles` rows (`battlesPlayed`: new `defended` entries) after any
  save of a defender's state (load, command, settle). `repo.recordPvpBattle` (memory, Supabase:
  missing table ignored, mock route `/rest/v1/pvp_battles`).
- `staleActivity` → `pvp.lastActiveAt` on load/command. `colonyPower(s, now, pvp)` gives allies'
  `pvpGuard` / `pvpUntil`. `villageView` empties `pvp` lists.
- SQL `20261110000000_pvp.sql`: `pvp_battles` (members read, function writes, realtime).

## Client

- `UniverseModal`: the PvP box at creation, PvP tags. `VisitBanner`: "Land on this colony"
  (`actions.prepareRaid`), `PvpModal.tsx` (`modal: 'pvp'`, store `pvpTarget`; `pvpBlock`
  explains a protection or the cooldown; `OrdersPicker pvp`).
- Defence: `RaidLine` in `DefenseModal` (who, classes, range, side, what can be lost), badge
  "Attack by …", shield line, reports "Attack by …"; `game/pvpWatch.ts` toasts a new raid
  (no event reaches the target for the announcement); toasts `pvp.toast.*`.
- `ReportModal` pvp branch (outcome, loot, `LandingReplay`), `ExpeditionsPanel` label,
  `ShipsView` (a PvP ship never flies to the twin), chat `BattleLine` (`chatBattles`).
- i18n section `pvp` (FR/EN).

## Leagues and bot

- Feat `pvpHeld` (tiers 1, 5, 15, 40, group conquest); pillages count for nothing.
- `pnpm balance:pvp [--seeds 6] [--days 12]` (`tools/balance/src/pvp.ts`): two attentive bots
  played apart, snapshots at days 4–12, attacks under the real rules (the defender brings its
  reserves back an hour before). Slow: ~6 min per pair and 6 days. End of chantier 57 (3 pairs,
  days 4–10): every attack held, 4–5.3 of 6 attackers dead, no loot, no defender hurt (the
  turrets stop a crew before it reaches a building).
