import {
  currentObjective,
  isObjectiveComplete,
  objectiveProgress,
  OBJECTIVES,
} from '@kiwar/shared';
import { actions } from '../actions';
import { ScrollIcon } from '../icons';
import { pushToast, useT, useUi } from '../store';
import { Cost } from './Cost';
import type { TKey } from '../../i18n/i18n';

export function ObjectivesPanel() {
  const t = useT();
  const open = useUi((s) => s.objectivesOpen);
  const game = useUi((s) => s.game);
  if (!open || !game) return null;
  const obj = currentObjective(game);
  return (
    <section class="objectives parchment pe" aria-label={t('objectives.title')}>
      <h3>
        <ScrollIcon size={18} /> {t('objectives.title')}
        <span class="badge">
          {Math.min(game.objectiveIndex + 1, OBJECTIVES.length)}/{OBJECTIVES.length}
        </span>
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
                  <button
                    class="btn btn-primary glow"
                    onClick={() => {
                      if (actions.dispatch({ type: 'claimObjective' }))
                        pushToast('success', 'events.claimed');
                    }}
                  >
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
