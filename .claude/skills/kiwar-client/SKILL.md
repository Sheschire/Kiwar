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
  with vertex colours (`buildingModels.ts` + the families in `render/models/`, one `BUILDERS`
  recipe per building type, MODEL_SCALE 1.3; see **Chantier 33** below).
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
  The scene haze follows the camera distance; max zoom is `MAX_ZOOM` 3 × `rig.frameDistance`.
- **Chantier 24 (planets in space)**: the twin and the members' planets have fixed places
  (`render/space.ts`, see `kiwar-world`); past the framing the camera rises towards the
  horizon (`CameraRig.liftPolar`, "space view"); `GameRenderer.travelTo(ref)` /
  `actions.travelTo` fly the camera to a planet (`CameraRig.visit`, `flyTo`/`stepFlight`: an
  arc, controls off until the landing; `rig.flying`) and `travelTo(null)` back. UI:
  `PlanetTag` (hover name, `viewStore.planetHover`), `PlanetCard` ("Go there", store
  `planetCard`), `PlanetsPanel` + `PlanetsButton` (round fab above the logistics one, phone
  menu entry "Planets", store `planetsOpen`), `VisitBanner` for any `visit: PlanetRef`.
  Measure planets with `renderer.renderer.info` with and without `twin.group` /
  `allies.group` visible (same page).
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
  `showLevels` — `LevelsButton`, key L, `kiwar.levels`). Each tier 2/3 of a model adds a
  silhouette piece (chantier 33: in every age): keep that rule when touching the recipes. Visual check of levels:
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
  `Glide`: target samples on pointer moves, τ 0.6 s since chantier 20, stopped by any input or `focus`/`frame`),
  pinch, two-finger twist (eased; chantier 20: a released twist spins on with a second
  `Glide`). Glide tau 0.6 s, starts within 120 ms of the last move. `updateGlide` clamps its
  target to `this.bounds` itself (always set the boundary through `setBounds`):
  camera-controls' `_encloseToBoundary` returns NaN when the target is above/below the box
  and the offset has no height. Path mode disables one-finger/left drag for the painter.
  Double tap / double click (`TapDetector.onDoubleTap`, the first tap still selects) flies to
  the tile. `render/front.ts` re-exports the shared `FRONT_AZIMUTH`, the colony's front
  (alien twin, compass, chantier 12 wave sectors); `Compass.tsx` reads the azimuth from `ui/viewStore.ts` (renderer
  `onAzimuth`), a tap calls `renderer.focusNest()`.

- Chantier 15 (`kiwar-tasks`): `AutomationPanel.tsx` (village tab `auto`), `QueuePanel`
  (sites at once, "waiting for a builder", `BuilderPick` in manual mode), `MeteorSection.tsx`
  (crater sheet), the drill in `render/meteors.ts`, miners in `render/kiwis.ts`.
- Chantier 12 (visible logistics): `render/logisticsBadges.ts` ("92 %" sprites: overlay above
  producers via `BuildingsView.anchorOf`, or the hovered placement tile) driven by
  `renderer.setLogisticsOverlay` (store `showLogistics`, `LogisticsButton`, key O, also on in
  path mode) and `setPlacement(tiles, efficiencies?, turret?)` (tiles tinted by
  `efficiencyGlow` or by sector; `SelectionView` instance colours are allocated in the
  constructor, or the shader ignores them). `render/dropLabels.ts`: "+0,4" and the resource
  icon (canvas copy of `ui/icons.tsx`, texture cache capped) when a 3D kiwi drops its load
  (`KiwisView.showDrop`, chantier 16: output × its worker-power share × game time since its
  `loadSince`, capped at 10 min; nothing when the stock is full); kiwis walk at 1/√(walk cost)
  per segment and carry to the shared `nearestDepotOf`. Path mode: `onPaintPreview` → `actions.previewPaths` →
  store `pathGains` (shared `pathLogisticsChanges`) shown in `PathToolbar`. Tile sheet:
  `LogisticsLine` / `logisticsParams` (percent, steps, depot name). Turret range and the
  defense by sector: see `kiwar-threats`.

- Chantier 16 (readable placement): store `placingTile` / `placingPinned`;
  `actions.pointPlacement` (mouse hover, via `renderer.onPlacementHover`), `pinPlacement`
  (finger tap: `onTileTap(tile, touch)` — `TapDetector` passes the pointer type),
  `confirmPlacement` ("Build here"). `game/placement.ts`: `placementError` (= `buildLock ??
siteError`) and `placementPlan` (shared `catchmentPlan`, cached per state and tile, free and
  taken tiles). A `startGame` subscription (on `slowGame`, the pointed tile and `placing`)
  drives `renderer.setGhostModel/setGhostTile` (`render/placementGhost.ts`: cached level-1
  geometry, one transparent material, green/red emissive, hovering) and
  `setPlannedCatchment` (`SelectionView.setPlanned`: two small instanced meshes, pulsing green
  / grey). `setGhostTile` also moves `placementHover`, so a tapped tile shows its logistics %
  and turret range on phones. `PlacingBanner` (`.placing-banner`, buttons below the text on
  phones) shows the reason or the plan summary. Waves: `render/tileWave.ts` (`TileWaves`, one
  additive instanced mesh + a ring per wave, sprouts from `BuildingsView.particles`), started
  from `onGameEvents` → `pendingWaves` → the next `setGameState` (the event comes before its
  state); only events < 15 s old. Zones: `refreshZones` (inside `refreshLogistics`, keyed on
  producers and pools) → `SelectionView.setZones` (colour per producer, dark rings on tiles
  in reach of several). Visual checks: the perf save is at its building cap (placing refuses
  pulperies): use `?seed=demo` + `debugGrant`, and `renderer.pickTile(x, y)` to find a tile's
  screen point; step `renderer.waves.update(1/60)` by hand with the loop stopped.

- Chantier 17 (visual identity): **family palette** in `buildingModels.ts` (production in its
  resource's colour, storage `storeWood`/`slate`, knowledge `blueRoof`, defense `guardStone` +
  iron, ship `lightWood`/`copper`) — a new building picks its family's colours, never a new
  material. Ages go through `ageColor` (wood/walls swap material at Iron and Industry,
  `FAMILY_COLORS` keep their hue): add a new family colour to `FAMILY_COLORS`. **Signs**:
  `partsOf` adds a post at `SIGN_SPOTS[type]` and sets `Parts.sign` (scaled by `grow`,
  exposed as `BuildingModel.sign`); `render/signs.ts` `SignsView` (owned by `BuildingsView`,
  `syncSigns` after `syncMeshes`) draws every sign as one camera-facing `InstancedMesh` from
  an atlas of the `iconSet` SVGs (`SIGNED` = atlas order: a new building type needs an entry
  there, `GRID` 4×4 holds 16), bigger beyond camera distance 32 (`NEAR`, `GROW`), no
  raycast. **Contact sheet**: `?sheet[&age=0..3][&types=a,b]` (`sheet/buildingSheet.ts`,
  routed in `main.tsx`): every building, levels 1–3, game lighting, signs; screenshot it
  with `scripts/shot.mjs` (wait ~6 s) after any model change. Sea of clouds: see
  `environment.ts` (`KIWAR_LITE` = the plain old sea). In-game check of many buildings: push
  copies of the Nest on free tiles 2–4 steps away (see the Chantier 11 note) and look at the
  default zoom.

- Chantier 23 (lights, living tiles, paths, sobriety): **frame loop** — `render/frameLimiter.ts`
  `FrameLimiter` (cap 30 / 60 / 0 = unlimited, store `fpsCap`, `actions.setFpsCap`,
  `kiwar.fps`, `?fps=30|60|max`) and `IdleWatch` (30 fps after 3 s without a sign of life, 20
  after 20 s). Skipped rAF frames only run `afterFrame` (the tick). Signs of life: window
  `pointerdown/move`, `wheel`, `keydown`, `touchstart` (`renderer.wake`, also on menu close),
  `rig.update()` true, painter, placing ghost, `waves.active`, `predators.playing`,
  `pendingShow`. **A new on-screen show must wake the loop** (add it to that list in
  `drawFrame`). `adaptQuality` compares fps with the aimed rate; auto starts strong GPUs on
  Medium (`autoCeiling`) and steps up to High when the GPU timer reads < 5 ms. Measures:
  `scripts/sobriety.mjs <save>` (`STUB=1` skips the WebGL calls: frames drawn and main-thread
  ms per second), `scripts/lightSheet.mjs <save> <out.png>` (8 hours × 4 seasons, env `HOURS`,
  `SEASONS`, `ZOOM`, `W`/`H`). Headless software WebGL: compare A/B **in the same page**
  (toggle a group's `visible` or a uniform); page-to-page noise reaches ±15 %; read
  `renderer.renderer.info.render.triangles` for geometry cost. **Night lights**:
  `BuildingModel.lights` (doors marked in `partsOf` before `dress`, windows kept where a ray
  hits the wall; a new model needs a `C.door` part to glow), `render/windows.ts`
  `WindowsView` owned by `BuildingsView` (`lit` = beds in use + work/train jobs), halos in
  `weather.sync(state, lit)`, path lanterns (`PathsView.setGlow`); all on the same curve from
  `updateCycles`. **Wind**: `render/wind.ts` `withWind(material, sway)` (instanced materials,
  props unrotated; `windUniforms`, off in Low). **Crops**: `render/crops.ts` `CropsView`
  (`GameRenderer.syncCrops`: producers' pool tiles, ratio from `depletedTiles`; their props
  are cleared like under a building; one instanced mesh per piece kind). **Paths**:
  `render/paths.ts` — one merged segment geometry per age × 2 variants instanced per
  segment (all segments have the same length), hub per tile, `sync(paths, age, ends)` with
  building/site keys as ends. Chantier 32: the track is a flat `ribbon` (y +0.004, wandering
  edges, darker rim, exact width at both ends, plain on the `CROSSING` 40 % near the centre
  where the segments of a tile overlap), flat details per age (top faces only), hubs a wobbly
  flat patch (`hubGeometry`, vertex colours × the age's bed colour, turned per tile). Crops:
  seed fields are `ridge` + `stalk` + `pod` pieces (the pod hangs at the stalk's top computed
  from the same yaw × tilt quaternion).

- **Chantier 34 (living kiwis and creatures)**: `render/anim/` — `pose.ts` (`Pose`: body
  bob/squash/pitch/roll/yaw/sit, head, wings raise + forward swing, legs, `prop`, `propSwing`,
  `glow`; `blendPoses`), `clips.ts` (`CLIPS`: procedural clips by group move/work/life/
  combat/state, one-shots hold after `once`; `ClipPlayer.play(clip, at)` + `pose(dt, rate)`
  crossfades), `props.ts` (accessories anchored to the right wing tip — authored along +Z,
  a forward wing swing raises them —, the body front or the ground; `companion`),
  `kiwiRig.ts` (`KiwiRig.draw(KiwiDraw)` then `end()` once a frame), `part.ts` (`Part`: one
  instanced part kind, hidden when unused), `creatures.ts` (`CreatureRig`, ferret and bat
  clips, gear by age). `KiwisView` keeps its agents (cosmetic, A*) and draws through the rig:
  `agent.clip` (null = the activity's default via `clipOf`), `agent.face` (heading to turn to
  while standing), `walkToPoint` (exact spot), `settle(agent, activity, clip, timer)`. Roles
  per state in `assignRoles` (Library place, School "index/count", guard sector) are part of
  the plan signature. Library: `thinkLibrary`; School: `thinkSchool` + `lessonSide`; guards:
  `thinkGuard` + `guardPosts` (cached until the turrets change); idle: `thinkIdle`,
  `pastime`, `startChat`/`leavePartner`; builders at `FOOT` from the site. `outpost` kiwis
  are not drawn. `particles.ts`: pools per shape × look (`lit`, `soft`, `glow` unlit),
  `EFFECTS` + `particles.effect(id, at, scale)`; `particles.mesh` is a `Group`.
  **Review sheet** `?kiwis[&t=1.5][&clips=read,ferret run,fx fire][&zoom=1.5]`
  (`sheet/kiwiSheet.ts`): every clip, creature (and age look) and effect; check it after any
  change in `render/anim/` or `particles.ts`. In-game checks of a lived colony: generate a
  save (`tools/balance/src/perfSave.ts`), load it with an init script (as `scripts/perf.mjs`;
  `kiwar.clockOffset` + N hours lands in daytime), close the offline summary with
  `uiStore.setState({ modal: 'none', offlineSummary: null })` (**`modal: 'none'`, not null**:
  any other value pauses the drawing), set `rig.controls.minDistance` lower and
  `moveTo/dollyTo(…, false)` (no transition), mutate jobs **after** any `dispatch` (the state
  object is replaced) and step `renderer.kiwis.update(0.1, …)` a few hundred times so the
  kiwis reach their places before the shot.

- **Chantier 30 (levels 1–12, reserves)**: level badges ring in the age's colour
  (`AGE_RINGS`) and shrink the font for two digits (the model of a level: chantier 33). Warehouse heaps:
  `reserveHeapGeometry(1|2|3)` added as a `heap` child of the warehouse group
  (`BuildingsView.syncHeaps`, size from the reserve fill); `renderer.showCollected` floats
  "+1 250" (`DropLabels`, never picked) and wakes the loop. `actions.collect(id | null)`
  dispatches `collect` / `collectAll`, diffs the reserves for the labels and plays
  `warehouse.collect` over each warehouse; a tap on a warehouse calls `actions.collectAt`
  (`startGame` `onTileTap`, not in path mode). UI in `ReserveInfo.tsx`: `ReserveSection`
  (warehouse sheet), `NestReserves` (Nest sheet), `ReserveBadge` (`.badge-stack`: reserves full,
  the harvest stops); phone menu entry "Bring back all reserves"; resource chips turn gold while
  the stock overflows (`is-reserving`) and show a thin reserve line (`.chip-reserve`).
  `BuildingTree` folds the hidden levels of a later age into one line (`plans.levelRange`).

- **Chantier 31 (objectives in three horizons)**: `ObjectivesPanel.tsx` — `NextStepLine`
  (shared `nextStep`, a button per step id: defense, repair tile, `collect(null)`, plans,
  research, posts, hatch; hidden during the tutorial and when the step is a claim), the
  tutorial row or three age objectives (`ObjectiveRow`, hints folded on phones), `AgeLine`
  (shared `ageProgress`); the thumb pill shows a reward to claim or the next step;
  `ObjectiveWatcher` (mounted in `App`) toasts once per fulfilled objective. Memos in
  `ui/derived.ts` (`nextStep`, `ageObjectives`, `ageProgress`, `claimableObjective`). The
  defense window's `WaveActions` lists the answers to a wave; the planner shows the launch
  cost (`.launch-cost`).

- **Chantier 35 (big buildings)**: `render/footprintFrame.ts` `footprintFrame(map, type, b)`
  (centre, height of the highest covered tile, `angle`: a triangle's door +z faces its anchor,
  the monument a multiple of 60°) places buildings, sites, the ghost and the twin's
  buildings. Models: `render/models/spread.ts` grows the recipe at the centre and dresses the
  other tiles (`TRIANGLE` / `HEXAGON` tile centres in model units); a new big building needs
  an entry in `DRESS`. Placement: store `placingRot`, `actions.rotatePlacement` (key R,
  "Turn" in `PlacingBanner`), `actions.placeFrom(type, tile, rot)` (tile sheet), the ghost's
  pads (`PlacementGhost.setTile(tile, valid, map, rot)`), `placementCover` (harvest and
  paths covered), `firstRotation`. Selection rings the footprint (`SelectionView.setFootprint`,
  red blockers for a cramped building). Kiwis' `findPath(…, blocked)` takes the shared walls.
  The `?sheet` widens its cells for big models.

- **Chantier 36 (battles)**: `render/battle/` (`timeline.ts`, `BattleShow.ts` replacing
  `predators.ts`, `gates.ts`), `ui/battleStore.ts` (out of the main store), `BattleBar.tsx`
  (bar and unit card), `game/battleOutcome.ts` (a live wave's outcome waits for the end of its
  show); a tap picks a battle unit before a tile; `KiwisView.setHidden`,
  `BuildingsView.maskDamaged`. See `kiwar-battle`.

- **Chantier 38 (forge, skill `kiwar-forge`)**: `IronChip`, `ForgeInfo`, `GearSection`,
  `render/models/forge.ts` (+ `forgeYard` in `spread.ts`), iron craters (`IRON_GLOW`,
  `SHARDS` in `meteors.ts`), gear parts in `kiwiRig.ts` (`KiwiDraw.weapon` / `armor`), `?kiwis`
  gear cells. `.icon` is `display: block`: inside a paragraph give it an inline rule.

- **Chantier 41 (the live battle on the twin)**: `LandingInvite` (desktop under the top bar,
  phones docked first in `.thumb-stack`), `VisitBanner` while watching (`watchingLanding`),
  `BattleBar` in the visiting HUD too (landing title, framing buttons `.battle-frames`), the
  report's "Watch the battle again"; store `landingInvite`, `watchingLanding`; the alien
  village's models in `render/models/alien.ts` (`?sheet&aliens`: kinds × ages). See
  `kiwar-battle` (show) and `kiwar-world` (twin, camera).

## Performance (chantier 10)

- **The UI store is the usual suspect.** The controller emits a new `game` and `now` 5 times
  a second; every mounted `useUi` selector runs on every `setState`. Never call costly shared
  selectors in a selector or render body directly: use the per-state memoized versions in
  `ui/derived.ts` (`netRates`, `capacity`, `consumption`, `housing`, `population`,
  `hungerStage`, `forecastWave`, `bedsOf`, `moraleOf`…; add new ones with `perGame`). Keep
  fast-changing numbers out of `uiStore` (frame stats → `perfStore`, camera → `viewStore`).
  `useUi(selector, shallow)` for object/array selectors; `useT()` is stable per language;
  memoize list items (`memo` from `preact/compat`, e.g. `KiwiPortrait`).
- **The tick is driven by the frames** (October 2026 pass): `GameRenderer` calls
  `callbacks.afterFrame()` after every animation frame (drawn or not); `startGame` uses it to
  run `controller.tickIfDue()` and, one frame later, the interface half of that tick
  (`pendingUi` → `publishState`). The controller's 200 ms timer only ticks when no frame came
  for 300 ms (hidden tab). Exceptions in `afterFrame` are caught (they would stop the loop).
  Saves: `controller.saveSoon()` (idle callback); `save()` only for leaving the page.
- **Per-state caches shared by UI and 3D**: `game/perState.ts` (`perGame`, `harvests`,
  `harvestOf(state, id)`, `productionRates`, `netRates`, `storageFull`, `bedsOf`), re-exported
  by `ui/derived.ts`. Never call the shared `buildingHarvest` / `netRates` per building in a
  view or a render body. `slowGame` / `slowNow` in the store: refreshed once a second or right
  after an action, for slow widgets (clock, objectives, hunger/threat badges, speech).
- Shared caches keyed on objects (`pathsKey`, `terraformKey`) rely on the simulation
  **replacing** `state.paths` / `state.terraform` instead of mutating them (a length/count
  check catches appends): keep it that way.
- Measure: `?debug` (frame fps, median, p95, worst, skipped beats = frames over 1.5 × median,
  JS ms per frame, GPU ms per frame via `render/gpuTimer.ts` when the browser exposes timer
  queries, draw calls, pixels, GPU name; interface ms/s, worst update; tick cost split
  simulation / 3D / interface; long tasks per second; last menu open time). `scripts/perf.mjs <save.json>` replays a
  colony from `tools/balance/src/perfSave.ts` on desktop/phone screens, medium/low, CPU ×4.
  Headless WebGL is software (≈ 1 fps): trust the JS/interface columns, not fps. For a CPU
  profile, use CDP `Profiler.start/stop` from Playwright and sum self/inclusive time per
  function (the hot path shows up immediately).
- Rendering: `pixelRatioFor` (quality.ts) caps device pixels per preset (`pixelBudget`) and
  integrated Intel GPUs (`isIntegratedGpu`) at 1.25, recomputed on resize; those also get the
  low preset in auto (a ratio of 1 without canvas MSAA looked jagged to the owner: keep MSAA). Soft shadows only in high (`softShadows`); low uses
  `liteShadows`: `BasicShadowMap`, whose chunk branch `render/shadowChunk.ts` turns into a
  4-read bilinear PCF (three's PCF reads 17 times per pixel). The sky is drawn after the opaque
  scene (`renderOrder` 50, far plane) so covered pixels skip its noise; `Environment.setLite`
  (low) lightens the sky and cloud noise. Ablation per scene group in software rendering is a
  good relative guide (fill-bound: terrain ≈ 45 %, shadows ≈ 20 %); Lambert instead of PBR
  gained nothing. While a modal
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
  `--berry`, `--gap`, `--safe-*`). Phone breakpoint `max-width: 760px` (landscape phones:
  `max-height: 520px`), and `.hud.thumb` for the thumb bar (chantier 21); when a tile sheet
  is open the HUD has `.has-sheet` (bottom sheet down to the bar; other floating panels hide).
- Icons are inline SVG: named components in `ui/icons.tsx`, and the `<Icon name>` registry of
  `ui/iconSet.tsx` (chantier 11) for buildings, effects and branches.
- Safety nets: `Guard` (error boundary) wraps the tile sheet, the modals and the whole app;
  while loading, the animated `#loader` of `index.html` (chantier 22: inline SVG + CSS, a kiwi
  bird running on a turning kiwi slice) covers the page until `game`, `intro` or `bootError`
  is set (`startGame` subscription, then two frames, fade 0.6 s); `BootScreen` only shows
  `bootError` (retry / play solo). Screenshot the loader by loading `index.html` without its
  script (`page.setContent`): blocking `main.tsx` stalls the page.
  Never return an empty HUD.
- Back from a break: `RecapBubble` (corner, < 8 h, auto-closes after 12 s unless alarming;
  "details" sets `recapOpen`) or `OfflineModal` (≥ 8 h or on demand).
- Chantier 20 (comfort): `TapDetector` tracks pointers by id (a `Set`), catches releases on
  the window in the capture phase, on `lostpointercapture`/`pointerleave`, and forgets every
  pointer on blur/hidden and on a mouse press or a first finger (`isPrimary`). **Never count
  pointers with a bare integer** (a release over a panel blocked every tap until a reload);
  the env is injectable for `test/picking.test.ts`. Opening a modal ends placing and path
  mode (`startGame`). `TrainingBar.tsx`; `VillageSort` (+ the six stats); sticky
  `.kiwi-nav`; `queueOpen`/`threatOpen` + `setPanelOpen` (persisted); hover zone
  (`hoverBuildingTile` → `refreshCatchment`, `setCatchment(…, faint)`); `plannedRim`.
- **Chantier 32 (fixes and sky)**: boot milestones `game/bootTimes.ts` (`bootMark`; shown in
  the debug panel `BootLine` and the console with `?debug`); online, `GameController.showCache`
  displays the cached colony read-only (`previewing`: `dispatch` answers `errors.syncing`)
  before `init`/`load`, and the guest import/transfer run after the display. The renderer
  waits for `compileAsync` (only with `KHR_parallel_shader_compile`, ≤ 4 s) before its first
  colony frame; `renderer.ready` gates the loader fade. Desktop bottom-left column
  `.left-stack` (expeditions above the queue: never a hand-made offset between them).
  `setPanelOpen('objectives' | 'queue' | 'threat')` persists the panels. Research rows of an
  age not reached show `tech-hidden` "???" tiles (`isSecret`; the next passage stays
  readable). Comet arrow and cosmos: see `kiwar-sky` and `kiwar-world`. Headless boot
  measures: `vite preview` of a production build + a seeded save; the first frame is
  dominated by software shader linking (3–4 s), not by the game.
- **Chantier 21 (thumb layout)**: `ui/layout.ts` `THUMB_QUERY` (≤ 760 px wide, ≤ 520 px
  high, or a coarse pointer up to 1500 px) / `useThumbLayout()`; the HUD gets `.thumb` and
  `App` mounts `MobileNav.tsx` `ThumbBar` (Build → plans, Village, `EggButton inBar`,
  Defense with the wave countdown, Menu) instead of the topbar column (`TopBar buttons`),
  the round fabs and the floating egg. The named menu (`NavMenu`, store `menuOpen`, mounted
  only while open) lists everything else by group: **a new HUD button needs an entry there**
  (and keeps its round button/column button on desktop). Above the bar, `.thumb-stack`
  stacks nudges, expeditions, `.badge-stack` and the queue (static children): never place
  a floating panel with a hand-made bottom offset; use `--thumb-h` (portrait) /
  `--thumb-w` (landscape phones). Objectives fold into `.objective-pill` (`ObjectivesPanel
compact`). Long sheets on touch: `FoldSection` (a `<details>` there, a plain section on
  desktop), `UpgradePreview foldable`, the tile sheet's `.sheet-foot` (`UpgradeAction`).
  Check the whole tutorial by taps with `node scripts/tutorial-mobile.mjs <outDir> 375 667`
  (dev server running; also 393 852 and 915 412): it needs `window.__kiwar`, imports the
  shared module the page loaded, waits for the camera to rest (a selection pans it) and
  targets buttons with `button:has-text(...)` (banner hints quote button names).
- Taps: a far planet (no tile hit) → its card (`onPlanetTap`; while visiting, only other
  planets answer); a building or construction site wins over a
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
   and a phone shot `… 390 844 3000 1` (the last argument turns on touch: the thumb bar),
   plus landscape `… 844 390 … 1` for HUD changes. Running many shots in parallel starves
   the frames: an animated element may not be there yet. Use `ACTIONS=./file.mjs` to script the page (grant
   resources, dispatch commands, select a tile, click buttons), then look at the PNG with Read.
3. Check both desktop and phone, and the console output printed by the script.
4. Headless Chromium auto-detects the **low** preset (no building animations): call
   `renderer.setQuality('medium')` in the actions. Frames are slow there: CSS animations (modal
   fade-in) need ~3 s before the shot, and `controller.setTimeScale(300)` finishes buildings
   quickly (queue length is limited: build two at a time). Zoom with
   `renderer.rig.focus(x, y, z)` + `renderer.rig.controls.dollyTo(d, false)`.
5. Confirmations: `uiStore.setState({ modal: 'demolish', demolishId })`; the `.modal-confirm`
   class turns a modal into a bottom sheet on phones.
6. A seeded colony: write a save with `pnpm --filter @kiwar/balance exec tsx src/perfSave.ts
<out.json> 72` and inject it with `addInitScript` (`kiwar.save.v1`, `kiwar.clockOffset` =
   savedAt − now, `kiwar.introSeen`; guard with a `sessionStorage` flag so a reload keeps the
   game). To force a look, wrap the view's `sync` (e.g. `renderer.paths.sync` with another
   age) — the next state update overrides a direct call. Spring: `calendarStart = now − 0.4 h`;
   night: `now − 1.83 h`, then a `debugGrant` dispatch.
7. Gestures and animations at real speed: headless frames take ~0.5 s, so pointer events
   arrive far apart. Stop the loop (`renderer.renderer.setAnimationLoop(null)`) and drive
   `rig.update(1/60)` from a `setInterval`, or step an animation by hand (`intro.update(1/60)`
   up to a time, then `renderer.renderer.render(intro.scene, intro.camera)`) before the shot.
   A short video: step 1/30 s per frame, a screenshot each, then
   `ffmpeg -framerate 30 -i f%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4` (installed).
   Touch swipes: CDP `Input.dispatchTouchEvent`.

- Chantier 19: the Siege screen — since chantier 40 only the conquered face and the settlers'
  ship (`SiegeModal`, `actions.planSiege({ mission: 'found' })`); see `kiwar-colonies`.
- **Chantier 40 (landing)**: `ExpeditionModal` (landing screen), `LandingParts.tsx`
  (`LandingMap`, `ParcelPanel`, `OrdersPicker`, `LandingForecastLines`, `UnitList`,
  `BestiaryList`, `LandingReplay`, `sectorName`, `fmtRange`), `ReportModal` (`LandingReport`),
  `BestiaryModal` (`bestiaryOpen`, over any modal), twin fog from `faceViews` in
  `startGame.showTwin`. Visual checks: push a level-3 launchpad, classed kiwis,
  `faceViews` and `bestiary` on `controller.state`, `debugGrant`, then
  `uiStore.setState({ modal: 'expedition', expeditionPad, siegePlan: { mission: 'land',
sector } })`; a real landing in solo: dispatch the launch and `setTimeScale(20000)` ~4 s.

- **Chantier 33 (buildings by age, 3D thumbnails)**: models live in `render/models/` —
  `kit.ts` (palette `C`, `Part`/`Parts`, `rig`, `emitter`, primitives, `bake`), `ageKit.ts`
  (the `Look` {age, tier, level, colonyAge, docked}, materials `A` of the later ages, pieces
  `wall`, `round`, `gable` (the lean-to prism: ridge at the back at y + 0.87a, eave at z + d),
  `cap`, `door` (always a `C.door` leaf: night lights), `chimney`, `pipe`, `lamp`, `banner`,
  `annex`, `crown`; helpers `byAge`, `frameColor`, `mix`, `shade`, `beam` (box or cylinder
  between two points, optionally in a rig), `under` (moves the parts a draw adds; `rigs` true
  only for a turn/scale that keeps the pivots)), then one file per family. **A recipe is
  `(look) => Parts`**; `lookOf(type, level)` gives the age of the level (monument: its level,
  lab: Iron then Industry, camp: Eden). At age 0 every piece draws exactly the old primitive;
  later ages use `const level = age > 0 ? 3 : look.tier` for the Eden pieces (never poorer
  than level 3), and `partsOf` adds the kit's `annex` (tier 2) and `crown` (tier 3) at
  `ANNEX_SPOTS` / `CROWN_SPOTS` unless the type is in `OWN_ANNEX` / `CROWNED`; `grow` scales
  levels 4–12 (1 + 0.05 age + 0.015 (tier − 1)); `dress` recolours by `ageColor` (look age),
  lays the plinth (`PLINTHS`) and the Iron lamp, and a chimney only for types not in
  `OWN_CHIMNEY`. A new building: a recipe from the kit, its sign spot, then check it with
  `?sheet&age=N[&levels=3,4][&types=a,b][&zoom=2]` (the levels of an age, a passage, a
  close-up). Turrets: the weapon is authored along +z then turned by `AIM` (profile) inside
  `under(…, true)`. **Thumbnails**: `render/thumbnails.ts` (`setThumbnailRenderer` from
  `startGame`; `thumbnailUrl(key)` queues and returns null until drawn; `onThumbnail`
  listeners; drawn with the game's context into an MSAA target, state restored, object URLs,
  two per frame; `buildingPicture` = the model without its sign post; locked = silhouette in
  the dark ink) and `ui/components/BuildingThumb.tsx` (`type`, `level`, `locked`, `size`; the
  SVG icon while drawing), used in `BuildingTree` (cards, level rows, placing banner),
  `TilePanel` (sheet header, build options) and `QueuePanel`. Headless Chromium draws ~1
  frame/s: allow 20–40 s for a screen of thumbnails. In-game check of every building at an
  age: push copies of the Nest at `age × 3 + tier` on free `buildableTiles` (≥ 2 apart), set
  the monument's level to the age, dispatch a `debugGrant`; keep the **low** preset for a full
  village (medium jams the software renderer for > 30 s per frame). Geometry checks without a
  browser: tsx imports `render/buildingModels.ts` in Node (hash the position and colour arrays
  to prove a refactor changes nothing); `test/buildingModels.test.ts` checks every model, the
  look of a level, new materials at each age and more pieces with the tiers.
