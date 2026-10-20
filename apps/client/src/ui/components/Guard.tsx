import { Component, type ComponentChildren } from 'preact';
import { uiStore, useT, useUi } from '../store';

const UNIVERSE_KEY = 'kiwar.universe';

function reload(): void {
  window.location.reload();
}

function playSolo(): void {
  try {
    localStorage.setItem(UNIVERSE_KEY, 'solo');
  } catch {
    // ignore
  }
  reload();
}

/**
 * Shown until the colony is on screen: a loading line, or what went wrong with a way out
 * (never an empty screen).
 */
export function BootScreen() {
  const t = useT();
  const error = useUi((s) => s.bootError);
  const online = useUi((s) => s.sync !== 'local');
  return (
    <div class="boot-screen pe">
      <div class="parchment boot-card" role={error ? 'alert' : 'status'}>
        {error ? (
          <>
            <h2>{t('boot.title')}</h2>
            <p class="small">{t('boot.body')}</p>
            <p class="small muted boot-detail">{error}</p>
            <div class="row boot-actions">
              <button class="btn btn-primary" onClick={reload}>
                {t('boot.retry')}
              </button>
              {online && (
                <button class="btn" onClick={playSolo}>
                  {t('boot.solo')}
                </button>
              )}
            </div>
          </>
        ) : (
          <p>{t('app.loading')}</p>
        )}
      </div>
    </div>
  );
}

function GuardFallback({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useT();
  return (
    <aside class="guard parchment pe" role="alert">
      <p class="small">{t('boot.broken')}</p>
      <p class="small muted boot-detail">{error}</p>
      <div class="row boot-actions">
        <button class="btn btn-primary" onClick={onRetry}>
          {t('boot.retry')}
        </button>
        <button class="btn" onClick={reload}>
          {t('boot.reload')}
        </button>
      </div>
    </aside>
  );
}

/** Keeps a broken panel from taking the whole interface down with it. */
export class Guard extends Component<{ children: ComponentChildren }, { error: string | null }> {
  override state = { error: null as string | null };

  override componentDidCatch(error: unknown): void {
    console.error(error);
    this.setState({ error: error instanceof Error ? error.message : String(error) });
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <GuardFallback
        error={this.state.error}
        onRetry={() => {
          uiStore.setState({ selectedTile: null, modal: 'none' });
          this.setState({ error: null });
        }}
      />
    );
  }
}
