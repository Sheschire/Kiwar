import { useMemo } from 'preact/hooks';
import { Color } from 'three';
import {
  bridgeheadAt,
  hexToPixel,
  holdersOf,
  INTEL,
  sectorOf,
  siegeView,
  twinTarget,
  type FinalForecast,
  type GameState,
  type IntelRange,
  type MissionKind,
  type VillagerId,
} from '@kiwar/shared';
import { formatNumber, type Lang } from '../../i18n/i18n';
import { tileTopColor } from '../../render/terrain';
import { useT, useUi, type Translate } from '../store';
import { targetFaceMap } from './IntelMap';
import { KiwiPortrait } from './KiwiPortrait';

/** Slice of a sector (0–5), whatever its ring. */
export const sliceOf = (sector: number) => sector % (INTEL.sectors / 2);
export const isOuter = (sector: number) => sector >= INTEL.sectors / 2;

const SLICES = ['bark', 'dew', 'moss', 'twig', 'down', 'seeds'] as const;

/** "Lisière de l'Écorce" / "Cœur de l'Écorce". */
export function sectorName(t: Translate, sector: number): string {
  const name = t(`siege.slices.${SLICES[sliceOf(sector)]!}`);
  return t(isOuter(sector) ? 'siege.outer' : 'siege.inner', { name });
}

export const fmtRange = (lang: Lang, r: IntelRange) => {
  const a = Math.round(r.min * 10) / 10;
  const b = Math.round(r.max * 10) / 10;
  return a === b ? formatNumber(lang, a) : `${formatNumber(lang, a)}–${formatNumber(lang, b)}`;
};

/** Inner ring edge in map units (hex distance 6 lies between 9 and 10.4). */
const INNER = 9.8;

function wedge(slice: number, r0: number, r1: number): string {
  const a0 = (slice * Math.PI) / 3;
  const a1 = ((slice + 1) * Math.PI) / 3;
  const p = (r: number, a: number) =>
    `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return r0 <= 0
    ? `M0,0L${p(r1, a0)}A${r1},${r1} 0 0 1 ${p(r1, a1)}Z`
    : `M${p(r0, a0)}L${p(r1, a0)}A${r1},${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 0 0 ${p(r0, a0)}Z`;
}

const HEX = 'M0,-1L0.866,-0.5L0.866,0.5L0,1L-0.866,0.5L-0.866,-0.5Z';

/**
 * Chantier 19: the twin face cut into its 12 sectors — what the siege knows of each outer hold,
 * the bridgeheads (flags, a shield when fortified), the next counter-attack and the queen's
 * lair once found. Public data only.
 */
export function SiegeMap(props: {
  game: GameState;
  selected?: number | null;
  onSelect?(sector: number): void;
  size?: number;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const universe = useUi((s) => s.universe);
  const twin = twinTarget(props.game);
  const map = twin ? targetFaceMap(props.game, twin, universe) : null;
  const intel = twin ? props.game.intel[twin.id] : undefined;
  const seen = new Set(intel?.sectors ?? []);
  const tiles = useMemo(() => {
    if (!map) return [];
    const c = new Color();
    return map.tiles.map((tile) => ({
      ...hexToPixel(tile),
      sector: sectorOf(tile.q, tile.r),
      color: `#${tileTopColor(tile, c, map.params.biome).getHexString()}`,
    }));
  }, [map]);
  if (!map || !twin) return null;
  const view = siegeView(props.game, now);
  const extent = Math.max(...tiles.map((x) => Math.hypot(x.x, x.y))) + 1.2;
  const size = props.size ?? 220;
  const conquered = props.game.siege.conqueredAt > 0;
  const counter = props.game.siege.counter;
  const mid = (slice: number) => ((slice + 0.5) * Math.PI) / 3;
  const at = (r: number, slice: number) => ({
    x: r * Math.cos(mid(slice)),
    y: r * Math.sin(mid(slice)),
  });
  const outerR = (INNER + extent) / 2;
  return (
    <figure class="intel-map siege-map">
      <svg
        viewBox={`${-extent} ${-extent} ${2 * extent} ${2 * extent}`}
        width={size}
        height={size}
        role="img"
        aria-label={t('siege.mapLabel')}
      >
        <circle r={extent} class="intel-rim" />
        {tiles.map((tile, i) => (
          <path
            key={i}
            d={HEX}
            transform={`translate(${tile.x} ${tile.y}) scale(0.96)`}
            fill={conquered || seen.has(tile.sector) ? tile.color : '#c9c3b8'}
            opacity={conquered || seen.has(tile.sector) ? 1 : 0.55}
          />
        ))}
        {Array.from({ length: INTEL.sectors }, (_, sector) => {
          const outer = isOuter(sector);
          const slice = sliceOf(sector);
          const head = bridgeheadAt(props.game, sector);
          const cls = [
            'siege-wedge',
            outer ? 'is-outer' : 'is-inner',
            head ? 'is-held' : '',
            counter?.sector === sector ? 'is-threatened' : '',
            props.selected === sector ? 'is-selected' : '',
            props.onSelect && outer ? 'is-clickable' : '',
          ].join(' ');
          return (
            <path
              key={sector}
              d={outer ? wedge(slice, INNER, extent - 0.2) : wedge(slice, 0, INNER)}
              class={cls}
              onClick={props.onSelect && outer ? () => props.onSelect!(sector) : undefined}
            >
              <title>{sectorName(t, sector)}</title>
            </path>
          );
        })}
        {!conquered &&
          SIEGE_OUTER.map((sector) => {
            const p = at(outerR, sliceOf(sector));
            const head = bridgeheadAt(props.game, sector);
            const hold = view.holds[sector];
            return (
              <g key={sector} transform={`translate(${p.x} ${p.y})`} class="siege-mark">
                {head ? (
                  <g class={`siege-flag ${head.fortified ? 'is-fortified' : ''}`}>
                    <path d="M-0.2,1.6L-0.2,-1.8" class="siege-pole" />
                    <path d="M-0.2,-1.8L1.8,-1.1L-0.2,-0.4Z" />
                    {head.fortified && <circle cx="-0.2" cy="1.6" r="0.9" class="siege-shield" />}
                  </g>
                ) : (
                  <text class="siege-hold" text-anchor="middle" dominant-baseline="central">
                    {hold ? fmtRange(lang, hold) : '?'}
                  </text>
                )}
              </g>
            );
          })}
        {view.queen && !conquered && (
          <g
            transform={`translate(${at(INNER * 0.55, sliceOf(view.queen.sector)).x} ${at(INNER * 0.55, sliceOf(view.queen.sector)).y})`}
            class="siege-queen"
          >
            <path d="M-1.6,0.9L-1.6,-0.9L-0.8,0L0,-1.3L0.8,0L1.6,-0.9L1.6,0.9Z" />
          </g>
        )}
      </svg>
      <figcaption class="small muted">
        <span class="siege-key siege-key-flag">⚑</span> {t('siege.keyHead')}{' '}
        <span class="siege-key siege-key-queen">♛</span> {t('siege.keyQueen')}
        <br />
        {t('siege.keyHold')}
      </figcaption>
    </figure>
  );
}

const SIEGE_OUTER = Array.from({ length: INTEL.sectors / 2 }, (_, i) => i + INTEL.sectors / 2);

/** The mission chosen on the Siege screen, above the planner. */
export function SiegeHeader(props: { game: GameState; mission: MissionKind; sector?: number }) {
  const t = useT();
  return (
    <section class="field siege-header">
      <h3>
        {t(`siege.missions.${props.mission as 'recon' | 'assault' | 'reinforce' | 'final'}`)}
        {props.sector !== undefined && ` · ${sectorName(t, props.sector)}`}
      </h3>
      <p class="small muted">
        {t(props.mission === 'recon' ? 'siege.deepHint' : `recon.hints.${props.mission}`)}
      </p>
    </section>
  );
}

/** Assault: who of the crew stays on the bridgehead if it is taken. */
export function HoldersPicker(props: {
  game: GameState;
  crew: VillagerId[];
  chosen: VillagerId[];
  onChange(ids: VillagerId[]): void;
}) {
  const t = useT();
  const kiwis = props.crew
    .map((id) => props.game.villagers.find((v) => v.id === id))
    .filter((v) => !!v);
  const on = new Set(props.chosen.filter((id) => props.crew.includes(id)));
  return (
    <section class="field">
      <div class="title-row">
        <h3>{t('siege.holders')}</h3>
        <span class="stepper-value">{on.size}</span>
      </div>
      <p class="small muted">{t('siege.holdersHint')}</p>
      <div class="chip-picks">
        {kiwis.map((v) => (
          <label key={v.id} class={`chip-pick ${on.has(v.id) ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on.has(v.id)}
              onChange={() =>
                props.onChange(on.has(v.id) ? [...on].filter((id) => id !== v.id) : [...on, v.id])
              }
            />
            <KiwiPortrait
              shiny={v.shiny}
              classId={v.classId}
              titan={!!v.kikiwiwi}
              seed={v.id}
              size={24}
            />
            {v.name}
          </label>
        ))}
      </div>
      {on.size === 0 && <p class="small warn">{t('errors.invalidHolders')}</p>}
    </section>
  );
}

/** Reinforcement: posted kiwis the ship brings home. */
export function BringBackPicker(props: {
  game: GameState;
  sector: number;
  chosen: VillagerId[];
  onChange(ids: VillagerId[]): void;
}) {
  const t = useT();
  const b = bridgeheadAt(props.game, props.sector);
  if (!b) return <p class="small warn">{t('errors.noBridgehead')}</p>;
  const on = new Set(props.chosen);
  const holders = holdersOf(props.game, b);
  return (
    <section class="field">
      <div class="title-row">
        <h3>{t('siege.bringBack')}</h3>
        <span class="stepper-value">
          {on.size} / {holders.length}
        </span>
      </div>
      <p class="small muted">{t('siege.bringBackHint')}</p>
      <div class="chip-picks">
        {holders.map((v) => (
          <label key={v.id} class={`chip-pick ${on.has(v.id) ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on.has(v.id)}
              onChange={() =>
                props.onChange(
                  on.has(v.id) ? props.chosen.filter((id) => id !== v.id) : [...props.chosen, v.id],
                )
              }
            />
            <KiwiPortrait
              shiny={v.shiny}
              classId={v.classId}
              titan={!!v.kikiwiwi}
              seed={v.id}
              size={24}
            />
            {v.name}
          </label>
        ))}
      </div>
      {on.size === holders.length && holders.length > 0 && (
        <p class="small warn">{t('siege.abandonWarn')}</p>
      )}
    </section>
  );
}

/** Final assault: both sides against the queen's estimate. */
export function FinalLines({ forecast }: { forecast: FinalForecast }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const q = forecast.queen;
  return (
    <>
      <p class="small">
        {t('siege.sideGround', {
          strength: fmtRange(lang, forecast.strength.ground),
          queen: q ? fmtRange(lang, q.ground) : '?',
        })}
      </p>
      <p class="small">
        {t('siege.sideAir', {
          strength: fmtRange(lang, forecast.strength.air),
          queen: q ? fmtRange(lang, q.air) : '?',
        })}
      </p>
      <p class="small muted">
        {t('siege.weakened', { pct: Math.round(forecast.reduction * 100) })}
      </p>
    </>
  );
}
