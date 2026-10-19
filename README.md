# Kiwar 🥝

A cozy low-poly management game about kiwi birds living on a kiwi planet cut in two.
Playable in the browser on desktop and mobile. Design brief: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

> Work in progress — milestone 1 (local single player, no server).

## Quick start

Requirements: Node ≥ 20 and pnpm (`corepack enable` gives you pnpm).

```bash
pnpm install
pnpm dev          # http://localhost:5173 (also exposed on your LAN for phone testing)
```

URL parameters: `?seed=banana&face=kiwino` generates a specific face.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Vite dev server for the client |
| `pnpm build` | Production build of the client (`apps/client/dist`) |
| `pnpm preview` | Serves the production build |
| `pnpm test` | Vitest (all workspaces) |
| `pnpm typecheck` | `tsc` on every workspace |
| `pnpm lint` | ESLint |
| `pnpm balance` | Headless balance report Kiwisu vs Kiwino |

## Architecture

```
packages/shared   game rules, data, simulation, procedural generation — pure TS, no DOM/Three
apps/client       Three.js rendering + Preact HUD; reads state, sends commands
tools/balance     headless balancing simulations (CLI)
docs/             game design brief and decision log
```

- `shared` is deterministic: no `Math.random()` / `Date.now()` (enforced by ESLint); randomness comes
  from a seeded RNG, time is passed in.
- See [`docs/DECISIONS.md`](docs/DECISIONS.md) for the decision log.

## Credits

- Font: [Alegreya](https://fonts.google.com/specimen/Alegreya) by Juan Pablo del Peral — SIL Open Font License 1.1 (via Fontsource).
- All 3D models, textures and effects are procedurally generated in code.
