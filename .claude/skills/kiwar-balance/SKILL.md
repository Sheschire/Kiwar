---
name: kiwar-balance
description: Kiwar balance tooling — the bot player, the Kiwisu vs Kiwino report, and how to diagnose pacing problems after changing numbers. Use whenever data tables or economy rules change.
---

# Kiwar balance

## Chantier 18: the complete bot and the report

- **Layout**: `src/bot.ts` (run loop, decision order, milestones, `RunResult`), one module per
  domain in `src/bot/` (economy: `bestTile`, `bottlenecks`; defense; rpg; ages; titans; sky;
  **paths**, **camps**, **expeditions**). `src/runner.ts` runs `Job`s (biome, seeds, hours,
  `without`, `profile`) in child processes (`worker.ts`); `report.ts` formats everything.
- **Paths** (`bot/paths.ts`): once per game hour, the route from each producer to its nearest
  depot (Dijkstra on paved costs) is paved when the extra harvest pays the fiber back within
  `PATH_PAYBACK_H` (6 h). **Camps** (`bot/camps.ts`): every meteorite crater, and the richest
  free deposit of the bottleneck when kiwis are idle; dismantled as soon as a workplace wants
  them back. **Expeditions** (`bot/expeditions.ts`, checked every 30 game minutes): launchpad
  after the Library, reconnaissance whenever the report is not `fresh`, raids when the
  forecast is `likely` and the loot beats provisions + wounds + the crew's absence (less XP);
  the bot also trains two warriors and a scout. Each check that finds nothing is throttled
  (`play.pathsAt`, `play.expeditionsAt`): an unthrottled bot was 3× slower.
- **Options of `pnpm balance`**: `--without paths,camps,expeditions`, `--profile active|casual`
  (casual: attentive 6 h, then a visit every 8 h, 60 decisions per visit), `--ages <seeds>
[--ages-days 10]` (long runs of both profiles against the age targets: Stone 36 h, Iron
  96 h, Industry 192 h, casual × 1.5, ±15 %; casual horizon × 1.4), `--impact <seeds>` (same
  seeds without each mechanic, reusing the main runs as the full bot), `--probe <seeds>` (the
  expedition probe, `probe.ts`). `pnpm balance:impact` and `pnpm balance:expeditions` still
  run alone.
- Milestones `recon` and `raidWon` are informative (`INFORMATIVE`: never flagged).
- **Bot bugs the long runs found** (check these first when an age stalls): a decision step
  that returns a command which always fails stops every later step (an idle Kikiwiwi made
  `researchStaffing` ask for a Library worker forever: Industry never came); a lesser tech
  started while the passage waited for a Library level delayed the ages.
- **Reference (end of chantier 18, `pnpm balance --seeds 200 --ages 10 --impact 20 --probe
100`, ~3 h on 4 cores)**: every line green; biomes within ±8.4 %, faces within 1.3 %;
  tutorial 1.3 h, Nest 3 ≈ 3.8 h, Library ≈ 4.0 h (paths), mayor ≈ 13.2 h, level 10 ≈ 2.1 d,
  Stone ≈ 36.5 h; ~60 path tiles, ~18 camps, ~15 reconnaissances and ~5 raids (all won,
  ~8 000 loot a day, ~1 kiwi lost) per 72 h run. Ages (10 seeds × 10 days): attentive Stone
  36.4 h, Iron 4.0 d, Industry 7.9 d; occasional 2.3 d, 5.6 d, 9.7 d (Industry target × 1.25:
  research runs offline, accepted). Impact: without paths Nest 3 / Library +52 %, without
  camps +40 % in the seed crown and lagoons, without expeditions kiwi level 10 +23 % but Stone
  −4 %.
- A decision step that returns a command which never applies (or two steps undoing each
  other: `defenseOrders` vs `titanOrders` relieving / posting the Kikiwiwi) eats the 12
  decisions of a round and freezes the bot: replay the loop with the exported `decide` on the
  stalled state (`runBot({ onStep })` up to the stall, then apply the first command that
  succeeds, 14 times, printing each).
- Quick checks: a scratch script calling `runBot` with `onStep` (log every 12 h: age,
  research, queue, resources, stardust) finds stalls fast; long runs must go through the CLI
  (parallel) — a sequential 9 × 9-day script exceeds the 30 min tool limit.

## Before chantier 18

- `pnpm balance --seeds 30` runs the bot on N seeds **per biome** (chantier 05: six biomes,
  each run in its own child process, `--jobs` = CPU count by default, `--biomes a,b` to pick)
  and prints medians of milestones (tutorial, pop10, nest2, nest3, allLevel3, kiwi5, kiwi10,
  mayor, library, stone, iron, industry). Each biome is compared to the **median of all biomes**, plus a Kiwisu vs Kiwino table
  over their biomes (threshold ±10 %). `runBot({ biome })` forces a biome; the bot keeps clear
  of floodable tiles. CPU-heavy: stop dev servers and browsers while it runs. The default horizon is 72 h (kiwi10 needs ~2.5 days): a 30-seed run takes
  ~10 min — run it in the background; CI uses 24 h (kiwi10 unreached there, that is expected).
  Writes `tools/balance/reports/latest.md`.
- Official report: `pnpm balance --seeds 200 --out ../../docs/BALANCE_REPORT.md` — **`--out` is
  resolved from `tools/balance`** (pnpm runs the script there). ~2 min: run it in the background.
- Reference (end of chantier 05, 200 seeds per biome × 72 h, ~66 min on 4 cores): every biome
  within ±5.6 % of the median (delta and highlands fastest early, seed crown and lagoons
  slowest), Kiwisu / Kiwino within 3.2 %; tutorial 1.5–1.6 h, Nest 3 ≈ 7 h, level 5 ≈ 10.1 h,
  mayor ≈ 12.4 h, level 10 ≈ 2.6 days. Unchanged from chantier 04 on average.
- Reference (end of the first half of chantier 08, 200 seeds per biome × 72 h, ~93 min; 30 seeds
  ~14 min): every biome within ±5.6 %, every line green; older
  milestones unchanged (Nest 3 ≈ 7.3 h, mayor ≈ 12.6 h, level 10 ≈ 2.6 days), Library ≈ 7.4 h,
  Stone age ≈ 35 h in every biome; Iron and Industry need `pnpm balance:ages` (see
  `kiwar-ages`). Runs no longer stop early (the Industry milestone is never reached in 72 h).
- Chantier 09 (30 seeds per biome × 72 h, before / after the redirection and `autoPlace`):
  every milestone within 1 %. Both runs show Nest 3 and Library ~+45 % in the seed crown and
  lagoons (Kiwino +21 %), against ±5.6 % at the end of chantier 08: a regression from another
  chantier, not diagnosed yet.
- **Reference (end of chantier 12, 200 seeds per biome × 72 h, ~100 min)**: every line green,
  biomes within ±7.6 %, faces within 4.4 %; tutorial 1.4–1.5 h, Nest 3 ≈ 5.7 h, Library
  ≈ 6.2 h, level 5 ≈ 10.1 h, mayor ≈ 12.9 h, level 10 ≈ 2.6 days, Stone age ≈ 35 h; 2.5 waves
  per run, none lost.
- Chantier 12 (30 seeds per biome × 72 h): the "Nest 3 +45 % in the seed crown" gap came from
  the bot (stumps cleared only with ≥ 400 pulp, so only pulp-rich biomes got their fiber);
  fixed, Nest 3 ≈ 5.7 h and Library ≈ 6.2 h in every biome, faces within 3.8 %, no wave
  lost. To bisect a balance gap quickly: a `git worktree` per commit and
  `npx tsx src/cli.ts --seeds 8 --hours 12 --biomes orchard,seedCrown` (~20 s each; the
  report's biomes exclude `classic`, which has no obstacles).
- Reference (end of chantier 06, 200 seeds per biome × 72 h, ~63 min): biomes within ±5.6 %,
  faces within 3.2 %, same milestones as chantier 05; 2 waves per run, almost all won by the
  attentive bot (seed crown 9 % lost). See `kiwar-threats` for the bot's defense.
- Reference (end of chantier 04, 200 seeds × 72 h, ~38 min): tutorial 1.5–1.6 h, Nest 3 ≈ 7 h,
  level 5 ≈ 10 h, mayor ≈ 12.3 h, level 10 ≈ 2.6 days, faces within 6 %.
- Previous reference (end of chantier 03, 200 seeds × 72 h): tutorial 1.5 h, Nest 2 1.5 h, Nest 3 ≈ 6.2 h,
  first kiwi level 5 ≈ 10 h, mayor ≈ 12 h, first kiwi level 10 ≈ 2.6 days,
  faces within 3 %.
- Bot (`tools/balance/src/bot.ts`): follows the tutorial, keeps kiwis busy, hatches eggs, builds
  one of each building on the site with the most deposits in reach × logistics
  (`catchmentPreview`, `logisticsEfficiency`), then upgrades the bottleneck producer (rates
  normalised by `NEED`, full storage ignored) or opens a new site when exhausted, saves up for
  the bottleneck, adds housing/storage, upgrades the Nest ASAP. Chantier 03: places stat points
  (Dexterity, Charisma for the mayor, Strength for the builder), builds a School after the
  Nest 2, trains the most charismatic level-5 kiwi as mayor then a builder, and gives speeches.
  Since chantier 18 it uses paths, camps and expeditions (see above); still not: mages,
  deliveries, terraforming beyond smashing rocks, locks (chantier 15).
- Chantier 04: the bot feeds its colony (`canFeedOneMore`, meals in the bottleneck), places huts
  where producers walk the most to a bed; `fullHorizon`, `activeMs` + `sessionEveryMs`
  (occasional player) and `final.starved` / `maxHungerH` let you check winters. A bot run costs
  ~2× more than before (beds, morale): run long reports in the background.
- Diagnose with `runBot({ …, onStep(state, map) })`: log every 30 min of game time the
  resources, rates and `buildingHarvest(state, b)` (status, stock/cap, efficiency). Typical
  culprits: tiny catchments, a bottleneck whose upgrade the bot cannot afford, storage caps.
- Change numbers in `packages/shared/src/data/*`, rerun, then record the retune in
  `docs/DECISIONS.md` and regenerate the report. CI runs 30 seeds × 24 h.

- **Reference (end of chantier 15, 12 seeds per biome × 72 h)**: biomes within ±5.5 %, faces
  within 2.9 %; tutorial 1.3 h, Nest 3 ≈ 3.7 h, Library ≈ 3.8 h, mayor ≈ 12.6 h, level 10 ≈ 2.1
  days, Stone age ≈ 28.8 h, Iron ≈ 2.9 days (about half the runs within 72 h). Ages probe
  (2 seeds × 12 days): Stone ≈ 29 h, Iron ≈ 74 h, Industry ≈ 159 h (−9 to −14 % from the
  automation). The bot relies on the automation (`kiwar-tasks`) and **saves up for the Nest**
  after the tutorial (no stump meanwhile): without it the Nest 3 was a chaotic race (±30 %).
