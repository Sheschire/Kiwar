import {
  KIKIWIWI,
  levelDef,
  type Command,
  type GameState,
  BLESSINGS,
  bestDustCrew,
  dustPickers,
  STARDUST_CAP,
  stardustOf,
} from '@kiwar/shared';

/** Stardust the next monument level needs (the age comes before a Kikiwiwi). */
export function nextMonumentDust(state: GameState): number {
  const monument = state.buildings.find((b) => b.type === 'monument');
  return levelDef('monument', (monument?.level ?? 0) + 1)?.stardust ?? 0;
}

/** Stardust kept for what the colony still needs: the next monuments and a Kikiwiwi. */
export function dustReserve(state: GameState): number {
  let need = 0;
  const monument = state.buildings.find((b) => b.type === 'monument');
  for (let level = (monument?.level ?? 0) + 1; level <= 3; level++)
    need += levelDef('monument', level)?.stardust ?? 0;
  if (!state.villagers.some((v) => v.kikiwiwi)) need += KIKIWIWI.stardust;
  return need;
}

/** Pickers on every stardust tile; the surplus heals wounded kiwis. */
export function cometOrders(state: GameState): Command[] {
  const cmds: Command[] = [];
  if (state.stardust < STARDUST_CAP)
    for (const p of state.comets.patches) {
      const crew = bestDustCrew(state, p.id);
      if (crew.length > dustPickers(state, p.id).length)
        cmds.push({ type: 'collectStardust', patchId: p.id, villagerIds: crew });
    }
  const hurt = state.villagers.find((v) => v.job.kind === 'injured');
  if (hurt && stardustOf(state) >= dustReserve(state) + BLESSINGS.heal)
    cmds.push({ type: 'bless', villagerId: hurt.id, kind: 'heal' });
  return cmds;
}
