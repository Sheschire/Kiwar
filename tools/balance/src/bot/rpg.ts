import {
  applyCommand,
  buildCost,
  buildingCount,
  canAfford,
  ageOf,
  CLASS_IDS,
  CLASS_RULES,
  CLASSES,
  classRank,
  inLine,
  levelDef,
  trainingCost,
  trainLock,
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
 * most charismatic experienced kiwi becomes mayor, the strongest one a builder. Chantier 37:
 * then two gatherers and, once the Library stands, two mages; from the Stone age a training
 * camp where one kiwi drills at a time, and promotions as soon as a kiwi qualifies.
 */
export function rpgDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
  /** Chantier 18: fighters for the expeditions once a launchpad stands. */
  fighters = false,
  /** Chantier 37: gatherers, mages, the camp and promotions. */
  classes = true,
): Command | null {
  if (nest(state).level < 2) return null;
  if (!has('school')) {
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
    if (!canAfford(state.resources, buildCost(state, 'school'))) return null;
    return build('school');
  }
  const school = state.buildings.find((b) => b.type === 'school');
  if (!school) return null;
  const ok = (cmd: Command) => applyCommand(state, cmd, { now: state.now, map }).ok;
  const free = state.villagers.filter((v) => v.job.kind === 'idle' || v.job.kind === 'work');
  const pick = (classId: ClassId, max = 1) => {
    const count = state.villagers.filter(
      (v) => v.classId === classId || (v.job.kind === 'train' && v.job.classId === classId),
    ).length;
    if (count >= max) return null;
    // The kiwi with the most of the class's stat.
    const stat = CLASSES[classId].stat;
    const candidates = free
      .filter((v) => !v.classId && !v.kikiwiwi && v.level >= CLASSES[classId].minLevel)
      .sort((a, b) => b.stats[stat] - a.stats[stat] || b.level - a.level);
    const v = candidates[0];
    if (!v || trainLock(state, v, classId, school)) return null;
    if (!canAfford(state.resources, trainingCost(v, classId, school))) return null;
    const cmd: Command = { type: 'train', villagerId: v.id, schoolId: school.id, classId };
    return ok(cmd) ? cmd : null;
  };
  const civil = pick('mayor') ?? pick('builder') ?? null;
  if (civil) return civil;
  if (classes) {
    const trade =
      pick('gatherer', 2) ??
      (has('library') ? pick('mage', 2) : null) ??
      campDecision(state, build, has, ok);
    if (trade) return trade;
  }
  if (!fighters || !has('launchpad')) return null;
  // Two warriors (the toughest) for the raids, a scout (the most agile) for the reports.
  return pick('warrior', 2) ?? pick('scout') ?? null;
}

/** Chantier 37: the training camp — build it, keep one kiwi drilling, promote who qualifies. */
function campDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
  ok: (cmd: Command) => boolean,
): Command | null {
  if (ageOf(state) < 1 || !has('library')) return null;
  if (!has('trainingCamp')) {
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
    if (!canAfford(state.resources, buildCost(state, 'trainingCamp'))) return null;
    return build('trainingCamp');
  }
  const camp = state.buildings.find((b) => b.type === 'trainingCamp');
  if (!camp || state.queue.some((i) => i.buildingId === camp.id && i.kind === 'build')) return null;
  // Promotions first: the mages' line before the others (research paces the ages).
  const order: ClassId[] = ['archmage', 'oracle', 'engineer', 'druid', 'herbalist', 'architect'];
  const lines = [...order, ...CLASS_IDS.filter((c) => CLASSES[c].tier > 1 && !order.includes(c))];
  const courses = state.villagers.filter(
    (v) => v.job.kind === 'train' && v.job.schoolId === camp.id,
  ).length;
  if (courses < (levelDef(camp.type, camp.level)?.trainingSlots ?? 0))
    for (const classId of lines)
      for (const v of state.villagers) {
        if (!v.classId || !CLASSES[classId].parents?.includes(v.classId)) continue;
        if (v.job.kind !== 'idle' && v.job.kind !== 'work') continue;
        // The cheap checks first (a dry run copies the whole colony).
        if (trainLock(state, v, classId, camp)) continue;
        if (!canAfford(state.resources, trainingCost(v, classId, camp))) continue;
        const cmd: Command = { type: 'train', villagerId: v.id, schoolId: camp.id, classId };
        if (ok(cmd)) return cmd;
      }
  // One kiwi drills at a time: the classed kiwi closest to a promotion, mages first.
  const drilling = state.villagers.some(
    (v) => v.job.kind === 'work' && v.job.buildingId === camp.id,
  );
  if (drilling) return null;
  const candidates = state.villagers
    .filter(
      (v) =>
        v.classId &&
        v.classId !== 'mayor' &&
        !v.kikiwiwi &&
        classRank(v) < CLASS_RULES.promoteRank &&
        (v.job.kind === 'idle' || v.job.kind === 'work'),
    )
    .sort(
      (a, b) =>
        +inLine(b.classId, 'mage') - +inLine(a.classId, 'mage') ||
        b.level - a.level ||
        a.id.localeCompare(b.id),
    );
  const v = candidates[0];
  if (!v) return null;
  const cmd: Command = { type: 'assignKiwi', villagerId: v.id, buildingId: camp.id };
  return ok(cmd) ? cmd : null;
}
