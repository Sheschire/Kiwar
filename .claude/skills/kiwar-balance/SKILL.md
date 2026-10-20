---
name: kiwar-balance
description: Kiwar balance tooling — the bot player, the Kiwisu vs Kiwino report, and how to diagnose pacing problems after changing numbers. Use whenever data tables or economy rules change.
---

# Kiwar balance

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
  It does not use camps, paths, expeditions, mages or scouts — update it when a new mechanic
  matters for progression. Expeditions have their own probe: `pnpm balance:expeditions`
  (`kiwar-expeditions`).
- Chantier 04: the bot feeds its colony (`canFeedOneMore`, meals in the bottleneck), places huts
  where producers walk the most to a bed; `fullHorizon`, `activeMs` + `sessionEveryMs`
  (occasional player) and `final.starved` / `maxHungerH` let you check winters. A bot run costs
  ~2× more than before (beds, morale): run long reports in the background.
- Diagnose with `runBot({ …, onStep(state, map) })`: log every 30 min of game time the
  resources, rates and `buildingHarvest(state, b)` (status, stock/cap, efficiency). Typical
  culprits: tiny catchments, a bottleneck whose upgrade the bot cannot afford, storage caps.
- Change numbers in `packages/shared/src/data/*`, rerun, then record the retune in
  `docs/DECISIONS.md` and regenerate the report. CI runs 30 seeds × 24 h.
