import {
  bedsOf,
  getBuilding,
  kiwiRhythm,
  MORALE,
  moraleOf,
  presence,
  type Morale,
  type Villager,
} from '@kiwar/shared';
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
    <section class="field rest-section">
      <h3>{t('needs.rest.title')}</h3>
      <div class="stat-row">
        <span class="stat-label">{t('needs.rest.fatigue')}</span>
        <div class={`fatigue-bar ${fatigue > 0.75 ? 'high' : ''}`} aria-hidden="true">
          <span style={{ width: `${Math.round(fatigue * 100)}%` }} />
        </div>
        <span class="small">{t(`needs.rest.rhythm.${rhythm}`)}</span>
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
    </section>
  );
}

const PARTS = [
  'food',
  'comfort',
  'speech',
  'mourning',
  'season',
] as const satisfies readonly (keyof Morale)[];

/** Colony morale with what makes it (village screen). */
export function MoraleCard() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const m = moraleOf(game);
  return (
    <div class={`morale-card ${m.total < 0 ? 'is-low' : ''}`}>
      <strong>{t('needs.morale.value', { value: signed(lang, m.total) })}</strong>
      <ul class="morale-parts">
        {PARTS.filter((k) => Math.abs(m[k]) > 1e-6).map((k) => (
          <li key={k} class={m[k] < 0 ? 'warn' : 'bonus'}>
            {t(`needs.morale.parts.${k}`)} {signed(lang, m[k])}
          </li>
        ))}
      </ul>
      <p class="small muted">{t('needs.morale.hint', { max: Math.round(MORALE.max * 100) })}</p>
    </div>
  );
}

/** One line for tooltips. */
export function MoraleLine() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game)!;
  const m = moraleOf(game);
  return (
    <p class={`tip-line ${m.total < 0 ? 'warn' : 'bonus'}`}>
      {t('needs.morale.value', { value: signed(lang, m.total) })}
    </p>
  );
}
