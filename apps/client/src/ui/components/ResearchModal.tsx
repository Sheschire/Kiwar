import {
  AGE_IDS,
  ageOf,
  describeTech,
  hasTech,
  MAX_AGE,
  PASSAGE_TECHS,
  shipIdForAge,
  libraryLevel,
  RESEARCH_SCALE,
  researchBank,
  researchEta,
  researchPerHour,
  researchPoints,
  TECHS,
  techStatus,
  techsOfAge,
  type GameState,
  type TechId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { BookIcon } from '../icons';
import { BRANCH_ICONS, Icon } from '../iconSet';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Modal } from './Modal';
import { TechChanges } from './StatChanges';

/** Points, rate and the technology in progress (also shown in the Library sheet). */
export function ResearchSummary({ game, t }: { game: GameState; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const rate = researchPerHour(game);
  const points = researchPoints(game);
  const current = game.research.current;
  const fmt = (v: number) => formatNumber(lang, Math.floor(v));
  if (libraryLevel(game) === 0) return <p class="small muted">{t('research.noLibrary')}</p>;
  const eta = researchEta(game);
  return (
    <div class="research-summary">
      <div class="stat-row">
        <span class="stat-label">{t('research.points')}</span>
        <span class="research-pts">
          <BookIcon size={16} /> {t('research.pointsValue', { points: fmt(points) })}
        </span>
        <span class={`small ${rate > 0 ? 'muted' : 'warn'}`}>
          {rate > 0
            ? t('research.rate', { rate: formatNumber(lang, Math.round(rate * 10) / 10) })
            : t('research.noRate')}
        </span>
      </div>
      {current ? (
        <div class="research-current">
          <p class="small">
            <strong>{t('research.current', { tech: `@techs.${current}.name` })}</strong>
          </p>
          <div class="progress-block">
            <div class="progress">
              <span style={{ width: `${Math.min(100, (points / TECHS[current].cost) * 100)}%` }} />
            </div>
            <span class="small muted">
              {fmt(points)}/{TECHS[current].cost}
              {' · '}
              {eta !== null
                ? t('research.eta', { duration: formatDuration(lang, eta) })
                : t('research.stalled')}
            </span>
          </div>
        </div>
      ) : (
        <p class="small muted">
          {t('research.none', { cap: fmt(researchBank(game) / RESEARCH_SCALE) })}
        </p>
      )}
    </div>
  );
}

function TechCard({ game, id, t }: { game: GameState; id: TechId; t: Translate }) {
  const def = TECHS[id];
  const status = techStatus(game, id);
  const current = game.research.current;
  return (
    <li class={`tech-card tech-${status} branch-${def.branch}`}>
      <div class="tech-head">
        <strong>{t(`techs.${id}.name`)}</strong>
        <span class="tech-branch small muted">
          <Icon name={BRANCH_ICONS[def.branch]} size={14} /> {t(`branches.${def.branch}`)}
        </span>
      </div>
      <p class="small">{t(`techs.${id}.desc`)}</p>
      {status !== 'done' && <TechChanges rows={describeTech(id, game)} />}
      <div class="tech-foot">
        <span class="small muted">
          {status === 'library'
            ? t('research.status.library', { level: def.libraryLevel })
            : status === 'available'
              ? t('research.cost', { cost: def.cost })
              : t(`research.status.${status}`)}
        </span>
        {status === 'available' && (
          <button
            class="btn btn-small btn-primary"
            onClick={() => actions.dispatch({ type: 'setResearch', tech: id })}
          >
            {current ? t('research.switch') : t('research.choose')}
          </button>
        )}
        {status === 'current' && (
          <button
            class="btn btn-small"
            onClick={() => actions.dispatch({ type: 'setResearch', tech: null })}
          >
            {t('research.stop')}
          </button>
        )}
      </div>
    </li>
  );
}

/** The age of the colony and how to reach the next one (monument sheet, research screen). */
export function AgeInfo({ game, t }: { game: GameState; t: Translate }) {
  const age = ageOf(game);
  const next = age + 1;
  return (
    <div class="age-info">
      <p>
        <strong>{t('ages.current', { age: `@ages.${AGE_IDS[age]!}` })}</strong>
      </p>
      {age >= MAX_AGE ? (
        <p class="small muted">{t('ages.last')}</p>
      ) : (
        <>
          <p class="small">
            {t('ages.next', { age: `@ages.${AGE_IDS[next]!}` })} ·{' '}
            {hasTech(game, PASSAGE_TECHS[next]!)
              ? t('ages.passageDone', { tech: `@techs.${PASSAGE_TECHS[next]!}.name` })
              : t('ages.steps', { tech: `@techs.${PASSAGE_TECHS[next]!}.name` })}
          </p>
          <p class="small muted">
            {t('ages.opens', {
              level: next + 3,
              ship: `@ages.ships.${shipIdForAge(next)}`,
            })}
          </p>
        </>
      )}
    </div>
  );
}

/** Chantier 08: the technology tree, one row per age. */
export function ResearchModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none' });
  const age = ageOf(game);
  return (
    <Modal title={t('research.title')} onClose={close} class="modal-wide modal-research">
      <AgeInfo game={game} t={t} />
      <ResearchSummary game={game} t={t} />
      {AGE_IDS.map((id, i) => (
        <section key={id} class={`age-row ${i > age ? 'is-later' : ''}`}>
          <h3 class="age-title">
            {t(`ages.${id}`)}
            {i === age && <span class="badge">●</span>}
          </h3>
          <ul class="tech-grid">
            {techsOfAge(i).map((tech) => (
              <TechCard key={tech} game={game} id={tech} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
