# Kiwar balance report — biomes

200 seeds per biome · horizon 72 h of game time · threshold ±10 % · computed in 3952.9 s

Each cell: median time to reach the milestone (gap to the median of all biomes). `[n/N]`: runs that reached it, when not all did.

## Every biome

| Milestone                          | Orchard         | Highlands       | Delta           | Seed crown      | Lagoons         | Tundra          | Worst gap |     |
| ---------------------------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------- | --- |
| Tutorial completed (10 objectives) | 1.5 h (-1.0 %)  | 1.5 h (-3.9 %)  | 1.5 h (-5.6 %)  | 1.6 h (+4.8 %)  | 1.6 h (+3.0 %)  | 1.6 h (+1.0 %)  | -5.6 %    | ✅  |
| Population 10                      | 1.7 h (-1.2 %)  | 1.7 h (-4.2 %)  | 1.6 h (-5.5 %)  | 1.8 h (+4.0 %)  | 1.8 h (+2.5 %)  | 1.8 h (+1.2 %)  | -5.5 %    | ✅  |
| Nest level 2                       | 1.5 h (-1.0 %)  | 1.5 h (-3.9 %)  | 1.5 h (-5.6 %)  | 1.6 h (+4.8 %)  | 1.6 h (+3.0 %)  | 1.6 h (+1.0 %)  | -5.6 %    | ✅  |
| Nest level 3                       | 6.9 h (-1.6 %)  | 6.8 h (-2.5 %)  | 6.9 h (-1.7 %)  | 7.2 h (+3.2 %)  | 7.3 h (+3.5 %)  | 7.1 h (+1.6 %)  | +3.5 %    | ✅  |
| Every economy building at level 3  | 7.0 h (-1.0 %)  | 7.0 h (-1.6 %)  | 6.9 h (-1.8 %)  | 7.2 h (+2.3 %)  | 7.3 h (+2.6 %)  | 7.1 h (+1.0 %)  | +2.6 %    | ✅  |
| First kiwi at level 5              | 10.1 h (+0.0 %) | 10.1 h (+0.1 %) | 10.1 h (+0.3 %) | 10.1 h (-0.1 %) | 10.1 h (-0.1 %) | 10.1 h (-0.0 %) | +0.3 %    | ✅  |
| First kiwi at level 10             | 2.6 d (-0.3 %)  | 2.6 d (-0.4 %)  | 2.6 d (-0.0 %)  | 2.6 d (+0.0 %)  | 2.7 d (+0.6 %)  | 2.7 d (+1.2 %)  | +1.2 %    | ✅  |
| A mayor elected (School)           | 12.4 h (-0.4 %) | 12.4 h (-0.1 %) | 12.4 h (-0.0 %) | 12.5 h (+0.7 %) | 12.5 h (+0.6 %) | 12.4 h (+0.0 %) | +0.7 %    | ✅  |

## Kiwisu vs Kiwino (all biomes of each face)

| Milestone                          | Kiwisu          | Kiwino          | Worst gap |     |
| ---------------------------------- | --------------- | --------------- | --------- | --- |
| Tutorial completed (10 objectives) | 1.5 h (-3.2 %)  | 1.6 h (+3.2 %)  | -3.2 %    | ✅  |
| Population 10                      | 1.7 h (-3.0 %)  | 1.8 h (+3.0 %)  | -3.0 %    | ✅  |
| Nest level 2                       | 1.5 h (-3.2 %)  | 1.6 h (+3.2 %)  | -3.2 %    | ✅  |
| Nest level 3                       | 6.9 h (-2.3 %)  | 7.2 h (+2.3 %)  | -2.3 %    | ✅  |
| Every economy building at level 3  | 7.0 h (-1.8 %)  | 7.2 h (+1.8 %)  | -1.8 %    | ✅  |
| First kiwi at level 5              | 10.1 h (+0.1 %) | 10.1 h (-0.1 %) | +0.1 %    | ✅  |
| First kiwi at level 10             | 2.6 d (-0.4 %)  | 2.7 d (+0.4 %)  | -0.4 %    | ✅  |
| A mayor elected (School)           | 12.4 h (-0.4 %) | 12.5 h (+0.4 %) | -0.4 %    | ✅  |

**Balanced**: every biome and both faces are within ±10 % on every milestone.

Bot: follows the tutorial, keeps kiwis busy, hatches eggs, builds one of each building on the site with the most deposits in reach (weighted by logistics), then upgrades the bottleneck producer (or opens a new site when its deposits are exhausted), adds housing/storage when needed and upgrades the Nest as soon as possible. It keeps clear of floodable tiles and uses neither camps nor paths.
