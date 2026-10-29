import { uiStore } from './store';

/** How often a long session asks the server whether a new version is out. */
const CHECK_MS = 20 * 60_000;

let registration: ServiceWorkerRegistration | null = null;

/**
 * The offline cache (PWA) keeps the version it has until a new one is installed. A new
 * version waits (`registerType: 'prompt'`) for the player's "Update" (the game saves on the
 * reload); it is looked for at start, every 20 minutes and when the tab comes back.
 */
export function watchUpdates(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  // The first install has nothing to replace: only a new worker over an old one is an update.
  const ready = (w: ServiceWorker | null) => {
    if (w && sw.controller) uiStore.setState({ updateReady: true });
  };
  sw.register('./sw.js', { scope: './' })
    .then((reg) => {
      registration = reg;
      ready(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') ready(w);
        });
      });
      const check = () => void reg.update().catch(() => {});
      window.setInterval(check, CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
    })
    .catch(() => {});
  // The new worker took over: load the new version.
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}
