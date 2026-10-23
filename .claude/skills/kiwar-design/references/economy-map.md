# Economy map (state at the end of chantier 30, October 2026)

Paths under `packages/shared/src/` unless stated. Costs are pulp/fiber/seeds/juice (p/f/s/j);
"N" = Nest level. **Update this file when a chantier changes the numbers (31 next).**

## Loops

| Loop        | In Kiwar today                                                                                |
| ----------- | --------------------------------------------------------------------------------------------- |
| Core        | place / upgrade buildings, assign kiwis, pick a tech, hatch an egg, launch an expedition      |
| Economy     | producers harvest deposits → kiwis carry to the nearest depot → stock (cap) → spent on builds |
| Progression | Nest levels open caps; Library techs; monument opens each age; School classes; kiwi XP/levels |
| Return      | `advance` is exact offline; automation (chantier 15) keeps building/research/craters going    |
| Strategy    | expeditions (recon/raid, one roll), defense (turrets, garrison), placement (logistics only)   |

Player-only actions: queue builds (2–6 slots), every egg, every tech choice (research stalls
after one tech), expeditions, class training, speech/rain skills, objective rewards.

## Faucets

- **Producers** (`data/buildings.ts`, `sim/territory.ts:520-575`): per-worker base at L1/L2/L3
  pulp 750/940/1250, fiber 600/750/1000, juice 450/560/750, seeds 190/240/333 per hour × worker
  power (Dexterity +3 %/pt, mastery +3 %/rank, class, trait) × morale × hunger × logistics
  (42 / (30 + 4·distance), clamp 0.35–1.25) × day/night (night ×0.4) × season × biome; capped by
  the deposit pool (`data/territory.ts:17-24`, regrowth per tile flesh 300/h, grove 250, seed
  ring 80, juice 300; winter 0, spring ×1.4).
- **Nest passive** income 340/290/–/40 → 600/380/–/80 p/f/j per hour (L1 → L3).
- **Camps** 450/380/130/450 per hour, free and instant. **Meteorite craters** ~1/day, 48 h, 3
  workers, seeds ×2 / juice / fiber (tuned by the Drill tech).
- **Expedition loot**: twin 1920/960/960/1440 (×0.8–1.2, hidden) × win bonus ≤ 2 × age factor
  [1, 1.5, 2, 3], limited by the hold. **Objectives**: tutorial only (15–100 resources).

## Sinks

- Building costs: L1→L3 explicit tables; L4–12 (chantier 30, `withAgeLevels`) = previous ×1.7
  cost (×2 at the first level of an age), ×1.35 time, ×1.25 output; copies × growth^copies
  (1.3–2), upgrades not scaled by copies (`sim/selectors.ts` `buildCost`).
- Monument L1/L2/L3: 2000/2000/400/600 (1 h, Nest 3), 9000/9000/2000/3000 + 15 stardust (6 h,
  Nest 6), 20000/20000/5000/7000 + 25 stardust (12 h, Nest 9).
- Food: 30 pulp + 10 juice per kiwi per hour (summer ×0.8, winter ×1.3).
- Eggs: pulp 25·1.3^n, juice 10·1.35^n, time min(2 h, 20 s·1.55^n), n = population − 3.
- Expedition rations: crew × (4 p + 2 j)/h × round trip (`sim/expeditions.ts:213-224`) — tiny.
- Wave loot: 35 % × severity of stock above the protected share (Nest 30 %, warehouse 60 %).

## Caps

| Cap                    | Values (Nest level 1→12)                                                                             | Where                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| Buildings in the cap   | 6 / 11 / 18, then +3 per level (45 at Nest 12)                                                       | Nest `maxBuildings`  |
| Queue / parallel sites | 2/3/4, +1 at the first level of each age (5 / 6 / 7) · 1/1/2/2/2/2/3…                                | Nest, `data/jobs.ts` |
| Storage (per resource) | Nest 600/1500/3000/6000/10200/17350/34700/… + warehouse 60/150/250/500/… each (masonry ×1.2)         | `capacity`           |
| Reserve (per resource) | warehouse 3000/7000/14000, ×1.5 per level, filled one warehouse after another once the stock is full | `reserves`, `accrue` |
| Level gate             | level n needs age ⌊(n−1)/3⌋ and Nest ≥ n (Nest: n−1)                                                 | `withAgeLevels`      |
| Turrets                | 2/4/6/7/7/8/8/8/9…                                                                                   | `data/threats.ts`    |
| Research bank          | 100/200/400/800/1000/1200/1500/1800/2100/2500/2800/3100 points without a chosen tech                 | `data/research.ts`   |

Once the stock of a resource is full the harvest overflows into the reserves; with every
reserve full it stops (`storageFullCheck`); stock above the cap (rewards) is kept. Only the
player collects reserves (`collect`, `collectAll`).

## Research and ages

- Points/h per researcher 8/10/12 (Library L1→L3), then ×1.07 per level (1→6 researchers, +1
  at the first level of an age) × (1 + 6 % Spirit above 5) × mastery × mage 1.2 × presence ×
  night × hunger × morale (`sim/research.ts`).
- Passage techs: stoneAge 120 (Library 1), ironAge 2900 (Library 4), industryAge 11500
  (Library 7); then the monument level. Eden techs 25–40 points.
- Targets were set at chantier 08 (Stone 1.5 d, Iron 4 d, Industry 8 d) and re-tuned at chantier
  18 (`docs/DECISIONS.md:578-588, 1110-1173`).

## Threats

- First wave ≥ 24 h of play and Nest 2; every 20–28 h; notice 8–12 h (+4 h starWatch); 24 h
  shield after a defeat (`sim/threats.ts` `planWave` 509-531).
- Power = 6 × Nest factor [0, 0.6, 1, 1.6, 2.2, 2.9, 3.6] × age [1, 1.15, 1.3, 1.5] × (1 + 0.25
  × days, ≤ 14) × (1 + 0.08 × raid victories, ≤ +0.8) — **no link to wealth or population**.
- Outcome (`waveOutcome` 379-436): loot, 1–4 damaged buildings, injuries, at most one death.
  The bot loses nothing (turrets L2 take 4 min against 8–12 h of notice).

## Morale, rest, hunger

- Morale = clamp(±0.20) of fed +0.03 / hungry −0.05, comfort ±0.03, mayor +0.01·Charisma
  (+0.05 Organisation), speech +0.03 for 1 h, mourning −0.06 for 24 h, season ±0.02
  (`data/needs.ts:67-83`, `sim/rest.ts:151-211`). Passive and easy.
- Rest: presence = max(0.5, 1 − need × (1 + 0.08 × steps to bed)).

## Measured pacing (bot, `docs/BALANCE_REPORT.md`)

End of chantier 30 (4 seeds per biome): tutorial 1.3 h · Nest 3 3.6 h · Library 3.8 h · every
economy building L3 ~8 h · Stone 12.0 h · Iron 2.8 d · Industry 9.2 d · occasional player Stone
20.5 h, Iron 3.8 d, Industry 10.0 d · dead time over the first 24 h 77–108 min · most capped
resource 0–11 % of the run.
