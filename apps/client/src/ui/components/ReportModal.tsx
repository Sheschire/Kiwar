import { isSiegeMission, otherFace, RESOURCE_IDS, type Expedition } from '@kiwar/shared';
import { fmtRange, sectorName } from './SiegeParts';
import { uiStore, useT, useUi } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { EnemyLine, targetLabel } from './ExpeditionModal';
import { IntelMap } from './IntelMap';
import { formatNumber } from '../../i18n/i18n';

export function ReportModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const id = useUi((s) => s.reportId);
  const e = game?.expeditions.find((x) => x.id === id);
  if (!game || !e?.result) return null;
  const r = e.result;
  const target = game.targets.find((x) => x.id === e.targetId);
  const close = () => uiStore.setState({ modal: 'none', reportId: null });
  const looted = RESOURCE_IDS.some((k) => r.loot[k] > 0);
  const recon = e.mission === 'recon';
  const siege = isSiegeMission(e.mission);
  // Chantier 19: the settlers stayed on the twin face, alive.
  const founded = e.mission === 'found';
  const intel = game.intel[e.targetId];
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
      ) : siege ? (
        <SiegeReport e={e} />
      ) : recon ? (
        <>
          <h2>{t('recon.reportTitle')}</h2>
          <p class="small">
            {t('recon.reportSeen', {
              count: r.sectors?.length ?? 0,
              defense: intel
                ? intel.defense.min === intel.defense.max
                  ? formatNumber(lang, intel.defense.min)
                  : `${formatNumber(lang, intel.defense.min)}–${formatNumber(lang, intel.defense.max)}`
                : '?',
            })}
          </p>
          <p class={`small ${r.spotted ? 'warn' : 'bonus'}`}>
            {r.spotted ? t('recon.reportSpotted') : t('recon.reportQuiet')}
          </p>
          {injured.length > 0 && (
            <p class="small warn">{t('recon.injured', { names: injured.join(', ') })}</p>
          )}
          {target && (
            <>
              <IntelMap game={game} target={target} intel={intel} fresh={r.sectors} />
              <EnemyLine game={game} targetId={target.id} />
            </>
          )}
        </>
      ) : (
        <>
          <h2 class={r.victory ? 'bonus' : 'warn'}>
            {r.victory ? t('expedition.victory') : t('expedition.defeat')}
          </h2>
          <p class="small">
            {t('expedition.reportBody', {
              strength: r.strength,
              defense: r.defense,
              fed: Math.round(r.fed * 100),
            })}
          </p>
        </>
      )}
      {r.lostInBattle.length === 0 &&
        r.lostOnReturn.length === 0 &&
        injured.length === 0 &&
        e.status === 'done' && <p class="bonus">{t('expedition.noLosses')}</p>}
      {!recon && injured.length > 0 && (
        <p class="small warn">{t('expedition.injured', { names: injured.join(', ') })}</p>
      )}
      {r.lostInBattle.length > 0 && (
        <p class="small">{t('expedition.lostInBattle', { names: r.lostInBattle.join(', ') })}</p>
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
            // Chantier 19: kiwis who stayed on a bridgehead are alive.
            const stayed =
              !back && ((siege && game.villagers.some((v) => v.id === m.id)) || founded);
            const lost = !back && !stayed;
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
                    : stayed
                      ? t(founded ? 'colony.settled' : 'siege.report.stayed')
                      : t('expedition.survived')}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {!recon && !siege && !founded && !r.broken && (
        <p>
          <strong>{t('expedition.loot')}</strong>
          {looted ? <Cost cost={r.loot} /> : t('expedition.nothing')}
        </p>
      )}
    </Modal>
  );
}

/** Chantier 19: what an assault, a reinforcement, the final assault or a retreat came to. */
function SiegeReport({ e }: { e: Expedition }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const r = e.result!;
  const where = e.sector !== undefined ? sectorName(t, e.sector) : '';
  const fmt = (v: number) => formatNumber(lang, Math.round(v * 10) / 10);
  if (e.mission === 'retreat')
    return (
      <>
        <h2 class="warn">{t('siege.report.retreat')}</h2>
        <p class="small">{t('siege.report.retreatBody', { sector: where })}</p>
      </>
    );
  if (e.mission === 'reinforce')
    return (
      <>
        <h2>{t(r.aborted ? 'siege.report.reinforceLate' : 'siege.report.reinforced')}</h2>
        <p class="small">
          {t(r.aborted ? 'siege.report.reinforceLateBody' : 'siege.report.reinforcedBody', {
            sector: where,
          })}
        </p>
      </>
    );
  if (e.mission === 'final')
    return (
      <>
        <h2 class={r.victory ? 'bonus' : 'warn'}>
          {t(r.victory ? 'siege.report.queenFell' : 'siege.report.queenHeld')}
        </h2>
        {r.sides && (
          <>
            <p class="small">
              {t('siege.sideGround', {
                strength: fmt(r.sides.strength.ground),
                queen: fmt(r.sides.queen.ground),
              })}
            </p>
            <p class="small">
              {t('siege.sideAir', {
                strength: fmt(r.sides.strength.air),
                queen: fmt(r.sides.queen.air),
              })}
            </p>
          </>
        )}
        {r.victory && <p class="small bonus">{t('siege.conqueredBody')}</p>}
      </>
    );
  return (
    <>
      <h2 class={r.victory ? 'bonus' : 'warn'}>
        {t(
          r.bridgehead
            ? 'siege.report.taken'
            : r.victory
              ? 'expedition.victory'
              : 'siege.report.repelled',
          {
            sector: where,
          },
        )}
      </h2>
      <p class="small">
        {t('siege.report.fight', {
          strength: fmt(r.strength),
          defense: fmtRange(lang, { min: r.defense, max: r.defense }),
        })}
      </p>
      {r.bridgehead && (
        <p class="small">
          {t('siege.report.holding', {
            count: (e.holders ?? []).filter((id) => !e.crew.includes(id)).length,
          })}
        </p>
      )}
    </>
  );
}
