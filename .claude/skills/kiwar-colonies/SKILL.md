---
name: kiwar-colonies
description: Kiwar colonisation of the twin face (chantier 19) — the siege (Iron age + a Kikiwiwi), the hidden holds and ferret queen drawn from the garrison's secret seed, deep reconnaissance, assault / reinforce / final / retreat missions, bridgeheads and the `outpost` job, announced counter-attacks resolved by the server, fortification by a Kikiwiwi, the final assault (ground and air), the conquered face, the Siege screen, the siege show and the flags on the twin; later the second colony. Use when touching the siege, bridgeheads, counter-attacks, the queen, the conquered twin or the second colony.
---

# Kiwar colonies (chantier 19)

Load `kiwar-sim` (exact offline), `kiwar-expeditions` (anti-cheat, missions, intel),
`kiwar-online` (server), `kiwar-titans` (Kikiwiwis) and `kiwar-client` (UI) too.

## State of the chantier

First half done (siege and final assault, no SQL). Second half left (second colony, links,
its threats, 3D staging, bot): see "Reste" in `docs/chantiers/19-colonisation.md`.

## The truth stays hidden

- `siegeTruth(g)` (`sim/siege.ts`) derives the holds of the 6 outer sectors (`SIEGE.outerSectors`
  = INTEL sectors 6–11), the queen's inner sector (0–5) and her ground / air power from
  `g.seed` (`<garrison seed>/siege`), memoized, **never stored**: no new hidden field, the
  client cannot compute it. Everything grows with `siegeGrowth(g, at)` (the garrison's own
  rate and ×2 cap; game days are short, so the cap is reached by the Iron age).
- Anything that reads it (assault and final landings, counter-attack strikes) runs only where
  `state.aliens[twin]` is: the server online, the client in solo. Reinforcements read nothing
  hidden (`canResolveArrival` lets them through).
- The client knows a fight is due: `counterAwaited` / `awaitingServer` (aliens.ts) make
  `GameController` poll `load`, and `load` advances to `hiddenDue(state, now)` (outbound
  landings + a due counter-attack). Tests scan responses for `"aliens":{` and seeds.

## Data and state

- `data/siege.ts` `SIEGE`: `minAge` 2, bridgeheads 3 max / 2 needed, hold base and spread,
  queen (ground, air, spread, −15 % per bridgehead, −10 % beside her lair, ≤ 90 %),
  `holdBonus` 1.2, counter (20–30 h, 6 h notice, share 0.5–0.9, +10 % per counter up to ×2),
  `fortify` (12 h, 400 juice, ×1.5), `fallLosses` 0.5–0.9.
- `GameState.siege: SiegeState` (save v22): `bridgeheads` ({ sector, since, holders,
  fortified, fortifyUntil?, fortifierId? }), `counter` ({ id, sector, announceAt, at,
  announced } — public), `counters`, `lastCounterAt`, `reports` (5), `conqueredAt`.
- `IntelReport.siege?: SiegeIntel` ({ seen, holds: { [sector]: DatedRange }, queen? }):
  merged by `recordIntel` (raids and recons keep it) and `recordSiegeIntel`; aged by
  `siegeView` / `ageRange` like the defense.
- `Expedition.sector / holders / bringBack`, `ExpeditionResult.bridgehead / sides /
queenFallen`, `MISSION_KINDS` (raid, recon, assault, reinforce, final, retreat; `retreat`
  is never launched: `invalidMission`).
- Job `outpost { sector }`: away (no bed in `rest.ts`, not the mayor, no skills, no garrison,
  not in `availableCrew`), but counted in the colony's consumption (they eat its stock).
  Removing villagers calls `forgetHolders` (inside `removeVillagers`): a bridgehead left
  empty is dropped (and the counter with the last one).

## Rules

- `siegeLock(state)`: unknownTarget (no distance-0 target) / conquered / ageTooLow /
  needsKikiwiwi. `assaultLock(state, sector)`: + notASector, sectorUnseen (intel.sectors),
  bridgeheadHere, bridgeheadLimit (bridgeheads + assaults in flight). `finalLock`: +
  queenUnknown, needBridgeheads, needFortified. `fortifyLock`: noBridgehead,
  alreadyFortified, fortifying, notAKikiwiwi (no Kikiwiwi holder), notEnoughResources.
  `siegeLaunchCheck` in `commands.ts` applies them to `launchExpedition`; the return weight
  (`forecast.returnWeight`) must fit the hold too.
- Deep reconnaissance: `resolveRecon` calls `deepRecon` when the siege is open and the target
  is the twin (draws only then).
- Landings (`resolveSiegeLanding`, called from `resolveArrival` after the broken / gone
  checks): assault (raid-like fight vs the hold; a victory posts the surviving holders, the
  others hit come home wounded; the exact hold is recorded), reinforcement (crew joins,
  `bringBack` boards, empty bridgehead abandoned, fortification stops if its Kikiwiwi
  leaves), final (crew + every holder, `assaultSides` with `fighterSides` = guard power /
  `GARRISON.power` × hunger; victory needs both sides; conquest brings every holder home and
  reveals all sectors).
- Counter-attacks: `planCounter` at the loop top (hash RNG `<seed>/<face>/siege/<n>`, no state
  RNG: big step = small steps), `nextSiegeEvent` / `siegeTick` (announce, fortification end,
  strike with the truth). A fallen bridgehead sends its survivors home with `sendHome` (a
  `retreat` expedition, launchpad `none`, rations given).
- Forecasts for the UI (public only): `counterForecast`, `finalForecast`, `assaultEnemy`,
  `forecastExpedition().final / returnCrew / returnWeight`.
- Imports: `resetSiege` (server `import` action).

## Client

- `ui/components/SiegeModal.tsx` (`siegeVisible`, conditions, steps, `CounterCard`,
  `SectorPanel`, reports, `CounterBadge`), `SiegeParts.tsx` (`SiegeMap` — wedges in
  `hexToPixel` space, slice k spans angles kπ/3…(k+1)π/3 as `sectorOf`; `sectorName` with
  `siege.slices.*`; `HoldersPicker`, `BringBackPicker`, `FinalLines`), `SiegeShow.tsx` (2D
  show from `uiStore.siegeShow`, set by `game/events.ts` for fights < 20 s old).
- Planner: `uiStore.siegePlan` (`actions.planSiege({ mission, sector? })` picks a free
  launchpad); the mission switch and target cards hide, the default crew follows the
  mission (final: 75 % of the seats, one Kikiwiwi).
- `render/twin.ts`: `TwinOptions.siege` → flags on bridgeheads (`sectorMiddle`), no dens once
  conquered; `startGame.showTwin` keys on bridgeheads and conquest. The twin's place belongs
  to chantier 24 (`render/space.ts`, see `kiwar-world` "Map of space"): bring it closer for
  the siege show with `renderer.setTwinApproach(t)`; the sister colony sits at the twin's
  place (`setTwin(map, { fog: false, friend })`); `actions.travelTo('twin')` flies there.
- Sounds `siege.warning|victory|defeat|queen` (`audio/catalog.ts`, `/admin` labels).
- Screenshots: push a monument level 2, a launchpad level 3, kiwis (clone `villagers[0]`), a
  Kikiwiwi, `intel[twin].siege`, bridgeheads with `outpost` holders and an announced counter
  on `controller.state`, then a `debugGrant` with `resources`; open `{ modal: 'siege' }` or
  `actions.planSiege(...)`; `uiStore.setState({ siegeShow: { kind, id } })` for the show.

## Balance

`pnpm balance:siege [--seeds 2] [--days 12] [--biomes …]` (`tools/balance/src/siege.ts`):
when the siege opens and what the colony could field (10 best for an assault, holds, army
sides vs the queen after two bridgeheads). The bot does not play the siege yet.
