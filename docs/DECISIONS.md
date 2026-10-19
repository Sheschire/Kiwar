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
