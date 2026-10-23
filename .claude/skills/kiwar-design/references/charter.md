# Design charter — owner decisions (23 October 2026)

Status: **validated** = chosen by the owner; **to test** = the effect is about feelings and
must be played; **default** = chosen by Claude when the owner left the detail open (changeable).
The French summary and the schedule are in `docs/CARNET_DE_ROUTE.md`; the log is
`docs/DECISIONS.md` ("Carnet de route").

## Why (owner's feedback after playing)

- The game is passive: long waits for the ages, nothing new in between, reconnaissance and alien
  waves are not stimulating. It should feel like an idle game: big progression at first, always
  something to manage, then slowly longer waits.
- Little reason to optimise kiwis or building placement. Too safe: "I win without doing
  anything." Warehouses too strong: log in, spend everything, leave.
- Conquest of the twin face is the heart of the game and must become dynamic and tense.

## Decisions

| #   | Topic              | Decision                                                                                                                                                             | Status                        |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Ages (attentive)   | Stone ~12 h, Iron ~3 days, Industry ~10 days                                                                                                                         | validated                     |
| 2   | Levels             | 3 per age: Eden 1–3, Stone 4–6, Iron 7–9, Industry 10–12; the Nest follows                                                                                           | validated                     |
| 3   | Reserves           | in warehouses; overflow model: when a stock is full, production goes on into warehouse reserves, collected by a tap; reserve cap ~8 h early                          | validated (overflow: default) |
| 4   | Punishment         | repairable losses: morale, full reserves stop production, stronger waves loot and damage; a kiwi dies only on a real defeat; never blocked                           | validated                     |
| 5   | Battle             | orders before departure (posture, priorities, retreat threshold); the server computes the battle on landing; the client plays it live, clickable; replay when absent | validated                     |
| 6   | Defeat on landing  | retreat when losses pass the threshold (survivors and ship come back, no beacon); otherwise crew dead forever, ship lost, loot to the aliens, fog returns            | validated                     |
| 7   | Alien civilisation | its own clock (fixed dates for everyone), slowed by our burns, fed by our defeats; its waves follow its power                                                        | validated                     |
| 8   | Sector conquest    | one victory: beacon, burnt buildings, permanent view; later in the game the aliens may attack a beacon (announced, defendable)                                       | validated                     |
| 9   | Morale             | one gauge per kiwi (food, rest, leisure, beauty, safety, traits, mourning, wounds); low-morale kiwis seek leisure off work                                           | validated                     |
| 10  | Rouge-Gorge        | a Moulin-Rouge-style cabaret (cancan show, soft red lights at night), not an escort house                                                                            | validated                     |
| 11  | Order              | Rhythm (+ UX fixes, content workshop) → War of the faces → Living village → Beyond                                                                                   | validated                     |
| 12  | Docs               | roadmap + this skill + detailed chantiers for acts I–II; short sheets for act III; act IV in the roadmap only                                                        | validated                     |
| 13  | Neighbour vision   | a beacon also lights the edge of adjacent sectors (natural edge → centre progression)                                                                                | default                       |
| 14  | Burn or loot       | a landing order: burn (slows the civilisation) or loot (more resources back)                                                                                         | default                       |
| 15  | Retreat report     | survivors of a retreat bring back what they saw (stale snapshot), no beacon                                                                                          | default                       |
| 16  | Breakdowns         | a breakdown delays the trip instead of aborting the mission                                                                                                          | default                       |
| 17  | Decorations        | outside the building cap, growing cost per copy, beauty in a radius                                                                                                  | default                       |
| 18  | Second colony      | kept: the conquered twin still becomes the second colony (chantier 19)                                                                                               | default                       |

## To test with people (not with the bot)

- Is a 12 h Eden dense enough, or too rushed? Does the first wave feel exciting or unfair?
- Do warehouse taps feel like a reward or like a chore?
- Does permadeath on landings create good tension, or discourage? Is the retreat threshold
  understood before launch?
- Is the per-kiwi morale readable on a phone?
