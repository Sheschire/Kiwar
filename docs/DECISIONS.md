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
  |                  | Low               | Medium | High                    |
  | ---------------- | ----------------- | ------ | ----------------------- |
  | Pixel ratio cap  | 1.25              | 1.5    | 2                       |
  | Shadows (static) | 1024              | 2048   | 2048                    |
  | Post-processing  | — (direct render) | bloom  | AO + bloom + tilt-shift |
  | MSAA             | browser AA        | 2×     | 4×                      |
  | Props density    | 45 %              | 75 %   | 100 %                   |
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
- Behaviour per job: _idle_ → potter around the heart ring; _work_ → loop Nest ↔ workplace (walk, peck for 3.5–7 s, carry a resource-coloured load back, drop it); _build_ → walk to the site and do a hopping hammer dance until it completes.
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

## Milestone 3 — shared universes and chat

- **A universe** = several kiwis (pairs of faces). Joining by invite link (`?join=CODE`, 8 characters without ambiguous letters) gives the player **a new colony** on the first free face, twin faces first; their solo colony stays untouched and a switcher lets them move between colonies. Up to 8 players; a player may own up to 5 universes.
- **There is always at least one alien face**: kiwis = ⌊players / 2⌋ + 1. Both faces of a kiwi share the same seed (two halves of one fruit).
- **Co-op against aliens**: expedition targets are the alien-held faces of the universe (twin face first; faces on other kiwis are further away — +60 min, +4 defense per kiwi of distance — but richer). Targets are recomputed from the membership on every load/command; a ship whose target was claimed by a friend meanwhile turns back without fighting. Player-vs-player raids are left for universes created with a PvP option (later).
- **Server**: memberships are written by the `game` function only (it assigns faces; unique constraints + retry handle two friends joining at the same instant). Players can read their universes and member lists through RLS (`is_universe_member` security-definer helper).
- **Team chat**: `chat_messages` written directly by members under RLS; the author name is taken from the membership by a trigger (no spoofing); flood protection (5 messages / 10 s); 280 characters. Live via Supabase Realtime, with a 20 s polling fallback. **Mute** is local to the player (localStorage); **report** goes to `chat_reports` (readable by admins only). No automatic moderation yet.
- Client: universe modal (switcher, invite link with copy/share, members and alien faces, create, join by code), invite-link confirmation with a kiwi name, chat panel (side panel on desktop, bottom sheet on mobile) with unread badge.

## Milestone 4 — territory (deposits, camps, paths, logistics)

- **The land is finite.** Every flesh / grove / seed / juice tile holds a deposit (× tile richness) that harvesting drains and that **regrows** slowly (per tile: pulp 600 stock / +300 h⁻¹, fibre 500 / +250, seeds 200 / +80, juice 800 / +300). Sized so that a well-placed producer is sustainable at level 1, drains slowly at level 2 and needs its wider level-3 catchment.
- **Catchments**: a producer harvests the deposit tiles of its type within radius 1 (levels 1–2) or 2 (level 3). Tiles go to the **oldest building first**; a tile under another building is built over. Each producer pools the stock of its tiles. Tile richness now sizes deposits instead of multiplying the harvest rate.
- **Depletion follows the land**: when a tile changes hands (new building, upgrade, removal) it keeps its stock; unharvested deposits regrow on their own (stored lazily as `{stock, at}`), so rebuilding a camp does not refill a tile.
- **Exhausted deposit**: harvest falls to the regrowth. **Full storage**: harvest pauses and the deposit regrows (the Nest's passive income is unaffected by deposits).
- **Logistics**: harvest × efficiency, where efficiency = (30 + 4 × 3) / (30 + 4 × D), clamped to 0.35–1.25, and D is the walking cost to the nearest **depot** (Nest or Warehouse) — mean of tile costs per step (ray 0.5, heart 0.6, flesh 1, seeds 1.2, groves 1.5; juice and skin unwalkable; a well is reached from the shore, +0.5). Warehouses therefore double as relay depots.
- **Paths**: painted by the player on walkable tiles (4 fibre per tile, instant, removal free, max 20 + 15 × Nest level). A path tile costs 0.35 to walk. A construction ordered on a path replaces it. The cosmetic kiwi pathfinding uses the same costs and kiwis carry harvests to the nearest depot.
- **Gathering camps** (owner's answer 7: harvesting without a building, slower): free and instant (`gather` command), on a resource tile, outside the building cap, max 3, 2 kiwis, single level, harvest only their own tile (pulp 360, fibre 300, seeds 100, juice 360 per hour at full staff — a third of a building per kiwi, still more than one tile regrows). Camps can be dismantled; other buildings cannot (yet).
- **Exact offline simulation** is kept: `advance` adds two kinds of events, "a deposit runs dry" and "a storage fills up", between which every rate is constant. The face map needed by the simulation is regenerated from the seed and memoized (`faceMapOf`).
- Schema v3 (paths, free deposits, per-building pools), v2 → v3 migration; pools are set up on the next `advance`.
- Client: deposit bar, regrowth, time to depletion, logistics in the building card; deposits in reach when choosing a site; catchment highlighted on the selected producer; depleted tiles tinted towards dry straw; path mode (button above the egg; tap or drag to paint, start on a path to erase; on touch, two fingers pan/zoom while painting); stepping-stone paths; camp model.
- Balance: Nest level 1 passive income raised to 270 pulp / 230 fibre per hour to keep onboarding short. The bot now picks sites by deposits in reach × logistics, opens new sites when a producer is exhausted, and saves up for the bottleneck resource. It does not use camps or paths, so its times are an upper bound for a careful player.

## Chantier 01 — demolition and living buildings

Owner's answers: demolition is **instant**, refunds **25 %**, no "move a building" for now,
the Juice well gets a **windmill**.

- **`demolish { buildingId }`** works on every building but the Nest; `dismantle` (camps) is
  kept as an alias so queued/old commands still apply. Instant: it does not use the
  construction queue (a stuck player must be able to act right away).
- **Refund** = 25 % of what was invested, rounded to 5: the build cost of that copy (base cost
  × copyGrowth^(copies − 1), the copy being demolished counted among the copies) plus every
  upgrade level reached. Camps are free and refund nothing. Approximation accepted: with several
  copies built in a different order the refund is the price of the latest copy, not the exact
  one paid — no schema change needed.
- **Refused** for the Nest (`notDemolishable`), while an upgrade of that building is queued
  (`upgradeInProgress`, cancel first), while the launchpad's ship is away (`launchpadBusy`), or
  when housing would fall below the population (`housingNeeded`: "build another home first").
- **Effects**: workers go idle then are reassigned automatically, builders that were to return
  there stay free, deposit tiles go back to the land with their depletion (`releasePool`, then
  `syncPools` so neighbours may claim them), stock above the new capacity is kept (harvesting
  just pauses).
- A **"no dead end" test** builds 12 random colonies with a clumsy bot, demolishes everything
  allowed, and checks that the Nest alone pays for a Juice well then a Seed quarry that harvest.
- UI: discreet "Demolish…" link at the bottom of the building sheet → confirmation (modal on
  desktop, bottom sheet on phones) with refund, freed kiwis, storage / housing lost, deposit
  note. Two taps. The building sinks into a cloud of dust and debris.
- **Living buildings**: each model = merged static part + animated **rigs** (pivot + motion:
  spin, swing, pump, pound, bob, breathe, flicker). Pulpery press, Fibre workshop spinning
  wheel, Seed quarry drop hammer, Juice well windmill and bucket, Warehouse crane, breathing
  ship, rocking eggs and quivering twigs on the Nest, campfire, waving flags (level 2+).
- **The animation tells the state**, from the shared `buildingHarvest`: pace = 0.45 + 0.55 ×
  staff / slots; stopped when nobody works or storage is full (pause badge), very slow when the
  deposit is exhausted (exclamation badge). Ambient rigs (flags, eggs, fire, smoke) never stop.
- **Particles**: one instanced pool of 240 (pulp drops when the press hits, seed chips when the
  hammer falls, juice drops, chimney and campfire smoke, sparks, golden twinkles on the level-3
  golden egg). Bursts are synced to the rig phase.
- Quality: `buildingAnimations` and `particles` flags, both off in "low" (still poses). Rigs do
  not cast shadows (shadows are static).

## Chantier 02 — audio, sounds, admin space

Owner's answers: **soft acoustic** music, kiwis **speak now** (per-kiwi voice), **no** admin
management UI (admins are added with SQL), CC0 files **shipped in the repo as defaults**.

- The game never plays a file: it emits a typed **sound event** (`audio/catalog.ts`); a
  **binding** (sources + volume, pitch, random pitch, probability, cooldown, max voices, loop,
  fades, spatial flag, zoom / time-of-day / season conditions) decides what plays. Bindings are
  validated with zod everywhere (admin, manifest, import); invalid data falls back to defaults.
- Sources are references: `synth:<preset>` (generated in code, no licence), `builtin:<file>`
  (repo, ogg + mp3, the browser picks ogg when it can — Vorbis loops seamlessly — else mp3),
  `asset:<uuid>` (uploaded). Each event has a synth fallback used when a file fails to decode.
- Audio context created on the first gesture (iOS: silent buffer in the gesture), **suspended**
  while the page is hidden or muted (battery). Volumes: perceptual curve (slider²), stored in
  `kiwar.audio.settings`. Default levels: master 80, music 50, ambience 60, effects 80, UI 60.
- Anti-spam: per-event cooldown and max simultaneous voices; one-shots whose file takes more
  than 400 ms to load are skipped (no late sounds).
- Spatial sounds: no PannerNode/HRTF (cost on phones); gain from the XZ distance to the camera
  target relative to the zoom, softer off screen, stereo pan from the screen x.
- Ambience: two loops crossfaded every 250 ms from the zoom (birds 0.25–1, wind 0.1–1).
  Music: a single CC0 loop, 6 s fade-in. Kiwi voice: three babble variants, pitch offset
  ±4 semitones from a hash of the villager id (chantier 03 can plug real traits). Tapping a kiwi
  (generous screen radius) makes it speak instead of selecting the tile.
- Database: `audio_assets` (file metadata, bytes in the public `audio` bucket, 2 MB, audio
  MIME types only) and `audio_bindings` (event id → binding jsonb with size / shape checks).
  Everyone reads (even anonymous), only `is_admin()` writes (security definer helper, since
  `admins` has no read policy). The client reads the manifest with plain `fetch` on PostgREST so
  local players never download supabase-js; cached in `kiwar.audio.manifest`.
- Admin space at `/admin` (or `?admin`): `main.tsx` became a tiny router that lazy-loads either
  the game (`startGame.tsx`) or the admin chunk (no Three.js). Admin texts live in
  `admin/strings.ts` (FR + EN) to keep them out of the game bundle. Not admin / offline → a
  **local sandbox** (localStorage + IndexedDB) that the game of the same browser uses instead
  of the shared sounds, with a switch to go back. Changes autosave after 500 ms; visible in the
  game on reload (Realtime left for later). Uploads send raw bytes (supabase-js would send a
  Blob as multipart form data).
- CC0 picks made without listening (no audio output in the build environment): steadiest 24 s
  windows chosen by loudness analysis for the ambiences; the owner validates by ear.
- Sounds are cached by the service worker on first play (CacheFirst), never precached.

## Chantier 03 — individual kiwis: levels, masteries, classes, shiny

Owner's answers: stat points **mixed** (odd levels drawn from the activity, even levels placed
by the player); level cap **30**, level 10 in about **3 days** of work; classes and **one
School** in this chantier (combat skills against ferrets / bats come with chantier 06);
expedition losses **weighted** (the weak fall first, nobody is immortal); **no hero** (every
kiwi can become one; the mayor is the only unique role); trained kiwis **keep working** with
bonuses; **reconversion** possible at double price.

- **Stats** (Strength, Agility, Endurance, Spirit, Dexterity, Charisma): 1–10 each at hatching,
  total drawn in 27–33 (no perfect kiwi), cap 20 with levels. **Trait** for 30 % of kiwis
  (Early bird, Glutton, Brave, Dreamer, Sturdy, Lucky, Curious), each a small bonus and a small
  drawback. **Shiny** 1/512 (red, yellow, green, blue), from the state's RNG at hatching;
  existing kiwis got stats from `hash(seed, id)` in the v4 migration (game RNG untouched).
- **Exact offline progress**: experience and mastery practice accrue in **integer** units
  (`XP_SCALE` = 100 × 1 h per point, rates are integers per ms), so a big step and many small
  steps give identical kiwis. Level-ups and mastery ranks are `advance` events (their time is
  computed with a ceiling); the automatic stat point uses the RNG at that event, in time order.
- Curve: cumulative XP to level L = ⌊(518 n² + 41 n³) / 100⌋ with n = L − 1 (level 5 ≈ 11 h,
  10 ≈ 3 days, 20 ≈ 3 weeks, 30 ≈ 2 months at 10 XP/h). Work 10 XP/h, building 12, School 10,
  expedition +40 (+40 on a victory, half if the ship turned back); Spirit +4 % per point.
- **Masteries** pulp / fibre / seeds / juice / construction, rank 0–10 at 2·r² hours of practice,
  +3 % per rank. A worker's power = (1 + 3 % per Dexterity point above 5) × (1 + 3 % per rank) ×
  trait × class; a building's harvest uses the summed power instead of the head count (an
  average newborn = 1, so early balance is unchanged). Builders: Strength (+2 %/pt) and
  construction mastery set the duration once, when the construction starts.
- Auto-assignment prefers the most skilled kiwi (best idle worker for a new building, the least
  skilled step back when the player removes workers, builders by speed).
- **Expeditions**: the player picks the crew (head counts are still accepted by the command).
  Strength of a kiwi = (1 + 6 % per Strength point + 3 % per Endurance point above 5) ×
  (1 + 4 % per level) × trait × class (+ skills). Losses: same count as before, victims drawn
  **without replacement, weighted by exposure** = trait / (strength × dodge (Agility) × toughness
  (Endurance)). The planner shows each kiwi's strength and risk (expected losses spread by
  exposure). The fallen go to the **memorial** (50 kept).
- **School** (Nest 2, outside the economy loop): level 1 teaches builder, warrior and mayor,
  level 2 mage and scout, level 3 trains two kiwis at once 30 % faster. Courses cost resources
  and 1–3 h; kiwi level ≥ 3 (mayor ≥ 5). Demolishing a School refunds its trainees.
- **Classes** (versatile roles): builder build ×1.3; warrior fight ×1.5, build ×1.1, harvest
  ×0.95; mage fight ×1.3, harvest ×1.15, build ×0.9; scout weight aboard ×0.5, fight ×1.1;
  mayor (unique): +1 % colony harvest per Charisma point. **Skills** at levels 5 / 10 / 20,
  mostly passive multipliers; active **Rain** (mage, refills 30 % of the workplace deposits,
  12 h) and **Speech** (mayor, +15 % harvest for 1 h — 2 h with Village feast —, 12 h, the end
  is an `advance` event). Scouting (+10 % crew strength) and Tailwind (−20 % travel) apply once
  per crew.
- Outfits: one instanced mesh per class in 3D (hard hat, helmet and sword, wizard hat, wings
  and goggles, top hat and sash) and the same outfits in the SVG portraits. Shiny kiwis are
  tinted in 3D (instance colour) and portraits; kiwis grow slightly with Strength + Endurance.
- Village screen (top-bar button, badge for points to place): list sorted by level / name /
  job / age, sheet with radar, rename, follow (camera follows until the player moves it, ring
  under the kiwi), workplace shortcut, class and skills, story; memorial tab. Tapping a kiwi in
  3D opens its sheet. Full-screen sheet on phones.
- Anti-cheat for imported local saves: stats + unplaced points ≤ 33 + level − 1, level matches
  the XP, XP and practice bounded by the kiwi's age, ≤ 2 shinies (+1 per 128 kiwis), one mayor,
  no expedition history.
- No database change: the state is stored as jsonb (schema v4 then v5 migrations in the shared
  code).
- **Balance** (30 seeds × 72 h): the bot now places its points, builds a School after the
  Nest 2, trains a mayor (first level-5 kiwi ≈ 10 h, mayor ≈ 12 h) and a builder, and gives
  speeches. Kiwisu / Kiwino stay within 1 % on every milestone. Nest 3 moves from 5.6 h to
  6.2 h (the School is an investment the bot makes early); the first level-10 kiwi comes after
  ≈ 2.6 days, as intended. New report milestones: kiwi5, kiwi10, mayor; default horizon 72 h.

## Chantier 04 — needs and cycles: hunger, fatigue, rest, day/night, seasons

Owner's answers: **2 h days and 24 h seasons**; famine deaths **allowed with guard rails**; kiwis
eat **pulp and drink juice**; **aggregated** fatigue model; one **shared calendar** per universe;
a **simple morale** in this chantier; winter **as proposed**; **beds = housing**, and since the
population can never exceed housing, the walk from the work to the bed is what matters (beds
near the work sites).

- **Calendar** (`data/cycles.ts`, `sim/calendar.ts`): a pure function of time and
  `GameState.calendarStart` (save v6). Day = 2 h ending with a 30 min night (20 min in summer);
  season = 12 days = 24 h; year = 4 days. Seasons change at dawn. A new colony starts 20 min
  after a spring dawn (no pink first frame); every colony of a shared universe follows the
  universe's `created_at` (already in the database, now read by the edge function: no SQL
  change). Imported solo saves must keep `calendarStart = createdAt − 20 min`.
- Nightfall and dawn are `advance` events (rates change); `seasonChanged` is reported. Visuals
  read the same calendar: sun and moon, dawn/dusk/night sky and fog, moonlit materials (night
  desaturation), static shadows refreshed when the sun moves ~1°, season looks shared by terrain,
  props, paths and buildings (vegetation tint, snow on upward faces, crossfaded over ~2 h around
  each change), frozen pools, weather particles animated in the vertex shader (spring showers,
  autumn leaves, winter snow, fireflies; the weather of a day is a hash of the date, the same for
  everyone), glowing homes at night. HUD clock: day dial, season, countdown, effects tooltip.
- **Effects** (`CYCLES`): night work ×0.4; spring regrowth ×1.4 and eggs −20 %; summer juice
  regrowth ×0.7; autumn pulp harvest ×1.2 and fibre regrowth ×1.3; winter no regrowth, juice
  wells ×0.5, walking ×1.5 off paths and **snowed-in groves** (paths stay clear, so paths matter
  in winter). Free deposits are rebased at every season change (they regrow at the pace of the
  season they were last seen in); depot distances are memoized per season; the 3D kiwis use the
  same walking costs (`tileWalkCost`). Constructions and experience are not slowed at night
  (no rebalance of chantier 03).
- **Hunger** (`data/needs.ts`, `sim/needs.ts`): 30 pulp + 10 juice per kiwi at home and per hour
  (×0.8 summer, ×1.3 winter); kiwis on an expedition eat their provisions. Stocks may now shrink:
  `foodRanOut` at the exact time, then the colony eats what is harvested. A colony **hunger
  gauge** (integer units, exact offline) fills as fast as food is missing (pulp weighs 2/3, juice
  1/3) and recovers 3× faster once fed. Stages: hungry from 2 h of full privation (work ×0.7),
  weakened from 8 h (×0.4), famine at 18 h: a kiwi starves (frailest first, state RNG), then the
  gauge drops by 6 h. **Guard rails**: never before Nest level 2, never the last two kiwis, at
  most one death per 6 h; warnings when a stock lasts under 6 h (pulsing chip, badge), toasts,
  sound, "while you were away" lines. Memorial cause `famine`. The Nest gets a little spring
  (juice 40 / 60 / 80 per hour) so the first kiwis can drink before the first Juice well.
- **Full storage**: a full stock the meals do not outpace stays full and its producers harvest
  **only what the kiwis eat** (their deposits drain for the meals); first draft let the overflow
  feed the kiwis for free, which made winter harmless.
- **Fatigue and rest** (`REST`, `sim/rest.ts`): each kiwi rests 12 % of the day (−4 % per
  Endurance point above 5, ×1.3 in summer, ×1.1 in winter), in the free bed nearest to its work
  (greedy, workers first, season-aware walking distances); each step to bed lengthens its breaks
  by 8 %; no bed doubles them; presence ≥ 50 %. A worker's power × presence, constant between
  events. Cosmetic rhythm (`kiwiRhythm`): 60 % of kiwis sleep at night (the night work cut),
  others alternate work and rest; the fatigue gauge and the 3D kiwis going inside their hut
  follow it.
- **Morale** (`MORALE`, ±10 % on all work): meals +3 % / hungry −5 %, beds near work ±3 %,
  mayor's speech +3 %, mourning −6 % for 24 h after any loss (`mourningUntil`, save v8, event),
  season (spring +2 %, winter −2 %). Every factor changes only at an event. Charisma still feeds
  the mayor's harvest bonus (chantier 03).
- Audio: `colony.hunger` (synth), night crickets ambience (`ambience.night`, synth loop), birds
  quieter at night, the calendar fills the binding conditions (time of day, season).
- **Retune**: production of every producer, camp and the Nest's pulp/fibre ×1.25 to keep the
  pace of chantier 03 despite nights and rest. Bot: huts where the walk to bed is longest, meals
  subtracted before picking the bottleneck, no egg it cannot feed, occasional-player mode
  (attentive for a day, then two visits a day). Performance: harvests are computed once per
  building per event and the bed plan is memoized on a cheap key (a bot run is ~2× slower than
  before the chantier).
- **Balance report** (200 seeds × 72 h, ~38 min): tutorial 1.5 / 1.6 h, Nest 3 ≈ 7 h, first
  level-5 kiwi ≈ 10 h, mayor ≈ 12.3 h, first level-10 kiwi ≈ 2.6 days; Kiwisu / Kiwino within
  6 % on every milestone (Kiwino a little slower early). No famine death for the bot, and the
  twice-a-day player crosses the first winter without loss.

### Chantier 04 follow-up — chantier 03 hooks (traits, mayor, voices)

Owner's answers: keep the **aggregated** model (no per-kiwi gauges or sleep/eat jobs); the
mayor's **Charisma joins morale**; both need-related traits; voices from the stats.

- **Mayor → morale**: +1 % per Charisma point and Organisation +5 % are now a "Mayor" line of
  morale (`mayorMorale`), whose cap goes from ±10 % to **±20 %**; mourning and hunger weigh
  against it. The **Speech** stays the harvest boost (+15 % for 1 h, `colonyBonus`) plus its
  +3 % morale. The mayor away on an expedition lifts nothing (launch and return are events).
- **Traits**: Early bird rests 25 % less by day (`modifiers.rest`) and always sleeps at night
  (cosmetic rhythm); Glutton eats 1.5× at home too (`modifiers.appetite`, counted in
  `consumption`) but starves last (picked only when nobody else is left). Constant rates: no new
  event, no save change (still v8).
- Village list: each row shows a mini fatigue gauge, what the kiwi does (work / rest / sleep)
  and the colony's hunger stage when it is not fed.
- **Voices**: pitch = own offset (hash of the id, ±1.5 semitones) + 0.6 × (Agility − mean of
  Strength and Endurance), clamped to ±5: sturdy kiwis sound lower, agile ones higher.
- Balance (30 seeds × 72 h) unchanged: tutorial 1.5 h, Nest 3 ≈ 7 h, mayor ≈ 12.3 h, faces
  within 6 %.

## Chantier 05 — Intro, choice of the face, biomes, fog of war

Owner's answers: **3 biomes per face** (the proposed ones); the player picks **the face only**,
the biome is drawn from the seed (no paid reroll, no delay: balance is the answer); a friend's
face is **visible** (layout snapshot refreshed now and then), alien faces stay under fog; the
intro also plays when **arriving in a shared universe** (free faces only); "longer winters"
mean **harsher**, not longer (one calendar per universe); **floods are real now**, predators
are data for chantier 06; existing worlds keep their map with a hidden **classic** biome.

- **Biomes** (`data/biomes.ts`): orchard, highlands, delta (Kiwisu); seed crown, lagoons,
  tundra (Kiwino); `classic` (both faces, never drawn). `drawBiomes(planetSeed)` gives both
  halves of a kiwi their biome (so both are known before choosing, and both halves of a shared
  kiwi agree). The biome lives in `state.params.biome` (`FaceParams`, save **v9**: older states
  get `classic`); imports must carry the drawn biome or `classic` (`isPlausible`).
- A biome changes: generation (`biomeProfile` overrides the face profile; delta **juice rivers**
  from the rim inwards with a ford every 5 tiles; highlands `relief` = height noise ×2 plus
  plateaus with small cliffs), deposits (stock / regrowth per resource), climate (`climateOf`
  = face × biome yields), a walking multiplier (rugged highlands ×1.15), season extras
  multiplied onto `CYCLES.seasons` (`seasonEffects(season, biome)`, memoized), floods, and
  predator multipliers (stored, used from chantier 06).
- Numbers: orchard pulp regrowth ×1.25, few groves; highlands groves +, fibre deposits ×1.2,
  autumn regrowth ×0.8, winter walking ×1.3, juice ×0.6, fibre ×0.8; delta pulp deposits and
  regrowth ×1.15, summer regrowth ×0.7; seed crown wide dense ring, pulp deposits ×0.8 and
  regrowth ×0.85; lagoons 7–9 pools, spring regrowth ×1.4, spring floods; tundra deposits ×1.6,
  regrowth ×0.7, winter like highlands, predators ×0.5. No yield retune was needed.
- **Floods** (lagoons, spring): flesh next to a pool (`Tile.flood`) is unwalkable (paths too),
  cannot get a building or camp (`flooded` error) and leaves every catchment for the season;
  a building standing on it stops (`flooded` harvest status, blue badge). The season change
  (already an event) resyncs pools when the biome floods: offline equivalence tested. The bot
  keeps clear of floodable tiles. A new lagoon colony starts in spring, so flooded.
- **Twin half in the sky**: generated from the same planet seed (`twinParams`); placed relative
  to the view — just above the frame at the normal zoom, sliding into the upper sky as the
  player zooms out (1.08 → 1.75 × the framing distance; max zoom now 1.9×) — leaning towards
  the camera and turning slowly. Terrain only (no props, shadows; water only for a friend),
  0.55 scale, not drawn while hidden; three animated cloud layers are the fog of war. The haze
  of the scene follows the zoom. The client never receives an alien face's state.
- **Friend on the twin face**: the server adds `twin` (owner, face, params, buildings, paths, no
  stocks) to `load`, `joinUniverse`/`createUniverse`, `universeInfo` and `pickFace`; the client
  draws their pools, static building models and a name ribbon, without fog; universe info is
  refreshed every 5 minutes. Other kiwis of the universe are not drawn (chantier 07).
- **Intro** (`render/intro.ts`, `ui/intro.ts`, `IntroOverlay`): its own scene and camera drawn
  instead of the game. The two halves are the real faces (two `TerrainView`s); while whole only
  their furry domes show, touching, stretched ×1.18 (a kiwi is longer than wide), rolling around
  the cut axis so the cut stays edge-on; at 1.6 s a blade slash + flash + `intro.slice` (synth);
  the halves part and turn to the player (1.4 s). Choice: hover (desktop) or tap / tabs turn
  the focused half to the player and grow it, the other steps back; side panel (desktop) or
  bottom sheet (phone, 48 % high) with face, biome, strengths, weaknesses, style, resource
  gauges (sustainable regrowth × climate against 1.5 × the classic faces of the seed) and the
  biome's numbers read from its data. Choosing dives the camera, then a 0.7 s fade into the
  game. Tap or "Skip" jumps to the choice; reduced motion starts there.
- When: first visit with no colony (`kiwar.introSeen`), every "New world" from the settings
  (the face is chosen there; shared links keep their face), "Replay the intro" in the settings
  (no change), and a new colony in a shared universe (`pickFace`: allowed while the colony is
  pristine and the other face of the same kiwi is free; `faceTaken` otherwise). No SQL change:
  the member's face is updated in place (`moveMember`).
- **Balance**: the report compares each biome to the median of all biomes (plus Kiwisu vs
  Kiwino over their biomes); biomes run in parallel processes (`--jobs`, default = CPU count).
- **Balance report** (200 seeds per biome × 72 h, ~66 min): every biome within ±5.6 % of the
  median of all biomes on every milestone (delta −5.6 % and highlands −3.9 % early, seed crown
  +4.8 % and lagoons +3 %), Kiwisu / Kiwino within 3.2 %; tutorial 1.5–1.6 h, Nest 3 ≈ 7 h, first
  level-5 kiwi ≈ 10.1 h, mayor ≈ 12.4 h, first level-10 kiwi ≈ 2.6 days.

## Chantier 06 — Threats: ferrets and bats, defenses, gifts from the sky

Owner's answers (this chantier): one big wave a real day (20–28 h apart), announced 8–12 h
ahead; a dodge exists (everybody into the Nest); bats mostly at night and in summer, hungry
ferrets in winter; ~3 small incidents a day; turrets on the skin rampart, two models, outside
the building cap; protection 24 h **and** Nest 2, shield 24 h after a defeat, ferrets may trample
paths but never deposits; at most one death on a wave more than twice the defense, never below
4 kiwis; meteorites as temporary deposits, about one a day. Turrets fire offline.

- **Resolution in `advance`**: a wave is planned (time only) as soon as the colony is out of
  protection, announced at `announceAt` (composition drawn then, with the calendar of the strike
  time and the biome) and resolved at `at`. `waveOutcome` is shared by `forecastWave` (UI, average
  luck) and the strike (luck ±15 %): severity = unstopped threat / total threat; a defeat damages
  `round(severity × 4)` buildings (at least one, never the Nest or camps, bigger ones first), loots
  `severity × 35 %` of the stock above what the Nest (30 % of its storage) and Warehouses (60 %)
  protect, hurts `severity × 40 %` of the kiwis at home (2–6 h), tramples paths with the ferrets'
  part, and kills one kiwi if the threat exceeds twice the defense and the colony has more than
  four kiwis. Every defeat gives a 24 h shield.
- **Own RNG stream** for threats and the sky (`threats.rng`), so existing colonies keep their
  hatching and level-up draws; nothing is drawn at game creation (first incident at 4 h, first
  meteorite at 6 h are fixed), so advancing by 0 ms leaves the state unchanged.
- **Power** = 6 × Nest factor (0.6 / 1 / 1.6) × (1 + 0.25 × days played, up to 14) × (1 + 0.08 ×
  expedition victories, up to +80 %); air share 70 % at night, 25 % by day; ±15 % at the
  announcement. Biomes multiply ferrets / bats (chantier 05 data).
- **Defenses**: Seed crossbow (ground 4/8/14) and Sky sling (air 4/8/14), 15/25/40 seeds per
  wave each, firing only at the side they face; without enough seeds they fire in proportion;
  damaged ones at half power. 2/4/6 turrets by Nest level. Garrison: `kiwiStrength × 1.5 ×
affinity` (warrior ground 1 / air 0, mage 0.8 / 1, scout 0.5 / 0.8, builder 0.5 / 0, others
  0.4 / 0); guards stop harvesting, earn 8 XP/h and are 1.5× more exposed. Kiwis at home add
  15 % of their strength on the ground (militia), never in the air.
- **Shelter**: possible from 45 min before the strike, everybody stays in the Nest until 15 min
  after it (workforce 0, an event); nobody is hurt, buildings and stocks are not spared.
- **Repairs**: a queue item `repair` (30 % of the level cost, 40 % of its time); an upgrade also
  mends. Damaged buildings work at 50 %.
- **Incidents** (every 5–11 h): a thief steals 2–5 % of the pulp or fiber, a bat drinks 3–6 % of
  the juice (both stopped with a chance defense / (defense + 4), max 80 %), a storm blows 1–3 path
  tiles away.
- **Meteorites**: seen an hour ahead (a star coming down over a target ring), land on free flesh,
  grove or seed ring as a 48 h deposit of seeds (½), juice or fiber (¼ each), 300 × Nest factor
  (1 / 1.5 / 2.2) × (1 + 0.15 × days). A camp on the crater picks it at the camp rate, a producer
  of the same resource reaching it takes half its base rate, on top of their usual harvest; no
  regrowth, no climate. Drained exactly like a pool.
- **UI**: a threat pill under the top bar (countdown + odds, shelter, unread report), a Defense
  button (shield) and screen (threat vs defense per side with breakdown, seeds, expected losses,
  shelter, garrison picker, reports, incidents), a Garrison section in the kiwi sheet, repair box
  and smoke on damaged buildings, a short show when the player watches a strike (purely
  cosmetic, follows the report), offline summary lines, synth sounds.
- **No SQL change**: the game state is a `jsonb` (save v10 threats, v11 sky).
- **3D models from Sketchfab** (owner's suggestion): the animated weasel is not downloadable and
  personal use only; the bat (CC BY) has 132k triangles and the kiwi (CC BY) 502k without
  animation — far too heavy for instanced crowds on phones. Procedural low-poly models are kept;
  a decimated (~1–2k triangles) glTF could replace them later.
- **Balance report** (200 seeds per biome × 72 h, ~63 min): every biome within ±5.6 % of the
  median on every milestone, Kiwisu / Kiwino within 3.2 %; milestones unchanged from chantier 05
  (tutorial 1.5–1.6 h, Nest 3 ≈ 7.1–7.5 h, level 5 ≈ 10.1 h, mayor ≈ 12.6 h, level 10 ≈ 2.6 days).
  The attentive bot meets 2 waves per run and loses almost none (seed crown 9 %, its seeds are
  spent on turret ammo); ~3 meteorites per run. An occasional player (twice a day, 5 days)
  loses about one wave in six, without deaths.

## Chantier 07 — Mechanical kiwi ship and reconnaissance

Owner's answers: the launchpad stays at Nest 2; a report is a partial, cumulative map plus
ranges (tighter with the scouts' Agility/Spirit and the ship, wider with age); a broken ship
comes back empty and its launchpad must be repaired; spotted scouts fight a light skirmish
(0–1 loss, mostly wounds, worse report); blind raids stay allowed ("unknown" odds); the alien
garrison grows slowly every day; the truth is hidden online only (solo games keep it in the
local save, the UI never shows it).

- **Hidden truth**: `ExpeditionTarget` is public (face, distance, travel time); the garrison is
  `state.aliens[targetId]` (base defense × 0.75–1.2 of the public number, reinforce, growth
  1.5–4 % of the base per game day up to ×2, loot × 0.8–1.2, ferret share 35–80 %, 6 + 2 ×
  distance dens/roosts), drawn from a secret seed. The server draws that seed itself
  (`ctx.randomSeed()`) for new games, migrated games and imports (an imported save never brings
  its own garrison), strips `aliens` from every response (`publicState` wraps
  `handleGameRequest`) and resolves landed ships on `load`. Migration
  `20261024000000_hide_game_state.sql` drops the "players read their own games" policy, since
  `games.state` holds the truth.
- **Client without truth**: an arrival is not an `advance` event when the garrison is missing
  (`canResolveArrival`); the expedition shows "waiting for news" and `GameController` polls
  `load` every 5 s (`awaitingReport`) and rebases. The way back (rations, starvation, unloading)
  is simulated by the client as before. Breakdowns need no truth.
- **Intel** (`state.intel`): ranges for defense, ferrets, bats, sectors seen (12: 6 slices × 2
  rings, inner ring up to 6 hexes) and dens/roosts seen there, `victoriesAt`. Aged view
  (`intelView`): max × (1 + 4 % per game day, up to ×2) + public reinforcement per victory since;
  fresh < 1 day, stale < 3, then old. A raid records the defense it faced exactly.
- **Reconnaissance**: 1–2 kiwis, travel × 0.75, no loot, no provocation, half XP. Quality =
  0.25 + 0.05 × (mean (Agility + Spirit) / 2 − 5) + 0.015 × (level − 1) + 0.15 Scouting + ship
  bonus (0 / 0.05 / 0.1 / 0.15). Sectors = 2 + round(4 × quality), unseen first; range
  half-width 40 % → 8 %, always containing the truth. Spot chance 20 % + 15 % per extra kiwi −
  3 % per Agility point above 5 − 5 % Scouting, 5–60 %. Spotted: quality halved, skirmish against
  12 % of the garrison: outmatched → one scout falls, else one comes home wounded (3 h).
- **Ships** (`SHIPS`, `shipOf(pad)`): wood 70 %, logs 85 %, iron 95 % (armour −15 % raid
  losses), jet 99 % (−25 %, kept for the Industry age of chantier 08). Until ages exist the
  launchpad level picks the generation (1/2/3). Best crew Dexterity adds 1 % per point above 5
  (max +5 %). Speed and hold stay on the launchpad levels. A breakdown is drawn at take-off: the
  ship turns back half-way, rations are eaten, nothing is found, the launchpad comes home
  `damaged` (repair queue of chantier 06) and cannot launch until mended (`launchpadDamaged`).
- **Probe** (`pnpm balance:expeditions`, 300 seeds, fresh level-1 kiwis): breakdowns 28 / 14 /
  3 %; a lone average scout is spotted 17 % of the time, falls 1 %, is wounded 16 %, maps
  2.9 sectors with ±26 % ranges; a blind raid of 6 wins 37 % of the time against the twin face,
  an informed raid (crew sized on the top of the estimate) wins every time with 13–18 % losses.
  The colony bot still does not use expeditions (milestones unchanged).
- **Rendering**: procedural mechanical kiwi bird per generation (wings on rigs, preening on the
  pad); `ShipsView` animates take-off (12 s of game time), cruise towards the twin half (or far
  in the sky for another kiwi) and landing; a broken ship trails smoke. The twin's fog shader
  takes a 12-sector mask and opens over seen sectors; seen dens and roosts stand there.
- **UI**: mission switch (reconnaissance suggested while nothing is known), recon forecast
  (quality, sectors, spot chance), crew sorted by discretion, ship and reliability line, aged
  intel on target cards, SVG map of the target face (public seed only) in the planner and the
  report, enemy ranges.

## Chantier 08 — Ages, research (first half; the Kikiwiwis come next)

Owner's answers (start of the chantier): **4 ages** at launch (Eden → Stone → Iron → Industry);
an age is passed by **research then a monument**; a Kikiwiwi transformation **can fail but the
kiwi survives** (hurt, juice lost); at most **one Kikiwiwi per ship, and one per age reached
from the Iron age** (Iron 1, Industry 2); Kikiwiwis hit **ground and air**; **obstacles**
(rocks, stumps, meteorite wrecks) are added to the world generation in this chantier (second
conversation). An age brings one more building level, the next ship generation, stronger
predators and richer gifts, and firearms at the Industrial age. Split in two conversations:
ages and research first, Kikiwiwis second. Target pace for an active player: Stone ≈ 1.5 day,
Iron ≈ 4 days, Industry ≈ 8 days.

- **Library** (`library`, Nest 2, flesh / ray / heart, copy ×2): 1 / 2 / 3 researchers at
  levels 1–3, then 4–6 with the ages (a laboratory). **Kiwis never join it on their own**
  (`isManualWorkplace`: no `autoAssign`, no auto-staffing at completion): the player picks the
  researchers. Research power = (1 + 6 % per Spirit point above 5) × (1 + 3 % per rank of the
  new **research mastery**) × modifiers (mage × 1.2, dreamer × 1.15); × the Library's points per
  hour (8 / 10 / 12, then × 1.2 per age level) × presence × night × hunger × morale × damaged;
  0 during a shelter.
- **Research points** are integers in raw units (`RESEARCH_SCALE` = 100 × 1 h per point) like
  XP, so offline progress is exact. They flow into the chosen technology; with nothing chosen
  they wait in a bank capped by the Library level (100 / 200 / 400 / 800 / 1 500 / 2 500).
  Completion is an `advance` event (`researchDone`); switching technology is free (the points
  stay). The research rate is accrued before the kiwis level up in `accrue`.
- **Technologies** (`data/research.ts`, 3 per age + 1 passage): Eden — foraging (pulp and fibre
  +10 %), palisade (turrets +15 %), star charts (travel −10 %), stone cutting (passage, 700 pts,
  Library 2). Stone — masonry (storage +20 %), slingshots (guards +25 %), preserves (rations
  −20 %), smelting furnace (passage, 1 800 pts, Library 4). Iron — metal tools (seeds +15 %,
  constructions −15 % time), armour (wave injuries −30 %, ship armour +0.1), compass (travel
  −10 %, recon +0.1), steam power (passage, 4 000 pts, Library 5). Industry — machines (every
  harvest +15 %), firearms (warriors reach the bats at 0.8 in the garrison, Library 6), steam
  engines (travel −15 %). `techEffects(state)` combines them (memoised on the list). The
  "against nature" branch is shown greyed ("coming soon") for the second conversation.
- **Age = monument level** (`ageOf`): one `monument` per colony (outside the building cap,
  never demolished, never damaged by waves), level 1 / 2 / 3 = Stone / Iron / Industry, each
  needing its passage technology and a Nest 3 / 4 / 5; costs 3 000–20 000 pulp and fibre, 3 h /
  6 h / 12 h. Errors `ageTooLow`, `passageMissing`, `monumentExists`; event `ageReached`.
- **Levels 4–6** for every building but camps and the monument, grown from level 3 by
  `withAgeLevels` (`AGE_GROWTH`: cost × 2.4, time × 1.6, output × 1.5 per level, one more worker
  slot for producers and the Library, +2 housing, storage × 1.9, cargo +200, travel × 0.9,
  ammo × 1.4; the Nest: passive × 1.3, +4 buildings, queue +1 at levels 4 and 6). Each needs the
  matching age and a Nest of the same level (the Nest: its previous level). Catchment radius
  1 / 1 / 2 / 2 / 2 / 3; turrets 7 / 8 / 9; Nest factors of waves and meteorites extended.
  `maxLevelNow(state, type)` gives the cap of the current age; saves allow level 6.
- **Threats × age**: waves × 1 / 1.15 / 1.3 / 1.5, meteorite stocks × 1 / 1.3 / 1.7 / 2.2.
- **Ships by age**: `shipOf(state)` = wood / logs / iron / jet by age (the launchpad level keeps
  the hold and the speed), with the technologies' armour and recon added; reconnaissance now
  uses the ship bonus when resolving too (it only did in the forecast). An existing colony with
  a level-3 launchpad goes back from the iron ship to the wooden one (accepted by the owner).
- **Save v13**: `research` (points, current, done) and the research mastery (0 for old kiwis).
  Import plausibility: techs of reached ages only, points earned ≤ Libraries × 4 × play time,
  one monument whose levels match the passages, no level above the age.
- **Rendering**: Library (round tower, star globe, telescope; laboratory vat, flasks and
  lightning rod at 4–6), monument (stone ring, forge, clock tower), levels 4–6 = level 3 scaled
  up with gold studs, age dressing of every building (stone plinth; slate roofs and an iron
  lantern; metal roofs and a smoking brick chimney), paths from sand to dark slabs, fireworks
  over the monument on `ageReached`. Models are cached per type, level and age.
- **UI**: Research button in the top bar and research screen (age, points, rate, progress,
  tree by age with statuses), Library and monument sheets, "requires age" hints, toasts and
  sounds `research.done` (synth `discovery`) and `age.reached` (synth `fanfare`).
- **Balance**: the bot builds a Library after the Nest 3 and the School, keeps one researcher
  per five kiwis, researches the economy then each passage first, upgrades the Library when a
  technology needs it and saves up for the monument. New milestones `library`, `stone`, `iron`,
  `industry`; probe `pnpm balance:ages` (long horizon). Measured on 2 seeds × 4 biomes × 14
  days before the last tweak: Stone ≈ 32 h, Iron ≈ 90 h, Industry ≈ 173 h; passages were then
  raised a little (stone cutting 600 → 700, steam power 3 500 → 4 000) and the bot waits for
  the Nest 3 before its Library (earlier, it slowed the Nest 3 by ~20 %). Final probe (2 seeds ×
  6 biomes × 12 days): Stone 34–41 h, Iron 88–104 h, Industry 175–194 h (biomes within ±6 %).
  The 30-seed × 72 h report keeps the older milestones at their reference (Nest 3 ≈ 7.3 h,
  mayor ≈ 12.6 h, level 10 ≈ 2.6 days) and reaches the Stone age in ≈ 35 h in every biome.

## Multiplayer playtest fixes (after chantier 08, first half)

Feedback from a real game with friends (owner, 2026-10-20).

- **Robustness**: never an empty screen — boot screen while loading, an error card (retry /
  play solo) when the colony cannot be shown, error boundaries around the HUD, timeouts on
  sign-in (15 s) and game calls (20 s), server states migrated and validated on the client, a
  broken 3D view no longer stops the frame. The local save import and the first-visit intro only
  touch the solo colony. The exact cause of "some players cannot build / blank on reload" was
  not reproduced against the mock; the error card now shows the message to report.
- **One kiwi per player** (owner): each newcomer gets the first kiwi nobody lives on, on its
  Kiwisu face (they may switch to the other face while pristine). The twin half is always
  aliens: everyone has their own alien face to fight; allies are the other kiwis, far away
  (travel and trade later). `kiwiCount(members)` = one per player, + 1 when every face is taken
  (universes created before this rule keep their pairs, and their friend on the twin face).
  Targets: every alien face, distance = kiwi gap (own twin at 0).
- **A universe from the solo colony** (owner: move, not copy): `createUniverse { fromSolo }`
  moves the online solo colony (refused while pristine) into the new universe as kiwi 0 — same
  planet, buildings, kiwis, alien twin, intel and seasons (the universe's `created_at` is set
  so that its calendar is the colony's). The member row keeps the planet seed
  (`universe_members.planet_seed`, `planetSeedOf`), used for its colony and by the others' maps
  of its alien twin. The solo slot then starts over on a new world. Option shown (checked) in
  the universe screen when the solo colony has progress.
- **Allied planets** (owner: read-only visit): `load` / `universeInfo` / join / `pickFace` send
  `allies` — every other player's layout (owner, kiwi, seed, face, params, buildings, paths; no
  stocks), next to `twin` (kept for older pairs). The client floats each ally's face at a fixed
  place around ours (`render/allies.ts`: ring ≈ 95 + 14 per extra kiwi of distance, below our
  rim and above the sea of clouds, leaning towards us, name ribbon), so they peek over the far
  corners when zooming out. Tapping a planet (or "Visit" in the universe screen) flies the camera
  there (`CameraRig.visit`, bounds and zoom of that planet); the HUD shrinks to a banner (whose
  colony, next ally, back home; Escape too) and nothing can be built there. Back home restores
  the view the player left.
- **Comfort** (owner):
  - Back from a break under 8 h: a small bubble in a corner (gains, finished constructions,
    waves, hunger; "details" opens the full summary; closes by itself after 12 s unless
    something went wrong). 8 h or more: the full summary as before. Online, the summary starts
    from when the player last had the colony on screen (`kiwar.lastSeen` per universe), not from
    the last server write, so it no longer shows after a short look away.
  - Coming back (or reloading the same colony) no longer rebuilds the scene: the camera, its
    rotation and the selection stay. The favourite rotation is kept across sessions
    (`kiwar.camera.azimuth`, saved when the camera settles) and used when framing the colony.
  - Tapping a tile with a building or a construction site opens its sheet even if a kiwi walks
    there (kiwis are tapped elsewhere, or from the village screen).
  - Intro: a click (or a tab) on a face locks the choice; hovering the other half no longer
    changes it.
- **Deliveries between allies** (owner: the launchpad's bird as a cargo, free gifts, no risk,
  no kiwis yet, the cargo is the only limit, the recipient sees the bird land). Save v14:
  `friends` (the universe's other players, set by the server like `targets`; flight time as an
  alien face at the same kiwi distance), `shipments`, `incoming`. `sendCargo { launchpadId,
friendId, resources }`: weight = resources × 0.1 cargo units (level-1 launchpad: 1 500
  resources), launchpad busy until the empty ship is back (no raid meanwhile), no breakdown.
  The server writes the gift into the ally's game right away (`incoming`, retried on
  conflicts); it is credited when it lands, up to the storage (the rest is lost and said so).
  Ally snapshots carry `room` (free storage minus gifts on their way). Client: switch
  "Expedition / Deliver to an ally" in the launchpad screen, "Send resources" from a visit,
  flight towards the ally's planet, a visiting bird (wooden) resting 45 s beside the recipient's
  Nest, toasts, existing ship sounds, gifts in the away summary; the 5-minute universe refresh
  also reloads the state so new gifts show up long before they land (flights ≥ 1 h 30).

## Chantier 08 — second half: obstacles, laboratory against nature, Kikiwiwis, titan works

Owner's answers (start of the second conversation): **mixed obstacles** — stumps are cleared by
ordinary kiwis (a builder, a short while, a little loot), rocks and meteorite wrecks need a
Kikiwiwi, few obstacles near the Nest; the **laboratory against nature is a new building**; a
Kikiwiwi's daily roles are the **garrison, expeditions and titan works** (never a super
worker); terraforming at launch: **dig a juice spring, raise a terrace, flatten**.

- **Obstacles** live in the state (`state.obstacles`, save v15), not in the map generation:
  maps stay bit-identical. 6 stumps (grove, flesh) and 5 boulders (flesh, ray — seed rings were
  tried and slowed the Seed crown biome) per face, between 38 % and 90 % of the radius, drawn
  from their own seed stream; none on the classic biome (tests and the first worlds). Older games
  get the same layout minus the tiles already used. They block buildings, camps, paths and
  meteorite landings; kiwis still walk past them. A fading crater leaves a **wreck** (seeds and
  juice × the meteorites' age factor) when its tile is free, 4 at most. Clearing a stump is a
  queue item (40 pulp, 1 h 30 for an average builder, 80 fibre). Loot is credited up to the
  storage.
- **Research "against nature"** (Iron age): juice infusion (1 200 pts, Library 4: the
  laboratory), titan works (1 500 pts, Library 5: terraforming); Industry: green blood (2 500
  pts, Library 6: Kikiwiwis × 1.25 power, × 0.75 upkeep, infusions 10 points safer).
- **Laboratory against nature**: one per colony, outside the building cap, Nest 4/4/5, levels
  1–2 at the Iron age and 3 at the Industrial age (costs 4 000–16 000 pulp and fibre); the build
  command now checks the age required by level 1. One infusion at a time.
- **Infusion**: a kiwi of level 5 or more, idle or at work; 1 000 pulp, 400 seeds, 2 500 juice;
  16 / 12 / 8 h by laboratory level. Risk of failure 40 % − 2 points per Endurance above 5 − 1
  per level above 1 − 8 per laboratory level above 1 (− green blood), between 5 and 60 %, fixed
  when it starts and drawn when it ends (colony RNG, an `advance` event). Failure: the resources
  are lost, the kiwi survives, rests a day and loses a point of Strength and Endurance. Cap: one
  Kikiwiwi per age reached from the Iron age (Iron 1, Industry 2), kiwis in the vat included.
- **The Kikiwiwi** keeps its class and skills; fight × 4, exposure × 0.3. On the rampart it
  reaches ferrets and bats alike (affinity 1 / 1). It drinks **40 juice per hour** at home on top
  of its meals; while the colony's juice is empty it fights at half power and cannot do titan
  works (the colony also goes hungry). It never takes a workplace nor builds; it stands on guard
  or idles at home. **One per ship**, boarded by name only, it weighs five kiwis and eats three
  times the rations (it brings its own juice: no weakness on expeditions).
- **Titan works** (a Kikiwiwi idle or on guard): smash any obstacle (stump 50 juice / 20 min,
  rock 200 / 1 h, wreck 300 / 1 h 30) for its loot; with the technology, reshape a free tile —
  spring (flesh → juice pool, 600 juice, 3 h; never on a tile that would cut the walkable land in
  two), terrace (a floodable tile no longer floods, 400, 2 h), flatten (grove or seed ring →
  flesh, 300, 2 h). 4 reshaped tiles at the Iron age, 8 at Industry. The reshaped tile's deposit
  starts over full.
- **Reshaped tiles** (`state.terraform`, save v17) are applied by `faceMapOf(state)`, now the
  single source of the map for the simulation, the commands (whatever map the caller holds),
  the server and the client; the generated map stays the reference for obstacles and import
  checks. The client redraws the face in place when it changes (camera and selection kept);
  ally planets show their obstacles and reshaped tiles.
- **Rendering**: stumps with roots and moss, boulder heaps, cracked dark wrecks with a faint
  green glow; the laboratory (glass vats of glowing juice with a floating silhouette, copper
  pipes, a spinning lightning coil, bubbles and sparks); the Kikiwiwi as its own animated model
  (1.6 × taller, dark feathers, pulsing green veins that dim without juice, glowing eyes, heavy
  swaying steps, stomps during titan works, dripping juice), veins in its portrait, a badge.
- **UI**: obstacle sheet (loot, clear button or "needs a Kikiwiwi"), laboratory sheet (kiwi
  picker sorted by risk, cost, countdown, cap), Kikiwiwi section in the kiwi sheet, titan works
  in the tile sheet, toasts and existing sounds.
- **Balance** (`pnpm balance:ages -- --seeds 2 --days 12`, one process per biome, bot playing
  the Kikiwiwis): Stone 36–38 h, Iron 89–97 h, laboratory 123–134 h, first Kikiwiwi 144–166 h
  (≈ 2 days after the Iron age, waiting for 2 500 juice on top of a 1 500 reserve), Industry
  182–208 h (before this half: 175–194 h; the infusion research, the laboratory and the juice
  cost a few hours; every biome within ±10 % of the median). The 4-seed × 48 h report is
  unchanged by the obstacles once boulders stay off the seed rings.

## Chantier 14 — Bring the solo colony into an existing universe

- **Joining with the colony** (owner): `joinUniverse { fromSolo }` moves the online solo colony
  onto the first free kiwi (`assignFace`), with its own planet seed (member `planet_seed`) and
  face. What it knows of its twin moves along: intel, victories and the hidden garrison are
  re-keyed from `aliens:0:` to `aliens:<k>:`. Friends and deliveries start empty; the solo slot
  starts over on a new world (moved, not copied, as when founding).
- **Calendar**: the colony follows the universe's seasons (the shared-calendar rule wins); only
  a founding colony keeps its own, since the universe calendar is set from it.
- **Arrival shield** (owner: 48 h): predator waves are the only incoming threat (co-op only),
  so the shield is `threats.shieldUntil = max(current, now + 48 h)`
  (`THREATS.importShieldMs`); a wave already planned before then is dropped and replanned.
- **Guard rails**: one import per account and universe = membership itself (no leaving yet):
  `alreadyMember`; an untouched solo colony is refused (`isPristine`); no ship may be away
  (`shipAway`: targets are renamed on the way). `isPlausible` is not applied: the online solo
  state is written by the server only, and it would refuse legitimate expeditions.
- **Host setting** (owner: the host may refuse): `universes.allow_imports` (default true),
  changed by `universeSettings` (creator only, `created_by`). A plain join stays possible.
- **Colony power** (owner: age + Nest + kiwis + defense, for every member): `colonyPower(state)`
  in ally snapshots (`AllySnapshot.power`, defense = `defenseOf` ground + air) and from the own
  state; members imported get `imported_at` and a "from solo" badge; the shield shows as a badge
  while active.
- **Deploy before migration**: the edge repository retries with the older columns on an
  unknown-column error (`42703` / `PGRST204`), so pushing the function before the owner runs the
  SQL keeps universes working (imports allowed, no imported flag, host toggle fails).
- File export/import: left out (owner: cheating risk).

## Chantier 10 — Visual comfort and performance

- **Measure first** (part 1). `?debug` opens the debug panel with frame timing (fps, p95 and
  worst frame, hitches > 33 ms, JS ms per frame, draw calls, drawing-buffer pixels, DPR, GPU)
  and interface timing (`ui/perfProbe.ts`: main-thread ms per second spent in store listeners
  and Preact re-renders, worst update, time from opening a menu to the next painted frame).
  `scripts/perf.mjs` replays a lived-in colony (`tools/balance/src/perfSave.ts`: the bot after
  72 h, 26 kiwis, 26 buildings) on desktop and phone screens, medium and low presets, CPU
  slowed ×4. Headless Chromium draws WebGL in software (≈ 1 fps whatever the preset), so frame
  rates are meaningless here; the JS and interface columns are the reliable ones.
- **Baseline** (before any optimisation, CPU ×4, ranges over screens and presets):
  - JS per frame of the 3D loop: 6–20 ms; draw calls 136 (low) – 155 (medium). The 3D loop's
    own CPU cost is small; the GPU cost cannot be measured here.
  - Interface: 135–210 ms of main-thread work per second with nothing open, 240–490 ms/s with
    the village or defense screen open; the worst single store update + re-render takes
    45–147 ms, i.e. a visible hitch at every simulation tick (5 per second).
  - Opening a menu: Preact work 35–50 ms (settings), 55–75 ms (research), 65–75 ms (tile sheet),
    90–135 ms (defense), 110–170 ms (village).
  - CPU profile (no slowdown, 8 s idle): 445 ms in `netRates`, called ~9 times per update by
    the resource chips of the top bar and the hunger badge, each recomputing every building's
    harvest; then the Preact re-renders of the whole HUD (`game` and `now` change 5 times a
    second). Hover picking costs 0.6 ms (not a lead).
  - Reading: the stutter felt on desktop, even on fast PCs, is the interface work at each
    tick (larger HUD on desktop: objectives, queue, expeditions panels), on top of a GPU bill
    that grows with the screen (high preset: DPR 2, MSAA 4, N8AO).
- **Optimisations** (part 2), all client-side:
  - `ui/derived.ts`: the shared selectors used by the HUD (`netRates`, `capacity`,
    `consumption`, `housing`, `population`, `hungerStage`, `forecastWave`, `bedsOf`,
    `moraleOf`…) are memoized per state object (the controller emits a new state at each tick
    and never mutates an emitted one), so each is computed once per tick.
  - `fps` left the main store (debug numbers live in `perfStore`), `useT` returns the same
    function while the language stays, `useUi(selector, equals?)` + `shallow`, `Modal` listens
    to Escape once, `KiwiPortrait` is memoized, number formatters are cached.
  - Pixel budget per preset (`pixelRatioFor`: low 1.6 M, medium 2.6 M, high 4.2 M device
    pixels, never below a ratio of 1): large HiDPI desktop screens lower their ratio, phones do
    not change. Intel GPUs other than Iris Xe / Arc are capped at a ratio of 1.25 (the auto
    preset already gave them medium). High preset: MSAA 4 → 2.
  - While a menu is open, the 3D is drawn at ~20 fps (`GameRenderer.setBackground`).
  - The menu backdrop no longer blurs the canvas (`backdrop-filter`), it is a little darker.
  - Kept: the infinite box-shadow glows (small elements, changing them would move layouts);
    building animations stay one mesh per part (the 3D loop costs 5–20 ms of JS at CPU ×4,
    draw calls 136–155: not the bottleneck).
- **After** (same probe, CPU ×4): interface 34–89 ms/s with nothing open (was 135–210),
  100–160 ms/s with the village open (was 240–490); worst update 11–60 ms (was 45–147); long
  tasks almost gone. Menu work: village 63–96 ms (was 110–170), defense 40–59 (90–135),
  research 18–38 (55–75), tile sheet 27–77 (65–75), settings 12–38 (35–50). Without slowdown
  this is ~4× less, under the 100 ms target on an old laptop. The owner can check real frame
  rates with `?debug` (GPU, pixels, fps, p95, menu times).
- **Camera** (part 3):
  - Glide after a one-finger pan on touch screens (`camera/inertia.ts`): the release velocity
    of the camera target over the last 100 ms (sampled on pointer moves; a finger resting
    > 60 ms before lifting does not throw the camera), fading with a 0.28 s time constant
    (≈ 12 % left after 0.6 s), capped at 3 camera distances per second, braked against the
    edge of the colony, stopped by any new touch, click, wheel, focus or framing. Mouse drags
    keep camera-controls' own smoothing.
  - Double tap (or double click) on a tile: the first tap selects as before, the second one
    flies the camera there (`TapDetector.onDoubleTap`, < 320 ms and < 30 px apart).
  - Two-finger twist goes through camera-controls' easing like the other gestures.
  - Compass (`Compass.tsx`, above the paths button, hidden behind a phone sheet and in path
    mode): its needle points to the alien planet, i.e. the colony's front (`render/front.ts`,
    `FRONT_AZIMUTH = π`: the far side of the default view, reused by chantier 12); a tap flies
    to the Nest. The camera azimuth goes through a small `viewStore`, not the main store.
- **Alien planet** (part 4): a truly fixed position cannot work with this camera (it looks
  45–64° down: a fixed object in the sky would only show at a few zooms and angles). The twin
  now behaves like the moon: always in the direction of the front (`FRONT_AZIMUTH`), at the
  same height in the sky for a given zoom and pitch, with a fixed orientation and its slow
  spin. Turning the camera slides it across the screen and out of view (the compass shows
  where it is); zooming out raises it (ramp 1.0 → 1.55 × the framing distance, was
  1.08 → 1.75, so it shows sooner) a little higher above the rim than before.
- **Lighter blur** (owner: lighter, no setting): high preset tilt-shift focus area 0.5 → 0.75,
  feather 0.32 → 0.2.
- **Closed planet** (part 5): the skin dome is `FrontSide` and carries a "cut" disc
  (`CircleGeometry` child of the dome, same ellipse as its rim): between the rim tiles and the
  skin, and through the gaps between tile prisms, one sees the fruit's cut (the biome's outer
  flesh mixed 55 % with a skin brown, olive in the classic biome), never the inside of the
  skin. The twin, allies and intro share it through `TerrainView`. Near plane 0.5 → 1 (the
  camera never comes closer than 11; polar angle still 0.32–1.12).
- **Intro** (part 6, `render/introFx.ts`): the whole fruit is a smooth round kiwi (sphere
  64 × 48, fur streaks along its axis, 1.04 × longer across the cut) instead of the two flat
  domes stretched ×1.18; at the cut the halves start as deep as it and settle into the game's
  dome while they part. The additive white flash is replaced by a thin streak with a fading
  tail sweeping down the seam. Juice splashes from the cut (150 green drops, 22 dark seeds,
  instanced, gravity, 1.5 s, shrinking). The `slice` synth gained a wet splash and five drop
  "plips" (the ring is softer); still played by `onSlice`.

## Chantier 11 — Construction readability (icons, before/after, building tree)

- **Owner's answers**: level badges at medium zoom plus a "show levels" button; future ages in
  the tree as "???" with the age that brings them; one "Plans" screen with two tabs (Buildings,
  Research) behind the book button; a green "upgradable" arrow inside the badge.
- **Icons** (`ui/iconSet.tsx`): one `<Icon name>` component over a registry of inline SVG
  glyphs (32×32, filled shapes and brown outlines like `icons.tsx`, no icon font): one per
  building, per effect (harvest, beds, storage, ground/air defense, ammo, cargo, speed, pupils,
  research, cap, queue, guards, rations, injuries, armour, recon, firearms, terraforming…) and
  per research branch (`BRANCH_ICONS`). The older named components stay and are reused.
- **One truth for the numbers** (`packages/shared/src/sim/describe.ts`):
  `describeLevel(type, level, state?)` lists a level's stats from `levelDef`; with a state,
  production includes the face climate and the researched harvest bonus ("with every worker,
  on this face": logistics and staffing stay in the building sheet), storage and turret defense
  their tech multipliers. `describeUpgrade` pairs two levels (a stat new at the next level
  starts from 0). `describeTech(id, state)` compares `techEffects` with and without the tech,
  so bonuses stack on what is already known. Multipliers show as ±%, smaller-is-better stats
  (durations, rations, injuries, upkeep) turn green when they drop.
- **Build checks shared with the UI**: `buildLock` (Nest level, age, one lab/monument,
  technology, turret and building caps), `siteError` (tile type, taken, obstacle, titan, flood,
  rampart) and `upgradeLock` (the upgrade checks plus queue and resources) are what the `build`
  and `upgrade` commands now call, in the same order, so the tree, the placement mode and the
  badges can never disagree with the server. `buildableTiles(state, map, type)` feeds the
  placement mode. Tests compare them with `validateCommand` on every tile / building.
- **Upgrade preview**: the building sheet shows "Level N → N+1" with each stat, the next value
  in green (red if it drops), above the cost. The build menu lists the level-1 numbers; each
  technology card lists its effect on this colony, before → after.
- **Plans screen** (`modal: 'plans'`, `plansTab`): the Buildings tab groups every type by family
  (production, housing, storage, defense, knowledge, ship), with its icon, how many are built or
  ordered (`copiesOf`), its level-1 numbers, a "All levels" fold-out (stats and Nest level per
  level; levels of an age not reached show "??? · comes with: <age>"), its cost and "Place".
  A type whose first level needs a later age is a dark silhouette "???". "Place" is disabled
  with the reason (lock, queue full, resources). The Nest is listed (not placeable). Camps are
  not in the tree (they stay a tile action).
- **Placement mode** (`placing` in the store): the screen closes and the valid tiles pulse in
  yellow (above the juice for wells); a tap on a lit tile builds and shows the new site, other
  taps are ignored; the banner (reusing the path toolbar look) has Cancel, Escape cancels,
  painting paths cancels it. No valid tile → a toast instead of an empty mode.
- **Silhouettes per level**: levels 2 and 3 each add a piece readable from the default zoom
  (hut annex rooms and a thatched cap, juice pockets on cradles, pulpery storehouse and drying
  tower, fibre drying rack and loft, seed cart and silo, warehouse shed, launchpad windsock and
  beacon, school archery target, turret shield plates / spiked base, sky turret lookout ring /
  buttresses). Levels 4–6 add a banner pole with one golden pennant per level above 3, on top
  of the existing gold studs and age dressing.
- **Level badges** (`render/levelBadges.ts`, owned by `BuildingsView`): a canvas sprite per
  building (camps excluded) above the model, constant size on screen (`sizeAttenuation: false`,
  3 % of the screen height), shown below 0.6 × the framing distance or always with "show
  levels" (round button above the compass, key L, `localStorage` `kiwar.levels`); hidden while
  visiting. Textures are cached per (level, upgradable); the sync signature includes the
  upgradable flag so resources arriving light the arrow. Tapping a badge selects its building;
  picking now skips hidden objects.
