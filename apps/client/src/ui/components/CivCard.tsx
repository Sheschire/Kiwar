import { AGE_IDS, ageOf, civEstimate, waveAwaited, type GameState } from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { useT, useUi } from '../store';
import { sectorName } from './SiegeParts';

/**
 * Chantier 39: what we can tell of the alien civilisation of our twin — the age our scouts
 * saw, its likely age now on the common schedule, and where the announced wave comes from.
 */
export function CivCard(props: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const est = civEstimate(props.game, now);
  if (!est) return null;
  const age = (i: number) => `@ages.${AGE_IDS[i]!}`;
  const ours = ageOf(props.game);
  const pace = est.likelyAge > ours ? 'ahead' : est.likelyAge < ours ? 'behind' : 'even';
  return (
    <section class="field civ-card">
      <h3>{t('civ.title')}</h3>
      <p class="small">
        {est.seenAge === null || est.seenAt === null
          ? t('civ.unseen')
          : t('civ.seen', { age: age(est.seenAge), ago: formatDuration(lang, now - est.seenAt) })}
      </p>
      <p class="small">
        <strong>{t('civ.likely', { age: age(est.likelyAge) })}</strong>
        {est.nextAgeAt !== null &&
          t('civ.next', {
            age: age(est.likelyAge + 1),
            duration: formatDuration(lang, est.nextAgeAt - now),
          })}
      </p>
      <p class={`small ${pace === 'ahead' ? 'warn' : 'muted'}`}>{t(`civ.${pace}`)}</p>
      {est.waveFrom !== null ? (
        <p class="small warn">{t('civ.waveFrom', { sector: sectorName(t, est.waveFrom) })}</p>
      ) : (
        waveAwaited(props.game, now) && <p class="small muted">{t('civ.waveWait')}</p>
      )}
      <p class="small muted">{t('civ.hint')}</p>
    </section>
  );
}
