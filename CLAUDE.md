# Kiwar — guide for Claude

Cozy-but-real management game in 3D isometric (Three.js), browser desktop + mobile. Kiwi birds
grow a colony on a kiwi-fruit planet cut in two faces (Kiwisu / Kiwino).

## Read first

- `docs/PLAN.md` — **roadmap, current milestone, next tasks** (start every conversation here).
- `docs/GAME_DESIGN.md` (original brief, never edit), `docs/VISION.md` (owner's long-term ideas
  and answers), `docs/DECISIONS.md` (every design/tech decision, per milestone).
- Skills in `.claude/skills/` hold the codebase know-how — load the matching one before working:
  - `kiwar-workflow` — checks, commits, pushing, environment pitfalls (always).
  - `kiwar-sim` — adding a mechanic to the shared deterministic simulation.
  - `kiwar-client` — rendering, UI, i18n, mobile, visual checks with screenshots.
  - `kiwar-online` — Supabase backend, edge function bundle, mock server, RLS tests.
  - `kiwar-balance` — balance bot, reports, diagnosing pacing.

## Owner's rules

- The owner is French: talk to them in French; code, comments and commit messages in English;
  game texts in FR + EN (`apps/client/src/i18n`); README in French; gender-neutral French copy.
- Push **directly to `main`** (`git push -q origin HEAD:main`); no pull requests unless asked.
- Small playable steps, clear commits; typecheck, lint and tests must pass before each push.
- Record small decisions in `docs/DECISIONS.md`; ask the owner (interactive questions) for
  design decisions the docs do not cover.
- Mobile must be very fluid and responsive; desktop beautiful and intuitive.
- "A management game, not just a cozy game": trade-offs between productivity, safety, expansion.
- **Keep the skills and `docs/PLAN.md` up to date** at the end of each milestone (or whenever
  you learn something about the codebase that the next conversation would need).
