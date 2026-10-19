import { KIWI, STAT_IDS, type StatId, type Stats } from '@kiwar/shared';
import { useT } from '../store';

/** Six-axis radar of a kiwi's stats; with points to place, each axis gets a + button. */
export function StatRadar(props: { stats: Stats; onAdd?: (stat: StatId) => void }) {
  const t = useT();
  const max = Math.max(KIWI.stat.max, ...STAT_IDS.map((id) => props.stats[id]));
  const c = 80;
  const r = 54;
  const point = (i: number, value: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / STAT_IDS.length;
    const k = (value / max) * r;
    return [c + Math.cos(a) * k, c + Math.sin(a) * k] as const;
  };
  const ring = (f: number) => STAT_IDS.map((_, i) => point(i, max * f).join(',')).join(' ');
  const shape = STAT_IDS.map((id, i) => point(i, props.stats[id]).join(',')).join(' ');
  return (
    <div class="stat-radar">
      <svg viewBox="0 0 160 160" role="img" aria-label={t('kiwi.stats')}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={ring(f)} class="radar-ring" />
        ))}
        {STAT_IDS.map((id, i) => {
          const [x, y] = point(i, max);
          return <line key={id} x1={c} y1={c} x2={x} y2={y} class="radar-axis" />;
        })}
        <polygon points={shape} class="radar-shape" />
        {STAT_IDS.map((id, i) => {
          const [x, y] = point(i, max * 1.24);
          return (
            <text
              key={id}
              x={x}
              y={y}
              class="radar-label"
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {t(`statsShort.${id}`)}
            </text>
          );
        })}
      </svg>
      <ul class="stat-list">
        {STAT_IDS.map((id) => (
          <li key={id} title={t(`statsDesc.${id}`)}>
            <span class="stat-name">{t(`stats.${id}`)}</span>
            <span class="stat-value">{props.stats[id]}</span>
            {props.onAdd && props.stats[id] < KIWI.stat.cap && (
              <button
                class="btn btn-small btn-primary stat-add"
                aria-label={t('kiwi.add', { stat: t(`stats.${id}`) })}
                onClick={() => props.onAdd!(id)}
              >
                +
              </button>
            )}
            <span class="stat-desc">{t(`statsDesc.${id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
