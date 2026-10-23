import { useState } from 'preact/hooks';
import {
  AGE_IDS,
  ageOf,
  CAMP,
  CLASS_IDS,
  CLASS_RULES,
  CLASSES,
  classRank,
  classRankProgress,
  trainingCost,
  trainingDuration,
  validateCommand,
  type Building,
  type ClassId,
  type Command,
  type GameState,
  type Villager,
} from '@kiwar/shared';
import { formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { useT, useUi } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';

/** One condition of a class for a kiwi: met (green) or not (red). */
export interface Requirement {
  label: string;
  ok: boolean;
}

type Translate = ReturnType<typeof useT>;

/**
 * Chantier 37: what a class asks of a kiwi — its stat(s), the kiwi level, the class it comes
 * from and its rank, the age, and the School or camp level. Shared by the courses and the tree.
 */
export function classRequirements(
  game: GameState,
  v: Villager,
  classId: ClassId,
  t: Translate,
): Requirement[] {
  const def = CLASSES[classId];
  const min = CLASS_RULES.statMin[def.tier]!;
  const out: Requirement[] = [];
  for (const stat of def.stat2 ? [def.stat, def.stat2] : [def.stat])
    out.push({
      label: `${t('classInfo.stat', { stat: `@stats.${stat}`, min })} (${v.stats[stat]})`,
      ok: v.stats[stat] >= min,
    });
  if (def.minLevel > 1)
    out.push({ label: t('classInfo.level', { level: def.minLevel }), ok: v.level >= def.minLevel });
  if (def.parents) {
    out.push({
      label: t('classInfo.from', {
        classes: def.parents.map((p) => t(`classes.${p}.name`)).join(' / '),
      }),
      ok: !!v.classId && def.parents.includes(v.classId),
    });
    out.push({
      label: t('classInfo.needsRank', { rank: CLASS_RULES.promoteRank }),
      ok: !!v.classId && def.parents.includes(v.classId) && classRank(v) >= CLASS_RULES.promoteRank,
    });
  }
  if (def.age)
    out.push({
      label: t('classInfo.age', { age: `@ages.${AGE_IDS[def.age]!}` }),
      ok: ageOf(game) >= def.age,
    });
  const place = def.tier === 1 ? 'school' : 'trainingCamp';
  const best = Math.max(0, ...game.buildings.filter((b) => b.type === place).map((b) => b.level));
  out.push({
    label:
      def.tier === 1
        ? t('kiwi.needsSchoolLevel', { level: def.schoolLevel })
        : t('classInfo.needsCamp', { level: def.schoolLevel }),
    ok: best >= def.schoolLevel,
  });
  return out;
}

/** The rank in the current class, with its bar. */
export function ClassRank({ v }: { v: Villager }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const p = classRankProgress(v);
  if (p.rank === 0) return null;
  const from = CAMP.rankHours[p.rank]!;
  const share = p.next === null ? 1 : (p.hours - from) / (p.next - from);
  return (
    <div class="class-rank">
      <span class="small">
        <strong>{t('classInfo.rank', { rank: p.rank, max: CAMP.maxRank })}</strong>{' '}
        <span class="muted">
          {p.next === null
            ? t('classInfo.rankMax')
            : t('classInfo.rankNext', {
                hours: formatNumber(lang, Math.ceil(Math.max(0, p.next - p.hours) * 10) / 10),
                rank: p.rank + 1,
              })}
        </span>
      </span>
      <span class="xp-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }} />
      </span>
    </div>
  );
}

function Course({ v, classId, places }: { v: Villager; classId: ClassId; places: Building[] }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  const ctx = map ? { now, map } : null;
  // The place that can take this kiwi (the highest level first).
  const sorted = [...places].sort((a, b) => b.level - a.level);
  let cmd: Command | null = null;
  let place: Building | undefined;
  for (const b of sorted) {
    const c: Command = { type: 'train', villagerId: v.id, schoolId: b.id, classId };
    if (!cmd) {
      cmd = c;
      place = b;
    }
    if (ctx && validateCommand(game, c, ctx) === null) {
      cmd = c;
      place = b;
      break;
    }
  }
  const error = cmd && ctx ? validateCommand(game, cmd, ctx) : 'notASchool';
  const reqs = classRequirements(game, v, classId, t);
  const unmet = reqs.some((r) => !r.ok);
  return (
    <li class={`course ${unmet ? 'is-locked' : ''}`}>
      <KiwiPortrait shiny={v.shiny} classId={classId} seed={v.id} size={40} />
      <span class="course-main">
        <strong>{t(`classes.${classId}.name`)}</strong>
        <span class="small muted">{t(`classes.${classId}.desc`)}</span>
        <span class="small muted">{t(`classes.${classId}.combat`)}</span>
        <span class="req-list">
          {reqs.map((r) => (
            <span key={r.label} class={`small req ${r.ok ? 'bonus' : 'warn'}`}>
              {r.label}
            </span>
          ))}
        </span>
        {!unmet && place && (
          <Cost
            cost={trainingCost(v, classId, place)}
            have={game.resources}
            durationMs={trainingDuration(place, classId)}
          />
        )}
        {!unmet && error && error !== 'notEnoughResources' && (
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
}

/**
 * The courses open to a kiwi: tier 1 at the School (a change of class costs double), and at the
 * training camp the promotions from its class and the cheaper changes of class.
 */
export function ClassCourses({ v }: { v: Villager }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const [showSchool, setShowSchool] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const schools = game.buildings.filter((b) => b.type === 'school');
  const camps = game.buildings.filter((b) => b.type === 'trainingCamp');
  const tierOne = CLASS_IDS.filter((c) => c !== v.classId && CLASSES[c].tier === 1);
  const promotions = v.classId
    ? CLASS_IDS.filter((c) => CLASSES[c].parents?.includes(v.classId!))
    : [];
  return (
    <>
      {schools.length === 0 ? (
        <p class="small muted">{t('kiwi.needsSchool')}</p>
      ) : v.classId && !showSchool ? (
        <button class="btn btn-small" onClick={() => setShowSchool(true)}>
          {t('kiwi.retrain')}
        </button>
      ) : (
        <ul class="course-list">
          {tierOne.map((c) => (
            <Course key={c} v={v} classId={c} places={schools} />
          ))}
        </ul>
      )}
      {v.classId && (
        <>
          <h4 class="small-title">{t('classInfo.campCourses')}</h4>
          {camps.length === 0 ? (
            <p class="small muted">{t('classInfo.noCamp')}</p>
          ) : (
            <>
              <ul class="course-list">
                {promotions.map((c) => (
                  <Course key={c} v={v} classId={c} places={camps} />
                ))}
              </ul>
              {!showChange ? (
                <button class="btn btn-small" onClick={() => setShowChange(true)}>
                  {t('classInfo.change', { percent: Math.round(CAMP.retrainCost * 100) })}
                </button>
              ) : (
                <ul class="course-list">
                  {tierOne.map((c) => (
                    <Course key={c} v={v} classId={c} places={camps} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
