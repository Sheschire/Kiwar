import { useEffect, useRef } from 'preact/hooks';
import {
  AGE_IDS,
  ageOf,
  currentObjective,
  isObjectiveComplete,
  notebookCount,
  objectiveProgress,
  OBJECTIVES,
  PASSAGE_TECHS,
  type GameState,
  type NextStep,
  type ObjectiveDef,
} from '@kiwar/shared';
import { actions } from '../actions';
import { ScrollIcon } from '../icons';
import { pushToast, setPanelOpen, uiStore, useT, useUi } from '../store';
import { ageObjectives, ageProgress, claimableObjective, nextStep } from '../derived';
import { Cost } from './Cost';
import type { TKey } from '../../i18n/i18n';

function claim(obj: ObjectiveDef) {
  const tutorial = OBJECTIVES.includes(obj);
  if (
    actions.dispatch(tutorial ? { type: 'claimObjective' } : { type: 'claimObjective', id: obj.id })
  )
    pushToast('success', 'events.claimed');
}

/** What the next-step button does, if anything. */
function stepAction(game: GameState, step: NextStep): (() => void) | null {
  switch (step.id) {
    case 'prepareWave':
      return () => uiStore.setState({ modal: 'defense' });
    case 'repair': {
      const b = game.buildings.find((x) => x.id === step.buildingId);
      const map = uiStore.getState().map;
      const tile = b && map ? map.tiles[map.index.get(`${b.q},${b.r}`) ?? -1] : undefined;
      return tile
        ? () => {
            actions.selectTile(tile);
            actions.focusTile(tile);
          }
        : null;
    }
    case 'collect':
      return () => actions.collect(null);
    case 'claim': {
      const obj = claimableObjective(game);
      return obj ? () => claim(obj) : null;
    }
    case 'monument':
      return () => uiStore.setState({ modal: 'plans', plansTab: 'buildings' });
    case 'research':
      return () => uiStore.setState({ modal: 'plans', plansTab: 'research' });
    case 'staff':
      return () => uiStore.setState({ modal: 'village', villageTab: 'posts' });
    case 'hatch':
      return () => actions.dispatch({ type: 'hatchEgg' });
    default:
      return null;
  }
}

function stepText(t: ReturnType<typeof useT>, step: NextStep): string {
  const resource = step.resource ? t(`resources.${step.resource}` as TKey) : '';
  return t(`objectives.next.${step.id}` as TKey, { resource });
}

/** Chantier 31: the next step, one line and its button. */
function NextStepLine({ game }: { game: GameState }) {
  const t = useT();
  const step = nextStep(game);
  // A reward to claim already glows in the list below.
  if (step.id === 'claim') return null;
  const act = stepAction(game, step);
  return (
    <div class={`next-step next-${step.id}`}>
      <span class="small muted next-step-label">{t('objectives.nextLabel')}</span>
      <span class="next-step-text">{stepText(t, step)}</span>
      {act && (
        <button type="button" class="btn btn-small" onClick={act}>
          {t(`objectives.go.${step.id}` as TKey)}
        </button>
      )}
    </div>
  );
}

function ObjectiveRow({
  game,
  obj,
  tutorial,
  brief,
}: {
  game: GameState;
  obj: ObjectiveDef;
  tutorial?: boolean;
  /** Phones: the age objectives without their hint. */
  brief?: boolean;
}) {
  const t = useT();
  const p = objectiveProgress(game, obj);
  const done = isObjectiveComplete(game, obj);
  return (
    <div class={`objective ${done ? 'done' : ''} ${tutorial ? '' : 'is-age'}`}>
      <strong>{t(`objectives.${obj.id}.title` as TKey)}</strong>
      {(tutorial || (!done && !brief)) && (
        <p class="small muted">{t(`objectives.${obj.id}.hint` as TKey)}</p>
      )}
      {!done && (
        <div class="progress-block">
          <div class="progress">
            <span style={{ width: `${(p.current / p.target) * 100}%` }} />
          </div>
          <span class="small">
            {p.current}/{p.target}
          </span>
        </div>
      )}
      <div class="objective-foot">
        <Cost cost={obj.reward} stardust={obj.stardust} />
        {obj.egg && <span class="small objective-egg">{t('objectives.egg')}</span>}
        {done && (
          <button type="button" class="btn btn-primary btn-small glow" onClick={() => claim(obj)}>
            {t('objectives.claim')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Chantier 31: the long-term goal, the passage to the next age and its steps. */
function AgeLine({ game }: { game: GameState }) {
  const t = useT();
  const p = ageProgress(game);
  if (!p) return <p class="small muted age-line">{t('objectives.lastAge')}</p>;
  const tech = PASSAGE_TECHS[p.age]!;
  return (
    <div class="age-line">
      <div class="age-line-head small">
        <span>{t('objectives.toAge', { age: t(`ages.${AGE_IDS[p.age]}` as TKey) })}</span>
        <span class="muted">{Math.round(p.progress * 100)} %</span>
      </div>
      <div class="progress age-progress">
        <span style={{ width: `${p.progress * 100}%` }} />
      </div>
      <div class="age-steps">
        {p.steps.map((s) => (
          <span key={s.id} class={`age-step ${s.done ? 'is-done' : ''}`}>
            {s.done ? '✓ ' : ''}
            {t(`objectives.steps.${s.id}` as TKey, {
              level: s.level,
              tech: t(`techs.${tech}.name` as TKey),
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Chantier 31: a short toast when an objective is fulfilled (once per objective). */
export function ObjectiveWatcher() {
  const game = useUi((s) => s.slowGame);
  // undefined until the first read: an objective already fulfilled at load stays quiet.
  const seen = useRef<string | null | undefined>(undefined);
  const ready = game ? (claimableObjective(game)?.id ?? null) : null;
  useEffect(() => {
    if (seen.current !== undefined && ready && ready !== seen.current)
      pushToast('success', 'objectives.ready');
    seen.current = ready;
  }, [ready]);
  return null;
}

/**
 * Objectives in three horizons (chantier 31): the next step, the tutorial or three objectives
 * of the age, and the passage to the next age. With the thumb bar (`compact`), a folded panel
 * stays on screen as a one-line pill (a reward to claim, else the next step).
 */
export function ObjectivesPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const open = useUi((s) => s.objectivesOpen);
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  const tutorial = currentObjective(game);
  const notebook = tutorial ? [] : ageObjectives(game);
  if (!open) {
    if (!compact) return null;
    const ready = claimableObjective(game);
    const step = nextStep(game);
    return (
      <button
        type="button"
        class={`objective-pill parchment pe ${ready ? 'is-done glow' : ''}`}
        aria-label={t('objectives.title')}
        onClick={() => (ready ? claim(ready) : setPanelOpen('objectives', true))}
      >
        <ScrollIcon size={18} />
        <span class="objective-pill-name">
          {ready
            ? t('objectives.claim')
            : tutorial
              ? t(`objectives.${tutorial.id}.title` as TKey)
              : stepText(t, step)}
        </span>
        {ready ? (
          <Cost cost={ready.reward} stardust={ready.stardust} />
        ) : (
          tutorial && (
            <span class="small muted">
              {objectiveProgress(game, tutorial).current}/{objectiveProgress(game, tutorial).target}
            </span>
          )
        )}
      </button>
    );
  }
  const age = ageOf(game);
  const count = notebookCount(game, age);
  return (
    <section class="objectives parchment pe" aria-label={t('objectives.title')}>
      <h3>
        <ScrollIcon size={18} /> {t('objectives.title')}
        <span class="badge">
          {tutorial
            ? `${Math.min(game.objectiveIndex + 1, OBJECTIVES.length)}/${OBJECTIVES.length}`
            : `${count.claimed}/${count.total}`}
        </span>
        {compact && (
          <button
            type="button"
            class="btn btn-icon btn-small fold-btn"
            aria-label={t('objectives.fold')}
            aria-expanded={true}
            onClick={() => setPanelOpen('objectives', false)}
          >
            ▴
          </button>
        )}
      </h3>
      {/* During the tutorial its step is the next step. */}
      {!tutorial && <NextStepLine game={game} />}
      {tutorial ? (
        <ObjectiveRow game={game} obj={tutorial} tutorial />
      ) : notebook.length > 0 ? (
        <div class="objective-list">
          {notebook.map((o) => (
            <ObjectiveRow key={o.id} game={game} obj={o} brief={compact} />
          ))}
        </div>
      ) : (
        <p class="small">{t('objectives.allDone')}</p>
      )}
      <AgeLine game={game} />
    </section>
  );
}
