import {
  applyCommand,
  buildCost,
  buildingCount,
  canAfford,
  capacity,
  idleVillagers,
  ageOf,
  hasTech,
  PASSAGE_TECHS,
  techStatus,
  type TechId,
  nest,
  nestDef,
  pendingUpgrade,
  population,
  RESOURCE_IDS,
  upgradeCost,
  workersOf,
  workerSlots,
  type BuildingType,
  type Command,
  type FaceMap,
  type GameState,
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

/** Researchers wanted: one per five kiwis, within the Library's slots. */
export function researchStaffing(state: GameState): Command | null {
  const library = state.buildings.find((b) => b.type === 'library');
  if (!library) return null;
  const staff = workersOf(state, library.id).length;
  const want = Math.min(workerSlots(library), Math.max(1, Math.floor(population(state) / 5)));
  if (staff >= want) return null;
  if (idleVillagers(state).length > 0)
    return { type: 'assignWorkers', buildingId: library.id, count: staff + 1 };
  // Free the least useful worker of the most staffed producer.
  const busiest = state.buildings
    .filter((b) => b.id !== library.id && workerSlots(b) > 0)
    .map((b) => ({ b, n: workersOf(state, b.id).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (!busiest || busiest.n < 2) return null;
  return { type: 'assignWorkers', buildingId: busiest.b.id, count: busiest.n - 1 };
}

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
  if (!state.research.current) {
    const next = TECH_ORDER.find((id) => techStatus(state, id) === 'available');
    if (next) return { type: 'setResearch', tech: next };
  }
  // The Library level the next wanted technology needs.
  const wanted = TECH_ORDER.find((id) => !hasTech(state, id) && techStatus(state, id) !== 'age');
  if (
    wanted &&
    techStatus(state, wanted) === 'library' &&
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
