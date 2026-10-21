import {
  currentObjective,
  isObjectiveComplete,
  objectiveProgress,
  OBJECTIVES,
} from '@kiwar/shared';
import { actions } from '../actions';
import { ScrollIcon } from '../icons';
import { pushToast, uiStore, useT, useUi } from '../store';
import { Cost } from './Cost';
import type { TKey } from '../../i18n/i18n';

function claim() {
  if (actions.dispatch({ type: 'claimObjective' })) pushToast('success', 'events.claimed');
}

/**
 * The tutorial objectives. Chantier 21: with the thumb bar (`compact`), a folded panel stays
 * on screen as a one-line pill (the objective and its progress, or its reward in one tap).
 */
export function ObjectivesPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const open = useUi((s) => s.objectivesOpen);
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  const obj = currentObjective(game);
  if (!open) {
    if (!compact || !obj) return null;
    const p = objectiveProgress(game, obj);
    const done = isObjectiveComplete(game, obj);
    return (
      <button
        type="button"
        class={`objective-pill parchment pe ${done ? 'is-done glow' : ''}`}
        aria-label={`${t('objectives.title')}: ${t(`objectives.${obj.id}.title` as TKey)}`}
        onClick={() => (done ? claim() : uiStore.setState({ objectivesOpen: true }))}
      >
        <ScrollIcon size={18} />
        <span class="objective-pill-name">
          {done ? t('objectives.claim') : t(`objectives.${obj.id}.title` as TKey)}
        </span>
        {done ? (
          <Cost cost={obj.reward} />
        ) : (
          <span class="small muted">
            {p.current}/{p.target}
          </span>
        )}
      </button>
    );
  }
  return (
    <section class="objectives parchment pe" aria-label={t('objectives.title')}>
      <h3>
        <ScrollIcon size={18} /> {t('objectives.title')}
        <span class="badge">
          {Math.min(game.objectiveIndex + 1, OBJECTIVES.length)}/{OBJECTIVES.length}
        </span>
        {compact && (
          <button
            type="button"
            class="btn btn-icon btn-small fold-btn"
            aria-label={t('objectives.fold')}
            aria-expanded={true}
            onClick={() => uiStore.setState({ objectivesOpen: false })}
          >
            ▴
          </button>
        )}
      </h3>
      {!obj ? (
        <p class="small">{t('objectives.allDone')}</p>
      ) : (
        (() => {
          const p = objectiveProgress(game, obj);
          const done = isObjectiveComplete(game, obj);
          return (
            <div class={`objective ${done ? 'done' : ''}`}>
              <strong>{t(`objectives.${obj.id}.title` as TKey)}</strong>
              <p class="small muted">{t(`objectives.${obj.id}.hint` as TKey)}</p>
              <div class="progress-block">
                <div class="progress">
                  <span style={{ width: `${(p.current / p.target) * 100}%` }} />
                </div>
                <span class="small">
                  {p.current}/{p.target}
                </span>
              </div>
              <div class="objective-foot">
                <span class="small muted">{t('objectives.reward')}</span>
                <Cost cost={obj.reward} />
                {done && (
                  <button class="btn btn-primary glow" onClick={claim}>
                    {t('objectives.claim')}
                  </button>
                )}
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}
