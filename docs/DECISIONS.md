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
