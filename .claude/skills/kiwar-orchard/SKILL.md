---
name: kiwar-orchard
description: Kiwar cosmic orchard (chantiers 54 and 55) — the wormholes (technology, launchpad 9), one orchard per universe (public layout from the universe's seed, hidden truth from `universe_secrets`), three fruits sharing one shape (`FruitMap`, parcels and clans; ids name their fruit) — the raspberry (drupelets, standing), the apple (galleries in skin / flesh / core, worms, ripeness on a public calendar, cider only overripe), the pineapple (scales in spirals, weaver ants, the crown, bromelain wearing crews down, golden fibre) —, standing that drifts back to 0, public trade rates, red nectar, cider and golden fibre, voyages (`voyage`: visit / gift / found a post / pillage, cider fuel), a trading post per fruit on its small map (huts, stalls, palisades, job `post` with its fruit), attacks on posts, routes between posts (bonus, upkeep), the orchard's sinks (gear tiers, cider evenings, gilded decorations), the Orchard screen with a tab per fruit, the fruits in the sky and battles played on a parcel, the bot in the orchard. Use when touching the orchard, any fruit, an orchard good, voyages, posts, routes or their UI.
---

# Kiwar orchard (chantier 54)

Load `kiwar-sim` (determinism, exact offline), `kiwar-expeditions` (ships, rations, the
anti-cheat rule), `kiwar-battle` (the engine, shows), `kiwar-orbit` (small maps) and
`kiwar-online` (the hidden seed) with it. Chantier 55 added the apple and the pineapple (the
section "Chantier 55" below supersedes the raspberry-only wording above where they differ).

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
probe `pnpm --filter @kiwar/balance orchard [--seed] [--face] [--days 34] [--casual]` (prints
the end state and `why`: the reasons no ship left — `noPad`, `padBusy`, `noPlan`, a lock).
Before its post the bot trades with one partner clan (the best standing); deliveries to the
sister wait while a voyage is due (`orchardWantsPad`); goods are cut to the hold (`fitHold`).
Measured (end of chantier 54): first voyage day 29.2 / 33.6, post day 33.4; the nectar sat at
its cap 64–92 % of the time (its sinks came with chantier 55). A probe of 36 days takes ~30 min.

## Chantier 55 (the apple, the pineapple, routes and sinks)

- **Every fruit has the same shape** (`sim/orchard.ts`): `FruitMap { fruit, seed, parcels,
clans, byId, clanById }`, `Parcel` (alias `Drupelet`: id, index, x/y/z, `ring` 0–2, clan,
  links, `crown?`), `Clan.parcels`. **Ids name their fruit**: parcel / clan prefixes in
  `FRUIT_PREFIX` (raspberry `d` / `c`, apple `g` / `w`, pineapple `s` / `n`), `fruitOfId(id)`;
  so `standing`, `sold`, `views`, `taken` keep one record each. Use `fruitMapOf(seed, fruit)`,
  `fruitOfState(state, fruit)`, `parcelOf`, `clanOf`, never `raspberryOfState` for new code.
  The truth: `fruitTruth(seed, parcel)` (the raspberry keeps its `/drupelet/` stream; others
  `<seed>/<fruit>/<id>`), `parcelNow(state, seed, parcel, at)` (regrowth × the apple's stage),
  `fruitGarrison(fruit, power, level)`, `guessGarrison`, `rescaleSeen` (a view seen at one
  stage, rescaled to another). `FruitDef` per fruit in `FRUIT_DEFS` (rings, spreads, nests, mix,
  regrowth, help, `travelMs`). `fruitLayout.ts`: links and clan growth shared by every fruit
  (the raspberry's draws are unchanged — hash checked).
- **The apple** (`sim/apple.ts`, `APPLE`): 20–30 galleries in three layers (skin ring 0, flesh
  1, core 2), linked along a layer and upward; 5–7 worm colonies (`worm`, `wormGuard`, flying
  `codlingMoth`). **Ripeness** is public: `appleStage(seed, at)` / `appleCalendar` / `appleEffects`
  (green, ripe, overripe, 48 h each, offset from the seed): ripe → worms × 0.7, trade and nectar ×
  1.3; overripe → worms × 1.5, × 0.5, and **cider only then** (`FruitTruth.cider`). Reach:
  `parcelInReach` — the skin, or next to a gallery taken or to our post (`galleryOutOfReach`).
  Forecasts read strengths and rates **at the ship's arrival** (`voyageForecast.ripeness`).
- **The pineapple** (`sim/pineapple.ts`, `PINEAPPLE`): 100–200 scales on a barrel, each touching
  its 5 nearest (≈ hexagonal), 6–9 ant colonies (`weaverAnt`, `antSoldier`, flying
  `antWinged`), the **crown** last (`crownOf`, ring 2, × 2.5 power, × 3 golden fibre, reached only
  from a scale next to it). **Bromelain** (public, no roll): `bromelainHarm(state, crew, hours)`
  (6 %/h, `landingHours` 3 before a pillage, floor 25 %), `bromelainShield` (Endurance above 5,
  `actinidineActive` × 0.5, a golden fibre armour × its `bromelain`); `fruitSetup({ harm })`
  lowers the crew's starting hit points (forecast and truth alike: `landingHarm`). Kiwis left at
  its post get `job.wornAt` (`postWornAt`, 36 h / shield): worn out (`wornOut`) they neither work
  nor fight (`postFit`), an event `postKiwiWorn`, and come home **wounded** with a relief ship
  (`result.injured`).
- **Goods**: `ORCHARD_GOODS` nectar / cider / goldFiber, raw units (`NECTAR_SCALE`), caps by Nest
  (`GOOD_CAPS`), `goodOf`, `goodCap`, `addGood`, `payGood` (`state.cider`, `state.goldFiber`,
  save v45); `ExpeditionResult.cider` / `goldFiber` credited at the return.
- **Posts**: `state.orchard.posts[fruit]` (save v45 moved the old `post` to `posts.raspberry`),
  `postOf`, `postsOf`, `workingPost(state, fruit)`, `postKiwis(state, fruit)` (job `post` carries
  `fruit`, missing = raspberry), `allPostKiwis`. Stalls (`postYield`): raspberry nectar 0.6/h,
  apple nectar × richness or **cider 0.4/h while overripe** (the stage's end is an event in
  `nextPostEvent`), pineapple golden fibre 0.25/h; stores `store` (nectar) + `goods.cider /
goldFiber` (caps `POST.goodsCap`), `postGoods`, `emptyPost` (a visit calling there brings all
  home; `voyageForecast.waiting`); a fallen post loses them all. `Flows.posts: PostFlow[]`.
  Attacks: one per post (raspberry ids `pa<n>`, others `<fruit>-pa<n>`), `postAttackForecast(s,
fruit)`.
- **Routes** (`sim/routes.ts`, `ROUTE`): `openRoute { a, b }` (both posts working; the first day
  paid), `closeRoute { routeId }`; each route standing gives +25 % to both posts' stalls
  (`routeBonus`) and trips × 0.85 (`voyageTime`); upkeep 6 a day of each end's good
  (`routeUpkeep`), paid at `paidUntil` (`nextRouteEvent`, `routeTick` inside the post branch of
  `advance`); unpaid or a post down → `cut`, event `routeCut`, reopened by paying.
- **Sinks**: gear tiers `nectar` (weapons ×1.9, pierce 0.25, 15 nectar) and `gold` (armours, 6 /
  10 golden fibre, `bromelain` 0.5) at the Forge (technology Wormholes; `ForgeOrder.nectar /
goldFiber` refunded on cancel); `serveCider` (night, once a night, 8 cider, memory `cider` +12
  for 12 h, `village.ciderNight`); `fuelCider` on a voyage (6 cider, the effect of `fuel`;
  `fuelOn(plan)`); `gildDecor` (30 nectar + 12 golden fibre: `Building.gilded`, +2 beauty past
  the decorations' cap, up to +6 — `beautyOf`).
- **Client**: `OrchardModal` (store `orchardFruit`, a tab per fruit; `FruitMapView` projects each
  fruit — `drupeletSpot`, the apple cut open, the pineapple unrolled —, `Ripeness`, `ParcelPanel`,
  `VoyagePlanner` by fruit, `PostPanel` by fruit, `RoutesPanel`, `GoodsLine` with the cider
  evening), `GildLine` in a decoration's sheet (a golden ring at its foot in 3D,
  `BuildingsView.syncGilding`), cider and golden fibre chips (`GoodChip`), icons `cider`,
  `goldFiber`, `apple`, `pineapple`. 3D: `render/orchardView.ts` — one `FruitBody` per fruit
  (`RaspberryBody`, `AppleBody` whose skin follows `appleStage`, `PineappleBody` with its crown)
  on each side of the raspberry; `pick` returns the fruit (`onOrchardTap(fruit)`),
  `attachField` dispatches by the parcel's fruit, `centerOf`, `radiusOf`, `parcelRadius` feed
  `playFruit`. Worms and ants wear the crawler / flier rigs tinted (`BEETLE_TINTS`).
- **Screenshots**: seed the state from the page (`scratchpad` scripts of the chantier: posts on
  `d3`, `g1`, `s2`, views, standing, a route, extra idle kiwis), then
  `uiStore.setState({ modal: 'orchard', orchardFruit, orchardDrupelet })`; the sky:
  `renderer.rig.visit(renderer.orchard.centerOf(fruit), 40, { target, distance: 55 })`; a show:
  dispatch a `voyage` pillage (orders need `goal`), `setTimeScale(20000)` until `result.log`,
  `actions.watchFruit(id)` then `battleSpeed(0)` at once (the shows are short), wait ~9 s,
  `battleSeek(6)`.
- **Bot**: fruits in turn (the next fruit without a post first: raspberry, apple, pineapple),
  the apple only when the ship lands before it is overripe, a relief for worn-out kiwis, a
  route once two posts work and three days of upkeep are in store, a cider evening with cider
  to spare, a decoration gilded; `orchardAttackAnnounced` for every post. The probe prints the
  first visit to each fruit, posts, routes, the goods and each good's share of time at its cap.
- **Feats**: `apple`, `pineapple` (rare), `crown` (legendary: the crown's parcel in `taken`),
  `orchardRoute` (rare: a route standing); the raspberry's feat reads `orchard.visited`.
- **Measured** (end of chantier 55, 40 days): wormholes day 27.2, raspberry post 35.5, apple
  and pineapple reached days 36.1 / 37.7, nectar at its cap 8 % of the time; a run without the
  Weevil opens the wormholes on day 36.7. Cider and golden fibre need longer runs (chantier 58).
