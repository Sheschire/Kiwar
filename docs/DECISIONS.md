# Kiwar — Decision log

Small design and technical decisions taken during development, with their rationale.
Larger choices were validated with the project owner (marked ✅).

## Milestone 1

### Validated with the owner
- ✅ **Workers drive production.** Production buildings have worker slots (1/2/3 per level). Output = base × level factor × tile richness × (assigned / slots). An unassigned kiwi produces nothing.
- ✅ **Multiple copies of a building** are allowed (one per compatible tile). The total number of buildings is capped by the Nest level.
- ✅ **The Nest is upgradable** (3 levels): it raises the building cap, the construction queue size, storage and housing.
- ✅ **One active construction at a time** (Ogame-style), plus a short queue. The active site borrows one kiwi as a builder.
- ✅ **Environment "A"**: pastel cosmic void, twinkling stars, drifting sea of clouds under the disc, distant kiwi moons; the disc is half a kiwi (strata on its edge, furry skin dome underneath).
- ✅ **Seed**: a new game draws a random seed and stores it; `?seed=…&face=…` starts a new game with those parameters (after confirmation if a save exists).

### Tooling
- **pnpm workspaces**, TypeScript strict (+ `noUncheckedIndexedAccess`). Packages export their TypeScript sources directly (no build step between workspaces): Vite, Vitest and `tsx` all consume TS natively.
- **TypeScript 5.9 / Vite 7 / Vitest 3 / ESLint 9** rather than the very latest majors, for ecosystem compatibility (typescript-eslint, vite-plugin-pwa).
- **three 0.180** pinned to stay inside the peer range of `postprocessing` 6.37.8.
- `packages/shared` compiles with `lib: ["ES2022"]` only (no DOM types), and ESLint forbids `Math.random`, `Date.now`, DOM globals and Three/Preact imports there: determinism is enforced by tooling, not just convention.
- **Typed home-made i18n** (~80 lines) instead of i18next: `en.ts` is the source of truth; `fr.ts` must have exactly the same shape, so a missing key is a compile error. `t()` keys are type-checked too.
- **Preact + zustand vanilla store**: the store lives outside the UI framework so the Three.js renderer can subscribe to the same state. A tiny `useStoreSlice` hook avoids depending on React typings.

### Rendering
- Custom `ShaderMaterial`s include `colorspace_fragment` so their colours match the PBR materials.
- Stars are procedural in the sky shader (no geometry, zero extra draw calls).

### World generation (step 2)
- Disc radius **12 hexes** (~490 tiles). Pointy-top axial coordinates; world X/Z = hex pixel coordinates (size 1).
- Generation order: footprint (ellipse) → skin = every tile touching the outside → seed ring (angular noise pockets) → down groves near the rim → wavy rays traced with hex lines → juice pools grown from centres away from rays/rim → heart (radius 1).
- The face map is **never saved**: it is regenerated from `(seed, face, params)`; only the game state is stored.
- Each tile has a **richness** (0.8–1.25, smooth noise) that multiplies the production of a building placed on it, so choosing the location matters.
- Kiwisu: ~90 grove / 27 seed / 10 juice tiles on average; Kiwino: ~45 grove / 35 seed / 13 juice (200 seeds). Production multipliers compensate (see `faceProfiles.ts`).

### Rendering (step 2)
- One `InstancedMesh` for all tiles (1 draw call). The top colour comes from `instanceColor`; the sides get kiwi strata (light flesh → deep flesh → white pith line → brown skin) from a patched `MeshStandardMaterial`, based on world height so strata line up across tiles.
- The disc is half a kiwi: a furry brown hemisphere hangs below the tiles.
- Camera: `camera-controls` (truck on the ground plane by default in v3). Left click/tap is reserved for selection; taps are distinguished from drags by distance (6 px mouse / 14 px touch) and duration (450 ms). Two-finger twist also rotates (custom handler).

### Art direction (step 3)
- **Juice pools**: custom shader on an instanced flat hex per juice tile, slightly larger than land tiles so pools look continuous. Foam is computed from a per-instance "which edges touch land" mask (no depth texture needed → works everywhere, cheap on mobile). Ripples, caustic ridges, fresnel sky tint and twinkling sun glints that feed the bloom.
- **Props** (all `InstancedMesh`, ~8 draw calls total): down tufts (stem + fluffy puff) on groves, glossy black seeds pointing away from the heart on the seed ring, pulp drops and grass on the flesh, pebbles on rays, fur on skin cliffs and on the dome. Prop placement uses the shared seeded RNG so a face always looks the same. Props on a tile can be hidden when a building is placed.
- **Static shadows**: the shadow map is rendered only when the scene changes (buildings), not every frame. Moving kiwis will use cheap blob shadows.
- **Post-processing** (`postprocessing` + `n8ao`): N8AO (half resolution) → one merged EffectPass with bloom, tilt-shift, slight saturation/contrast, **Khronos Neutral tone mapping** (ACES greyed out the pastel palette) and vignette.
- **Quality presets**:
  | | Low | Medium | High |
  |---|---|---|---|
  | Pixel ratio cap | 1.25 | 1.5 | 2 |
  | Shadows (static) | 1024 | 2048 | 2048 |
  | Post-processing | — (direct render) | bloom | AO + bloom + tilt-shift |
  | MSAA | browser AA | 2× | 4× |
  | Props density | 45 % | 75 % | 100 % |
- **Auto preset**: GPU name (WEBGL_debug_renderer_info), device memory, cores, coarse pointer + small screen. Desktop discrete / Apple Silicon → High, phones → Medium, weak GPUs / software rendering → Low. In Auto, if the average fps stays under 40 for ~4 s the preset steps down. `?quality=low|medium|high` forces a preset (handy for testing).

### Simulation (step 4)
- `advance(state, now)` is **event-driven**: it jumps to the next event (end of the active construction, egg hatching), integrating production linearly in between (rates are constant between events), clamped at storage capacity. A test checks that one big step equals many small steps.
- **Costs are paid when ordered**; cancelling refunds 100 % (cozy, no punishment).
- **One active construction**; the next queued item starts at the exact millisecond the previous one ends (even offline). The builder is an idle kiwi if any, otherwise one borrowed from the most-staffed workplace; it goes back afterwards if there is still room.
- **Autonomous kiwis**: a new production building grabs an idle kiwi; newborns and freed builders go to the producing building with the lowest staffing ratio. Kiwis the player deliberately idles stay idle.
- **Tile richness is copied into the building** at placement so `advance` does not need the face map; `applyCommand(state, cmd, { now, map })` needs it to validate placement (the server will regenerate the map from the seed).
- **Rays**: building next to (or on) a ray is 15 % faster.
- **Additional copies** of a building cost ×1.3–1.4 per existing copy (and take √ of that longer): upgrading is often better than spreading.
- **Level 3 requires Nest level 2.** Nest: buildings cap 6/11/18, queue 2/3/4, storage 300/800/2000, housing 4/6/8, small passive pulp/fibre income so the game can never soft-lock.
- **Eggs**: cost and incubation grow geometrically with population (20 s for the 4th kiwi, ~6 min for the 10th, capped at 2 h). One egg at a time, capped by housing.
- Kiwi names come from seeded syllables stored in the state RNG.
- Objectives are claimed with a button (gives the reward) — more satisfying than an automatic reward.
- `debugGrant` is a regular command (so even debug goes through the rules); the server will refuse it.

### Persistence & clock (step 4)
- Save = `{ format, savedAt, state }` JSON in `localStorage` (`kiwar.save.v1`), validated with **zod** and migrated by `schemaVersion`. The face map is regenerated from the seed.
- Autosave every 5 s, after each command/event, and on `visibilitychange`/`pagehide`.
- The client clock is `virtual = real + offset`; the debug time multiplier (×10/×100) grows the offset, which is persisted so a reload never goes back in time. A new world resets it.
- "While you were away" appears for absences ≥ 1 min: duration, resources gathered, constructions finished, kiwis hatched, storages that filled up.
- Opening a `?seed=` link while a colony exists asks for confirmation instead of overwriting it.
- Debug panel: `` ` `` key (also `²` on AZERTY) or Settings → Debug panel (mobile).

### Gameplay UI (step 5)
- **Tile panel**: side card on desktop, bottom sheet on mobile (max 52 % of the height, scrollable). It shows the tile (resource, richness), then either the building (workers −/+, production, housing/storage, upgrade with cost/duration and the exact reason when impossible), the construction progress, or the build menu filtered by tile type with a production preview (richness × climate).
- Buttons are disabled using the shared `validateCommand` (the UI never duplicates rules).
- **Queue panel** (bottom-left): progress, remaining time, builder name, cancel (full refund); tapping an entry selects and focuses the site.
- **Egg button** (bottom-right) with a progress ring while hatching; cost and incubation time shown next to it on desktop.
- **Objectives panel** (top-left, toggled by the scroll button; open by default on wide screens). Rewards are collected with a glowing button.
- On mobile, opening the tile sheet hides the queue, egg and objectives to keep the view clear.
- **Buildings**: procedural low-poly models (one merged, vertex-coloured geometry per type × level, cached), flags for levels 2 (blue) and 3 (gold). Construction sites show scaffolding with a translucent ghost rising with progress; queued sites show a stake. Completion = bouncy pop + sparkle burst. Decorative props are removed under buildings and sites; static shadows refresh on change.
- Tapping a building selects its tile (raycast against buildings first, then tiles).
- Dev builds expose `window.__kiwar` (controller, renderer, store, actions) for debugging.

### Villagers (step 6)
- Kiwis are **cosmetic agents** mirroring `state.villagers` and their `job`; positions are never saved.
- Behaviour per job: *idle* → potter around the heart ring; *work* → loop Nest ↔ workplace (walk, peck for 3.5–7 s, carry a resource-coloured load back, drop it); *build* → walk to the site and do a hopping hammer dance until it completes.
- Paths: A* over hex tiles (`walkCost` from tile data; rays cost 0.5 so kiwis prefer them, and walk 1.6× faster on them). Juice pools and skin are not walkable, except as a destination (wells).
- Rendering: 4 instanced meshes for all kiwis (merged body+head+beak+eyes, legs, blob shadows, carried loads) → constant draw calls whatever the population. Waddle = roll + bob + alternating legs; spawn with an ease-out-back pop and a sparkle burst at the Nest.
- Moving kiwis use blob shadows instead of the (static) shadow map.

### Balance tool & pacing (step 7)
- `pnpm balance [--seeds 200] [--threshold 10] [--hours 72] [--out path]` plays a deterministic greedy bot on N seeds per face through `applyCommand`/`advance` (the real rules), measures milestones (tutorial done, population 10, Nest 2, Nest 3, every building type at level 3) and writes a Markdown report (`tools/balance/reports/latest.md`, snapshot in `docs/BALANCE_REPORT.md`). Gaps between the Kiwisu/Kiwino medians (or in the share of runs reaching a milestone) above the threshold are flagged.
- The first run flagged Kiwino ~14 % slower: its malus was on pulp/fibre, the bottleneck resources, while its bonus (seeds/juice) was not. Climate multipliers were rebalanced (Kiwisu pulp ×1.05, seeds/juice ×0.95; Kiwino seeds/juice ×1.05) → all milestones within ±1 %.
- Economy pass: production roughly ×1.6, Nest passive income doubled, storage +25 %, cheaper eggs. Bot pacing (median): 7 tutorial objectives in ~3 min, a building action every few minutes for the first ~8 min, then 10–20 min waits; tutorial (incl. Nest 2) ~1 h 10, Nest 3 / everything level 3 ~6 h 20 of game time.
- 200 seeds × 2 faces run in ~50 s.

### Mobile, PWA & polish (step 8)
- **PWA** via `vite-plugin-pwa` (auto-update service worker, precached assets, manifest with regular + maskable icons, Apple meta tags). Icons are rendered from `public/icon.svg`. `base: './'` so the build can be hosted in any sub-folder.
- Production bundle split into `index` (game + UI, ~59 kB gzip), `three` (~122 kB) and `postfx` (~104 kB). Only the Latin + Latin-ext font subsets are loaded (`œ` is in Latin-ext).
- Loading screen in plain HTML/CSS, faded out after the first frames.
- **Phones in portrait**: the default framing crops the rim slightly; selecting a tile zooms on it and shifts the view (camera focal offset) so it stays visible above the bottom sheet. In landscape phones the tile card becomes a side card.
- Selection ring is opaque gold (additive blending disappeared on pale tiles); fixed its triangle winding (it was back-face culled).
- French copy avoids gendered agreements (“Construction terminée : {name} !”, “{name} a éclos !”, “Votre absence a duré…”).
- i18n test: same keys, no empty strings and identical placeholders in FR and EN.

### Feedback round 1
- **Mouse controls reworked**: left-drag now pans the map (a click without movement still selects — 6 px / 450 ms threshold), right-drag orbits, Alt/Option or Ctrl + left-drag also orbits (Mac trackpads without a right button; Ctrl+click is the macOS right click), wheel / trackpad pinch zooms. Grab / grabbing cursor on the canvas.
- **Resource tooltips**: hovering a resource chip (mouse) or tapping it (touch, stays open until tapping elsewhere) shows a short explanation (what it is for, which building produces it, where), the stock / capacity, production per hour, and either the time until storage is full or a hint to build a Warehouse. The population chip explains housing and reports idle kiwis.

## Milestone 2 — backend (Supabase)

- **Guests are anonymous Supabase users** (`signInAnonymously`): playing starts immediately, the game is already server-side, and converting keeps the same user id (Google via `linkIdentity`, email via `updateUser` + confirmation link). Signing in to an existing account on another device replaces the local guest colony (the UI says so).
- **Server authority**: the `game` edge function (Deno) runs the very same shared rules (bundled from `packages/shared` with esbuild; a test fails if the bundle is stale). The client never sends state, only commands; the server owns the clock (no time multiplier online) and the randomness (seeds).
- **Protocol** (`shared/server/protocol.ts`, zod-validated): `load` (creates the game if needed, optionally from a shared link), `command`, `newWorld`, `import`. Responses carry the authoritative state and the server time.
- **Optimistic client**: commands are applied locally for instant feedback, queued, sent in order; each answer rebases the local state (authoritative state + still-pending commands, advanced to now). Rejected commands show the error and roll back. Offline: commands wait and retry with exponential backoff (2 s → 30 s); the last authoritative state is cached for display.
- **Concurrency**: `games.version` optimistic locking, one automatic retry.
- **Anti-cheat (basic)**: RLS makes games read-only for players; every command is logged (`command_log`, purgeable after 30 days); rate limit 40 commands / 10 s; `debugGrant` only for users listed in `admins`; imported milestone-1 saves must pass consistency checks (resources within storage + rewards, levels earned through completed constructions, kiwis ≤ 3 + eggs hatched, buildings on allowed tiles with the tile's richness, Nest in the heart…) and are only accepted into a pristine account, once.
- **One solo universe per player** for now (`universe_id = 'solo-<uid>'`, unique per user and universe) so milestone 3 can add shared universes without a schema rewrite.
- Supabase-js is loaded on demand (separate chunk) so local mode stays light.
- Tooling: `pnpm test:db` applies migrations to a real Postgres with a small `auth` stub and asserts the RLS rules; `pnpm mock:supabase` + `pnpm dev:online` run the online mode locally; GitHub Actions CI runs typecheck, lint, tests, DB tests, build and a quick balance report.

## Milestone 3 — expeditions (base)

- **Launchpad** (Aire d'envol, Nest 2): one ship per launchpad; cargo 150 / 300 / 500 and travel time ×1 / ×0.85 / ×0.7 by level.
- **The ship is a logistics puzzle** (no combat rounds; everything is decided before departure):
  - a kiwi takes 10 cargo units, a resource unit 0.1;
  - each crew member eats 4 pulp + drinks 2 juice per hour of travel, on both legs;
  - provisions still on board after the outbound leg take the room the loot needs on the way back;
  - one kiwi always stays home; crew of 2 minimum.
- **Battle** resolved once on landing: strength = crew × (0.5 + 0.5 × share of outbound rations covered) × luck (±10 %, seeded RNG). Victory if strength ≥ defense.
  - Losses: victory 25 % × defense/strength (max 60 %); defeat 50–90 %.
  - Lost kiwis are **gone for good** (the brief: "aliens decimate the first colonists").
  - Loot is picked most precious first (seeds → juice → fibre → pulp), up to the free hold, ×(1 + 25 % of the strength surplus), max ×2.
- **Return leg**: the crew eats the remaining provisions, then edible loot (pulp, juice); missing rations starve half of the shortfall share. Everything left in the hold is unloaded (storage limits do not apply to a homecoming).
- **Aliens reinforce**: each victory against a garrison adds its `reinforce` to its defense (twin face: defense 6 + 3 per victory) — repeated raids need bigger, better-fed crews.
- The **same forecast function** drives the preparation screen and the simulation, so what the player sees is exactly what will be simulated (except the ±10 % luck, shown as a range).
- Targets live in the game state (`targets`), set by the universe; a solo game targets the alien-held other face of its own kiwi. Schema v2 with a v1→v2 migration (also applied server-side when reading stored games).
- Villager names are now unique within a colony.
- The balance bot does not play expeditions yet; its "all level 3" milestone covers economy buildings only.
