---
name: kiwar-world
description: Kiwar world and faces (chantier 05) — biomes (data, generation, floods, palettes), the twin half floating in the sky under fog of war, a friend's twin face, the intro (kiwi sliced in two) and the choice of a face, pickFace in shared universes. Use when touching world generation, biomes, the intro, the twin view or face choice.
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
- **Twin half** (`render/twin.ts`, `GameRenderer.setTwin(map, { fog, friend })`): like the moon,
  always towards the colony's front (`render/front.ts` `FRONT_AZIMUTH`), fixed orientation and
  slow spin; its height follows the camera's distance and pitch — hidden above the frame
  below zoom 0.6 × `rig.frameDistance`, half showing at the top at 1.0 (the default zoom),
  fully in the upper sky from 1.15 × (chantier 17; max zoom 1.9 ×). Scale 0.68; alien twins
  carry a ribbon `TwinOptions.caption` ("Alien face — to colonise", `compass.twin`, shown
  when k > 0.75, `renderOrder` above the fog layers). Turning the
  camera slides it off screen (the compass shows where it is). A truly fixed world position
  does not work: the camera looks 45–64° down. Terrain without shadows/props, materials `fog=false`,
  three `CircleGeometry` cloud layers (fog of war). Friend: `WaterView`, static
  `buildingGeometry` meshes (shared cache, do not dispose), name sprite. `startGame.showTwin`
  rebuilds it only when the key (seed, face, biome, friend snapshot time) changes.
- **Closed planet**: the skin dome (`createKiwiDome`, `FrontSide`, radius `domeRadius(map)`:
  its rim stays under the rim tiles, no ledge) carries a dark cut disc child that closes the
  gaps between tiles. Anything sized on the skin (dome fur props) uses `domeRadius`. The intro finds the dome as the terrain
  group's child that is neither tiles nor water: keep extra parts as children of the dome.
- **Intro** (`render/intro.ts` `IntroScene`, effects in `render/introFx.ts`): own scene/camera;
  `GameRenderer.playIntro(maps, handlers, skip)` renders it instead of the game (camera
  controls and taps off), `endIntro()`. Timeline: whole round kiwi (`createWholeKiwi`, shell
  fur `addFurShells` also put on the halves' domes for the intro, `disposeFur`; domes hidden,
  rolling around X) → blade streak at 1.6 s (`BladeTrail`) + juice (`JuiceBurst`) +
  `onSlice` (synth `slice`: whoosh, splash, drops); the halves start as deep as the whole fruit
  and settle into the game dome while parting 1.9–3.3 s → choice (focus: hover on desktop, taps, tabs) → `choose` →
  1.3 s dive → `onDone`. Layout: `setIntroLayout` frees the right panel (desktop) or the bottom
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
  each ally's face is an anchored `TwinView` (`anchored: true`, no fog, name ribbon above) at a
  fixed place: slots around the far side, ring 95 + 14 per extra kiwi of distance, y ≈ −14
  (above the sea of clouds at −26), leaning towards us. Tapping one (when no tile is hit) or
  `actions.visitAlly(k)` → `GameRenderer.visitAlly` → `CameraRig.visit(center, radius)` (bounds
  and zoom of that planet, `away` flag); `visitAlly(null)` → `returnHome` (restores the saved
  view). Store `allies`, `visit`; the HUD shrinks to `VisitBanner`, taps and hover are off,
  the alien twin hides. `startGame.showAllies` re-syncs after `onAllies` / `onWorld`.
- `twin` in responses (`TwinSnapshot`: owner, face, params, buildings, paths, at) when a friend
  lives on the other half of our kiwi (older universes only: each newcomer now gets their own
  kiwi), and `allies` (`AllySnapshot` = twin snapshot + `kiwiIndex`, `seed`) for everyone else;
  never stocks, never an alien face's state.
- Intro choice: a click (or a tab, `focusIntro(face, true)`) locks the face (`IntroScene.lock`);
  hovering only moves the focus until then.
- Visual check of a universe: `pnpm mock:supabase` + `pnpm dev:online`, two Playwright contexts
  (`actions.enterUniverse({ create }, 'Alice')`, then join with the code). Headless phones play
  the intro slowly: click `.intro-skip`.
