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
