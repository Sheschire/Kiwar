import { uiStore, useT, useUi } from '../store';

/** Small cloud showing where the colony is saved; opens the settings (account). */
export function SyncBadge() {
  const t = useT();
  const sync = useUi((s) => s.sync);
  const guest = useUi((s) => s.account?.isAnonymous ?? false);
  const label = t(`sync.${sync}`);
  return (
    <button
      class={`btn btn-icon parchment-btn sync sync-${sync} ${guest ? 'is-guest' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => uiStore.setState({ modal: 'settings' })}
    >
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M9 25h15a6 6 0 0 0 .6-12A8 8 0 0 0 9.3 11 7 7 0 0 0 9 25z"
          fill="var(--sync-fill)"
          stroke="#7a5a40"
          stroke-width="2"
          stroke-linejoin="round"
        />
        {sync === 'online' && (
          <path
            d="M11.5 18l3.5 3.5 6.5-7"
            stroke="#fff"
            stroke-width="2.6"
            fill="none"
            stroke-linecap="round"
          />
        )}
        {sync === 'offline' && (
          <path d="M16 13v6M16 22.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
        )}
        {sync === 'local' && <rect x="12" y="15" width="8" height="7" rx="1.5" fill="#fff" />}
      </svg>
    </button>
  );
}
