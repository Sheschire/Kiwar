---
name: kiwar-design
description: Kiwar game design, tempo and player psychology — the owner's validated design charter, the target pacing (idle curve, ages, sessions, absences), the decision grid every gameplay change must pass, the guard rails, and a verified bibliography with evidence levels. Use before changing costs, durations, rewards, storage, threats, morale, expeditions or battles, before adding any building or mechanic, and when writing or reviewing a chantier document.
---

# Kiwar design

This skill holds the **why** and the **targets**. How to measure them lives in `kiwar-balance`;
the roadmap that schedules the work lives in `docs/CARNET_DE_ROUTE.md` (French). Load the
reference files only when needed:

- `references/charter.md` — the owner's decisions of 23 October 2026, with status and reasons.
- `references/science.md` — verified bibliography, evidence levels, what transfers to Kiwar.
- `references/economy-map.md` — loops, faucets and sinks, caps and formulas, with code paths
  (state before chantier 30; update it when chantiers 30–31 change the numbers).

## The promise

**"A colony that needs you."** The look stays cozy; the game is management under tension between
productivity, safety and expansion (`docs/VISION.md`). The player should always know what they
are sacrificing today, see the consequence of their choices, and feel their kiwis are alive and
worth protecting.

## Charter (validated by the owner, October 2026)

1. **Idle curve.** A dense first day (Eden in one evening), then waits that grow age after age.
   A wait is fine when it is expected and leads to a decision; time with nothing to decide is
   the defect to hunt.
2. **Always something to do early.** Every age brings new buildings or systems, not only bigger
   numbers (novelty and visible progress weigh more than fine difficulty tuning).
3. **Reward the return, never punish the absence beyond stagnation and repairable losses.**
   Warehouse reserves fill while away and are collected by a tap; a full reserve stops
   production; nothing is ever lost entirely.
4. **Punitive but recoverable.** Bad placement, bad management or neglect cost morale, loot,
   damage and wounds; a kiwi dies only on a real defeat (and on expeditions). Every threat is
   announced and has at least two answers. No dead end, ever.
5. **Optimisation pays.** Stats, classes, gear and placement must change outcomes the player can
   see (battles on the map, adjacency, logistics).
6. **Tension with information.** Permadeath on expeditions, but with intel before landing, a
   retreat threshold, and a clear forecast. The player loses because of a choice, not a hidden
   roll.
7. **A world with its own clock.** The alien civilisation grows on a fixed schedule for
   everyone, slowed by our victories and fed by our defeats. No hidden per-player difficulty
   adjustment.
8. **Legible goals.** Immediate, session, multi-session and long-term goals coexist and are
   visible (objectives per age, progress toward the next age, the conquest map).
9. **A living village.** Kiwis visibly live, work in place, gather, celebrate; watching the
   colony run on its own is a pleasure in itself (delegated play).
10. **Fair and exact.** Same rules for every player, deterministic simulation, exact offline,
    server authority for hidden data.

## Tempo targets (attentive player; to verify with the bot)

| Milestone                      | Target                    | Before chantier 30 | End of chantier 30 |
| ------------------------------ | ------------------------- | ------------------ | ------------------ |
| Tutorial done                  | ~1–1.5 h                  | 1.3 h              | 1.3 h              |
| Stone age                      | ~12 h                     | 36 h               | 12.0 h             |
| Iron age                       | ~3 days                   | 4.1 days           | 2.8 days           |
| Industrial age                 | ~10 days                  | 7.8 days           | 9.2 days           |
| Occasional player (8 h visits) | ~×1.5 the attentive times | ×1.5 / ×1.3        | ×1.7 / ×1.4 / ×1.1 |

Levels: 3 per age (Eden 1–3, Stone 4–6, Iron 7–9, Industry 10–12), the Nest follows.

**Working hypotheses** (not laws, check them with the bot and with people): in the first 24 h of
active play no stretch longer than ~45 min without a useful decision; a resource sits at its
cap less than ~20 % of active time; early reserves cover ~8 h of absence.

## Decision grid — every gameplay change

Answer these in the chantier document or the commit body before coding:

1. **Loop touched**: core (observe → decide → act → feedback), economy (produce → store → spend
   → change production), progression (unlock → learn → specialise), return (leave → offline →
   come back → re-plan), strategy (compare → risk → see the effect).
2. **Goal horizon**: immediate, session, multi-session or long term? Is the next step visible?
3. **Faucets and sinks**: what produces, what consumes, what saturates? Does it create useless
   stock or a dominant strategy?
4. **Decision created**: what does the player now choose? Is there a real trade-off, or only a
   bigger number or a longer wait?
5. **Punishment**: announced? recoverable? at least two answers? no dead end?
6. **Absence**: what happens after 8 h, 24 h, 3 days away? Stagnation is fine, loss of
   everything is not, forced log-in is not.
7. **Measure**: which bot metric moves (milestone times, dead time, cap time, losses), by
   profile (attentive, occasional)? Kiwisu vs Kiwino within ±10 %.
8. **People**: is the effect about feelings (fun, frustration, tension)? Then a simulation does
   not validate it: ask the owner to play it, and note it "to test" in `docs/DECISIONS.md`.

## Guard rails (non-negotiable)

- Never present a reward rate, a cost slope or a "frustration rate" as a scientific constant.
- Retention, session length or urge to continue are not fun (wanting ≠ liking); "more usage" is
  never a design goal by itself.
- No coercive log-in pressure, no opaque random rewards, no frustration designed to force a
  spend. No hidden per-player tuning of a shared economy.
- Never invent studies, numbers or player data; mark anything unverified with ⚠️.
- Keep the simulation invariants (`kiwar-sim`): determinism, exact offline, server authority.
- Never a blocked game: every chantier checks there is no decision leading to a dead end.

## Where things are decided

- Owner decisions and their reasons: `docs/DECISIONS.md` (one section per chantier) and
  `references/charter.md` for the charter itself.
- Schedule, unlock table per age, content backlog: `docs/CARNET_DE_ROUTE.md`.
- Each chantier document (`docs/chantiers/NN-*.md`) lists the decisions already taken: do not
  ask them again; ask the owner only about new points (interactive questions, with a
  recommended option).
