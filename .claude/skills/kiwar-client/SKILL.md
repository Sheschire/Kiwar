---
name: kiwar-client
description: Kiwar client architecture (Three.js renderer, Preact UI, zustand store, i18n, mobile layout) and how to verify visual changes with screenshots. Use for any change in apps/client.
---

# Kiwar client (`apps/client/src`)

## Wiring

- `main.tsx` creates `GameRenderer` (canvas) and `GameController` (game state, local save or
  online backend), binds them to the UI with `bindActions`, renders `<App />`.
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
- `terrain.ts` (tile prisms, `setDepletion` tint), `water.ts`, `props.ts` (cleared under
  buildings/paths), `kiwis.ts` (cosmetic agents, A* in `pathfinding.ts` with the same walk
  costs as the sim), `selection.ts` (hover/selected/catchment markers), `paths.ts`.
- Camera: `camera/CameraRig.ts` (camera-controls). Desktop: left-drag pan, right or Alt/Ctrl+drag
  rotate, wheel zoom, WASD, Q/E. Touch: one finger pan, pinch, two-finger twist. Path mode
  disables one-finger/left drag for the painter.

## UI (`ui/`)

- `App.tsx` lays out the HUD; components in `ui/components/` (TopBar, TilePanel = contextual
  sheet for the selected tile, QueuePanel, EggButton, PathTools, ExpeditionModal, ChatPanel…).
- Styles in `ui/styles.css`: parchment look, CSS variables (`--paper`, `--edge`, `--leaf`,
  `--berry`, `--gap`, `--safe-*`). Phone breakpoint `max-width: 760px`; when a tile sheet is
  open the HUD has `.has-sheet` (bottom sheet covers half the screen; other floating panels hide).
- Icons are inline SVG components in `ui/icons.tsx`.

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
