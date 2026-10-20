import {
  applyCommand,
  buildCost,
  buildingCount,
  canAfford,
  capacity,
  ageOf,
  hasTech,
  PASSAGE_TECHS,
  techStatus,
  type TechId,
  nest,
  nestDef,
  pendingUpgrade,
  RESOURCE_IDS,
  upgradeCost,
  type BuildingType,
  type Command,
  type FaceMap,
  type GameState,
  researchBank,
} from '@kiwar/shared';

/** The economy first, then each passage as soon as possible, then the rest. */
export const TECH_ORDER: TechId[] = [
  'foraging',
  'stoneAge',
  'masonry',
  'ironAge',
  'smelting',
  'juiceInfusion',
  'industryAge',
  'machines',
  'greenBlood',
  'palisade',
  'slingshots',
  'armor',
  'firearms',
  'starCharts',
  'preserves',
  'compass',
  'steamEngines',
  'titanWorks',
];

/**
 * A Library after the School and the Nest 3, the next technology of TECH_ORDER, Library upgrades when a
 * technology needs them, and the monument as soon as its passage is known ('save': keep the
 * resources for it).
 */
export function ageDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | 'save' | null {
  if (nest(state).level < 2 || !has('school')) return null;
  if (!has('library')) {
    // After the Nest 3: the early economy comes first.
    if (nest(state).level < 3) return null;
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
    if (!canAfford(state.resources, buildCost(state, 'library'))) return null;
    return build('library');
  }
  const library = state.buildings.find((b) => b.type === 'library');
  if (!library) return null;
  const ok = (cmd: Command) => applyCommand(state, cmd, { now: state.now, map }).ok;
  // The next wanted technology, in order; while it waits for a Library level, the points go to
  // the bank (chantier 18: starting a lesser technology meanwhile delayed the passages).
  const wanted = TECH_ORDER.find((id) => !hasTech(state, id) && techStatus(state, id) !== 'age');
  if (!state.research.current) {
    const bankFull = state.research.points >= researchBank(state);
    const next =
      wanted && techStatus(state, wanted) === 'available'
        ? wanted
        : bankFull
          ? TECH_ORDER.find((id) => techStatus(state, id) === 'available')
          : undefined;
    if (next) return { type: 'setResearch', tech: next };
  }
  // A Library level the next wanted technology needs, or (chantier 18) one that follows the Nest
  // while research is going on: more researchers, sooner passages.
  const behind = !!state.research.current && library.level < nest(state).level;
  if (
    ((wanted && techStatus(state, wanted) === 'library') || behind) &&
    !pendingUpgrade(state, library.id) &&
    ok({ type: 'upgrade', buildingId: library.id })
  )
    return { type: 'upgrade', buildingId: library.id };
  // The monument once the passage is known.
  const age = ageOf(state);
  const passage = PASSAGE_TECHS[age + 1];
  if (!passage || !hasTech(state, passage)) return null;
  const monument = state.buildings.find((b) => b.type === 'monument');
  if (monument && pendingUpgrade(state, monument.id)) return null;
  if (!monument && state.queue.some((i) => i.buildingType === 'monument')) return null;
  const cmd: Command | null = monument
    ? { type: 'upgrade', buildingId: monument.id }
    : build('monument');
  if (!cmd) return null;
  const r = applyCommand(state, cmd, { now: state.now, map });
  if (r.ok) return cmd;
  if (r.error !== 'notEnoughResources') return null;
  // Too big for the storage: grow a warehouse first.
  const cost = upgradeCost('monument', (monument?.level ?? 0) + 1);
  const cap = capacity(state);
  if (RESOURCE_IDS.some((id) => (cost[id] ?? 0) > cap[id])) return null;
  return 'save';
}
