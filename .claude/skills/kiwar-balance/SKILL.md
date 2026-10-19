---
name: kiwar-balance
description: Kiwar balance tooling — the bot player, the Kiwisu vs Kiwino report, and how to diagnose pacing problems after changing numbers. Use whenever data tables or economy rules change.
---

# Kiwar balance

- `pnpm balance --seeds 30` runs the bot on N seeds per face and prints medians of milestones
  (tutorial, pop10, nest2, nest3, allLevel3, kiwi5, kiwi10, mayor) with the Kiwisu/Kiwino gap
  (threshold ±10 %). The default horizon is 72 h (kiwi10 needs ~2.5 days): a 30-seed run takes
  ~10 min — run it in the background; CI uses 24 h (kiwi10 unreached there, that is expected).
  Writes `tools/balance/reports/latest.md`.
- Official report: `pnpm balance --seeds 200 --out ../../docs/BALANCE_REPORT.md` — **`--out` is
  resolved from `tools/balance`** (pnpm runs the script there). ~2 min: run it in the background.
- Reference (end of milestone 4, 200 seeds): tutorial 1.5 h, Nest 2 1.5 h, Nest 3 ≈ 5.9 h,
  faces within 3 %.
- Bot (`tools/balance/src/bot.ts`): follows the tutorial, keeps kiwis busy, hatches eggs, builds
  one of each building on the site with the most deposits in reach × logistics
  (`catchmentPreview`, `logisticsEfficiency`), then upgrades the bottleneck producer (rates
  normalised by `NEED`, full storage ignored) or opens a new site when exhausted, saves up for
  the bottleneck, adds housing/storage, upgrades the Nest ASAP. Chantier 03: places stat points
  (Dexterity, Charisma for the mayor, Strength for the builder), builds a School after the
  Nest 2, trains the most charismatic level-5 kiwi as mayor then a builder, and gives speeches.
  It does not use camps, paths, expeditions, mages or scouts — update it when a new mechanic
  matters for progression.
- Diagnose with `runBot({ …, onStep(state, map) })`: log every 30 min of game time the
  resources, rates and `buildingHarvest(state, b)` (status, stock/cap, efficiency). Typical
  culprits: tiny catchments, a bottleneck whose upgrade the bot cannot afford, storage caps.
- Change numbers in `packages/shared/src/data/*`, rerun, then record the retune in
  `docs/DECISIONS.md` and regenerate the report. CI runs 30 seeds × 24 h.
