import {
  BIOMES,
  BANKS,
  CANALS,
  canalCount,
  canalError,
  fillError,
  hexKey,
  isBank,
  techEffects,
  type FaceMap,
  type GameState,
  type Tile,
} from '@kiwar/shared';
import { actions } from '../actions';
import { Icon } from '../iconSet';
import { ResourceIcon } from '../icons';
import { useT, useUi, type Translate } from '../store';
import { digFloods } from '../../game/placement';

/** Chantier 45: round button opening the dig mode (once Canals is researched). */
export function CanalButton() {
  const t = useT();
  const on = useUi((s) => s.digMode || s.pathMode);
  const known = useUi((s) => !!s.slowGame && techEffects(s.slowGame).canals);
  if (on || !known) return null;
  return (
    <button
      class="round-fab canal-fab pe"
      aria-label={t('canals.button')}
      title={t('canals.button')}
      onClick={() => actions.setDigMode(true)}
    >
      <Icon name="canal" size={30} />
    </button>
  );
}

function Cost({ t }: { t: Translate }) {
  return (
    <span class="canal-cost">
      {Object.entries(CANALS.cost).map(([id, n]) => (
        <span key={id}>
          <ResourceIcon id={id as 'pulp'} size={14} /> {n}{' '}
        </span>
      ))}
      {t('canals.perTile')}
    </span>
  );
}

/** Bottom bar while digging: count, cost, what the pointed tile gives or why it cannot. */
export function CanalToolbar() {
  const t = useT();
  const on = useUi((s) => s.digMode);
  const game = useUi((s) => s.slowGame ?? s.game);
  const map = useUi((s) => s.map);
  const tile = useUi((s) => s.digTile);
  if (!on || !game || !map) return null;
  const error = tile ? canalError(game, map, tile.q, tile.r) : null;
  const floods = tile && !error ? digFloods(game, map, tile).length : 0;
  return (
    <div class="path-toolbar parchment pe" role="dialog" aria-label={t('canals.title')}>
      <Icon name="canal" size={30} />
      <div class="path-toolbar-text">
        <strong>{t('canals.title')}</strong>
        <span class="small muted">{t('canals.hint')}</span>
        <span class="small">
          {t('canals.count', { count: canalCount(game) })} · <Cost t={t} />
        </span>
        {tile && error && error !== 'notFlesh' && (
          <span class="small warn">{t(`errors.${error}`)}</span>
        )}
        {floods > 0 && (
          <span class="small warn">
            ≈ {t('canals.floods', { count: floods, season: floodSeason(game, t) })}
          </span>
        )}
      </div>
      <button class="btn btn-primary" onClick={() => actions.setDigMode(false)}>
        {t('paths.done')}
      </button>
    </div>
  );
}

function floodSeason(game: GameState, t: Translate): string {
  const season = BIOMES[game.params.biome].floods;
  return season ? t(`cycles.seasons.${season}`).toLowerCase() : '';
}

/** Tile sheet: a fertile bank, a canal (fill it in) or a flesh tile where one can be dug. */
export function CanalSection({
  game,
  map,
  tile,
  free,
  t,
}: {
  game: GameState;
  map: FaceMap;
  tile: Tile;
  free: boolean;
  t: Translate;
}) {
  const bank = isBank(map, tile);
  const canal = game.terraform[hexKey(tile)] === 'canal';
  const known = techEffects(game).canals;
  const error =
    known && free && tile.type === 'flesh' ? canalError(game, map, tile.q, tile.r) : null;
  const dig = known && free && tile.type === 'flesh' && error === null;
  const floods = dig ? digFloods(game, map, tile).length : 0;
  const fill = canal ? fillError(game, tile.q, tile.r) : 'notACanal';
  if (!bank && !canal && !dig && !(error && error !== 'notFlesh' && error !== 'notByJuice'))
    return null;
  return (
    <div class="section canal-section">
      {bank && (
        <p class="small bonus">
          ❀ {t('canals.bank', { pct: Math.round((BANKS.regen - 1) * 100) })}
        </p>
      )}
      {canal && (
        <>
          <p class="small">
            <Icon name="canal" size={16} class="inline-icon" />{' '}
            {t('canals.isCanal', { pct: CANALS.deposit * 100 })}
          </p>
          {fill === null && (
            <button
              class="btn btn-small"
              onClick={() => actions.dispatch({ type: 'fillCanal', q: tile.q, r: tile.r })}
            >
              {t('canals.fill')} · <Cost t={t} />
            </button>
          )}
        </>
      )}
      {dig && (
        <>
          {floods > 0 && (
            <p class="small warn">
              ≈ {t('canals.floods', { count: floods, season: floodSeason(game, t) })}
            </p>
          )}
          <button
            class="btn btn-small btn-primary"
            onClick={() => actions.dispatch({ type: 'digCanal', q: tile.q, r: tile.r })}
          >
            {t('canals.dig')} · <Cost t={t} />
          </button>
        </>
      )}
      {error && error !== 'notFlesh' && error !== 'notByJuice' && (
        <p class="small muted">{t(`errors.${error}`)}</p>
      )}
    </div>
  );
}
