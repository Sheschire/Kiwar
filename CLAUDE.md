# Kiwar — guide for Claude

Cozy-but-real management game in 3D isometric (Three.js), browser desktop + mobile. Kiwi birds
grow a colony on a kiwi-fruit planet cut in two faces (Kiwisu / Kiwino).

## Read first

- `docs/PLAN.md` — **current state and next chantier** (start every conversation here).
- `docs/CARNET_DE_ROUTE.md` — **the direction** (October 2026): why, target pacing, the acts
  and chantiers 30–45, the unlock table per age, act IV ideas. Read it when an act starts, not
  every session. `docs/DETTE.md` holds the debt of finished chantiers (read when referenced).
- `docs/chantiers/` — one design document per upcoming workstream ("chantier"): owner's intent,
  proposals, technical impact, breakdown, open questions. `docs/chantiers/README.md` lists the
  rules shared by every chantier.
- `docs/GAME_DESIGN.md` (original brief, never edit), `docs/VISION.md` (owner's long-term ideas
  and answers), `docs/DECISIONS.md` (every design/tech decision, per milestone).
- Skills in `.claude/skills/` hold the codebase know-how — load the matching one before working:
  - `kiwar-workflow` — checks, commits, pushing, environment pitfalls (always).
  - `kiwar-design` — game design charter, target pacing, decision grid, guard rails, verified
    bibliography (any change to costs, durations, rewards, threats, or a new mechanic).
  - `kiwar-sim` — adding a mechanic to the shared deterministic simulation.
  - `kiwar-client` — rendering, UI, i18n, mobile, visual checks with screenshots.
  - `kiwar-online` — Supabase backend, edge function bundle, mock server, RLS tests.
  - `kiwar-balance` — balance bot, reports, diagnosing pacing.
  - `kiwar-audio` — sound events, audio engine, CC0/synth sounds, `/admin` sound space.
  - `kiwar-rpg` — individual kiwis: stats, XP, masteries, classes, skills, School, village screen.
  - `kiwar-cycles` — calendar, day/night and seasons, hunger, rest and beds, morale, sky/weather.
  - `kiwar-world` — biomes, floods, the twin half under fog of war, the intro and the face choice.
  - `kiwar-threats` — predator waves, incidents, turrets, garrison, shelter, repairs, meteorites.
  - `kiwar-expeditions` — raids and reconnaissance, hidden alien garrisons (anti-cheat), intel,
    ship generations and breakdowns, the mechanical kiwi bird.
  - `kiwar-ages` — research (Library, points, technologies), ages and the monument, building
    levels 4–6, ships and threats by age, the village look by age.
  - `kiwar-titans` — obstacles (rocks, stumps, wrecks), the laboratory against nature and the
    Kikiwiwis, titan works and reshaped tiles (`state.terraform`, `faceMapOf`).
  - `kiwar-tasks` — the automation: tasks filled with the best kiwis (constructions in
    parallel, research, meteorite posts and the drill, stardust, repairs, garrison), borrowing
    and sending back, the dispatcher's exactness rules, the Automation panel.
  - `kiwar-colonies` — the siege of the twin face: hidden holds and queen, deep reconnaissance,
    assaults, bridgeheads and counter-attacks, fortification, the final assault, the Siege
    screen; later the second colony.
  - `kiwar-battle` — the battle engine: unit data, AI, journal, waves played as battles, the 3D
    show and its UI, the forecast's practice battles (and the landings of chantier 40).
  - `kiwar-forge` — meteoric iron (craters, wrecks, what it pays for), the Forge, items by
    family and tier, the armory, kiwis' gear and its weight in battle.
  - `kiwar-civ` — the alien civilisation: its own clock and ages, 12 parcels with buildings
    and garrisons, the AI that hides its key buildings, impacts (burns, defeats), waves drawn
    from it (announced by the server online), the public estimate.
  - `kiwar-sky` — comets and stardust: pickers, blessings, the star egg, the Stars research
    branch, ship fuel, stardust costs of the ages and the Kikiwiwis.

## Owner's rules

- The owner is French: talk to them in French; code, comments and commit messages in English;
  game texts in FR + EN (`apps/client/src/i18n`); README in French; gender-neutral French copy.
- Push **directly to `main`** (`git push -q origin HEAD:main`); no pull requests unless asked.
- Small playable steps, clear commits; typecheck, lint and tests must pass before each push.
- Record small decisions in `docs/DECISIONS.md`; ask the owner (interactive questions) for
  design decisions the docs do not cover.
- Mobile must be very fluid and responsive; desktop beautiful and intuitive.
- "A management game, not just a cozy game": trade-offs between productivity, safety, expansion.
- **Database changes**: always a new file in `supabase/migrations/`, then `pnpm build:sql`, and
  **give the owner the complete SQL, ready to copy-paste** into the Supabase SQL Editor (in your
  final answer, with the execution order). Never edit an applied migration.
- **Keep the skills, `docs/PLAN.md` and the chantier document up to date** at the end of each
  chantier (create a new skill when a chantier opens a new domain), and whenever you learn
  something about the codebase that the next conversation would need.

## Working in plan mode

Conversations usually start in plan mode with a chantier document. First ask the owner only the
questions the chantier does not already decide (interactive questions, with a recommended option), then propose a plan split into
playable parts (one commit each). After approval, implement part by part, verify (tests +
desktop and phone screenshots), push to `main`, and finish with the docs/skills updates above.
