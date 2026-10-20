import { useState } from 'preact/hooks';
import {
  builderSpeed,
  buildingResource,
  getBuilding,
  KIWI_NAME_MAX,
  levelProgress,
  MASTERY_IDS,
  masteryHours,
  masteryProgress,
  workerPower,
  CLASS_IDS,
  CLASSES,
  trainingCost,
  trainingDuration,
  validateCommand,
  type ClassId,
  type Command,
  type GameState,
  type Villager,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { pushToast, useT, useUi, uiStore } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { StatRadar } from './StatRadar';
import { KiwiNeedsLine, MoraleCard, RestSection } from './NeedsWidgets';

type Sort = 'level' | 'name' | 'job' | 'born';
const SORTS: Sort[] = ['level', 'name', 'job', 'born'];

function jobRank(v: Villager): number {
  return { work: 0, build: 1, train: 2, expedition: 3, idle: 4 }[v.job.kind];
}

/** What a kiwi is doing, in words. */
export function useJobLabel(): (game: GameState, v: Villager) => string {
  const t = useT();
  return (game, v) => {
    if (v.job.kind === 'work') {
      const b = getBuilding(game, v.job.buildingId);
      return b ? t(`buildings.${b.type}.name`) : t('kiwi.job.idle');
    }
    return t(`kiwi.job.${v.job.kind}`);
  };
}

function XpBar({ v }: { v: Villager }) {
  const p = levelProgress(v);
  const share = p.next === null ? 1 : (p.xp - p.current) / (p.next - p.current);
  return (
    <div class="xp-bar" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </div>
  );
}

function KiwiList() {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const [sort, setSort] = useState<Sort>('level');
  const jobLabel = useJobLabel();
  const kiwis = [...game.villagers].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'job') return jobRank(a) - jobRank(b) || b.level - a.level;
    if (sort === 'born') return a.bornAt - b.bornAt;
    return b.level - a.level || b.xp - a.xp;
  });
  if (kiwis.length === 0) return <p class="muted">{t('village.empty')}</p>;
  return (
    <>
      <MoraleCard />
      <div class="segmented village-sort" role="group" aria-label={t('village.sort')}>
        <span class="small muted">{t('village.sort')}</span>
        {SORTS.map((s) => (
          <button
            key={s}
            class={`btn btn-small ${s === sort ? 'btn-active' : ''}`}
            aria-pressed={s === sort}
            onClick={() => setSort(s)}
          >
            {t(`village.sorts.${s}`)}
          </button>
        ))}
      </div>
      <ul class="kiwi-list">
        {kiwis.map((v) => (
          <li key={v.id}>
            <button class="kiwi-row" onClick={() => actions.showKiwi(v.id)}>
              <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={44} />
              <span class="kiwi-row-main">
                <span class="kiwi-row-name">
                  {v.name}
                  {v.statPoints > 0 && (
                    <span
                      class="badge badge-points"
                      title={t('village.points', { count: v.statPoints })}
                    >
                      +{v.statPoints}
                    </span>
                  )}
                </span>
                <span class="small muted">{jobLabel(game, v)}</span>
                <XpBar v={v} />
                <KiwiNeedsLine v={v} />
              </span>
              <span class="kiwi-row-level">{t('common.levelShort', { level: v.level })}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Memorial() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const now = useUi((s) => s.now);
  if (game.memorial.length === 0) return <p class="muted">{t('village.memorialEmpty')}</p>;
  return (
    <>
      <p class="small muted">{t('village.memorialIntro')}</p>
      <ul class="kiwi-list memorial">
        {[...game.memorial].reverse().map((m) => (
          <li key={m.id} class="kiwi-row is-static">
            <KiwiPortrait shiny={m.shiny} classId={m.classId} seed={m.id} size={40} />
            <span class="kiwi-row-main">
              <span class="kiwi-row-name">{m.name}</span>
              <span class="small muted">
                {t('village.memorialLine', {
                  level: m.level,
                  cause: t(`village.cause.${m.cause}`),
                  ago: formatDuration(lang, Math.max(0, now - m.diedAt)),
                })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function RenameForm({ v, onDone }: { v: Villager; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(v.name);
  const submit = (e: Event) => {
    e.preventDefault();
    if (actions.dispatch({ type: 'renameVillager', villagerId: v.id, name })) onDone();
  };
  return (
    <form class="row rename" onSubmit={submit}>
      <input
        class="input"
        aria-label={t('kiwi.renameLabel')}
        value={name}
        maxLength={KIWI_NAME_MAX}
        autoFocus
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <button class="btn btn-primary" type="submit">
        {t('kiwi.save')}
      </button>
      <button class="btn" type="button" onClick={onDone}>
        {t('common.cancel')}
      </button>
    </form>
  );
}

/** Current class, skills (active ones can be used) and the School's courses. */
function ClassSection({ v }: { v: Villager }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  const [showCourses, setShowCourses] = useState(false);
  const schools = game.buildings.filter((b) => b.type === 'school');
  const job = v.job;
  const ctx = map ? { now, map } : null;
  const trainCmd = (classId: ClassId): Command | null => {
    // The School that can take this kiwi (the highest level first).
    const sorted = [...schools].sort((a, b) => b.level - a.level);
    let fallback: Command | null = null;
    for (const school of sorted) {
      const cmd: Command = { type: 'train', villagerId: v.id, schoolId: school.id, classId };
      fallback ??= cmd;
      if (ctx && validateCommand(game, cmd, ctx) === null) return cmd;
    }
    return fallback;
  };
  return (
    <section class="field">
      <h3>{t('kiwi.class')}</h3>
      {job.kind === 'train' && (
        <p class="small bonus">
          {t('kiwi.training', {
            class: t(`classes.${job.classId}.name`),
            duration: formatDuration(lang, Math.max(0, job.until - now)),
          })}
        </p>
      )}
      {v.classId ? (
        <>
          <p class="small">
            <strong>{t(`classes.${v.classId}.name`)}</strong> — {t(`classes.${v.classId}.desc`)}
          </p>
          <h4 class="small-title">{t('kiwi.skills')}</h4>
          <ul class="skill-list">
            {CLASSES[v.classId].skills.map((sk) => {
              const unlocked = v.level >= sk.level;
              const ready = v.skillReadyAt[sk.id] ?? 0;
              return (
                <li key={sk.id} class={unlocked ? '' : 'is-locked'}>
                  <span class="skill-main">
                    <strong>{t(`skills.${sk.id}.name`)}</strong>
                    <span class="small muted">{t(`skills.${sk.id}.desc`)}</span>
                  </span>
                  {!unlocked ? (
                    <span class="badge">{t('kiwi.skillAt', { level: sk.level })}</span>
                  ) : sk.cooldownMs ? (
                    ready > now ? (
                      <span class="small muted">
                        {t('kiwi.readyIn', { duration: formatDuration(lang, ready - now) })}
                      </span>
                    ) : (
                      <button
                        class="btn btn-small btn-primary"
                        onClick={() => {
                          if (
                            actions.dispatch({ type: 'useSkill', villagerId: v.id, skill: sk.id })
                          )
                            pushToast('success', 'kiwi.skillUsed', {
                              skill: `@skills.${sk.id}.name`,
                            });
                        }}
                      >
                        {t('kiwi.use')}
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        job.kind !== 'train' && <p class="small muted">{t('kiwi.noClass')}</p>
      )}
      {job.kind !== 'train' &&
        (schools.length === 0 ? (
          <p class="small muted">{t('kiwi.needsSchool')}</p>
        ) : (
          <>
            {v.classId && !showCourses ? (
              <button class="btn btn-small" onClick={() => setShowCourses(true)}>
                {t('kiwi.retrain')}
              </button>
            ) : (
              <ul class="course-list">
                {CLASS_IDS.filter((c) => c !== v.classId).map((c) => {
                  const def = CLASSES[c];
                  const cmd = trainCmd(c);
                  const error = cmd && ctx ? validateCommand(game, cmd, ctx) : 'notASchool';
                  const maxSchool = Math.max(...schools.map((b) => b.level));
                  const lock =
                    maxSchool < def.schoolLevel
                      ? t('kiwi.needsSchoolLevel', { level: def.schoolLevel })
                      : v.level < def.minLevel
                        ? t('kiwi.needsKiwiLevel', { level: def.minLevel })
                        : null;
                  return (
                    <li key={c} class={`course ${lock ? 'is-locked' : ''}`}>
                      <KiwiPortrait shiny={v.shiny} classId={c} seed={v.id} size={40} />
                      <span class="course-main">
                        <strong>{t(`classes.${c}.name`)}</strong>
                        <span class="small muted">{t(`classes.${c}.desc`)}</span>
                        {lock ? (
                          <span class="small warn">{lock}</span>
                        ) : (
                          <Cost
                            cost={trainingCost(v, c)}
                            have={game.resources}
                            durationMs={
                              schools[0] ? trainingDuration(schools[0], c) : def.trainingMs
                            }
                          />
                        )}
                        {!lock && error && error !== 'notEnoughResources' && (
                          <span class="small warn">{t(`errors.${error}`)}</span>
                        )}
                      </span>
                      <button
                        class="btn btn-small btn-primary"
                        disabled={error !== null}
                        onClick={() => cmd && actions.dispatch(cmd)}
                      >
                        {t('kiwi.trainAs')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ))}
    </section>
  );
}

function KiwiSheet({ v }: { v: Villager }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const now = useUi((s) => s.now);
  const [renaming, setRenaming] = useState(false);
  const jobLabel = useJobLabel();
  const p = levelProgress(v);
  const work = v.job.kind === 'work' ? getBuilding(game, v.job.buildingId) : undefined;
  const resource = work ? buildingResource(game, work) : null;
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 100) / 100);
  return (
    <div class="kiwi-sheet">
      <header class="kiwi-head">
        <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={88} />
        <div class="kiwi-head-main">
          {renaming ? (
            <RenameForm v={v} onDone={() => setRenaming(false)} />
          ) : (
            <h3 class="kiwi-name">
              {v.name}
              <button class="btn btn-small btn-ghost" onClick={() => setRenaming(true)}>
                {t('kiwi.rename')}
              </button>
            </h3>
          )}
          <p class="small">
            <strong>{t('kiwi.level', { level: v.level })}</strong> · {jobLabel(game, v)}
            {v.shiny && (
              <span class={`badge badge-shiny shiny-${v.shiny}`}>
                {t('kiwi.shiny')} · {t(`shiny.${v.shiny}`)}
              </span>
            )}
          </p>
          <XpBar v={v} />
          <p class="small muted">
            {p.next === null
              ? t('kiwi.maxLevel')
              : t('kiwi.xp', { xp: Math.floor(p.xp), next: p.next })}
          </p>
        </div>
      </header>

      <div class="row kiwi-actions">
        <button class="btn btn-primary" onClick={() => actions.followKiwi(v.id)}>
          {t('kiwi.follow')}
        </button>
        {work && (
          <button
            class="btn"
            onClick={() => {
              const tile = uiStore
                .getState()
                .map?.tiles.find((x) => x.q === work.q && x.r === work.r);
              actions.closeVillage();
              if (tile) {
                actions.selectTile(tile);
                actions.focusTile(tile);
              }
            }}
          >
            {t('kiwi.workplace')}
          </button>
        )}
      </div>

      <RestSection v={v} />

      <section class="field">
        <h3>{t('kiwi.stats')}</h3>
        {v.statPoints > 0 && <p class="small bonus">{t('kiwi.points', { count: v.statPoints })}</p>}
        <StatRadar
          stats={v.stats}
          onAdd={
            v.statPoints > 0
              ? (stat) => actions.dispatch({ type: 'spendStatPoint', villagerId: v.id, stat })
              : undefined
          }
        />
        <p class="small muted">
          {resource && t('kiwi.harvest', { value: fmt(workerPower(v, resource)) })}
          {resource && ' · '}
          {t('kiwi.building', { value: fmt(builderSpeed(v)) })}
        </p>
      </section>

      <ClassSection v={v} />

      <section class="field">
        <h3>{t('kiwi.trait')}</h3>
        {v.trait ? (
          <p class="small">
            <strong>{t(`traits.${v.trait}.name`)}</strong> — {t(`traits.${v.trait}.desc`)}
          </p>
        ) : (
          <p class="small muted">{t('kiwi.noTrait')}</p>
        )}
      </section>

      <section class="field">
        <h3>{t('kiwi.masteries')}</h3>
        <ul class="mastery-list">
          {MASTERY_IDS.map((id) => {
            const m = masteryProgress(v, id);
            const prev = masteryHours(m.rank);
            const share = m.next === null ? 1 : (m.hours - prev) / (m.next - prev);
            return (
              <li key={id} class={m.rank === 0 && m.hours < 0.05 ? 'muted' : ''}>
                <span class="mastery-name">{t(`masteries.${id}`)}</span>
                <span class="mastery-rank">
                  {m.next === null ? t('kiwi.rankMax') : t('kiwi.rank', { rank: m.rank })}
                </span>
                <span
                  class="xp-bar mastery-bar"
                  title={
                    m.next === null
                      ? t('kiwi.rankMax')
                      : t('kiwi.rankHours', { hours: Math.floor(m.hours * 10) / 10, next: m.next })
                  }
                >
                  <span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="field">
        <h3>{t('kiwi.story')}</h3>
        <p class="small">
          {t('kiwi.born', { ago: formatDuration(lang, Math.max(0, now - v.bornAt)) })}
          <br />
          {t('kiwi.built', { count: v.history.built })}
          <br />
          {t('kiwi.expeditions', {
            count: v.history.expeditions,
            victories: v.history.victories,
          })}
        </p>
      </section>
    </div>
  );
}

/** The village screen: every kiwi, their sheet, and the memorial. */
export function VillageModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const kiwiId = useUi((s) => s.kiwiId);
  const tab = useUi((s) => s.villageTab);
  if (!game) return null;
  const v = kiwiId ? game.villagers.find((x) => x.id === kiwiId) : undefined;
  return (
    <Modal title={t('village.title')} onClose={() => actions.closeVillage()} class="modal-village">
      {v ? (
        <>
          <button class="btn btn-small btn-ghost back" onClick={() => actions.showKiwi(null)}>
            ← {t('kiwi.back')}
          </button>
          <KiwiSheet v={v} />
        </>
      ) : (
        <>
          <div class="segmented" role="tablist">
            {(['kiwis', 'memorial'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                class={`btn ${tab === k ? 'btn-active' : ''}`}
                onClick={() => uiStore.setState({ villageTab: k })}
              >
                {k === 'kiwis'
                  ? t('village.kiwis', { count: game.villagers.length })
                  : t('village.memorial')}
              </button>
            ))}
          </div>
          {tab === 'kiwis' ? <KiwiList /> : <Memorial />}
        </>
      )}
    </Modal>
  );
}

/** Floating chip while the camera follows a kiwi. */
export function FollowBadge() {
  const t = useT();
  const id = useUi((s) => s.followId);
  const v = useUi((s) => s.game?.villagers.find((x) => x.id === s.followId));
  if (!id || !v) return null;
  return (
    <div class="follow-badge parchment pe">
      <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={28} />
      <span>{t('kiwi.following', { name: v.name })}</span>
      <button class="btn btn-small" onClick={() => actions.openVillage(v.id)}>
        {t('kiwi.sheet')}
      </button>
      <button class="btn btn-small btn-ghost" onClick={() => actions.followKiwi(null)}>
        {t('kiwi.stopFollow')}
      </button>
    </div>
  );
}
