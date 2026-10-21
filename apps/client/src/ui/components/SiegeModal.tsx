import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  ageOf,
  assaultLock,
  bridgeheadAt,
  counterAwaited,
  counterForecast,
  finalLock,
  fortifyLock,
  holdDefense,
  holdersOf,
  INTEL,
  SIEGE,
  siegeLock,
  siegeView,
  twinTarget,
  type GameState,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ShieldIcon, ShipIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { fmtRange, sectorName, SiegeMap } from './SiegeParts';

/** Chantier 19: is there anything about the siege worth a button? */
export function siegeVisible(game: GameState): boolean {
  if (!twinTarget(game)) return false;
  return (
    game.siege.conqueredAt > 0 ||
    game.siege.bridgeheads.length > 0 ||
    ageOf(game) >= SIEGE.minAge - 1 ||
    game.villagers.some((v) => v.kikiwiwi)
  );
}

function Check({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li class={ok ? 'bonus' : 'muted'}>
      {ok ? '✔' : '○'} {children}
    </li>
  );
}

function Step(props: { n: number; done: boolean; title: string; children?: ComponentChildren }) {
  return (
    <li class={`siege-step ${props.done ? 'is-done' : ''}`}>
      <span class="siege-step-n">{props.done ? '✔' : props.n}</span>
      <div>
        <strong>{props.title}</strong>
        {props.children}
      </div>
    </li>
  );
}

/** The next counter-attack: countdown, target, odds (or waiting for the news). */
function CounterCard({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const f = counterForecast(game, now);
  if (!f) return null;
  const waiting = counterAwaited(game, now);
  return (
    <section class={`siege-counter parchment-inset odds-${waiting ? 'uncertain' : f.odds}`}>
      <strong>
        {waiting
          ? t('siege.counterWaiting', { sector: sectorName(t, f.sector) })
          : f.announced
            ? t('siege.counterIn', {
                sector: sectorName(t, f.sector),
                duration: formatDuration(lang, f.at - now),
              })
            : t('siege.counterQuiet')}
      </strong>
      {f.announced && !waiting && (
        <p class="small">
          {t('siege.counterOdds', {
            strength: fmtRange(lang, f.strength),
            enemy: f.enemy ? fmtRange(lang, f.enemy) : '?',
          })}{' '}
          <span class={`odds odds-${f.odds}`}>{t(`expedition.odds.${f.odds}`)}</span>
        </p>
      )}
    </section>
  );
}

/** What the selected outer sector holds, and what can be done there. */
function SectorPanel({ game, sector }: { game: GameState; sector: number }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const b = bridgeheadAt(game, sector);
  const hold = siegeView(game, now).holds[sector];
  const flying = game.expeditions.find(
    (e) => e.status === 'outbound' && e.sector === sector && e.mission !== 'retreat',
  );
  const head = (
    <h3>
      {sectorName(t, sector)}
      <span class="small muted">
        {' · '}
        {hold ? t('siege.holdRange', { range: fmtRange(lang, hold) }) : t('siege.holdUnknown')}
      </span>
    </h3>
  );
  if (!b) {
    const lock = assaultLock(game, sector);
    return (
      <section class="field siege-sector">
        {head}
        {flying ? (
          <p class="small">
            {t('siege.onItsWay', { duration: formatDuration(lang, flying.arriveAt - now) })}
          </p>
        ) : (
          <>
            <button
              class="btn btn-primary"
              disabled={lock !== null}
              onClick={() => actions.planSiege({ mission: 'assault', sector })}
            >
              <ShipIcon size={18} /> {t('siege.assault')}
            </button>
            {lock && <p class="small warn">{t(`errors.${lock}`)}</p>}
          </>
        )}
      </section>
    );
  }
  const holders = holdersOf(game, b);
  const fortLock = fortifyLock(game, sector);
  return (
    <section class="field siege-sector">
      {head}
      <p class="small">
        {t('siege.heldBy', {
          count: holders.length,
          strength: formatNumber(lang, Math.round(holdDefense(game, b) * 10) / 10),
        })}
        {b.fortified && ` · ${t('siege.fortified')}`}
      </p>
      <div class="chip-picks">
        {holders.map((v) => (
          <span key={v.id} class="chip-pick is-on">
            <KiwiPortrait
              shiny={v.shiny}
              classId={v.classId}
              titan={!!v.kikiwiwi}
              seed={v.id}
              size={24}
            />
            {v.name}
          </span>
        ))}
      </div>
      <div class="row">
        <button
          class="btn"
          disabled={!!flying}
          onClick={() => actions.planSiege({ mission: 'reinforce', sector })}
        >
          <ShipIcon size={18} /> {t('siege.reinforce')}
        </button>
        {!b.fortified && (
          <button
            class="btn"
            disabled={fortLock !== null}
            onClick={() => actions.dispatch({ type: 'fortifyBridgehead', sector })}
          >
            <ShieldIcon size={18} />{' '}
            {b.fortifyUntil !== undefined
              ? t('siege.fortifying', { duration: formatDuration(lang, b.fortifyUntil - now) })
              : t('siege.fortify', { juice: SIEGE.fortify.juice })}
          </button>
        )}
      </div>
      {flying && (
        <p class="small">
          {t('siege.onItsWay', { duration: formatDuration(lang, flying.arriveAt - now) })}
        </p>
      )}
      {fortLock && fortLock !== 'fortifying' && fortLock !== 'alreadyFortified' && (
        <p class="small muted">{t(`errors.${fortLock}`)}</p>
      )}
    </section>
  );
}

export function SiegeModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.slowGame);
  const now = useUi((s) => s.slowNow);
  const [selected, setSelected] = useState<number | null>(
    () => game?.siege.bridgeheads[0]?.sector ?? null,
  );
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none' });
  const twin = twinTarget(game);
  const lock = siegeLock(game);
  const view = siegeView(game, now);
  const s = game.siege;
  const heads = s.bridgeheads.length;
  const fortified = s.bridgeheads.some((b) => b.fortified);
  const final = finalLock(game);
  const finalFlying = game.expeditions.some(
    (e) => e.mission === 'final' && e.status === 'outbound',
  );
  return (
    <Modal title={t('siege.title')} onClose={close} class="modal-wide siege-modal">
      {s.conqueredAt > 0 ? (
        <section class="siege-won">
          <h2 class="bonus">{t('siege.conquered')}</h2>
          <p class="small">{t('siege.conqueredBody')}</p>
          <button class="btn btn-primary" disabled>
            {t('siege.found')}
          </button>
          <p class="small muted">{t('siege.foundSoon')}</p>
        </section>
      ) : lock === 'ageTooLow' || lock === 'needsKikiwiwi' ? (
        <section class="field">
          <p>{t('siege.intro')}</p>
          <ul class="siege-checks">
            <Check ok={ageOf(game) >= SIEGE.minAge}>{t('siege.needIron')}</Check>
            <Check ok={game.villagers.some((v) => v.kikiwiwi)}>{t('siege.needTitan')}</Check>
          </ul>
        </section>
      ) : null}

      {twin && s.conqueredAt === 0 && (
        <>
          <CounterCard game={game} />
          <div class="siege-layout">
            <SiegeMap
              game={game}
              selected={selected}
              onSelect={lock && heads === 0 ? undefined : setSelected}
              size={230}
            />
            <ol class="siege-steps">
              <Step n={1} done={!!view.queen} title={t('siege.step1')}>
                <p class="small muted">
                  {t('siege.step1Body', {
                    seen: view.seen.length,
                    total: INTEL.sectors,
                    queen: view.queen ? sectorName(t, view.queen.sector) : t('siege.queenHidden'),
                  })}
                </p>
                <button
                  class="btn btn-small"
                  disabled={lock !== null}
                  onClick={() => actions.planSiege({ mission: 'recon' })}
                >
                  {t('siege.sendRecon')}
                </button>
              </Step>
              <Step n={2} done={heads >= SIEGE.neededBridgeheads} title={t('siege.step2')}>
                <p class="small muted">
                  {t('siege.step2Body', {
                    count: heads,
                    need: SIEGE.neededBridgeheads,
                    max: SIEGE.maxBridgeheads,
                  })}
                </p>
              </Step>
              <Step n={3} done={fortified} title={t('siege.step3')}>
                <p class="small muted">{t('siege.step3Body')}</p>
              </Step>
              <Step n={4} done={false} title={t('siege.step4')}>
                <p class="small muted">{t('siege.step4Body')}</p>
                <button
                  class="btn btn-primary btn-small"
                  disabled={final !== null || finalFlying}
                  onClick={() => actions.planSiege({ mission: 'final' })}
                >
                  {t('siege.finalAssault')}
                </button>
                {final && lock === null && <p class="small warn">{t(`errors.${final}`)}</p>}
                {finalFlying && <p class="small">{t('siege.finalFlying')}</p>}
              </Step>
            </ol>
          </div>
          {selected !== null && <SectorPanel game={game} sector={selected} />}
          {selected === null && lock === null && <p class="small muted">{t('siege.pickSector')}</p>}
        </>
      )}

      {s.reports.length > 0 && (
        <section class="field">
          <h3>{t('siege.reports')}</h3>
          <ul class="siege-reports small">
            {[...s.reports].reverse().map((r) => (
              <li key={r.id} class={r.victory ? 'bonus' : 'warn'}>
                {t(r.victory ? 'siege.reportHeld' : 'siege.reportFell', {
                  sector: sectorName(t, r.sector),
                  ago: formatDuration(lang, Math.max(0, now - r.at)),
                  strength: formatNumber(lang, Math.round(r.strength * 10) / 10),
                  enemy: formatNumber(lang, Math.round(r.enemy * 10) / 10),
                })}
                {r.dead.length > 0 && ` ${t('siege.reportDead', { names: r.dead.join(', ') })}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}

/** Under the top bar: a counter-attack is coming on a bridgehead (or being fought). */
export function CounterBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.slowGame);
  const now = useUi((s) => s.slowNow);
  const f = game ? counterForecast(game, now) : null;
  if (!game || !f || !f.announced) return null;
  const waiting = counterAwaited(game, now);
  return (
    <span class="threat-wrap pe">
      <button
        class={`threat-badge threat-pill parchment odds-${waiting ? 'uncertain' : f.odds}`}
        onClick={() => uiStore.setState({ modal: 'siege' })}
        aria-label={t('siege.counterBadge', { sector: sectorName(t, f.sector) })}
        title={t('siege.counterBadge', { sector: sectorName(t, f.sector) })}
      >
        <span class="threat-paw" aria-hidden="true">
          ⚑
        </span>
        <span>{waiting ? '…' : formatDuration(lang, Math.max(0, f.at - now))}</span>
      </button>
    </span>
  );
}
