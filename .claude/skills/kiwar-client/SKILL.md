---
name: kiwar-client
description: Kiwar client architecture (Three.js renderer, Preact UI, zustand store, i18n, mobile layout) and how to verify visual changes with screenshots. Use for any change in apps/client.
---

# Kiwar client (`apps/client/src`)

## Wiring

- `main.tsx` only routes: `/admin` (or `?admin`) lazy-loads the admin space
  (`admin/startAdmin.tsx`), anything else `startGame.tsx`, which creates `GameRenderer` (canvas)
  and `GameController` (game state, local save or online backend), binds them to the UI with
  `bindActions`, installs audio (`installGameAudio`) and renders `<App />`.
- Audio: see the `kiwar-audio` skill (sound events, engine, admin space).
- `game/GameController.ts` — owns the `GameState`; `dispatch(cmd)` applies the command
  optimistically with `applyCommand` (shared), shows errors as toasts, saves locally or queues
  the command for the server (pending queue + rebase on server state); `tick()` advances time.
  Modes: local (localStorage) or online (Supabase, lazily loaded). Universe switching lives here.
- `ui/store.ts` — zustand vanilla store `uiStore` (game, map, now, selectedTile, modal,
  pathMode, chat…) and the hooks `useUi(selector)` / `useT()`.
- `ui/actions.ts` — the only way UI components act: `actions.dispatch(cmd)`, `selectTile`,
  `setPathMode`, `paintPaths`, universes, account…
- Dev builds expose `window.__kiwar = { controller, renderer, uiStore, actions }` (handy in
  Playwright: `controller.dispatch({ type: 'debugGrant', resources: {...} })`, `controller.map`).

## Rendering (`render/`)

- `GameRenderer.ts` — scene, frame loop, quality presets (`quality.ts`: low/medium/high + auto +
  adaptive downgrade), post-processing (`postfx.ts`), picking (`picking.ts`: `TapDetector`
  separates taps from camera drags), path painting (`pathPainter.ts`).
- Views follow one pattern: built from the `FaceMap` in `setFace`, then `sync(state)` called on
  every state update, **cheap when nothing changed** (signature string). Instanced meshes
  everywhere (terrain, props, kiwis, paths); building models are procedural merged geometries
  with vertex colours (`buildingModels.ts`, one `BUILDERS` entry per building type, MODEL_SCALE
  1.3).
- **Living buildings.** A builder pushes parts `[geometry, colour, matrix, rigName?]` and
  declares rigs with `rig(p, name, pivot, motion)` (spin, swing, pump, pound, bob, breathe,
  flicker; `ambient` = moves even when idle) and particle emitters with `emitter(p, …)` (steady
  `rate`, or a burst each time a rig passes `phase`). `buildingModel(type, level)` returns the
  merged static geometry + one geometry per rig centred on its pivot + emitters (cached);
  `buildingGeometry` is the whole model in rest pose (construction ghosts). Rig parts are
  authored in the same coordinates as static parts. A building on screen is a `Group`
  (`userData.q/r` for picking) with the static mesh (casts the static shadow) and rig meshes
  (no shadow). `buildingLife.ts` animates rigs at the pace from `activityOf` (shared
  `buildingHarvest`: staff, idle, depleted, storageFull) and shows status badges (canvas
  sprites); `particles.ts` is the instanced pool. Quality flags `buildingAnimations` /
  `particles` (off in low). Removed buildings collapse in dust (`collapse` in `buildings.ts`).
- Shadows are static: after changing meshes set `renderer.shadowMap.needsUpdate = true`.
- Biome palettes, flood water, the twin half in the sky (`twin.ts`), the closed planet (cut
  disc under the tiles) and the intro scene (`intro.ts` + `introFx.ts`, drawn instead of the
  game while `renderer.playIntro` runs): see `kiwar-world`.
  The scene haze follows the camera distance; max zoom is 1.9 × `rig.frameDistance`.
- Chantier 08, second half (`kiwar-titans`): `render/obstacles.ts`, `render/kikiwiwi.ts`
  (Kikiwiwis posed from `KiwisView`), the `lab` model, `LabInfo.tsx`, `TitanWorks.tsx`;
  `renderer.reshape(map)` redraws a reshaped face without moving the camera.
- Chantier 08 (`kiwar-ages`): models take the age (`buildingModel(type, level, shipAway, age)`;
  levels 4–6 grown from level 3, age dressing), `ResearchModal.tsx` (plans screen, `AgeInfo`),
  Library and monument sheets, paths by age.
- Chantier 11 (construction readability): `ui/iconSet.tsx` (`<Icon name>`: one glyph per
  building, effect and research branch, `BRANCH_ICONS`, `buildingIcon`), `StatChanges.tsx`
  (`LevelStats` chips, `UpgradePreview` "level N → N+1" in the building sheet, `TechChanges`),
  all fed by the shared `describeLevel` / `describeUpgrade` / `describeTech`.
  `PlansModal` (in `ResearchModal.tsx`, `modal: 'plans'` + `plansTab`) with `BuildingTree.tsx`
  (families, levels fold-out, "???" for later ages, lock reason from `buildLock`, "Place").
  Placement mode: store `placing`, `actions.startPlacing/placeAt/stopPlacing`, valid tiles from
  the shared `buildableTiles` lit by `renderer.setPlacement` (`SelectionView`), `PlacingBanner`.
  Level badges: `render/levelBadges.ts` (owned by `BuildingsView.badges`, constant screen size,
  green arrow when `upgradeLock` is null, visible below 0.6 × `frameDistance` or with
  `showLevels` — `LevelsButton`, key L, `kiwar.levels`). Each level 2/3 of a model adds a
  silhouette piece: keep that rule when touching `buildingModels.ts`. Visual check of levels:
  push copies of the Nest with another `type`/`level`/`q`/`r` into `controller.state.buildings`,
  then dispatch a `debugGrant` to resync (no need to build them).
- Chantier 06 (`kiwar-threats`): `meteors.ts` (shooting star, craters), `predators.ts` (wave
  show), turret models, damaged smoke/badge; UI `DefenseModal.tsx` (`ThreatBadge` in
  `.badge-stack`), shield button in the top bar (on 761–1500 px screens the resource bar centres
  left of the round buttons).
- Day/night, seasons, weather, HUD clock, hunger badge, rest and morale widgets: see the
  `kiwar-cycles` skill (`dayCycle.ts`, `seasonLook.ts`, `weather.ts`, `ClockChip.tsx`,
  `NeedsWidgets.tsx`). Shadows also refresh when the sun moves.
- `terrain.ts` (tile prisms, `setDepletion` tint), `water.ts`, `props.ts` (cleared under
  buildings/paths), `kiwis.ts` (cosmetic agents, A* in `pathfinding.ts` with the same walk
  costs as the sim), `selection.ts` (hover/selected/catchment markers), `paths.ts`.
- Camera: `camera/CameraRig.ts` (camera-controls). Desktop: left-drag pan, right or Alt/Ctrl+drag
  rotate, wheel zoom, WASD, Q/E. Touch: one finger pan (then a glide, `camera/inertia.ts`
  `Glide`: target samples on pointer moves, τ 0.28 s, stopped by any input or `focus`/`frame`),
  pinch, two-finger twist (eased). Path mode disables one-finger/left drag for the painter.
  Double tap / double click (`TapDetector.onDoubleTap`, the first tap still selects) flies to
  the tile. `render/front.ts` `FRONT_AZIMUTH` is the colony's front (alien twin, compass,
  chantier 12 waves); `Compass.tsx` reads the azimuth from `ui/viewStore.ts` (renderer
  `onAzimuth`), a tap calls `renderer.focusNest()`.

## Performance (chantier 10)

- **The UI store is the usual suspect.** The controller emits a new `game` and `now` 5 times
  a second; every mounted `useUi` selector runs on every `setState`. Never call costly shared
  selectors in a selector or render body directly: use the per-state memoized versions in
  `ui/derived.ts` (`netRates`, `capacity`, `consumption`, `housing`, `population`,
  `hungerStage`, `forecastWave`, `bedsOf`, `moraleOf`…; add new ones with `perGame`). Keep
  fast-changing numbers out of `uiStore` (frame stats → `perfStore`, camera → `viewStore`).
  `useUi(selector, shallow)` for object/array selectors; `useT()` is stable per language;
  memoize list items (`memo` from `preact/compat`, e.g. `KiwiPortrait`).
- Measure: `?debug` (frame fps/p95/worst/hitches, JS ms per frame, draw calls, pixels, GPU;
  interface ms/s, worst update, last menu open time). `scripts/perf.mjs <save.json>` replays a
  colony from `tools/balance/src/perfSave.ts` on desktop/phone screens, medium/low, CPU ×4.
  Headless WebGL is software (≈ 1 fps): trust the JS/interface columns, not fps. For a CPU
  profile, use CDP `Profiler.start/stop` from Playwright and sum self/inclusive time per
  function (the hot path shows up immediately).
- Rendering: `pixelRatioFor` (quality.ts) caps device pixels per preset (`pixelBudget`) and
  integrated Intel GPUs (`isIntegratedGpu`) at 1, recomputed on resize; those also get the low
  preset in auto and no canvas MSAA. Soft shadows only in high (`softShadows`). While a modal
  is open the renderer stops drawing after two frames (`setBackground`). No
  `backdrop-filter` over the canvas. Real measure (Iris Pro, 2015 MacBook Pro): GPU-bound,
  low 58 fps, medium 37, high 22, JS ≤ 5.5 ms per frame.

## UI (`ui/`)

- Village screen, kiwi sheets, portraits, crew picker, Posts tab, "Assign to…", the
  "N without a post" pill: see the `kiwar-rpg` skill.
- Dev server pitfall: after adding exports to a shared module, Vite may keep a stale module
  ("does not provide an export named …" page error, `window.__kiwar` never appears): restart
  `pnpm dev`.
- `App.tsx` lays out the HUD; components in `ui/components/` (TopBar, TilePanel = contextual
  sheet for the selected tile, QueuePanel, EggButton, PathTools, ExpeditionModal, ChatPanel…).
  Expedition planner, reports, the target map (`IntelMap`) and the flying bird (`render/ship.ts`):
  see `kiwar-expeditions`.
- Styles in `ui/styles.css`: parchment look, CSS variables (`--paper`, `--edge`, `--leaf`,
  `--berry`, `--gap`, `--safe-*`). Phone breakpoint `max-width: 760px`; when a tile sheet is
  open the HUD has `.has-sheet` (bottom sheet covers half the screen; other floating panels hide).
- Icons are inline SVG: named components in `ui/icons.tsx`, and the `<Icon name>` registry of
  `ui/iconSet.tsx` (chantier 11) for buildings, effects and branches.
- Safety nets: `Guard` (error boundary) wraps the tile sheet, the modals and the whole app;
  `BootScreen` shows while `game` is null (loading line, or `bootError` with retry / play solo).
  Never return an empty HUD.
- Back from a break: `RecapBubble` (corner, < 8 h, auto-closes after 12 s unless alarming;
  "details" sets `recapOpen`) or `OfflineModal` (≥ 8 h or on demand).
- Taps: an ally planet (no tile hit) → visit; a building or construction site wins over a
  kiwi standing on it (`GameRenderer.hasStructure`); otherwise a kiwi near the pointer wins.
- Camera: `onWorld` rebuilds the scene only when seed/face/params change (`startGame.worldKey`),
  so a resync keeps camera and selection; `CameraRig` saves the azimuth on `rest`
  (`kiwar.camera.azimuth`, not while visiting) and `frame()` uses it.

## i18n

- `i18n/en.ts` is the source (`Dict` type), `i18n/fr.ts` must match it (TypeScript enforces
  every key, including `errors.<code>` for each `COMMAND_ERRORS` entry and
  `buildings.<type>.name/desc`). Params: `'{count} tile(s)'`. French copy is gender-neutral.

## Verify visually

1. `pnpm dev --port 5173` in the background (log to the scratchpad).
2. `node scripts/shot.mjs "http://localhost:5173/?seed=demo" /tmp/…/desk.png 1280 800 3000`
   and a phone shot `… 390 844 3000 1`. Use `ACTIONS=./file.mjs` to script the page (grant
   resources, dispatch commands, select a tile, click buttons), then look at the PNG with Read.
3. Check both desktop and phone, and the console output printed by the script.
4. Headless Chromium auto-detects the **low** preset (no building animations): call
   `renderer.setQuality('medium')` in the actions. Frames are slow there: CSS animations (modal
   fade-in) need ~3 s before the shot, and `controller.setTimeScale(300)` finishes buildings
   quickly (queue length is limited: build two at a time). Zoom with
   `renderer.rig.focus(x, y, z)` + `renderer.rig.controls.dollyTo(d, false)`.
5. Confirmations: `uiStore.setState({ modal: 'demolish', demolishId })`; the `.modal-confirm`
   class turns a modal into a bottom sheet on phones.
6. Gestures and animations at real speed: headless frames take ~0.5 s, so pointer events
   arrive far apart. Stop the loop (`renderer.renderer.setAnimationLoop(null)`) and drive
   `rig.update(1/60)` from a `setInterval`, or step an animation by hand (`intro.update(1/60)`
   up to a time, then `renderer.renderer.render(intro.scene, intro.camera)`) before the shot.
   Touch swipes: CDP `Input.dispatchTouchEvent`.
