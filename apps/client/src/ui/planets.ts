import { INTEL, otherFace, type AllySnapshot, type GameState } from '@kiwar/shared';
import type { PlanetRef } from '../render/space';
import type { Translate } from './store';

/** What a far planet is called on its hover tag, its card and the Planets list (chantier 24). */
export interface PlanetLabel {
  title: string;
  hint: string;
}

/** Share of the alien twin our scouts have seen (0–100), from the intel on the twin target. */
export function twinExplored(game: GameState): number {
  const face = otherFace(game.face);
  const target = game.targets.find((t) => t.distance === 0 && t.face === face);
  const seen = target ? (game.intel[target.id]?.sectors.length ?? 0) : 0;
  return Math.round((seen / INTEL.sectors) * 100);
}

export function planetLabel(
  planet: PlanetRef,
  t: Translate,
  game: GameState,
  allies: AllySnapshot[],
  twinOwner: string | null,
): PlanetLabel | null {
  if (planet === 'twin') {
    const face = t(`faces.${otherFace(game.face)}`);
    if (twinOwner) return { title: twinOwner, hint: t('planets.twinHint') };
    const percent = twinExplored(game);
    return {
      title: percent > 0 ? t('planets.twinSeen', { face, percent }) : t('planets.twin', { face }),
      hint: t('planets.twinHint'),
    };
  }
  const ally = allies.find((a) => a.kiwiIndex === planet);
  if (!ally) return null;
  return {
    title: ally.owner,
    hint: t('planets.allyHint', { face: t(`faces.${ally.face}`), index: ally.kiwiIndex + 1 }),
  };
}
