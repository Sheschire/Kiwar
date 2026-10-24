import { FoldSection } from './FoldSection';
import {
  getBuilding,
  kiwiRhythm,
  MORALE,
  moraleFactor,
  presence,
  type Morale,
  type Villager,
} from '@kiwar/shared';
import { bedsOf, hungerStage, kiwiMorales, missingBeds, moraleOf } from '../derived';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { useT, useUi } from '../store';

const signed = (lang: 'fr' | 'en', share: number) => {
  const v = Math.round(share * 1000) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatNumber(lang, Math.abs(v))}`;
};

/** A kiwi's fatigue, what it does right now, where it sleeps and its share of work. */
export function RestSection({ v }: { v: Villager }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const now = useUi((s) => s.now);
  if (v.job.kind === 'expedition') return null;
  const bed = bedsOf(game).get(v.id);
  const home = bed?.buildingId ? getBuilding(game, bed.buildingId) : undefined;
  const { rhythm, fatigue } = kiwiRhythm(game, v, now);
  const share = presence(game, v, bed);
  return (
    <FoldSection class="rest-section" title={t('needs.rest.title')}>
      <div class="stat-row">
        <span class="stat-label">{t('needs.rest.fatigue')}</span>
        <div class={`fatigue-bar ${fatigue > 0.75 ? 'high' : ''}`} aria-hidden="true">
          <span style={{ width: `${Math.round(fatigue * 100)}%` }} />
        </div>
        {(rhythm !== 'work' || v.job.kind !== 'idle') && (
          <span class="small">{t(`needs.rest.rhythm.${rhythm}`)}</span>
        )}
      </div>
      {home ? (
        <p class="small">
          {t('needs.rest.bed', {
            building: `@buildings.${home.type}.name`,
            steps: Math.round((bed?.distance ?? 0) * 10) / 10,
          })}
        </p>
      ) : (
        <p class="small warn">{t('needs.rest.outside')}</p>
      )}
      <p class="small muted">{t('needs.rest.presence', { percent: Math.round(share * 100) })}</p>
      <p class="small muted">{t('needs.rest.hint')}</p>
    </FoldSection>
  );
}

const PARTS = [
  'base',
  'food',
  'comfort',
  'mayor',
  'bards',
  'speech',
  'beauty',
  'leisure',
  'temper',
  'memories',
  'season',
] as const satisfies readonly (keyof Morale)[];

/** Morale points with their sign (chantier 43: rounded to a point). */
const points = (lang: 'fr' | 'en', v: number) => {
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${formatNumber(lang, Math.abs(r))}`;
};

/** Colony morale (the average of its kiwis) with what makes it (village screen). */
export function MoraleCard() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const m = moraleOf(game);
  return (
    <div class={`morale-card ${m.work < 0 ? 'is-low' : ''}`}>
      <strong>
        {t('needs.morale.value', {
          value: Math.round(m.average),
          work: signed(lang, m.work),
        })}
      </strong>
      <ul class="morale-parts">
        {PARTS.filter((k) => Math.abs(m[k]) >= 0.5).map((k) => (
          <li key={k} class={k === 'base' ? '' : m[k] < 0 ? 'warn' : 'bonus'}>
            {t(`needs.morale.parts.${k}`)} {k === 'base' ? Math.round(m[k]) : points(lang, m[k])}
          </li>
        ))}
      </ul>
      {m.low > 0 && <p class="small warn">{t('needs.morale.low', { count: m.low })}</p>}
      <MissingBedsLine />
      <p class="small muted">
        {t('needs.morale.hint', {
          low: Math.round((MORALE.work.low - 1) * 100),
          high: Math.round((MORALE.work.high - 1) * 100),
        })}
      </p>
    </div>
  );
}

/** Chantier 43: the colour step of a morale gauge. */
function moraleTone(points: number): 'low' | 'meh' | 'good' {
  return points < MORALE.sulk ? 'low' : points < MORALE.neutral ? 'meh' : 'good';
}

/** Chantier 43: a morale gauge (0–100). */
export function MoraleGauge({ points, mini = false }: { points: number; mini?: boolean }) {
  const t = useT();
  return (
    <span
      class={`morale-bar ${mini ? 'mini' : ''} is-${moraleTone(points)}`}
      title={t('needs.morale.gauge', { value: Math.round(points) })}
      aria-label={t('needs.morale.gauge', { value: Math.round(points) })}
    >
      <span style={{ width: `${Math.round(points)}%` }} />
    </span>
  );
}

/** Chantier 43: one kiwi's morale gauge, its work and what makes it (kiwi sheet). */
export function KiwiMoraleSection({ v }: { v: Villager }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  if (v.job.kind === 'expedition' || v.job.kind === 'outpost') return null;
  const m = kiwiMorales(game).get(v.id);
  if (!m) return null;
  const work = moraleFactor(m.total) - 1;
  const parts = [
    ['colony', m.colony],
    ['bed', m.bed],
    ['leisure', m.leisure],
    ['temper', m.temper],
  ] as const;
  const memories = (v.memories ?? []).filter((x) => x.until > game.now);
  return (
    <FoldSection class="morale-section" title={t('needs.morale.title')}>
      <div class="stat-row">
        <span class="stat-label">{Math.round(m.total)}/100</span>
        <MoraleGauge points={m.total} />
        <span class={`small ${work < 0 ? 'warn' : 'bonus'}`}>
          {t('needs.morale.work', { value: signed(lang, work) })}
        </span>
      </div>
      {m.total < MORALE.sulk && <p class="small warn">{t('needs.morale.sulk')}</p>}
      <ul class="morale-parts">
        {parts
          .filter(([k, x]) => k === 'colony' || Math.abs(x) >= 0.5)
          .map(([k, x]) => (
            <li key={k} class={k === 'colony' ? '' : x < 0 ? 'warn' : 'bonus'}>
              {t(`needs.morale.kiwiParts.${k}`)} {k === 'colony' ? Math.round(x) : points(lang, x)}
            </li>
          ))}
      </ul>
      {memories.length > 0 && (
        <ul class="morale-memories small">
          {memories.map((x) => (
            <li key={x.kind} class={x.value < 0 ? 'warn' : 'bonus'}>
              {t(`needs.morale.memories.${x.kind}`)} {points(lang, x.value)} ·{' '}
              {formatDuration(lang, x.until - game.now)}
            </li>
          ))}
        </ul>
      )}
      <p class="small muted">{t('needs.morale.kiwiHint')}</p>
    </FoldSection>
  );
}

/** Compact needs of a kiwi for the village list: fatigue gauge, what it does, colony hunger. */
export function KiwiNeedsLine({ v }: { v: Villager }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const now = useUi((s) => s.now);
  if (v.job.kind === 'expedition') return null;
  const { rhythm, fatigue } = kiwiRhythm(game, v, now);
  const stage = hungerStage(game);
  const morale = kiwiMorales(game).get(v.id)?.total;
  return (
    <span class="kiwi-needs small">
      {morale !== undefined && <MoraleGauge points={morale} mini />}
      <span
        class={`fatigue-bar mini ${fatigue > 0.75 ? 'high' : ''}`}
        title={t('needs.rest.fatigue')}
        aria-label={`${t('needs.rest.fatigue')} ${Math.round(fatigue * 100)} %`}
      >
        <span style={{ width: `${Math.round(fatigue * 100)}%` }} />
      </span>
      {(rhythm !== 'work' || v.job.kind !== 'idle') && (
        <span class="muted">{t(`needs.rest.rhythm.${rhythm}`)}</span>
      )}
      {stage !== 'fed' && <span class="warn">{t(`needs.stages.${stage}`)}</span>}
      {morale !== undefined && morale < MORALE.sulk && (
        <span class="warn">{t('needs.morale.sulking')}</span>
      )}
    </span>
  );
}

/** What the missing beds cost (village screen, home sheets); nothing when everyone has one. */
export function MissingBedsLine() {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const homeless = missingBeds(game);
  if (homeless.count === 0) return null;
  return (
    <p class="small warn">
      {t('needs.missingBeds', {
        count: homeless.count,
        percent: Math.max(1, Math.round(homeless.presenceLost * 100)),
      })}
    </p>
  );
}

/** One line for tooltips. */
export function MoraleLine() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const m = moraleOf(game);
  return (
    <p class={`tip-line ${m.work < 0 ? 'warn' : 'bonus'}`}>
      {t('needs.morale.value', { value: Math.round(m.average), work: signed(lang, m.work) })}
    </p>
  );
}
