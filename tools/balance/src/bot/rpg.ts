import {
  applyCommand,
  buildCost,
  buildingCount,
  canAfford,
  CLASSES,
  type ClassId,
  nest,
  nestDef,
  type BuildingType,
  type Command,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';

/**
 * The School comes after the Nest 2 (never before the bottleneck economy is in place); the
 * most charismatic experienced kiwi becomes mayor, the strongest one a builder.
 */
export function rpgDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (nest(state).level < 2) return null;
  if (!has('school')) {
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
    if (!canAfford(state.resources, buildCost(state, 'school'))) return null;
    return build('school');
  }
  const school = state.buildings.find((b) => b.type === 'school');
  if (!school) return null;
  const free = state.villagers.filter((v) => v.job.kind === 'idle' || v.job.kind === 'work');
  const pick = (classId: ClassId, score: (v: (typeof free)[number]) => number) => {
    if (
      state.villagers.some(
        (v) => v.classId === classId || (v.job.kind === 'train' && v.job.classId === classId),
      )
    )
      return null;
    const candidates = free
      .filter((v) => !v.classId && v.level >= CLASSES[classId].minLevel)
      .sort((a, b) => score(b) - score(a));
    const v = candidates[0];
    if (!v) return null;
    const cmd: Command = { type: 'train', villagerId: v.id, schoolId: school.id, classId };
    return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
  };
  return pick('mayor', (v) => v.stats.charisma) ?? pick('builder', (v) => v.stats.strength) ?? null;
}
