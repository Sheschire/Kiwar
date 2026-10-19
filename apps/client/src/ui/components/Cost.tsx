import { RESOURCE_IDS, type ResourceCost, type Resources } from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { ClockIcon, ResourceIcon } from '../icons';
import { useT, useUi } from '../store';

/** Resource cost list; missing amounts are highlighted. */
export function Cost({
  cost,
  have,
  durationMs,
}: {
  cost: ResourceCost;
  have?: Resources;
  durationMs?: number;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const ids = RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0);
  return (
    <span class="cost">
      {ids.length === 0 && <span class="cost-item">{t('common.free')}</span>}
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
      {durationMs !== undefined && (
        <span class="cost-item cost-time">
          <ClockIcon size={14} />
          {formatDuration(lang, durationMs)}
        </span>
      )}
    </span>
  );
}
