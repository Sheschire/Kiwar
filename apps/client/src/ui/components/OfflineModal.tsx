import { RESOURCE_IDS, type BuildingType } from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { EggIcon, ResourceIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';
import { RECAP_MODAL_MS } from './RecapBubble';

export function OfflineModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const summary = useUi((s) => s.offlineSummary);
  const open = useUi((s) => s.recapOpen);
  // Short breaks get the corner bubble; its "details" opens this.
  if (!summary || (summary.awayMs < RECAP_MODAL_MS && !open)) return null;
  const close = () => uiStore.setState({ offlineSummary: null, recapOpen: false });
  const gained = RESOURCE_IDS.filter((id) => summary.gained[id] >= 1);
  const nothing =
    gained.length === 0 &&
    summary.completed.length === 0 &&
    summary.hatched.length === 0 &&
    summary.starved.length === 0 &&
    summary.foodRanOut.length === 0 &&
    summary.waves.won + summary.waves.lost === 0 &&
    summary.counters.held + summary.counters.fell === 0 &&
    summary.meteors === 0 &&
    summary.comets === 0 &&
    summary.stardust === 0 &&
    summary.iron === 0 &&
    summary.forged === 0 &&
    summary.gifts.length === 0;
  return (
    <Modal
      title={t('offline.title')}
      onClose={close}
      class="modal-offline"
      footer={
        <button class="btn btn-primary" onClick={close}>
          {t('common.ok')}
        </button>
      }
    >
      <p>{t('offline.away', { duration: formatDuration(lang, summary.awayMs) })}</p>
      {nothing && <p class="muted">{t('offline.nothing')}</p>}
      {gained.length > 0 && (
        <>
          <h3>{t('offline.gathered')}</h3>
          <ul class="gains">
            {gained.map((id) => (
              <li key={id}>
                <ResourceIcon id={id} size={22} /> +
                {formatNumber(lang, Math.floor(summary.gained[id]))} {t(`resources.${id}`)}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.completed.length > 0 && (
        <>
          <h3>{t('offline.completed')}</h3>
          <ul>
            {summary.completed.map((c, i) => (
              <li key={i}>
                {t(`buildings.${c.buildingType as BuildingType}.name`)} —{' '}
                {t('common.levelShort', { level: c.level })}
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.hatched.length > 0 && (
        <p class="row">
          <EggIcon size={20} /> {t('offline.hatched', { names: summary.hatched.join(', ') })}
        </p>
      )}
      {summary.foodRanOut.length > 0 && (
        <p class="warn">
          {t('offline.foodRanOut', {
            list: summary.foodRanOut
              .map((r) => t(`resources.${r as (typeof RESOURCE_IDS)[number]}`))
              .join(', '),
          })}
        </p>
      )}
      {summary.starved.length > 0 && (
        <p class="warn">{t('offline.starved', { names: summary.starved.join(', ') })}</p>
      )}
      {summary.counters.held + summary.counters.fell > 0 && (
        <p class={summary.counters.fell > 0 ? 'warn' : 'bonus'}>
          {t('offline.counters', summary.counters)}
        </p>
      )}
      {summary.waves.won + summary.waves.lost > 0 && (
        <p class={summary.waves.lost > 0 ? 'warn' : 'bonus'}>
          {t('offline.waves', summary.waves)}{' '}
          <button
            class="btn btn-small"
            onClick={() =>
              uiStore.setState({
                offlineSummary: null,
                recapOpen: false,
                modal: 'defense',
                unreadWave: null,
              })
            }
          >
            {t('offline.openDefense')}
          </button>
        </p>
      )}
      {summary.gifts.length > 0 && (
        <p class="bonus">{t('offline.gifts', { names: [...new Set(summary.gifts)].join(', ') })}</p>
      )}
      {summary.meteors > 0 && (
        <p class="bonus">{t('offline.meteors', { count: summary.meteors })}</p>
      )}
      {summary.comets > 0 && <p class="bonus">{t('offline.comets', { count: summary.comets })}</p>}
      {summary.iron > 0 && <p class="bonus">{t('offline.iron', { count: summary.iron })}</p>}
      {summary.forged > 0 && <p class="bonus">{t('offline.forged', { count: summary.forged })}</p>}
      {summary.stardust > 0 && (
        <p class="bonus">{t('offline.stardust', { count: summary.stardust })}</p>
      )}
      {summary.incidents > 0 && (
        <p class="small muted">{t('offline.incidents', { count: summary.incidents })}</p>
      )}
      {summary.storageFull.length > 0 && (
        <p class="warn">
          {t('offline.storageFull', {
            list: summary.storageFull
              .map((r) => t(`resources.${r as (typeof RESOURCE_IDS)[number]}`))
              .join(', '),
          })}
        </p>
      )}
    </Modal>
  );
}
