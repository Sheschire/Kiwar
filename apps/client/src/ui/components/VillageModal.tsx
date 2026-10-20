import { useRef, useState } from 'preact/hooks';
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
  garrisonOf,
  guardPower,
  KIKIWIWI,
  kikiwiwiWeak,
  techEffects,
  CLASS_IDS,
  CLASSES,
  trainingCost,
  trainingDuration,
  validateCommand,
  type ClassId,
  type Command,
  type GameState,
  kiwiPosts,
  JOBS,
  jobBoard,
  idleVillagers,
  type BoardRow,
  type ResourceId,
  type Villager,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { pushToast, useT, useUi, uiStore } from '../store';
import { BookIcon, HammerIcon, LockIcon, ResourceIcon } from '../icons';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { StatRadar } from './StatRadar';
import { KiwiNeedsLine, MoraleCard, RestSection } from './NeedsWidgets';

type Sort = 'level' | 'name' | 'job' | 'born';
const SORTS: Sort[] = ['level', 'name', 'job', 'born'];

/** The kiwis in the order of the village list (the sheet arrows follow it). */
function sortedKiwis(game: GameState, sort: Sort): Villager[] {
  return [...game.villagers].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'job') return jobRank(a) - jobRank(b) || b.level - a.level;
    if (sort === 'born') return a.bornAt - b.bornAt;
    return b.level - a.level || b.xp - a.xp;
  });
}

function jobRank(v: Villager): number {
  return {
    work: 0,
    guard: 1,
    build: 2,
    train: 3,
    transform: 3,
    titan: 2,
    stardust: 1,
    expedition: 4,
    injured: 5,
    idle: 6,
  }[v.job.kind];
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
  const sort = useUi((s) => s.villageSort);
  const jobLabel = useJobLabel();
  const kiwis = sortedKiwis(game, sort);
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
            onClick={() => uiStore.setState({ villageSort: s })}
          >
            {t(`village.sorts.${s}`)}
          </button>
        ))}
      </div>
      <ul class="kiwi-list">
        {kiwis.map((v) => (
          <li key={v.id}>
            <button class="kiwi-row" onClick={() => actions.showKiwi(v.id)}>
              <KiwiPortrait
                shiny={v.shiny}
                classId={v.classId}
                titan={!!v.kikiwiwi}
                seed={v.id}
                size={44}
              />
              <span class="kiwi-row-main">
                <span class="kiwi-row-name">
                  {v.name}
                  {v.kikiwiwi && <span class="badge badge-titan">{t('kikiwiwi.badge')}</span>}
                  <FlagIcons v={v} />
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
  const [assigning, setAssigning] = useState(false);
  const jobLabel = useJobLabel();
  const canAssign = !v.kikiwiwi && ['idle', 'work', 'guard'].includes(v.job.kind);
  const p = levelProgress(v);
  const work = v.job.kind === 'work' ? getBuilding(game, v.job.buildingId) : undefined;
  const resource = work ? buildingResource(game, work) : null;
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 100) / 100);
  return (
    <div class="kiwi-sheet">
      <header class="kiwi-head">
        <KiwiPortrait
          shiny={v.shiny}
          classId={v.classId}
          titan={!!v.kikiwiwi}
          seed={v.id}
          size={88}
        />
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
            {v.kikiwiwi && <span class="badge badge-titan">{t('kikiwiwi.badge')}</span>}
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
        {canAssign && (
          <button
            class={`btn ${assigning ? 'btn-active' : 'btn-primary'}`}
            aria-expanded={assigning}
            onClick={() => setAssigning(!assigning)}
          >
            {t('posts.assign')}
          </button>
        )}
        <button class="btn" onClick={() => actions.followKiwi(v.id)}>
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
      {assigning && canAssign && (
        <PostPicker game={game} v={v} onDone={() => setAssigning(false)} />
      )}
      <KiwiFlags v={v} />
      {v.homeJob && <RedirectNote game={game} v={v} />}

      {v.kikiwiwi && <TitanSection game={game} />}
      <GuardSection game={game} v={v} />

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
        <SheetNavigator game={game} v={v} />
      ) : (
        <>
          <div class="segmented" role="tablist">
            {(['kiwis', 'posts', 'memorial'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                class={`btn ${tab === k ? 'btn-active' : ''}`}
                onClick={() => uiStore.setState({ villageTab: k })}
              >
                {k === 'kiwis'
                  ? t('village.kiwis', { count: game.villagers.length })
                  : k === 'posts'
                    ? t('posts.tab')
                    : t('village.memorial')}
              </button>
            ))}
          </div>
          {tab === 'kiwis' ? <KiwiList /> : tab === 'posts' ? <JobBoardView /> : <Memorial />}
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
      <KiwiPortrait
        shiny={v.shiny}
        classId={v.classId}
        titan={!!v.kikiwiwi}
        seed={v.id}
        size={28}
      />
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

/** A Kikiwiwi's juice and what it can do (chantier 08). */
function TitanSection({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const weak = kikiwiwiWeak(game);
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 10) / 10);
  const upkeep = KIKIWIWI.upkeep * techEffects(game).kikiwiwiUpkeep;
  return (
    <section class="field titan-section">
      <h3>{t('kikiwiwi.title')}</h3>
      <p class={`small ${weak ? 'warn' : ''}`}>
        {weak ? t('kikiwiwi.weak') : t('kikiwiwi.upkeep', { juice: fmt(upkeep) })}
      </p>
      <p class="small muted">
        {t('kikiwiwi.hint', { weight: KIKIWIWI.modifiers.weight, perShip: KIKIWIWI.perShip })}
      </p>
    </section>
  );
}

/** Chantier 06: post a kiwi on the rampart against predators, or send it back to work. */
function GuardSection({ game, v }: { game: GameState; v: Villager }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const guard = v.job.kind === 'guard';
  if (!guard && v.job.kind !== 'work' && v.job.kind !== 'idle') return null;
  const others = garrisonOf(game)
    .map((x) => x.id)
    .filter((id) => id !== v.id);
  const power = guardPower(v, game);
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 10) / 10);
  return (
    <section class="field guard-section">
      <h3>{t('garrison.title')}</h3>
      <p class="small">{t('garrison.power', { ground: fmt(power.ground), air: fmt(power.air) })}</p>
      <p class="small muted">{t('garrison.hint')}</p>
      <button
        class={`btn ${guard ? '' : 'btn-primary'}`}
        onClick={() =>
          actions.dispatch({
            type: 'setGarrison',
            villagerIds: guard ? others : [...others, v.id],
          })
        }
      >
        {guard ? t(v.kikiwiwi ? 'garrison.standDown' : 'garrison.relieve') : t('garrison.post')}
      </button>
    </section>
  );
}

/** A kiwi's sheet with the arrows (and a swipe on phones) to the previous or next kiwi. */
function SheetNavigator({ game, v }: { game: GameState; v: Villager }) {
  const t = useT();
  const sort = useUi((s) => s.villageSort);
  const kiwis = sortedKiwis(game, sort);
  const index = kiwis.findIndex((x) => x.id === v.id);
  const go = (step: number) => {
    const next = kiwis[(index + step + kiwis.length) % kiwis.length];
    if (next && next.id !== v.id) actions.showKiwi(next.id);
  };
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      class="kiwi-nav-wrap"
      onPointerDown={(e) => {
        start.current = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        // A clear horizontal swipe, not a scroll.
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
      }}
    >
      <div class="kiwi-nav">
        <button class="btn btn-small btn-ghost back" onClick={() => actions.showKiwi(null)}>
          ← {t('kiwi.back')}
        </button>
        {kiwis.length > 1 && (
          <span class="kiwi-nav-arrows">
            <button
              class="btn btn-icon btn-small"
              aria-label={t('kiwi.prev')}
              onClick={() => go(-1)}
            >
              ◀
            </button>
            <span class="small muted">
              {t('kiwi.position', { index: index + 1, count: kiwis.length })}
            </span>
            <button
              class="btn btn-icon btn-small"
              aria-label={t('kiwi.next')}
              onClick={() => go(1)}
            >
              ▶
            </button>
          </span>
        )}
      </div>
      <KiwiSheet key={v.id} v={v} />
    </div>
  );
}

/** "Assign to…": every workplace with this kiwi's yield there, one tap to move it. */
function PostPicker({ game, v, onDone }: { game: GameState; v: Villager; onDone: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const posts = kiwiPosts(game, v);
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 100) / 100);
  const assign = (buildingId: string | null) => {
    if (
      actions.dispatch({
        type: 'assignKiwi',
        villagerId: v.id,
        buildingId: buildingId as never,
      })
    )
      onDone();
  };
  return (
    <section class="field post-picker">
      {posts.length === 0 && <p class="small muted">{t('posts.none')}</p>}
      <ul class="post-list">
        {posts.map((p) => (
          <li key={p.buildingId}>
            <button
              class={`post-row ${p.current ? 'is-current' : ''} ${p.ideal ? 'is-ideal' : ''}`}
              disabled={p.current}
              title={t('posts.power', { value: fmt(p.power), average: fmt(p.power / p.affinity) })}
              onClick={() => assign(p.buildingId)}
            >
              <ResourceKind kind={p.kind} />
              <span class="post-main">
                <strong>
                  {t(`buildings.${p.type}.name`)}{' '}
                  <span class="small muted">{t('common.levelShort', { level: p.level })}</span>
                </strong>
                <span class="small muted">
                  {t(`posts.kinds.${p.kind}`)} · {p.workers}/{p.slots}
                  {p.swapWith && ` · ${t('posts.swap', { name: p.swapWith.name })}`}
                  {p.current && ` · ${t('posts.here')}`}
                </span>
                {p.ideal && <span class="badge badge-ideal">{t('posts.ideal')}</span>}
              </span>
              <span
                class={`post-power ${p.affinity >= 1.005 ? 'bonus' : p.affinity < 0.995 ? 'muted' : ''}`}
              >
                ×{fmt(p.power)}
              </span>
            </button>
          </li>
        ))}
        {v.job.kind !== 'idle' && (
          <li>
            <button class="post-row" onClick={() => assign(null)}>
              <span class="post-main">
                <strong>{t('posts.rest')}</strong>
              </span>
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Icon of what a workplace produces. */
export function ResourceKind({ kind, size = 20 }: { kind: string; size?: number }) {
  return kind === 'research' ? (
    <BookIcon size={size} />
  ) : (
    <ResourceIcon id={kind as ResourceId} size={size} />
  );
}

/** A row of small portraits; a tap opens the kiwi's sheet. */
export function KiwiChips({ kiwis }: { kiwis: Villager[] }) {
  return (
    <span class="kiwi-chips">
      {kiwis.map((v) => (
        <button key={v.id} class="kiwi-chip" title={v.name} onClick={() => actions.showKiwi(v.id)}>
          <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={26} />
          <span class="small">{v.name}</span>
          <FlagIcons v={v} />
        </button>
      ))}
    </span>
  );
}

/** Chantier 09: who works where, by resource, with the kiwis without a post on top. */
function JobBoardView() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const [open, setOpen] = useState<string | null>(null);
  const board = jobBoard(game);
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 10) / 10);
  return (
    <div class="job-board">
      <section
        class={`field board-idle ${board.unassigned.length && board.freeSlots ? 'is-alert' : ''}`}
      >
        <h3>{t('posts.unassigned', { count: board.unassigned.length })}</h3>
        {board.unassigned.length > 0 ? (
          <>
            <p class="small muted">
              {board.freeSlots > 0
                ? t('posts.freeSlots', { count: board.freeSlots })
                : t('posts.noFreeSlot')}
            </p>
            <KiwiChips kiwis={board.unassigned} />
          </>
        ) : (
          <p class="small muted">{t('posts.everyoneBusy')}</p>
        )}
      </section>
      {board.rows.length === 0 && <p class="small muted">{t('posts.none')}</p>}
      <ul class="board-rows">
        {board.rows.map((row) => (
          <BoardLine
            key={row.kind}
            row={row}
            open={open === row.kind}
            onToggle={() => setOpen(open === row.kind ? null : row.kind)}
            fmt={fmt}
          />
        ))}
        {board.guards.length > 0 && (
          <li class="board-row is-static">
            <div class="board-head">
              <span class="board-main">
                <strong>{t('garrison.title')}</strong>
                <span class="small muted">{board.guards.length}</span>
              </span>
            </div>
            <KiwiChips kiwis={board.guards} />
          </li>
        )}
        {board.builders.length > 0 && (
          <li class="board-row is-static">
            <div class="board-head">
              <span class="board-main">
                <strong>{t('posts.construction')}</strong>
                <span class="small muted">{board.builders.length}</span>
              </span>
            </div>
            <KiwiChips kiwis={board.builders} />
          </li>
        )}
        {board.pickers.length > 0 && (
          <li class="board-row is-static">
            <div class="board-head">
              <span class="board-main">
                <strong>{t('comet.board')}</strong>
                <span class="small muted">{board.pickers.length}</span>
              </span>
            </div>
            <KiwiChips kiwis={board.pickers} />
          </li>
        )}
      </ul>
    </div>
  );
}

function BoardLine({
  row,
  open,
  onToggle,
  fmt,
}: {
  row: BoardRow;
  open: boolean;
  onToggle: () => void;
  fmt: (x: number) => string;
}) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const idle = idleVillagers(game).filter((v) => !v.kikiwiwi).length;
  return (
    <li class={`board-row status-${row.status}`}>
      <button class="board-head" aria-expanded={open} onClick={onToggle}>
        <ResourceKind kind={row.kind} size={22} />
        <span class="board-main">
          <strong>{t(`posts.kinds.${row.kind}`)}</strong>
          <span class="small muted">
            {row.kind === 'research'
              ? t('research.rate', { rate: fmt(row.perHour) })
              : `+${fmt(row.perHour)}/h`}
          </span>
        </span>
        {row.status !== 'ok' && (
          <span class={`badge board-status status-${row.status}`}>
            {t(`posts.status.${row.status}`)}
          </span>
        )}
        <span class="board-count">
          {row.workers}/{row.slots}
        </span>
        <span class="board-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul class="board-buildings">
          {row.buildings.map(({ building: b, workers, slots }) => (
            <li key={b.id}>
              <div class="board-building">
                <span class="small">
                  <strong>{t(`buildings.${b.type}.name`)}</strong>{' '}
                  <span class="muted">{t('common.levelShort', { level: b.level })}</span>
                </span>
                <span class="stepper stepper-small">
                  <button
                    class="btn btn-icon btn-small"
                    aria-label={t('building.removeWorker')}
                    disabled={workers.length === 0}
                    onClick={() =>
                      actions.dispatch({
                        type: 'assignWorkers',
                        buildingId: b.id,
                        count: workers.length - 1,
                      })
                    }
                  >
                    −
                  </button>
                  <span class="small">
                    {workers.length}/{slots}
                  </span>
                  <button
                    class="btn btn-icon btn-small"
                    aria-label={t('building.addWorker')}
                    disabled={workers.length >= slots || idle === 0}
                    onClick={() =>
                      actions.dispatch({
                        type: 'assignWorkers',
                        buildingId: b.id,
                        count: workers.length + 1,
                      })
                    }
                  >
                    +
                  </button>
                </span>
              </div>
              {workers.length > 0 && <KiwiChips kiwis={workers} />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Small icons of a kiwi's flags (locked, priority builder). */
export function FlagIcons({ v }: { v: Villager }) {
  const t = useT();
  if (!v.locked && !v.builderPriority) return null;
  return (
    <span class="flag-icons">
      {v.locked && (
        <span title={t('posts.locked')}>
          <LockIcon size={14} />
        </span>
      )}
      {v.builderPriority && (
        <span title={t('posts.builderPriority')}>
          <HammerIcon size={14} />
        </span>
      )}
    </span>
  );
}

/** Chantier 09: keep a kiwi at its post, or send it to every construction site first. */
function KiwiFlags({ v }: { v: Villager }) {
  const t = useT();
  const toggle = (flags: { locked?: boolean; builderPriority?: boolean }) =>
    actions.dispatch({ type: 'setKiwiFlags', villagerId: v.id, ...flags });
  return (
    <div class="kiwi-flags">
      <button
        class={`btn btn-small flag-toggle ${v.locked ? 'btn-active' : ''}`}
        aria-pressed={!!v.locked}
        title={t('posts.lockedHint')}
        onClick={() => toggle({ locked: !v.locked })}
      >
        <LockIcon size={16} /> {t('posts.locked')}
      </button>
      {!v.kikiwiwi && (
        <button
          class={`btn btn-small flag-toggle ${v.builderPriority ? 'btn-active' : ''}`}
          aria-pressed={!!v.builderPriority}
          title={t('posts.builderPriorityHint')}
          onClick={() => toggle({ builderPriority: !v.builderPriority })}
        >
          <HammerIcon size={16} /> {t('posts.builderPriority')}
        </button>
      )}
      <p class="small muted">
        {v.locked
          ? t('posts.lockedHint')
          : v.builderPriority
            ? t('posts.builderPriorityHint')
            : t('posts.flagsHint')}
      </p>
    </div>
  );
}

/** Chantier 09: where a kiwi redirected from a full stock will go back. */
function RedirectNote({ game, v }: { game: GameState; v: Villager }) {
  const t = useT();
  const home = v.homeJob ? getBuilding(game, v.homeJob) : undefined;
  if (!home) return null;
  return (
    <p class="small muted redirect-note">
      {t('posts.redirected', {
        building: t(`buildings.${home.type}.name`),
        share: Math.round(JOBS.returnBelow * 100),
      })}
    </p>
  );
}
