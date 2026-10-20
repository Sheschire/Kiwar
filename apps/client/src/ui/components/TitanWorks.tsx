import { useState } from 'preact/hooks';
import {
  canReshape,
  obstacleAt,
  techEffects,
  TERRAFORM_KINDS,
  terraformLeft,
  titanAt,
  titanCost,
  validateCommand,
  type Command,
  type FaceMap,
  type GameState,
  type Tile,
  type TitanWork,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { useT, useUi } from '../store';
import { Cost } from './Cost';

/**
 * Titan works on the selected tile (chantier 08): a Kikiwiwi smashes the obstacle, or reshapes
 * the tile (spring, terrace, flatten) once the technology is known.
 */
export function TitanWorks(props: { game: GameState; map: FaceMap; tile: Tile; now: number }) {
  const { game, map, tile, now } = props;
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [picked, setPicked] = useState<VillagerId | null>(null);
  const titans = game.villagers.filter((v) => v.kikiwiwi);
  if (titans.length === 0) return null;
  const busy = titanAt(game, tile.q, tile.r);
  if (busy && busy.job.kind === 'titan') {
    return (
      <div class="section titan-works">
        <h3>{t('titan.title')}</h3>
        <p class="small">
          {t('titan.atWork', { name: busy.name, work: t(`titan.works.${busy.job.work}.name`) })} ·{' '}
          {formatDuration(lang, Math.max(0, busy.job.until - now))}
        </p>
      </div>
    );
  }
  const obstacle = obstacleAt(game, tile.q, tile.r);
  const known = techEffects(game).terraform;
  const works: TitanWork[] = obstacle
    ? ['smash']
    : TERRAFORM_KINDS.filter((k) => canReshape(game, map, k, tile.q, tile.r));
  if (works.length === 0) return null;
  const free = titans.filter((v) => v.job.kind === 'idle' || v.job.kind === 'guard');
  const who = free.find((v) => v.id === picked) ?? free[0] ?? titans[0]!;
  return (
    <div class="section titan-works">
      <h3>{t('titan.title')}</h3>
      {titans.length > 1 && (
        <div class="segmented" role="group">
          {titans.map((v) => (
            <button
              key={v.id}
              class={`btn btn-small ${v.id === who.id ? 'btn-active' : ''}`}
              aria-pressed={v.id === who.id}
              onClick={() => setPicked(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      {!obstacle && !known && <p class="small muted">{t('titan.needTech')}</p>}
      {!obstacle && known && (
        <p class="small muted">{t('titan.left', { count: terraformLeft(game) })}</p>
      )}
      {works.map((work) => {
        const cost = titanCost(game, work, tile.q, tile.r);
        const cmd: Command = { type: 'titanWork', villagerId: who.id, q: tile.q, r: tile.r, work };
        const error = validateCommand(game, cmd, { now, map });
        return (
          <div key={work} class="upgrade-box">
            <span>
              <strong>{t(`titan.works.${work}.name`)}</strong>
            </span>
            <p class="small muted">{t(`titan.works.${work}.desc`)}</p>
            {cost && (
              <Cost
                cost={{ juice: cost.juice }}
                have={game.resources}
                durationMs={cost.durationMs}
              />
            )}
            <button
              class="btn btn-primary"
              disabled={error !== null}
              title={error ? t(`errors.${error}`) : undefined}
              onClick={() => actions.dispatch(cmd)}
            >
              {t('titan.go', { name: who.name })}
            </button>
            {error && <span class="small warn">{t(`errors.${error}`)}</span>}
          </div>
        );
      })}
    </div>
  );
}
