import { useState } from 'preact/hooks';
import {
  infusionDuration,
  infusionRisk,
  kikiwiwiCap,
  kikiwiwiCount,
  KIKIWIWI,
  validateCommand,
  type Building,
  type FaceMap,
  type GameState,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { useJobLabel } from './VillageModal';

/**
 * The laboratory against nature (chantier 08): who is in the vat, or the kiwis that could go
 * (level, risk of failure), the cost and the button.
 */
export function LabInfo(props: { game: GameState; map: FaceMap; b: Building; now: number }) {
  const { game, map, b, now } = props;
  const t: Translate = useT();
  const lang = useUi((s) => s.lang);
  const jobLabel = useJobLabel();
  const [picked, setPicked] = useState<VillagerId | null>(null);
  const inVat = game.villagers.find((v) => v.job.kind === 'transform' && v.job.labId === b.id);
  const cap = kikiwiwiCap(game);
  const capLine = <p class="small muted">{t('lab.cap', { count: kikiwiwiCount(game), cap })}</p>;
  if (inVat && inVat.job.kind === 'transform') {
    const job = inVat.job;
    const total = infusionDuration(b);
    const progress = Math.min(1, Math.max(0, 1 - (job.until - now) / Math.max(1, total)));
    return (
      <div class="section lab-section">
        <h3>{t('lab.title')}</h3>
        <p class="small">
          {t('lab.inVat', { name: inVat.name })} ·{' '}
          {formatDuration(lang, Math.max(0, job.until - now))}
        </p>
        <div class="xp-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p class={`small ${job.risk > 0.3 ? 'warn' : 'muted'}`}>
          {t('lab.riskValue', { pct: Math.round(job.risk * 100) })}
        </p>
        {capLine}
      </div>
    );
  }
  const candidates = game.villagers
    .filter(
      (v) =>
        !v.kikiwiwi &&
        v.level >= KIKIWIWI.minLevel &&
        (v.job.kind === 'idle' || v.job.kind === 'work'),
    )
    .map((v) => ({ v, risk: infusionRisk(game, v, b) }))
    .sort((a, c) => a.risk - c.risk || c.v.level - a.v.level);
  const chosen = candidates.find((c) => c.v.id === picked) ?? candidates[0];
  const cmd = chosen
    ? ({ type: 'transform', villagerId: chosen.v.id, labId: b.id } as const)
    : null;
  const error = cmd ? validateCommand(game, cmd, { now, map }) : null;
  return (
    <div class="section lab-section">
      <h3>{t('lab.title')}</h3>
      {capLine}
      {candidates.length === 0 ? (
        <p class="small muted">{t('lab.none', { level: KIKIWIWI.minLevel })}</p>
      ) : (
        <>
          <p class="small muted">{t('lab.pick')}</p>
          <ul class="crew-list lab-list">
            {candidates.slice(0, 8).map(({ v, risk }) => (
              <li key={v.id}>
                <label class={`crew-row ${chosen?.v.id === v.id ? 'is-on' : ''}`}>
                  <input
                    type="radio"
                    name="lab-kiwi"
                    checked={chosen?.v.id === v.id}
                    onChange={() => setPicked(v.id)}
                  />
                  <KiwiPortrait
                    shiny={v.shiny}
                    classId={v.classId}
                    titan={!!v.kikiwiwi}
                    seed={v.id}
                    size={30}
                  />
                  <span class="kiwi-row-main">
                    <span class="kiwi-row-name">
                      {v.name}{' '}
                      <span class="small muted">{t('common.levelShort', { level: v.level })}</span>
                    </span>
                    <span class="small muted">{jobLabel(game, v)}</span>
                  </span>
                  <span class={`crew-numbers small ${risk > 0.3 ? 'warn' : ''}`}>
                    {Math.round(risk * 100)} %
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p class="small muted">{t('lab.riskHint')}</p>
        </>
      )}
      <div class="upgrade-box">
        <Cost cost={KIKIWIWI.cost} have={game.resources} durationMs={infusionDuration(b)} />
        <button
          class="btn btn-primary"
          disabled={!cmd || error !== null}
          title={error ? t(`errors.${error}`) : undefined}
          onClick={() => cmd && actions.dispatch(cmd)}
        >
          {t('lab.start')}
        </button>
        {error && <span class="small warn">{t(`errors.${error}`)}</span>}
      </div>
    </div>
  );
}
