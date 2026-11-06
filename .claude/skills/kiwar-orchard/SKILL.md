---
name: kiwar-orchard
description: Kiwar cosmic orchard (chantier 54) — the wormholes (technology, launchpad 9), one orchard per universe (public layout from the universe's seed, hidden truth from `universe_secrets`), the raspberry (drupelets, clans, rings), standing that drifts back to 0, public trade rates, red nectar, voyages (`voyage`: visit / gift / found the trading post / pillage), the trading post on its small map (huts, stalls, palisades, job `post`), attacks on the post, the Orchard screen, the raspberry in the sky and battles played on a drupelet, the bot in the orchard. Use when touching the orchard, a fruit planet (chantier 55's apple and pineapple), nectar, voyages, the trading post or their UI.
---

# Kiwar orchard (chantier 54)

Load `kiwar-sim` (determinism, exact offline), `kiwar-expeditions` (ships, rations, the
anti-cheat rule), `kiwar-battle` (the engine, shows), `kiwar-orbit` (small maps) and
`kiwar-online` (the hidden seed) with it. Chantier 55 adds the apple and the pineapple here.

## The rule of the orchard

- **One orchard per universe, own impacts.** The layout is public: `state.orchard.seed` =
  `universeOrchardSeed(universe.seed)` (set by `withScopeTargets`, `rebaseOrchard`; solo:
  `<game seed>/orchard`). Every member sees the same drupelets and clans; standing, views,
  pillages and the post are each colony's own. No shared state between players.
- **The truth is hidden.** What a drupelet holds comes from `state.orchardSeed`, stripped by
  `publicState`, like `depthSeed`. Online it is the universe's secret
  (`universe_secrets.orchard_seed`, migration `20261107000000_orchard.sql`, RLS on, no policy;
  `repo.orchardSeedOf(universeId, fresh)`, fetched in `resolveScope` as `scope.shared.secret`;
  a missing table falls back to a seed per game). Solo online: `ctx.randomSeed()`. Local:
  `localOrchardSeed`. An import draws a new one and **forgets the orchard** (`forgetOrchard`:
  voyages dropped, the post's kiwis home, views, standing and post gone).
- **Home colony only**: `orchardOpen` = home colony + technology `wormholes`. A sister colony
  has no `orchardSeed` (`sim/colonies.ts`).
- Anything that reads the truth (a voyage's arrival, an attack's strike) resolves only where
  the seed is held: `canResolveArrival` (missions `visit`, `pillage`), `hiddenDue`
  (`postAttacksDue`), `awaitingServer` (`postAttackAwaited`). Leak tests:
  `test/orchard.test.ts` (no `"orchardSeed"`, no `/drupelet/` in any response).

## Data (`data/orchard.ts`)

`FRUIT_IDS` (raspberry), `ORCHARD_TARGET` (`'orchard:raspberry'`, never in `state.targets`),
`ORCHARD` (launchpad 9, travel 6 h before the launchpad's speed → ≈ 3.4 h, hop 10 min, two
stops, relay × 0.75 with a post, crew 1–8), `RASPBERRY` (60–90 drupelets, 8–12 clans, rings
power 40/60/85, level 16/18/20, nectar 20/35/55, nest 25 % × 1.5, mix beetle / beetleGuard /
byturus, regrowth 72 h, help 25 % after 25 s), `STANDING` (−100…100, friendly ≥ 30, hostile
≤ −30, trade +3, gift +8 per 5 000 units up to × 3, pillage −60 / neighbours −20, drift 2/day),
`TRADE` (rate 4–7 nectar per 1 000 units, our sales soften it over 72 h), `NECTAR` (cap by Nest
100 at Nest 10 up to 400 at 15, `NECTAR_SCALE` raw units), `POST` (40 nectar + 40 crystal + 20 iron,
2 h, radius 2, five modules, hut / stall / palisade, 0.6 nectar/h per kiwi, store 60, a ruin
at half price), `POST_ATTACK` (36–60 h apart, 8 h notice, half the clan's garrisons next to
the post). Technology `wormholes` (`data/research.ts`: Library 9, 20 000 points × 2.5 without
the Mother Vine, 30 crystal, 20 stardust; Library 14 and launchpad 14 were never reached by
the bot before day 34). Every number is a hypothesis.

## Simulation

- `sim/orchard.ts`: `raspberryOf(seed)` (memoized: drupelets on the unit sphere under the
  stem's cap, `ring` 0 at the tip → 2 by the stem, links, clans grown in one piece, `wants`,
  `rate`, name index), `clanNeighbours`, `drupeletTruth(seed, d)` (hidden), `drupeletNow`
  (× `regrowth` after a pillage), `beetles(power, level)`, standing (`standingOf`,
  `attitudeOf`, `addStanding`, `pillageStanding`: stored `{ value, at }`, the drift computed —
  no tick), trade (`tradeRate`, `soldTo`, `sellTo`), nectar (`nectarCap`, `nectarOf`,
  `addNectar`, `payNectar`), `orchardOpen`, `wormholePads`, seeds (`ensureOrchard`,
  `rebaseOrchard`, `forgetOrchard`).
- `sim/voyages.ts`: command `voyage` (`VoyagePlan`: pad, mission, stops, crew, provisions,
  goods, gift, settle, stay, bringBack, orders, fuel), `voyageLock`, `voyageForecast` (stops
  with rate and standing, settle cost, the post's store, `pillageForecast`: three practice
  battles against the view or the ring's estimate, help at its worst in the hardest),
  `launchVoyage` (a breakdown only delays), `resolveVoyage` (visit: per stop, refused by a
  hostile clan unless a gift; trade or gift, a dated view, `visits++`, the post founded on the
  first stop, kiwis left there or brought home, the store collected; unsold goods come home
  as loot) and the pillage (`battle/fruit.ts` `fruitSetup` on the delve's field with the clan's
  help; chantier 46's rule; `taken`, the clan's anger whatever happens). The nectar is credited
  at the return (`resolveReturn`); a pillage counts as a landing for XP and veterans.
- `sim/tradingPost.ts`: `postMapOf` (`smallMap('<orchard seed>/post/<drupelet>')`),
  `workingPost`, `postKiwis` (job `post`, treated like `outpost` everywhere: away, fed by the
  colony), `postHousing`, `stallWorkers`, `postFort`, the store (`postNectarRate` in
  `computeFlows` → `Flows.postNectar`, `accruePost`, a `nextChange` when it fills), events
  `postReady`, `postModuleReady` (`nextPostEvent`, `postTick`), commands `buildPostModule` /
  `removePostModule`, `foundPost`, `postCost`.
- `sim/postAttacks.ts`: `planPostAttack` (public stream `<orchard seed>/post/<drupelet>/attack/n`),
  the announcement (public: the most hostile clan next to the post; none → skipped), a gift
  bringing it back above hostile calls it off (`postAttackCalmed`), the strike (truth:
  `postSetup` — the store, the palisade's two turrets, our kiwis — held: wounded home; fallen:
  store taken, post `ruined`, the fallen die), `postAttackForecast`, reports with journals.
- State (save v44): `state.orchard` (`OrchardState`: seed, standing, sold, views, taken, post,
  visits), `state.orchardSeed`, `state.nectar`; `Expedition.voyage`; results `nectar`,
  `stops`, `postFounded`.
- Feats `raspberry` (rare), `tradingPost` (legendary); objective `starsWormhole`
  (condition `orchard`).

## Client

- `ui/components/OrchardModal.tsx` (`modal: 'orchard'`, store `orchardDrupelet`):
  `orchardVisible`, `orchardAlarm`; the raspberry from above (`drupeletSpot`: the tip in the
  middle), clan panel (`StandingGauge`), `VoyagePlanner` (reuses `CrewPicker`, `OrdersPicker`,
  `UnitList`), the post (its small map in SVG), voyages under way and pillages to watch again.
  Clan names `orchard.clanNames.n0…n15` (`clanName`), colours `render/orchardColors.ts`.
  Top bar button (alarm), phone menu entry, nectar chip and tip, toasts, report branch.
- `render/orchardView.ts` `OrchardView`: at `orchardPlace()` (`space.ts`: 280 away, height 34,
  a quarter turn from the front — above the cloud sea at −26), materials `fog: false` (far
  away the scene's fog hides everything), instanced drupelets tinted by clan (darker hostile,
  paler pillaged), calyx, a branch of vine rising, the post's hut, the wormhole's swirl under
  it (`mouth`: ships fly there, `ShipsView.orchardAt`; it turns — a sign of life — only while
  a voyage is under way); `pick` → `onOrchardTap`; `lookAtOrchard`; `attachField` /
  `detachField` (the fruit turns to show a drupelet).
- `render/orchard/fruitShow.ts` `FruitShow` (`ShowSource.kind` `'fruit'`):
  `GameRenderer.playFruit(source, live)` flies the camera there (`rig.visit` with a focus) and
  back at the end; `actions.watchFruit(id)` takes a pillage's expedition id or a post report's
  id. A fresh pillage is offered live through `LandingInvite` (outcome held, `tellOutcome`
  knows `pillage`). Beetles wear the crawler / flier rigs tinted (`BEETLE_TINTS`).
- Screenshots: push the state on `controller.state` (techs, Nest 14, a launchpad of level 9,
  `orchard.standing`, `views`, `post` with modules and an announced attack), a `debugGrant`
  dispatch, then `uiStore.setState({ modal: 'orchard', orchardDrupelet })`; for a show,
  dispatch a `voyage` pillage, `controller.setTimeScale(5000)` until it is back, then
  `actions.watchFruit(id)`, `renderer.battleSeek(t)`, `battleSpeed(0)`. Phones need ~14 s
  before the shot (the loading veil).

## Bot (`tools/balance/src/bot/orchard.ts`, mechanic `orchard`)

`wormholePadDecision` (the launchpad to 9 once the Mother Vine is found or the technology
known; `wormholes` comes right after `starsAge` in `TECH_ORDER` but waits for the Vine — or day
32 — `waitsForVine` in `bot/ages.ts`), `orchardOrders` (once an hour, every round while an attack is
announced): the post's modules (stall, palisade, hut), a defence (gift to calm the clan, or
everybody home) when the forecast is not "likely", the post with the first friendly clan, a
trade with the best-paying clan otherwise. Never a pillage. Milestones `wormhole`, `post`;
probe `pnpm --filter @kiwar/balance orchard [--seed] [--face] [--days 34] [--casual]`.
