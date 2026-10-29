import {
  CAMP,
  classRank,
  levelDef,
  workerSlots,
  type Building,
  type GameState,
  type Villager,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { useState } from 'preact/hooks';
import { useT, useUi } from '../store';
import { useJobLabel } from './VillageModal';
import { KiwiPortrait } from './KiwiPortrait';
import { TrainingBar } from './TrainingBar';

/**
 * Chantier 37: the training camp's sheet — the kiwis in drill with their class rank, the
 * courses under way (promotions, changes of class) and how it works.
 */
export function CampInfo({ game, b, now }: { game: GameState; b: Building; now: number }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const drilling = game.villagers.filter((v) => v.job.kind === 'work' && v.job.buildingId === b.id);
  const courses = game.villagers.filter(
    (v): v is Villager & { job: { kind: 'train' } } =>
      v.job.kind === 'train' && v.job.schoolId === b.id,
  );
  const slots = levelDef(b.type, b.level)?.trainingSlots ?? 0;
  const places = workerSlots(b);
  const speed = CAMP.drill[Math.min(b.level, CAMP.drill.length) - 1] ?? 1;
  const [picking, setPicking] = useState(false);
  const jobLabel = useJobLabel();
  // Kiwis with a class that can come and drill: free ones first, then the lowest ranks.
  const candidates = game.villagers
    .filter(
      (v) =>
        !v.kikiwiwi &&
        v.classId !== null &&
        ['idle', 'work', 'guard', 'meteor', 'stardust'].includes(v.job.kind) &&
        !drilling.includes(v),
    )
    .sort(
      (x, y) => +(y.job.kind === 'idle') - +(x.job.kind === 'idle') || classRank(x) - classRank(y),
    );
  const assign = (id: string, buildingId: string | null) =>
    actions.dispatch({
      type: 'assignKiwi',
      villagerId: id as never,
      buildingId: buildingId as never,
    });
  return (
    <div class="section camp-section">
      <p class="small muted">{t('camp.hint', { speed: Math.round(speed * 100) })}</p>
      <p class="small">
        <strong>{t('camp.drilling', { count: drilling.length, slots: places })}</strong>
      </p>
      {drilling.length > 0 && (
        <ul class="camp-list">
          {drilling.map((v) => (
            <li key={v.id} class="worker-row">
              <button class="worker-main" onClick={() => actions.openVillage(v.id)}>
                <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={28} />
                <span class="small">{v.name}</span>
                <span class="small muted">
                  {t('classInfo.rank', { rank: classRank(v), max: CAMP.maxRank })}
                </span>
              </button>
              <button class="btn btn-small" onClick={() => assign(v.id, null)}>
                {t('camp.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        class={`btn btn-small ${picking ? 'btn-active' : ''}`}
        aria-expanded={picking}
        onClick={() => setPicking(!picking)}
      >
        {t('camp.add')}
      </button>
      {picking && (
        <div class="replace-box">
          {drilling.length >= places && <p class="small muted">{t('camp.full')}</p>}
          {candidates.length === 0 && <p class="small muted">{t('camp.noCandidate')}</p>}
          <ul>
            {candidates.map((v) => (
              <li key={v.id}>
                <button
                  class="worker-main"
                  onClick={() => {
                    if (assign(v.id, b.id)) setPicking(false);
                  }}
                >
                  <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={30} />
                  <span class="small">{v.name}</span>
                  <span class="small muted">{jobLabel(game, v)}</span>
                  <span class="small muted">
                    {t('classInfo.rank', { rank: classRank(v), max: CAMP.maxRank })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p class="small">
        <strong>{t('camp.courses', { count: courses.length, slots })}</strong>
      </p>
      {courses.map((v) => (
        <p class="small" key={v.id}>
          {t('kiwi.training', {
            class: `${v.name} → ${t(`classes.${v.job.classId}.name`)}`,
            duration: formatDuration(lang, Math.max(0, v.job.until - now)),
          })}
          <TrainingBar game={game} v={v} now={now} />
        </p>
      ))}
      <button class="btn" onClick={() => actions.openVillage()}>
        {t('building.chooseKiwi')}
      </button>
    </div>
  );
}
