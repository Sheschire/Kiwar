import { useEffect, useMemo, useState } from 'preact/hooks';
import { Color } from 'three';
import {
  AGE_IDS,
  ENEMIES,
  faceViewOf,
  hexToPixel,
  INTEL,
  kiwiWeapon,
  landTileNear,
  LANDING,
  LANDING_GOALS,
  LANDING_PRIORITIES,
  POSTURES,
  sectorOf,
  viewFreshness,
  WEAPONS,
  type AlienBuilding,
  type AlienUnit,
  type BattleLog,
  type ExpeditionTarget,
  type GameState,
  type IntelRange,
  type LandingForecast,
  type LandingOrders,
  type ParcelView,
  type Villager,
} from '@kiwar/shared';
import { formatDuration, formatNumber, type Lang, type TKey } from '../../i18n/i18n';
import { tileTopColor } from '../../render/terrain';
import { buildTimeline, hpAt, placeAt, shownAt } from '../../render/battle/timeline';
import { useT, useUi, type Translate } from '../store';
import { targetFaceMap } from './IntelMap';
import { BeaconDefense } from './BeaconParts';

/**
 * Chantier 40: the landing screen's pieces. The 12 parcels of an alien face (beacons, glimpses,
 * edges, fog), the sheet of a parcel, the orders, the honest forecast, the bestiary and the
 * 2D replay of a landing's battle. Public data only.
 */

/** Slice of a parcel (0–5), whatever its ring. */
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
const HEX = 'M0,-1L0.866,-0.5L0.866,0.5L0,1L-0.866,0.5L-0.866,-0.5Z';

function wedge(slice: number, r0: number, r1: number): string {
  const a0 = (slice * Math.PI) / 3;
  const a1 = ((slice + 1) * Math.PI) / 3;
  const p = (r: number, a: number) =>
    `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return r0 <= 0
    ? `M0,0L${p(r1, a0)}A${r1},${r1} 0 0 1 ${p(r1, a1)}Z`
    : `M${p(r0, a0)}L${p(r1, a0)}A${r1},${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 0 0 ${p(r0, a0)}Z`;
}

/** How a parcel shows on the map. */
function lookOf(view: ParcelView | null, beacon: boolean): 'beacon' | 'seen' | 'edge' | 'unseen' {
  if (beacon) return 'beacon';
  if (!view) return 'unseen';
  return view.source === 'edge' ? 'edge' : 'seen';
}

const BUILDING_GLYPHS: Record<AlienBuilding['kind'], string> = {
  burrow: '●',
  roost: '▲',
  workshop: '■',
  totem: '◆',
  barracks: '⚔',
  store: '▣',
  royal: '♛',
};

/**
 * The 12 parcels of an alien face: the colours of the land where we have eyes (bright under a
 * beacon, a little faded for a glimpse, more for an edge), the fog elsewhere; the buildings
 * seen, the beacons' flags, the landings in flight. Tap a parcel to pick it.
 */
export function LandingMap(props: {
  game: GameState;
  target: ExpeditionTarget;
  selected?: number | null;
  onSelect?(sector: number): void;
  size?: number;
}) {
  const t = useT();
  const universe = useUi((s) => s.universe);
  const map = targetFaceMap(props.game, props.target, universe);
  const face = faceViewOf(props.game, props.target.id);
  const lit = new Set(face.beacons.map((b) => b.sector));
  const tiles = useMemo(() => {
    if (!map) return [];
    const c = new Color();
    return map.tiles.map((tile) => ({
      ...hexToPixel(tile),
      sector: sectorOf(tile.q, tile.r),
      color: `#${tileTopColor(tile, c, map.params.biome).getHexString()}`,
    }));
  }, [map]);
  if (!map) return null;
  const extent = Math.max(...tiles.map((x) => Math.hypot(x.x, x.y))) + 1.2;
  const size = props.size ?? 240;
  const looks = Array.from({ length: INTEL.sectors }, (_, s) =>
    lookOf(face.parcels[String(s)] ?? null, lit.has(s)),
  );
  const opacity = { beacon: 1, seen: 0.85, edge: 0.6, unseen: 0.5 };
  const flying = new Set(
    props.game.expeditions
      .filter(
        (e) => e.mission === 'land' && e.status === 'outbound' && e.targetId === props.target.id,
      )
      .map((e) => e.sector),
  );
  const mid = (slice: number) => ((slice + 0.5) * Math.PI) / 3;
  const at = (sector: number) => {
    const r = isOuter(sector) ? (INNER + extent) / 2 : INNER / 2;
    return { x: r * Math.cos(mid(sliceOf(sector))), y: r * Math.sin(mid(sliceOf(sector))) };
  };
  const marks = Object.values(face.parcels).flatMap((v) =>
    v.buildings.map((b) => ({ kind: b.kind, ...hexToPixel(landTileNear(map, b.q, b.r) ?? b) })),
  );
  const seen = Object.keys(face.parcels).length;
  return (
    <figure class="intel-map landing-map">
      <svg
        viewBox={`${-extent} ${-extent} ${2 * extent} ${2 * extent}`}
        width={size}
        height={size}
        role="img"
        aria-label={t('landing.mapLabel', { beacons: lit.size, seen })}
      >
        <circle r={extent} class="intel-rim" />
        {tiles.map((tile, i) => {
          const look = looks[tile.sector]!;
          return (
            <path
              key={i}
              d={HEX}
              transform={`translate(${tile.x} ${tile.y}) scale(0.96)`}
              fill={look === 'unseen' ? '#c9c3b8' : tile.color}
              opacity={opacity[look]}
            />
          );
        })}
        {marks.map((m, i) => (
          <text key={i} x={m.x} y={m.y} class={`landing-mark mark-${m.kind}`}>
            {BUILDING_GLYPHS[m.kind]}
          </text>
        ))}
        {Array.from({ length: INTEL.sectors }, (_, sector) => {
          const outer = isOuter(sector);
          const slice = sliceOf(sector);
          const cls = [
            'siege-wedge',
            outer ? 'is-outer' : 'is-inner',
            lit.has(sector) ? 'is-held' : '',
            face.attack?.announced && face.attack.sector === sector ? 'is-threatened' : '',
            props.selected === sector ? 'is-selected' : '',
            props.onSelect ? 'is-clickable' : '',
          ].join(' ');
          return (
            <path
              key={sector}
              d={outer ? wedge(slice, INNER, extent - 0.2) : wedge(slice, 0, INNER)}
              class={cls}
              onClick={props.onSelect ? () => props.onSelect!(sector) : undefined}
            >
              <title>{sectorName(t, sector)}</title>
            </path>
          );
        })}
        {[...lit].map((sector) => {
          const p = at(sector);
          return (
            <text key={`b${sector}`} x={p.x} y={p.y} class="landing-flag">
              ⚑
            </text>
          );
        })}
        {[...flying].map((sector) => {
          if (sector === undefined) return null;
          const p = at(sector);
          return (
            <text key={`f${sector}`} x={p.x} y={p.y + 2.4} class="landing-flying">
              ✦
            </text>
          );
        })}
      </svg>
      <figcaption class="small muted landing-legend">
        <span class="legend-beacon">⚑ {t('landing.legend.beacon')}</span>
        <span class="legend-seen">▧ {t('landing.legend.seen')}</span>
        <span class="legend-edge">░ {t('landing.legend.edge')}</span>
        <span class="legend-fog">▒ {t('landing.legend.unseen')}</span>
        <span>· {t('landing.mapLabel', { beacons: lit.size, seen })}</span>
      </figcaption>
    </figure>
  );
}

function gearNames(t: Translate, u: { weapon?: string; armor?: string }): string {
  return [u.weapon, u.armor]
    .filter((x): x is string => !!x)
    .map((id) => t(`gear.items.${id}` as TKey))
    .join(', ');
}

/** The aliens seen, by kind, level and gear. */
export function UnitList({ units }: { units: readonly AlienUnit[] }) {
  const t = useT();
  return (
    <ul class="landing-units small">
      {units.map((u, i) => {
        const gear = gearNames(t, u);
        return (
          <li key={i}>
            <span class={`unit-dot ${ENEMIES[u.kind].body}`} aria-hidden="true" />
            {t('landing.unitLine', {
              count: u.count,
              kind: t(`battle.enemies.${u.kind}`),
              level: u.level,
            })}
            {gear && <span class="muted"> · {gear}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** What we know of one parcel: its freshness, age, garrison, units and buildings. */
export function ParcelPanel(props: {
  game: GameState;
  target: ExpeditionTarget;
  sector: number;
  /** Chantier 42: inside the planner (the beacon's defence shows no buttons). */
  planning?: boolean;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const face = faceViewOf(props.game, props.target.id);
  const view = face.parcels[String(props.sector)] ?? null;
  const beacon = face.beacons.some((b) => b.sector === props.sector);
  const flying = props.game.expeditions.some(
    (e) =>
      e.mission === 'land' &&
      e.status === 'outbound' &&
      e.targetId === props.target.id &&
      e.sector === props.sector,
  );
  const ago = view ? formatDuration(lang, Math.max(0, now - view.at)) : '';
  const status = !view
    ? isOuter(props.sector)
      ? t('landing.status.unseen')
      : t('landing.status.formidable')
    : view.source === 'edge'
      ? t('landing.status.edge', { ago })
      : view.source === 'report'
        ? t('landing.status.report', { ago })
        : t(`landing.status.${beacon ? 'live' : viewFreshness(view, now)}`, { ago });
  const counts = new Map<string, number>();
  for (const b of view?.buildings ?? []) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  const list = [...counts]
    .map(([k, n]) => `${n} ${t(`landing.kinds.${k as AlienBuilding['kind']}`)}`)
    .join(', ');
  return (
    <section class="field parcel-panel">
      <div class="title-row">
        <h3>{sectorName(t, props.sector)}</h3>
        <span class="small muted">
          {t(isOuter(props.sector) ? 'landing.ring.outer' : 'landing.ring.inner')}
        </span>
      </div>
      <p class={`small ${beacon ? 'bonus' : view ? '' : 'muted'}`}>{status}</p>
      {flying && <p class="small">{t('landing.status.flying')}</p>}
      {view && (
        <p class="small">
          {t('landing.age', { age: t(`ages.${AGE_IDS[view.age] ?? AGE_IDS[0]!}`) })} ·{' '}
          {t('landing.garrison', { power: fmtRange(lang, view.power) })}
        </p>
      )}
      {view && view.units.length > 0 && (
        <>
          <p class="small muted">{t('landing.seenUnits')}</p>
          <UnitList units={view.units} />
        </>
      )}
      {view && (
        <p class="small muted">
          {list ? t('landing.buildings', { list }) : t('landing.noBuildings')}
        </p>
      )}
      {beacon && (
        <BeaconDefense
          game={props.game}
          target={props.target}
          sector={props.sector}
          planning={props.planning}
        />
      )}
    </section>
  );
}

/** Orders given before leaving: posture, priority, retreat threshold, burn or loot. */
export function OrdersPicker(props: {
  orders: LandingOrders;
  onChange(o: LandingOrders): void;
  /** Chantier 42: a beacon's guard (posture and retreat only). */
  guard?: boolean;
}) {
  const t = useT();
  const o = props.orders;
  const set = (patch: Partial<LandingOrders>) => props.onChange({ ...o, ...patch });
  const r = LANDING.retreat;
  return (
    <section class="field landing-orders">
      <h3>{t('landing.orders')}</h3>
      <p class="small muted">{t(props.guard ? 'beacons.ordersHint' : 'landing.ordersHint')}</p>
      <div class="segmented" role="group" aria-label={t('landing.orders')}>
        {POSTURES.map((p) => (
          <button
            key={p}
            class={`btn btn-small ${o.posture === p ? 'btn-active' : ''}`}
            aria-pressed={o.posture === p}
            onClick={() => set({ posture: p })}
          >
            {t(`landing.posture.${p}`)}
          </button>
        ))}
      </div>
      <label class="small order-row" hidden={props.guard}>
        <span>{t('landing.priority')}</span>
        <select
          value={o.priority}
          onChange={(e) =>
            set({ priority: (e.target as HTMLSelectElement).value as LandingOrders['priority'] })
          }
        >
          {LANDING_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`landing.priorities.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label class="small order-row order-retreat">
        <span>{t('landing.retreat', { pct: Math.round(o.retreatAt * 100) })}</span>
        <input
          class="slider"
          type="range"
          min={r.min}
          max={r.max}
          step={r.step}
          value={o.retreatAt}
          onInput={(e) =>
            set({
              retreatAt: Math.round(Number((e.target as HTMLInputElement).value) / r.step) * r.step,
            })
          }
        />
      </label>
      <p class="small muted">{t('landing.retreatHint')}</p>
      {!props.guard && (
        <div class="segmented" role="group" aria-label={t('landing.goal.burn')}>
          {LANDING_GOALS.map((g) => (
            <button
              key={g}
              class={`btn btn-small ${o.goal === g ? 'btn-active' : ''}`}
              aria-pressed={o.goal === g}
              onClick={() => set({ goal: g })}
            >
              {t(`landing.goal.${g}`)}
            </button>
          ))}
        </div>
      )}
      {!props.guard && <p class="small muted">{t(`landing.goalHints.${o.goal}`)}</p>}
    </section>
  );
}

/** Whether anybody in the crew can hit a bat (else the bats win by wearing them down). */
export function crewHitsAir(crew: readonly Villager[], game: GameState): boolean {
  return crew.some((v) => WEAPONS[kiwiWeapon(v, game)].hitsAir);
}

/** The forecast's lines: what it rests on, the practice battles, the dead to expect. */
export function LandingForecastLines(props: {
  forecast: LandingForecast;
  crew: readonly Villager[];
  game: GameState;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const f = props.forecast;
  const won = f.trials.filter((x) => x === 'victory').length;
  return (
    <>
      <p class="small">{t(`landing.forecast.${f.knowledge}`)}</p>
      {f.power && (
        <p class="small">{t('landing.garrisonGuess', { power: fmtRange(lang, f.power) })}</p>
      )}
      {f.trials.length > 0 && <p class="small">{t('landing.trials', { won })}</p>}
      {f.trials.length > 0 && f.expectedDead > 0 && (
        <p class="small warn">{t('landing.dead', { count: f.expectedDead })}</p>
      )}
      {props.crew.length > 0 && !crewHitsAir(props.crew, props.game) && (
        <p class="small warn">{t('landing.noAir')}</p>
      )}
      <p class="small muted">{t('landing.permadeath')}</p>
    </>
  );
}

/** Every enemy kind met in landings: best level, gear, how many. */
export function BestiaryList({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.slowNow);
  const entries = Object.entries(game.bestiary);
  if (entries.length === 0) return <p class="small muted">{t('landing.bestiary.empty')}</p>;
  return (
    <ul class="bestiary">
      {entries.map(([kind, b]) => {
        const k = kind as AlienUnit['kind'];
        const p = ENEMIES[k];
        const gear = gearNames(t, b!);
        return (
          <li key={kind} class="bestiary-row">
            <span class={`unit-dot big ${p.body}`} aria-hidden="true" />
            <div>
              <strong>{t(`battle.enemies.${k}`)}</strong>
              <p class="small">{t('landing.bestiary.line', { level: b!.level, count: b!.seen })}</p>
              <p class="small muted">
                {t('battle.unit.hp', { hp: p.hp, max: p.hp })} ·{' '}
                {t('battle.unit.weapon', { weapon: t(`battle.weapons.${p.weapon}` as TKey) })}
              </p>
              {gear && <p class="small muted">{t('landing.bestiary.gear', { items: gear })}</p>}
              <p class="small muted">
                {t('landing.bestiary.first', {
                  ago: formatDuration(lang, Math.max(0, now - b!.firstAt)),
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A simple 2D replay of a landing's journal, kept for the faces not drawn in our sky (chantier
 * 41 plays the others in 3D on the twin): kiwis in green, aliens in red (bats as triangles),
 * buildings as grey squares; health shown by size.
 */
/** Chantier 42: `ours` is our side in the journal (0 for the defence of a beacon). */
export function LandingReplay({ log, ours = 1 }: { log: BattleLog; ours?: 0 | 1 }) {
  const t = useT();
  const timeline = useMemo(() => buildTimeline(log), [log]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setTime((x) => {
        const next = x + dt * 3;
        if (next >= timeline.duration) {
          setPlaying(false);
          return timeline.duration;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline]);
  const points = [
    ...log.buildings.map((b) => hexToPixel({ q: b[2], r: b[3] })),
    ...log.units.map((u) => hexToPixel({ q: u[8], r: u[9] })),
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = 2;
  const box = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
    h: Math.max(...ys) - Math.min(...ys) + 2 * pad,
  };
  const ship = ours === 1 ? log.units.find((u) => u[1] === 1) : undefined;
  const shipAt = ship ? hexToPixel({ q: ship[8], r: ship[9] }) : null;
  return (
    <section class="field landing-replay">
      <div class="title-row">
        <h3>{t('landing.replay.title')}</h3>
        <button
          class="btn btn-small"
          onClick={() => {
            if (!playing && time >= timeline.duration) setTime(0);
            setPlaying(!playing);
          }}
        >
          {t(playing ? 'landing.replay.pause' : 'landing.replay.play')}
        </button>
      </div>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} class="replay-field" role="img">
        {log.buildings.map((b, i) => {
          const p = hexToPixel({ q: b[2], r: b[3] });
          return (
            <rect
              key={i}
              x={p.x - 0.5}
              y={p.y - 0.5}
              width="1"
              height="1"
              class="replay-building"
            />
          );
        })}
        {shipAt && <circle cx={shipAt.x} cy={shipAt.y} r="0.8" class="replay-ship" />}
        {timeline.tracks.map((track) => {
          if (!shownAt(track, time, 1)) return null;
          const at = placeAt(track, time);
          const a = hexToPixel(at.from);
          const b = hexToPixel(at.to);
          const x = a.x + (b.x - a.x) * at.k;
          const y = a.y + (b.y - a.y) * at.k;
          const hp = hpAt(track, time) / Math.max(1e-6, track.maxHp);
          const down = track.end !== null && time >= track.end && track.endKind === 'fall';
          const r = 0.25 + 0.3 * Math.max(0, hp);
          const cls = `replay-unit ${track.side === ours ? 'ours' : 'theirs'} ${down ? 'down' : ''}`;
          return track.unit[2] === 'bat' ? (
            <path
              key={track.index}
              d={`M${x},${y - r * 1.3}L${x + r},${y + r}L${x - r},${y + r}Z`}
              class={cls}
            />
          ) : (
            <circle key={track.index} cx={x} cy={y} r={r} class={cls} />
          );
        })}
      </svg>
      <input
        class="slider"
        type="range"
        min={0}
        max={timeline.duration}
        step={0.1}
        value={time}
        aria-label={t('landing.replay.title')}
        onInput={(e) => {
          setPlaying(false);
          setTime(Number((e.target as HTMLInputElement).value));
        }}
      />
      <p class="small muted replay-legend">
        <span class="replay-key ours">●</span> {t('landing.replay.ours')}{' '}
        <span class="replay-key theirs">●</span> {t('landing.replay.theirs')}{' '}
        <span class="replay-key ship">○</span> {t('landing.replay.ship')}
      </p>
    </section>
  );
}
