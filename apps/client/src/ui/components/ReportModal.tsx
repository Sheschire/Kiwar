import { RESOURCE_IDS } from '@kiwar/shared';
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
      {recon ? (
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
      {r.lostInBattle.length === 0 && r.lostOnReturn.length === 0 && e.status === 'done' && (
        <p class="bonus">{t('expedition.noLosses')}</p>
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
            const lost = !back;
            return (
              <li key={m.id} class={lost ? 'is-lost' : ''}>
                <KiwiPortrait shiny={m.shiny ?? null} classId={m.classId} seed={m.id} size={36} />
                <span class="small">
                  <strong>{m.name}</strong>
                  {m.level !== undefined && ` · ${t('common.levelShort', { level: m.level })}`}
                </span>
                <span class={`small ${lost ? 'warn' : 'bonus'}`}>
                  {lost ? t('expedition.lost') : t('expedition.survived')}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {!recon && (
        <p>
          <strong>{t('expedition.loot')}</strong>
          {looted ? <Cost cost={r.loot} /> : t('expedition.nothing')}
        </p>
      )}
    </Modal>
  );
}
