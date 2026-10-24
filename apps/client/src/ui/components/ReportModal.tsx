import { otherFace, RESOURCE_IDS, type Expedition } from '@kiwar/shared';
import { uiStore, useT, useUi } from '../store';
import { actions } from '../actions';
import { ShipIcon } from '../icons';
import { watchable } from '../../game/landingWatch';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { targetLabel } from './ExpeditionModal';
import { LandingReplay, sectorName, UnitList } from './LandingParts';

export function ReportModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const id = useUi((s) => s.reportId);
  const e = game?.expeditions.find((x) => x.id === id);
  if (!game || !e?.result) return null;
  const r = e.result;
  const target = game.targets.find((x) => x.id === e.targetId);
  const close = () => uiStore.setState({ modal: 'none', reportId: null });
  const looted = RESOURCE_IDS.some((k) => r.loot[k] > 0);
  // Chantier 19: the settlers stayed on the twin face, alive.
  const founded = e.mission === 'found';
  const landing = e.mission === 'land' && !!r.outcome;
  const injured = (r.injured ?? []).map((id) => e.roster.find((m) => m.id === id)?.name ?? id);
  return (
    <Modal
      title={`${t('expedition.report')} — ${target ? targetLabel(t, target) : ''}`}
      onClose={close}
      footer={
        <button class="btn btn-primary" onClick={close}>
          {t('common.close')}
        </button>
      }
    >
      {r.broken ? (
        <>
          <h2 class="warn">{t('expedition.defeat')}</h2>
          <p class="small warn">{t('ship.reportBroken')}</p>
        </>
      ) : founded ? (
        <>
          <h2 class="bonus">{t('colony.founded', { face: t(`faces.${otherFace(game.face)}`) })}</h2>
          <p class="small">{t('colony.noFight')}</p>
        </>
      ) : landing ? (
        <LandingReport e={e} />
      ) : (
        <h2 class="warn">{t('expedition.defeat')}</h2>
      )}
      {r.lostInBattle.length === 0 &&
        r.lostOnReturn.length === 0 &&
        injured.length === 0 &&
        e.status === 'done' &&
        !r.aborted && <p class="bonus">{t('expedition.noLosses')}</p>}
      {injured.length > 0 && (
        <p class="small warn">{t('expedition.injured', { names: injured.join(', ') })}</p>
      )}
      {r.lostInBattle.length > 0 && (
        <p class="small warn">{t('landing.report.dead', { names: r.lostInBattle.join(', ') })}</p>
      )}
      {r.lostOnReturn.length > 0 && (
        <p class="small warn">
          {t('expedition.lostOnReturn', { names: r.lostOnReturn.join(', ') })}
        </p>
      )}
      <section class="field">
        <h3>{t('expedition.roster')}</h3>
        <ul class="report-roster">
          {e.roster.map((m) => {
            const back = e.crew.includes(m.id);
            const lost = !back && !founded;
            return (
              <li key={m.id} class={lost ? 'is-lost' : ''}>
                <KiwiPortrait shiny={m.shiny ?? null} classId={m.classId} seed={m.id} size={36} />
                <span class="small">
                  <strong>{m.name}</strong>
                  {m.level !== undefined && ` · ${t('common.levelShort', { level: m.level })}`}
                </span>
                <span class={`small ${lost ? 'warn' : 'bonus'}`}>
                  {lost
                    ? t('expedition.lost')
                    : founded
                      ? t('colony.settled')
                      : t('expedition.survived')}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {landing && r.outcome === 'victory' && (
        <p>
          <strong>{t('expedition.loot')}</strong>
          {looted ? <Cost cost={r.loot} /> : t('expedition.nothing')}
        </p>
      )}
      {landing &&
        r.log &&
        (watchable(game, e) ? (
          // Chantier 41: the battle replayed in 3D on the twin, from the ship coming down.
          <p>
            <button
              class="btn btn-primary"
              onClick={() => {
                close();
                actions.watchLanding(e.id, false);
              }}
            >
              <ShipIcon size={16} /> {t('landing.watch.replay')}
            </button>
          </p>
        ) : (
          // A face not drawn in our sky (another kiwi of the universe): the 2D replay.
          <LandingReplay log={r.log} />
        ))}
    </Modal>
  );
}

/** Chantier 40: how a landing ended, what it left on the face and what the crew met. */
function LandingReport({ e }: { e: Expedition }) {
  const t = useT();
  const r = e.result!;
  const sector = sectorName(t, e.sector ?? 0);
  const won = r.outcome === 'victory';
  return (
    <>
      <h2 class={won ? 'bonus' : 'warn'}>{t(`landing.report.${r.outcome!}`, { sector })}</h2>
      {e.delayed && <p class="small muted">{t('landing.report.delayed')}</p>}
      {won && <p class="small bonus">{t('landing.report.beacon')}</p>}
      {won && <p class="small">{t(r.burnt ? 'landing.report.burnt' : 'landing.report.looted')}</p>}
      {won && e.crew.length > 0 && <p class="small">{t('landing.report.veterans')}</p>}
      {r.outcome === 'retreat' && <p class="small">{t('landing.report.glimpse')}</p>}
      {r.outcome === 'defeat' && (
        <>
          <p class="small warn">{t('landing.report.lost')}</p>
          <p class="small warn">{t('landing.report.shipLost')}</p>
        </>
      )}
      {r.seen && r.seen.length > 0 && (
        <section class="field">
          <div class="title-row">
            <h3>{t('landing.report.seen')}</h3>
            <button class="btn btn-small" onClick={() => uiStore.setState({ bestiaryOpen: true })}>
              {t('landing.bestiary.open')}
            </button>
          </div>
          <UnitList units={r.seen} />
        </section>
      )}
    </>
  );
}
