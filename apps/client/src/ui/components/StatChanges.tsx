import type { LevelStat, LevelStatId, StatChange, TechChange, TechStatId } from '@kiwar/shared';
import { formatNumber, type Lang } from '../../i18n/i18n';
import { ResourceIcon } from '../icons';
import { Icon, type IconName } from '../iconSet';
import { useT, useUi, type Translate } from '../store';

/** Chantier 11: what a level or a technology brings, from `describeLevel` / `describeTech`. */

const LEVEL_ICONS: Record<LevelStatId, IconName> = {
  production: 'harvest',
  passive: 'harvest',
  workers: 'workers',
  housing: 'housing',
  storage: 'storage',
  defenseGround: 'defenseGround',
  defenseAir: 'defenseAir',
  ammo: 'ammo',
  cargo: 'cargo',
  travelTime: 'speed',
  trainingSlots: 'training',
  trainingTime: 'time',
  research: 'research',
  maxBuildings: 'limit',
  queueSize: 'queue',
};

const TECH_ICONS: Record<TechStatId, IconName> = {
  harvest: 'harvest',
  storage: 'storage',
  turretDefense: 'seedTurret',
  guard: 'guard',
  travel: 'speed',
  rations: 'rations',
  build: 'queue',
  injuries: 'injuries',
  armor: 'armor',
  recon: 'recon',
  firearms: 'firearms',
  laboratory: 'lab',
  terraform: 'terraform',
  kikiwiwiPower: 'titan',
  kikiwiwiUpkeep: 'juice',
  infusionRisk: 'risk',
};

/** Smaller is better for these (durations, costs, harm). */
const LOWER_IS_BETTER = new Set<string>([
  'travelTime',
  'trainingTime',
  'travel',
  'rations',
  'build',
  'injuries',
  'kikiwiwiUpkeep',
]);

function StatIcon({ stat, resource }: Pick<LevelStat, 'stat' | 'resource'>) {
  return resource ? (
    <ResourceIcon id={resource} size={15} />
  ) : (
    <Icon name={LEVEL_ICONS[stat]} size={15} />
  );
}

export function formatLevelStat(lang: Lang, t: Translate, stat: LevelStatId, value: number) {
  const v = formatNumber(lang, Math.round(value * 100) / 100);
  if (stat === 'production' || stat === 'passive') return t('levelStats.perHour', { value: v });
  if (stat === 'travelTime' || stat === 'trainingTime') return t('levelStats.times', { value: v });
  return v;
}

/** Compact chips: the numbers of one level (build menu, building tree). */
export function LevelStats({ stats }: { stats: LevelStat[] }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  if (stats.length === 0) return null;
  return (
    <span class="level-stats">
      {stats.map((s) => (
        <span
          key={`${s.stat}${s.resource ?? ''}`}
          class="cost-item"
          title={t(`levelStats.${s.stat}`)}
        >
          <StatIcon stat={s.stat} resource={s.resource} />
          {formatLevelStat(lang, t, s.stat, s.value)}
        </span>
      ))}
    </span>
  );
}

/** "Current → next" table before an upgrade, the gains in green. */
export function UpgradePreview({
  rows,
  from,
  to,
}: {
  rows: StatChange[];
  from: number;
  to: number;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  return (
    <div class="upgrade-preview">
      <p class="small muted">{t('levelStats.next', { from, to })}</p>
      {rows.length === 0 ? (
        <p class="small muted">{t('levelStats.none')}</p>
      ) : (
        <ul class="change-list">
          {rows.map((r) => {
            const better = LOWER_IS_BETTER.has(r.stat) ? r.after < r.before : r.after > r.before;
            return (
              <li key={`${r.stat}${r.resource ?? ''}`} class="change-row">
                <span class="change-label">
                  <StatIcon stat={r.stat} resource={r.resource} /> {t(`levelStats.${r.stat}`)}
                </span>
                <span class="change-values">
                  <span class="muted">{formatLevelStat(lang, t, r.stat, r.before)}</span>
                  <span aria-hidden="true">→</span>
                  <strong class={better ? 'bonus' : r.after === r.before ? '' : 'warn'}>
                    {formatLevelStat(lang, t, r.stat, r.after)}
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function techValue(lang: Lang, c: TechChange, v: number): string {
  const pct = (x: number) => {
    const n = Math.round(x * 100);
    return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(lang, Math.abs(n))} %`;
  };
  if (c.kind === 'multiplier') return pct(v - 1);
  // Infusion risk: points removed from the risk.
  return c.stat === 'infusionRisk' ? pct(-v) : pct(v);
}

/** A technology's effect on this colony, before → after. */
export function TechChanges({ rows }: { rows: TechChange[] }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  if (rows.length === 0) return <p class="small muted">{t('techStats.nothing')}</p>;
  return (
    <ul class="change-list">
      {rows.map((r) => (
        <li key={`${r.stat}${r.resource ?? ''}`} class="change-row">
          <span class="change-label">
            {r.resource ? (
              <ResourceIcon id={r.resource} size={15} />
            ) : (
              <Icon name={TECH_ICONS[r.stat]} size={15} />
            )}{' '}
            {t(`techStats.${r.stat}`)}
          </span>
          {r.kind === 'unlock' ? (
            <strong class="bonus">✔ {t('techStats.unlock')}</strong>
          ) : (
            <span class="change-values">
              <span class="muted">{techValue(lang, r, r.before)}</span>
              <span aria-hidden="true">→</span>
              <strong class="bonus">{techValue(lang, r, r.after)}</strong>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
