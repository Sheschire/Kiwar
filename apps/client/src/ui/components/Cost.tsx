import { RESOURCE_IDS, type ResourceCost, type Resources } from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { ClockIcon, ResourceIcon, StardustIcon } from '../icons';
import { useT, useUi } from '../store';

/** Resource cost list; missing amounts are highlighted. */
export function Cost({
  cost,
  have,
  durationMs,
  stardust,
  haveDust,
}: {
  cost: ResourceCost;
  have?: Resources;
  durationMs?: number;
  /** Chantier 13: stardust points on top of the resources. */
  stardust?: number;
  haveDust?: number;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const ids = RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0);
  return (
    <span class="cost">
      {ids.length === 0 && !stardust && <span class="cost-item">{t('common.free')}</span>}
      {ids.map((id) => {
        const missing = have ? have[id] + 1e-9 < (cost[id] ?? 0) : false;
        return (
          <span
            key={id}
            class={`cost-item ${missing ? 'missing' : ''}`}
            title={t(`resources.${id}`)}
          >
            <ResourceIcon id={id} size={16} />
            {formatNumber(lang, cost[id] ?? 0)}
          </span>
        );
      })}
      {!!stardust && (
        <span
          class={`cost-item cost-dust ${haveDust !== undefined && haveDust < stardust ? 'missing' : ''}`}
          title={t('comet.name')}
        >
          <StardustIcon size={16} />
          {stardust}
        </span>
      )}
      {durationMs !== undefined && (
        <span class="cost-item cost-time">
          <ClockIcon size={14} />
          {formatDuration(lang, durationMs)}
        </span>
      )}
    </span>
  );
}
