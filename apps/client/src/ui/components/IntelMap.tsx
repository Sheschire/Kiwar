import { useMemo } from 'preact/hooks';
import { Color } from 'three';
import {
  generateFace,
  hexToPixel,
  landTileNear,
  sectorOf,
  targetFaceParams,
  type ExpeditionTarget,
  type FaceMap,
  type GameState,
  type IntelReport,
  type UniverseInfo,
} from '@kiwar/shared';
import { tileTopColor } from '../../render/terrain';
import { useT, useUi } from '../store';

const maps = new Map<string, FaceMap>();

/** The map of a target face, from public seeds only (memoized). */
export function targetFaceMap(
  game: GameState,
  target: ExpeditionTarget,
  universe: UniverseInfo | null,
) {
  const where = targetFaceParams(game, target, universe);
  if (!where) return null;
  const key = `${where.seed}/${target.face}/${where.params.biome}/${where.params.radius}`;
  let map = maps.get(key);
  if (!map) {
    map = generateFace(where.seed, target.face, where.params);
    if (maps.size > 8) maps.clear();
    maps.set(key, map);
  }
  return map;
}

const HEX = 'M0,-1L0.866,-0.5L0.866,0.5L0,1L-0.866,0.5L-0.866,-0.5Z';

/**
 * What our scouts saw of an alien face (chantier 07): sectors seen in colour, the rest under the
 * fog, with the dens (ferrets) and roosts (bats) spotted. Drawn only from public data: the map
 * comes from the seed, the rest from the reports.
 */
export function IntelMap(props: {
  game: GameState;
  target: ExpeditionTarget;
  intel: IntelReport | undefined;
  /** Sectors seen for the first time by the latest mission (highlighted). */
  fresh?: readonly number[];
  size?: number;
}) {
  const t = useT();
  const universe = useUi((s) => s.universe);
  const map = targetFaceMap(props.game, props.target, universe);
  const seen = new Set(props.intel?.sectors ?? []);
  const fresh = new Set(props.fresh ?? []);
  const tiles = useMemo(() => {
    if (!map) return [];
    const c = new Color();
    return map.tiles.map((tile) => {
      const p = hexToPixel(tile);
      return {
        x: p.x,
        y: p.y,
        sector: sectorOf(tile.q, tile.r),
        color: `#${tileTopColor(tile, c, map.params.biome).getHexString()}`,
      };
    });
  }, [map]);
  if (!map) return null;
  const extent = Math.max(...tiles.map((x) => Math.hypot(x.x, x.y))) + 1.2;
  const size = props.size ?? 220;
  const marks = (props.intel?.structures ?? []).map((s) => {
    const tile = landTileNear(map, s.q, s.r) ?? s;
    return { kind: s.kind, ...hexToPixel(tile) };
  });
  return (
    <figure class="intel-map">
      <svg
        viewBox={`${-extent} ${-extent} ${2 * extent} ${2 * extent}`}
        width={size}
        height={size}
        role="img"
        aria-label={t('recon.mapLabel', { seen: seen.size, total: 12 })}
      >
        <circle r={extent} class="intel-rim" />
        {tiles.map((tile, i) => (
          <path
            key={i}
            d={HEX}
            transform={`translate(${tile.x} ${tile.y}) scale(0.96)`}
            fill={seen.has(tile.sector) ? tile.color : '#c9c3b8'}
            opacity={seen.has(tile.sector) ? 1 : 0.55}
            class={fresh.has(tile.sector) ? 'intel-fresh' : undefined}
          />
        ))}
        {marks.map((m, i) =>
          m.kind === 'den' ? (
            <g key={i} transform={`translate(${m.x} ${m.y})`} class="intel-den">
              <ellipse rx="1.1" ry="0.8" />
              <ellipse rx="0.45" ry="0.35" cy="0.1" class="intel-hole" />
            </g>
          ) : (
            <g key={i} transform={`translate(${m.x} ${m.y})`} class="intel-roost">
              <path d="M0,-1.3L0.9,0.8L-0.9,0.8Z" />
            </g>
          ),
        )}
      </svg>
      <figcaption class="small muted">
        <span class="intel-key intel-den">●</span> {t('recon.dens')}{' '}
        <span class="intel-key intel-roost">▲</span> {t('recon.roosts')} ·{' '}
        {t('recon.mapLabel', { seen: seen.size, total: 12 })}
      </figcaption>
    </figure>
  );
}
