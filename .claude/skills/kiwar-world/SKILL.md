---
name: kiwar-world
description: Kiwar world and faces (chantiers 05 and 24) — biomes (data, generation, floods, palettes), the map of space (fixed places of the twin, the members and the sister colony of chantier 19, space view, camera travel between planets, level of detail), the twin half under fog of war, a friend's twin face, the intro (kiwi sliced in two) and the choice of a face, pickFace in shared universes. Use when touching world generation, biomes, the intro, the twin or planets in space, travel between planets or face choice.
---

# Kiwar world: biomes, twin half, intro

Load `kiwar-sim` (rules stay deterministic and exact offline) and `kiwar-client` (rendering).

## Biomes (shared)

- `data/biomes.ts` — `BIOME_IDS` (`classic` + 3 per face), `BIOMES[id]`: `face` (null for
  classic, never drawn), `generation` (overrides of `FaceProfile` + `rivers` + `relief`),
  `yield` (× face climate), `deposits.stock/regen` per resource, `walk`, `seasons` (extra
  multipliers per season, multiplied onto `CYCLES.seasons`), `floods` (season or null),
  `threats` (ferrets/bats multipliers, data for chantier 06).
- Helpers: `drawBiomes(planetSeed)` (both faces; universes use `planetSeedOf`), `biomesOf(face)`,
  `biomeFits`, `biomeProfile(face, biome)`, `climateOf(face, biome)` (use it instead of
  `FACE_PROFILES[face].yieldMultiplier`), `seasonEffects/seasonRegen/seasonHarvest(season, …,
biome)` (memoized), `tileDeposit(tile, biome)`, `twinParams(seed, face, params)`.
- The biome is `state.params.biome` (`FaceParams`; `DEFAULT_FACE_PARAMS` = classic). `newGame`
  draws it from the seed unless `biome`/`params` is given. **Every map cache key includes the
  biome.** Test helpers (`setup`) force `classic` so exact-number tests stay valid; tests that
  play random colonies use the drawn biome (`generateFace(seed, face, state.params)`).
- Generation (`worldgen/generateFace.ts`): classic maps are bit-identical to before biomes (new
  RNG forks only for new features). Rivers: `rivers.count` courses from rho 0.97 to 0.37, a ford
  every `fordEvery` tiles (test: < 4 % of the land unreachable). Relief: height noise × relief
  plus plateaus (`noise2` quantized). `Tile.flood` marks floodable flesh (next to juice).
- **Floods**: `isFlooded(tile, biome, season)`; unwalkable (paths too), `computeClaims` skips
  flooded tiles, `build`/`gather` fail with `flooded`, a building on a flooded tile has harvest
  status `flooded`. `calendarTick` resyncs pools at season changes when the biome floods.
- Balance: every biome must stay within ±10 % of the median of all biomes (`kiwar-balance`).
  Tune `deposits`/`yield`/`seasons` in `BIOMES`, never the length of seasons.

## Client

- Palettes: `BIOME_LOOKS` in `render/terrain.ts` (flesh gradient + tile colours),
  `tileTopColor(tile, out, biome)`. Flood water: `WaterView.flood` (second instanced mesh,
  `setFlooded`), badge `flooded` in `buildingLife.ts`. `pathfinding.ts` passes biome + flood.
- **Map of space** (chantier 24, `render/space.ts`, pure functions tested in
  `apps/client/test/space.test.ts`): every planet has a **fixed place**, none follows the
  camera. The face on show ("home") is always at the **origin**; `twinPlace(approach = 0)` =
  the other half of the same kiwi, `TWIN_DISTANCE` 120 towards `FRONT_AZIMUTH` (the front of
  waves and compass), height `TWIN_HEIGHT` 8; `allyPlace(rank, kiwiGap)` = the members on an
  outer ring (`ALLY_RING` 210 + 20 per extra kiwi of gap, a second lap 60 further), slots
  `ALLY_SLOTS` (±50°, ±80°… 180° from the front, never within `FRONT_CLEARANCE` 35° of the
  twin), heights −10 / −16; `planetOrientation(place)` = yaw towards home then the far rim
  lifted by `PLANET_TILT` 0.42. `PlanetRef` = `'twin' | kiwiIndex`.
- **For chantier 19 (colonisation)**: the siege show moves the twin with
  `GameRenderer.setTwinApproach(t)` (0 → 1 eases it from 120 to `TWIN_CLOSEST` 65 along the
  front, wakes the frame loop while moving; the camera bounds of a twin visit do not follow,
  so play the show from home). **Sister colony rule**: "the other half of the kiwi is always
  at the twin's place". Playing colony 1 → face 2 sits at `twinPlace()` (under fog while
  alien; once colonised, `setTwin(map, { fog: false, friend: snapshotOfTheSister })` draws it
  lit, with its buildings, like a friend's face). Switching to colony 2 rebuilds the scene
  with face 2 at the origin and colony 1 at the same twin place (same `FRONT_AZIMUTH`, so
  waves and compass keep their meaning). Going to look at the sister = `travelTo('twin')`.
- **Twin half** (`render/twin.ts` `TwinView`, `GameRenderer.setTwin(map, { fog, friend,
intel })`): placed once with `place(twinPlace())` (members: `place(allyPlace(...))`), turns
  on itself once in 5 min and bobs (`update(dt, time, eye, frozen, phase)`; a visited planet
  is `frozen`). Scale 0.68. Terrain without shadows/props, materials `fog=false`, three
  `CircleGeometry` cloud layers (fog of war). **Level of detail**: farther than 8 radii from
  the camera only the dome and one painted disc show (`farDisc`: every tile a dot of its
  colour on a canvas, veiled with cloud colour under fog; 3 draw calls, 1.6 k triangles); the
  tiles, pools, fog layers, dens and obstacles show near or while visited. Friend: `WaterView`,
  buildings **merged into one geometry** (clones of the cached `buildingGeometry`, the merge
  is disposed with the view), name sprite. `rayHit(ray)` = a sphere of `radius` (hover and
  taps). `startGame.showTwin` rebuilds it only when the key (seed, face, biome, friend
  snapshot time, intel) changes and sets the store's `twinOwner`.
- **Space view** (`camera/CameraRig.ts`): zoom out to `MAX_ZOOM` 3 × `frameDistance`; past
  the framing `liftPolar(k)` raises the camera towards the horizon (0.78 → `SPACE_POLAR` 1.42
  at k ≈ 2.6, eased out) so the planets come into view (the twin peeks in from k ≈ 1.4);
  zooming back in gives the player's own tilt back (`playerPolar`). Sky sphere (radius 900)
  and moons follow the camera (at infinity); the cloud sea is 1000 wide, fading 220–450.
- **Closed planet**: the skin dome (`createKiwiDome`, `FrontSide`, radius `domeRadius(map)`:
  its rim stays under the rim tiles, no ledge) carries a dark cut disc child that closes the
  gaps between tiles. Anything sized on the skin (dome fur props) uses `domeRadius`. The intro finds the dome as the terrain
  group's child that is neither tiles nor water: keep extra parts as children of the dome.
- **Intro** (`render/intro.ts` `IntroScene`, effects in `render/introFx.ts`): own scene/camera;
  `GameRenderer.playIntro(maps, handlers, skip)` renders it instead of the game (camera
  controls and taps off), `endIntro()`. Phases `waiting` → `playing` → `choice` → `leaving`
  (chantier 22). **Waiting**: the whole round kiwi (`createWholeKiwi`, shell fur
  `addFurShells(mesh, lean, parting)` — no hair on the seam —, also put on the halves' domes,
  `disposeFur`) posed three quarters on (`POSE`, axis `AXIS` 60° from the view), drifting
  (`drift`) and turning on its own axis, a pulsing glow (`createGlow`); `slice()` from a tap
  on the fruit (`onFruit` < 1, 24 px slack), a 40 px swipe crossing it, or the overlay button
  (`sliceIntro`). **Cut** (times from the request, `cut`): the drift settles 0–0.4 s, the
  blade (`BladeTrail`, a streak **on the seam's circle**, front half, in the plane of the
  cut: `aimBlade`) runs 0.4–0.7 s with slow motion (`SLOW` 0.3 for `SLOW_S` real seconds),
  juice spray (`JuiceBurst.burst(radius, POSE)`), `onSlice`, fur quiver (`furShiver`); at
  0.7 s `split()` swaps the fruit for the halves (deep as the fruit, settling into the game
  dome while parting until 2.1 s, first along the axis), each covered by a `FleshVeil` (wet
  flesh canvas texture, warm glow, noise dissolve `melt`) and joined by `JuiceStrands`
  (break → `drip` + `onJuice`) → choice (focus: hover on desktop, taps, tabs) → `choose` →
  1.3 s dive → `onDone`. Taps during the cut do nothing (Skip button). Check it frame by frame
  (see `kiwar-client`, Verify visually). Layout: `setIntroLayout` frees the right panel (desktop) or the bottom
  48 % (phone). The terrain shaders share `seasonUniforms`: the intro sets a neutral look.
- `ui/intro.ts`: `startIntro({ mode: 'new' | 'join' | 'replay', seed, params?, taken?, current?,
focus?, onChoose })`, store `intro` / `introFade`, gauges (sustainable regrowth × climate vs
  1.5 × the classic faces of the seed), `introSeen()` (`kiwar.introSeen`). `IntroOverlay` reads
  the biome numbers from `BIOMES` (`useTraits`), texts in `intro.*` and `biomes.<id>.*`.
- Entry points: first visit (`startGame.boot`), Settings → New world (`pendingWorld.pick`),
  Settings → Replay the intro, `actions.enterUniverse` → `joinIntro` when the colony is new.

## Online

- `pickFace { universe, face }`: only if the player's game is pristine and nobody holds that face
  of their kiwi (`faceTaken`); `repo.moveMember` updates `universe_members.face` in place (unique
  constraint → false), the game is recreated with `universeGame`.
- Chantier 07: the alien twin's clouds open over the sectors our scouts saw
  (`TwinOptions.intel`, shader mask `uSeen`), with the dens/roosts they reported — see
  `kiwar-expeditions`.
- **Allied planets** (`render/allies.ts` `AlliesView`, `GameRenderer.setAllies(allies, myKiwi)`):
  each member's face is a `TwinView` (no fog, name ribbon above) at `allyPlace(rank, gap)`
  (rank = nearest kiwi first, then kiwi index).
- **Travel** (chantier 24): a tap on a planet (when no tile is hit) opens its card
  (`PlanetCard`, store `planetCard`, `actions.showPlanetCard`); "Go there", the Planets list
  (`PlanetsPanel`, store `planetsOpen`: round button on desktop, "Planets" in the phone
  menu) or the universe screen call `actions.travelTo(ref)` → `GameRenderer.travelTo` →
  `CameraRig.visit(center, radius)`: an eased flight along an arc (1.4–2 s, controls and limits
  off until the landing, `rig.flying`), then that planet's bounds and zoom (`away` flag).
  `travelTo(null)` → `returnHome` flies back to the saved view. Store `visit: PlanetRef |
null`; the HUD shrinks to `VisitBanner` (twin: "Siege" when `siegeVisible`, "Prepare an
  expedition"; member: delivery, next, home), taps reach only other planets, hover shows
  `PlanetTag` (viewStore `planetHover`, names from `ui/planets.ts` `planetLabel`, twin
  explored % = intel sectors / 12). `startGame.showAllies` re-syncs after `onAllies` / `onWorld`.
- `twin` in responses (`TwinSnapshot`: owner, face, params, buildings, paths, at) when a friend
  lives on the other half of our kiwi (older universes only: each newcomer now gets their own
  kiwi), and `allies` (`AllySnapshot` = twin snapshot + `kiwiIndex`, `seed`) for everyone else;
  never stocks, never an alien face's state.
- Intro choice: a click (or a tab, `focusIntro(face, true)`) locks the face (`IntroScene.lock`);
  hovering only moves the focus until then.
- Visual check of a universe: `pnpm mock:supabase` + `pnpm dev:online`, two Playwright contexts
  (`actions.enterUniverse({ create }, 'Alice')`, then join with the code). Headless phones play
  the intro slowly: click `.intro-skip`.
