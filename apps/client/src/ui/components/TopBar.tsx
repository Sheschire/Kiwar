import {
  capacity,
  housing,
  population,
  productionRates,
  RESOURCE_IDS,
  type ResourceId,
} from '@kiwar/shared';
import { formatNumber } from '../../i18n/i18n';
import { GearIcon, KiwiIcon, ResourceIcon, ScrollIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';

function ResourceChip({ id }: { id: ResourceId }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const amount = useUi((s) => Math.floor(s.game?.resources[id] ?? 0));
  const cap = useUi((s) => (s.game ? capacity(s.game)[id] : 0));
  const rate = useUi((s) => (s.game ? Math.round(productionRates(s.game)[id]) : 0));
  const fill = cap > 0 ? Math.min(1, amount / cap) : 0;
  const full = fill >= 0.999;
  const label = `${t(`resources.${id}`)} : ${formatNumber(lang, amount)} / ${formatNumber(lang, cap)} · ${t('hud.rate', { value: rate })}`;
  return (
    <div
      class={`chip res-${id} ${full ? 'is-full' : ''}`}
      title={label}
      aria-label={label}
      role="status"
    >
      <ResourceIcon id={id} size={24} />
      <div class="chip-body">
        <div class="chip-line">
          <span class="chip-amount">{formatNumber(lang, amount)}</span>
          <span class="chip-cap">/{formatNumber(lang, cap)}</span>
        </div>
        <div class="chip-bar">
          <span style={{ width: `${fill * 100}%` }} />
        </div>
        <div class="chip-rate">+{formatNumber(lang, rate)}/h</div>
      </div>
    </div>
  );
}

export function TopBar() {
  const t = useT();
  const pop = useUi((s) => (s.game ? population(s.game) : 0));
  const house = useUi((s) => (s.game ? housing(s.game) : 0));
  const objectivesOpen = useUi((s) => s.objectivesOpen);
  return (
    <header class="topbar pe">
      <div class="resources parchment">
        {RESOURCE_IDS.map((id) => (
          <ResourceChip key={id} id={id} />
        ))}
        <div
          class="chip chip-pop"
          title={t('hud.populationTip')}
          aria-label={`${t('hud.population')} ${pop}/${house}`}
        >
          <KiwiIcon size={24} />
          <div class="chip-body">
            <div class="chip-line">
              <span class="chip-amount">{pop}</span>
              <span class="chip-cap">/{house}</span>
            </div>
            <div class="chip-rate">{t('hud.population')}</div>
          </div>
        </div>
      </div>
      <div class="topbar-buttons">
        <button
          class={`btn btn-icon parchment-btn ${objectivesOpen ? 'btn-active' : ''}`}
          aria-label={t('hud.objectives')}
          aria-pressed={objectivesOpen}
          title={t('hud.objectives')}
          onClick={() => uiStore.setState((s) => ({ objectivesOpen: !s.objectivesOpen }))}
        >
          <ScrollIcon />
        </button>
        <button
          class="btn btn-icon parchment-btn"
          aria-label={t('hud.settings')}
          title={t('hud.settings')}
          onClick={() => uiStore.setState({ modal: 'settings' })}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
