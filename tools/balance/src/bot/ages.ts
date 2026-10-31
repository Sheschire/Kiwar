import {
  meteorIronOf,
  crystalOf,
  TECHS,
  applyCommand,
  buildCost,
  buildingCount,
  canAfford,
  capacity,
  ageOf,
  hasTech,
  isSister,
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
  'canals',
  'masonry',
  'forge',
  'ironAge',
  // Chantier 48: the depths open the Iron age's long wait.
  'spelunking',
  'smelting',
  'juiceInfusion',
  'industryAge',
  'machines',
  // Chantier 50: what the locules give (the crystal-paid ones wait for their crystal).
  'glass',
  'crystalCut',
  'enzymes',
  // Chantier 51: the Age of the stars, then its harvest and its glass.
  'starsAge',
  'crystalGrafts',
  'celestialGlass',
  'starSails',
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
  // Chantier 50: a technology waiting for its crystal does not hold the others back.
  const wanted = TECH_ORDER.find(
    (id) =>
      !hasTech(state, id) &&
      techStatus(state, id) !== 'age' &&
      (TECHS[id].crystal ?? 0) <= crystalOf(state),
  );
  // Chantier 19: a sister colony's research is chosen at home.
  if (!state.research.current && !isSister(state)) {
    const bankFull = state.research.points >= researchBank(state);
    // Chantier 38: a technology paid in meteoric iron (chantier 50: or crystal) waits for it.
    const open = (id: TechId) =>
      techStatus(state, id) === 'available' &&
      (TECHS[id].iron ?? 0) <= meteorIronOf(state) &&
      (TECHS[id].crystal ?? 0) <= crystalOf(state);
    const next =
      wanted && open(wanted) ? wanted : bankFull ? TECH_ORDER.find((id) => open(id)) : undefined;
    if (next) return { type: 'setResearch', tech: next };
  }
  // A Library level the next wanted technology needs, or (chantier 18) one that follows the Nest
  // while research is going on: more researchers, sooner passages.
  const behind = !!state.research.current && library.level < nest(state).level;
  // Chantier 51: any technology of the order waiting for the Library (the wanted one may wait
  // for another technology or for its iron: the Library stayed at 9 for twelve days).
  const waiting = TECH_ORDER.some(
    (id) => !hasTech(state, id) && techStatus(state, id) === 'library',
  );
  if (
    ((wanted && techStatus(state, wanted) === 'library') || waiting || behind) &&
    !pendingUpgrade(state, library.id) &&
    ok({ type: 'upgrade', buildingId: library.id })
  )
    return { type: 'upgrade', buildingId: library.id };
  // Chantier 51: a passage waiting for the Library saves up for it (the Library 10 costs more
  // than the bot ever kept: the stars' passage waited a week with the Nest ready).
  const passage = PASSAGE_TECHS[ageOf(state) + 1];
  if (
    passage &&
    !hasTech(state, passage) &&
    techStatus(state, passage) === 'library' &&
    !pendingUpgrade(state, library.id)
  ) {
    const r = applyCommand(
      state,
      { type: 'upgrade', buildingId: library.id },
      { now: state.now, map },
    );
    const cost = upgradeCost('library', library.level + 1);
    const cap = capacity(state);
    if (
      !r.ok &&
      r.error === 'notEnoughResources' &&
      RESOURCE_IDS.every((id) => (cost[id] ?? 0) <= cap[id])
    )
      return 'save';
  }
  return null;
}

/**
 * The monument once the passage is known (chantier 30: looked at before anything else in the
 * queue, like a player coming back to open the next age).
 */
export function monumentDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
): Command | 'save' | null {
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
