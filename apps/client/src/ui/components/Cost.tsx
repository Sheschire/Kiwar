import { RESOURCE_IDS, type ResourceCost, type Resources } from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { ClockIcon, ResourceIcon, StardustIcon } from '../icons';
import { useT, useUi } from '../store';
import { Icon } from '../iconSet';

/** Resource cost list; missing amounts are highlighted. */
export function Cost({
  cost,
  have,
  durationMs,
  stardust,
  haveDust,
  iron,
  haveIron,
  crystal,
  haveCrystal,
  giantSeeds,
  haveSeeds,
}: {
  cost: ResourceCost;
  have?: Resources;
  durationMs?: number;
  /** Chantier 13: stardust points on top of the resources. */
  stardust?: number;
  haveDust?: number;
  /** Chantier 38: whole units of meteoric iron on top. */
  iron?: number;
  haveIron?: number;
  /** Chantier 50: whole units of crystal, and giant seeds, on top. */
  crystal?: number;
  haveCrystal?: number;
  giantSeeds?: number;
  haveSeeds?: number;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const ids = RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0);
  return (
    <span class="cost">
      {ids.length === 0 && !stardust && !iron && !crystal && !giantSeeds && (
        <span class="cost-item">{t('common.free')}</span>
      )}
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
      {!!iron && (
        <span
          class={`cost-item cost-iron ${haveIron !== undefined && haveIron < iron ? 'missing' : ''}`}
          title={t('iron.name')}
        >
          <Icon name="iron" size={16} />
          {iron}
        </span>
      )}
      {!!crystal && (
        <span
          class={`cost-item cost-crystal ${haveCrystal !== undefined && haveCrystal < crystal ? 'missing' : ''}`}
          title={t('crystal.name')}
        >
          <Icon name="crystal" size={16} />
          {crystal}
        </span>
      )}
      {!!giantSeeds && (
        <span
          class={`cost-item cost-giant ${haveSeeds !== undefined && haveSeeds < giantSeeds ? 'missing' : ''}`}
          title={t('giantSeeds.name')}
        >
          <Icon name="giantSeed" size={16} />
          {giantSeeds}
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
