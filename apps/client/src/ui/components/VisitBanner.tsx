import { actions } from '../actions';
import { useT, useUi } from '../store';

/** Visiting an ally's planet: whose it is, and the way back home (the rest of the HUD hides). */
export function VisitBanner() {
  const t = useT();
  const visit = useUi((s) => s.visit);
  const allies = useUi((s) => s.allies);
  const ally = allies.find((a) => a.kiwiIndex === visit);
  if (visit === null || !ally) return null;
  const others = allies.filter((a) => a.kiwiIndex !== visit);
  const next = others.find((a) => a.kiwiIndex > visit) ?? others[0];
  return (
    <aside class="visit-banner parchment pe" role="status">
      <div class="visit-title">
        <strong>{t('allies.visiting', { name: ally.owner })}</strong>
        <span class="small muted">
          {t('universe.memberFace', { face: t(`faces.${ally.face}`), index: ally.kiwiIndex + 1 })}
          {' · '}
          {t('allies.buildings', { count: ally.buildings.length })}
        </span>
      </div>
      <div class="row visit-actions">
        {next && (
          <button class="btn" onClick={() => actions.visitAlly(next.kiwiIndex)}>
            {t('allies.next', { name: next.owner })}
          </button>
        )}
        <button class="btn btn-primary" onClick={() => actions.visitAlly(null)}>
          {t('allies.home')}
        </button>
      </div>
    </aside>
  );
}
