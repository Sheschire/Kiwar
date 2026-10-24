import { FoldSection } from './FoldSection';
import {
  getBuilding,
  kiwiRhythm,
  MORALE,
  presence,
  type Morale,
  type Villager,
} from '@kiwar/shared';
import { bedsOf, hungerStage, missingBeds, moraleOf } from '../derived';
import { formatNumber } from '../../i18n/i18n';
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

/** Compact needs of a kiwi for the village list: fatigue gauge, what it does, colony hunger. */
export function KiwiNeedsLine({ v }: { v: Villager }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const now = useUi((s) => s.now);
  if (v.job.kind === 'expedition') return null;
  const { rhythm, fatigue } = kiwiRhythm(game, v, now);
  const stage = hungerStage(game);
  return (
    <span class="kiwi-needs small">
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
