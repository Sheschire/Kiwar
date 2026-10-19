---
name: kiwar-workflow
description: How to work on the Kiwar repo — commands, pre-push checklist, commit format, pushing to main, and environment pitfalls. Use at the start of any Kiwar task and before every commit.
---

# Kiwar workflow

## Layout

pnpm workspaces:

- `packages/shared` — pure deterministic TypeScript: data tables, world generation, simulation,
  save/migrations, server game service and protocol. Used by the client, the balance tool, the
  Supabase edge function (bundled) and the mock server.
- `apps/client` — Vite 7 + Three.js 0.180 + Preact + zustand (vanilla store), PWA.
- `tools/balance` — balance bot and report CLI (tsx).
- `supabase/` — SQL migrations, RLS tests, Deno edge function `game`.
- `scripts/` — `build-functions.mjs` (bundles shared into the edge function), `mock-supabase.ts`,
  `shot.mjs` (screenshots).

## Commands

| Command                                      | What                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | client on http://localhost:5173 (local mode)                                             |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | all workspaces / ESLint (max 0 warnings) / Vitest                                        |
| `pnpm exec prettier --write <paths>`         | format (CI does not check Prettier, but keep files formatted)                            |
| `pnpm build`                                 | client production build                                                                  |
| `pnpm build:functions`                       | **re-run after any change in `packages/shared`** (a test fails if the bundle is stale)   |
| `pnpm test:db`                               | migrations + RLS tests on local Postgres (start it first: `pg_ctlcluster 16 main start`) |
| `pnpm balance --seeds 30`                    | balance report (see `kiwar-balance`)                                                     |
| `pnpm mock:supabase` + `pnpm dev:online`     | online mode against the mock (port 5174)                                                 |

## Before every push

1. `pnpm exec prettier --write` on touched files (Prettier may rewrap code: re-read before
   string-based edits).
2. `pnpm build:functions` if shared changed.
3. `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm test:db` if SQL changed, `pnpm build` if
   client changed).
4. For visible changes, take a desktop and a phone screenshot (see `kiwar-client`).
5. Re-read the diff: no model names in commits/code, no debug leftovers.

## Commits

- English, imperative title (`Milestone N (part k): …` for milestone work), body with bullets.
- End every commit message with the attribution lines required by the session (Co-Authored-By
  and Claude-Session), never a model identifier elsewhere.
- Push straight to main: `git push -q origin HEAD:main` (local branch name does not matter).
- CI (`.github/workflows/ci.yml`): install, typecheck, lint, test, test:db (Postgres service),
  build, balance 30 seeds × 24 h. Check runs with the GitHub MCP `actions_list` tool.

## Environment pitfalls

- `pkill -f <pattern>` kills your own shell if the pattern appears in the command line (exit
  144). Prefer killing by port or PID.
- Long runs (balance 200 seeds ≈ 2 min): run in the background, write to a file in the
  scratchpad, read it later. Piped `grep` may buffer output.
- Postgres stops when the container restarts: `pg_ctlcluster 16 main start`.
- Deno is not installed globally; if needed, install it in the scratchpad. Deno once rewrote
  pnpm config into `package.json`: `supabase/functions/deno.json` prevents it — keep it.
- Playwright + Chromium are preinstalled (`/opt/pw-browsers`); never run `playwright install`.

## Database changes → SQL for the owner

The owner applies SQL by hand in the Supabase SQL Editor. For any schema change: add a new
migration file (`supabase/migrations/<timestamp>_<name>.sql`, never edit an applied one), run
`pnpm build:sql` and `pnpm test:db`, update `docs/SUPABASE_SETUP.md`, and **paste the complete
SQL of the new migration(s) in your final answer**, in a ```sql block, with the order to run
them. A brand-new project only needs `supabase/setup.sql`.

## End of a chantier

Update `docs/DECISIONS.md`, `README.md` (French status block), `docs/PLAN.md` (state), the
chantier document in `docs/chantiers/` (done / left), and **the skills** (create one for a new
domain, e.g. `kiwar-audio`, `kiwar-rpg`) with anything the next conversation must know.
