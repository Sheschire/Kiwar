import { useState } from 'preact/hooks';
import {
  attacksFrom,
  BEACONS,
  beaconForecast,
  canAfford,
  faceViewOf,
  fortifyCost,
  fortifyLock,
  guardsOf,
  INTEL,
  meteorIronOf,
  queenFrom,
  queenOf,
  queenWounds,
  SIEGE,
  type BeaconReport,
  type ExpeditionTarget,
  type GameState,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { useT, useUi } from '../store';
import { Cost } from './Cost';
import { LandingReplay, sectorName } from './LandingParts';

/**
 * Chantier 42: the defence of our beacons (the attack announced, the guard, the fortification,
 * the forecast of the battle), the reports of the attacks, and the ferret queen. Public data.
 */

/** The next attack on a face as the player knows it. */
export function AttackLine({ game, target }: { game: GameState; target: ExpeditionTarget }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const face = faceViewOf(game, target.id);
  if (face.beacons.length === 0 || game.siege.conqueredAt > 0) return null;
  const a = face.attack;
  const from = attacksFrom(game, target.distance);
  if (a?.announced && a.sector !== null) {
    if (a.at <= now) return <p class="small warn">{t('beacons.striking')}</p>;
    return (
      <p class="small warn beacon-attack">
        {t('beacons.attackIn', {
          name: sectorName(t, a.sector),
          origin: sectorName(t, a.origin ?? a.sector),
          duration: formatDuration(lang, a.at - now),
        })}
      </p>
    );
  }
  if (a && a.announceAt <= now) return <p class="small muted">{t('beacons.waiting')}</p>;
  if (from > now)
    return (
      <p class="small muted">
        {t('beacons.quietUntil', { duration: formatDuration(lang, from - now) })}
      </p>
    );
  return <p class="small muted">{t('beacons.quiet')}</p>;
}

/** The defence of one beacon (in the parcel sheet and the conquest screen). */
export function BeaconDefense(props: {
  game: GameState;
  target: ExpeditionTarget;
  sector: number;
  /** Inside the planner: no buttons. */
  planning?: boolean;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const { game, target, sector } = props;
  const face = faceViewOf(game, target.id);
  const b = face.beacons.find((x) => x.sector === sector);
  if (!b || game.siege.conqueredAt > 0) return null;
  const a =
    face.attack?.announced && face.attack.sector === sector && face.attack.origin !== null
      ? face.attack
      : null;
  const guards = guardsOf(game, b);
  const forecast = a ? beaconForecast(game, target.id, sector, a.origin!, now) : null;
  const cost = fortifyCost(game);
  const lock = fortifyLock(game, target.id, sector);
  const afford = canAfford(game.resources, cost.resources) && meteorIronOf(game) >= cost.iron;
  const orders = b.orders;
  return (
    <section class="field beacon-defense">
      <h4>{t('beacons.defense')}</h4>
      {a && (
        <p class="small warn">
          {t('beacons.attackHere', {
            origin: sectorName(t, a.origin!),
            duration: formatDuration(lang, Math.max(0, a.at - now)),
          })}
        </p>
      )}
      {forecast &&
        (forecast.bare ? (
          <p class="small warn">{t('beacons.bare')}</p>
        ) : (
          <p class="small">
            <span class={`odds odds-${forecast.odds}`}>{t(`beacons.odds.${forecast.odds}`)}</span>{' '}
            {t('beacons.trials', {
              held: forecast.trials.filter(Boolean).length,
              power: formatNumber(lang, Math.round((forecast.power.min + forecast.power.max) / 2)),
            })}
            {forecast.expectedDead > 0 && (
              <span class="warn"> {t('beacons.dead', { count: forecast.expectedDead })}</span>
            )}
            {forecast.expectedHurt > 0 && (
              <span class="muted"> {t('beacons.hurt', { count: forecast.expectedHurt })}</span>
            )}
          </p>
        ))}
      <p class="small">
        {guards.length > 0
          ? t('beacons.guards', {
              count: guards.length,
              names: guards.map((v) => v.name).join(', '),
            })
          : t('beacons.noGuard')}
      </p>
      {guards.length > 0 && orders && (
        <p class="small muted">
          {t('beacons.orders', {
            posture: t(`landing.posture.${orders.posture}`),
            pct: Math.round(orders.retreatAt * 100),
          })}
        </p>
      )}
      <p class="small">
        {b.fortifying
          ? t('beacons.fortifying', {
              duration: formatDuration(lang, Math.max(0, b.fortifying.until - now)),
            })
          : b.fort
            ? t('beacons.fortified', { level: b.fort })
            : t('beacons.unfortified')}
      </p>
      {!props.planning && (
        <>
          <div class="row beacon-actions">
            <button
              class="btn btn-small"
              disabled={lock !== null || !afford}
              onClick={() =>
                actions.dispatch({ type: 'fortifyBeacon', targetId: target.id, sector })
              }
            >
              {t(b.fort ? 'beacons.reinforce' : 'beacons.fortify')}
            </button>
            <button
              class="btn btn-small"
              disabled={guards.length >= BEACONS.maxGuards}
              onClick={() => actions.planSiege({ mission: 'guard', targetId: target.id, sector })}
            >
              {t('beacons.sendGuard')}
            </button>
            {guards.length > 0 && (
              <button
                class="btn btn-small"
                onClick={() =>
                  actions.planSiege({
                    mission: 'guard',
                    targetId: target.id,
                    sector,
                    bringBack: guards.map((v) => v.id),
                  })
                }
              >
                {t('beacons.bringHome')}
              </button>
            )}
          </div>
          {lock === null && (
            <p class="small muted beacon-cost">
              {t('beacons.fortifyCost', {
                hours: Math.round(BEACONS.fortify.durationMs / 3_600_000),
              })}{' '}
              <Cost
                cost={cost.resources}
                have={game.resources}
                iron={cost.iron}
                haveIron={meteorIronOf(game)}
              />
            </p>
          )}
          {lock && lock !== 'noBeacon' && lock !== 'notASector' && (
            <p class="small muted">{t(`errors.${lock}`)}</p>
          )}
        </>
      )}
      <p class="small muted">{t('beacons.hint')}</p>
    </section>
  );
}

function ReportLine({ r }: { r: BeaconReport }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const [open, setOpen] = useState(false);
  const ago = formatDuration(lang, Math.max(0, now - r.at));
  return (
    <li class={`beacon-report ${r.held ? 'is-held' : 'is-fallen'}`}>
      <p class="small">
        <strong>{sectorName(t, r.sector)}</strong> ·{' '}
        {t(
          r.held ? 'beacons.report.held' : r.fought ? 'beacons.report.fell' : 'beacons.report.bare',
          {
            ago,
            origin: sectorName(t, r.origin),
          },
        )}
      </p>
      {r.dead.length > 0 && (
        <p class="small warn">{t('beacons.report.dead', { names: r.dead.join(', ') })}</p>
      )}
      {(r.hurt ?? []).length > 0 && (
        <p class="small">{t('beacons.report.hurt', { names: r.hurt!.join(', ') })}</p>
      )}
      {r.back > 0 && <p class="small muted">{t('beacons.report.back', { count: r.back })}</p>}
      {r.log && (
        <button class="btn btn-small" onClick={() => setOpen(!open)}>
          {t(open ? 'beacons.report.hide' : 'beacons.report.watch')}
        </button>
      )}
      {open && r.log && <LandingReplay log={r.log} ours={0} />}
    </li>
  );
}

/** The last attacks on a face's beacons, newest first. */
export function BeaconReports({ game, target }: { game: GameState; target: ExpeditionTarget }) {
  const t = useT();
  const reports = [...(faceViewOf(game, target.id).reports ?? [])].reverse();
  if (reports.length === 0) return null;
  return (
    <section class="field">
      <h3>{t('beacons.report.title')}</h3>
      <ul class="beacon-reports">
        {reports.map((r) => (
          <ReportLine key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

/** The ferret queen: hidden in the depths, then out, her power and wounds, the final battle. */
export function QueenPanel(props: {
  game: GameState;
  target: ExpeditionTarget;
  planning?: boolean;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const { game, target } = props;
  const face = faceViewOf(game, target.id);
  const q = queenOf(game, target.id);
  if (game.siege.conqueredAt > 0) return null;
  if (!q) {
    // Chantier 47: she never comes out before her public date, and needs the 12 beacons then.
    const from = queenFrom(game);
    const all = face.beacons.length >= INTEL.sectors;
    const days = Math.round(SIEGE.queenFromH / 24);
    const left = formatDuration(lang, Math.max(0, from - now));
    return (
      <section class="field queen-panel is-hidden">
        <h3>{t('queen.title')}</h3>
        {!all && (
          <p class="small">
            {t('queen.hidden', { count: face.beacons.length, total: INTEL.sectors })}
          </p>
        )}
        <div class="queen-progress" aria-hidden="true">
          <span style={{ width: `${(face.beacons.length / INTEL.sectors) * 100}%` }} />
        </div>
        {from > now && all && (
          <p class="small warn queen-countdown">{t('queen.countdown', { duration: left })}</p>
        )}
        {from > now && !all && (
          <p class="small muted">{t('queen.digging', { days, duration: left })}</p>
        )}
        {from <= now && <p class="small muted">{all ? t('queen.rising') : t('queen.dateGone')}</p>}
      </section>
    );
  }
  const wounds = queenWounds(q, now);
  const flying = game.expeditions.some(
    (e) => e.mission === 'final' && e.status === 'outbound' && e.targetId === target.id,
  );
  const F = SIEGE.final;
  return (
    <section class="field queen-panel is-out">
      <h3>{t('queen.title')}</h3>
      <p class="small warn">
        {t('queen.out', {
          name: sectorName(t, q.sector),
          ago: formatDuration(lang, Math.max(0, now - q.since)),
        })}
      </p>
      <p class="small">
        {t('queen.power', {
          ground: formatNumber(lang, Math.round(q.ground)),
          air: formatNumber(lang, Math.round(q.air)),
        })}
      </p>
      {wounds > 0.005 && (
        <p class="small bonus">{t('queen.wounds', { pct: Math.round(wounds * 100) })}</p>
      )}
      <ol class="small queen-phases">
        <li>{t('queen.phases.charge')}</li>
        <li>{t('queen.phases.swarm', { pct: Math.round(F.swarm.below * 100) })}</li>
        <li>{t('queen.phases.tunnels', { pct: Math.round(F.tunnels.below * 100) })}</li>
        <li>{t('queen.phases.rage', { pct: Math.round(F.rage.below * 100) })}</li>
      </ol>
      {!props.planning &&
        (flying ? (
          <p class="small">{t('queen.flying')}</p>
        ) : (
          <button
            class="btn btn-primary"
            onClick={() => actions.planSiege({ mission: 'final', targetId: target.id })}
          >
            {t('queen.prepare')}
          </button>
        ))}
      <p class="small muted">{t('queen.hint')}</p>
    </section>
  );
}
