import { useState } from 'preact/hooks';
import {
  appleCalendar,
  attitudeOf,
  CIDER_EVENING,
  CIDER_FUEL,
  crewOf,
  fruitOfId,
  fruitOfState,
  FRUIT_IDS,
  goodCap,
  goodOf,
  hasTech,
  hexToPixel,
  LANDING,
  NECTAR_SCALE,
  openRouteLock,
  ORCHARD,
  parcelInReach,
  PINEAPPLE,
  POST,
  POST_MODULE_TYPES,
  postAttackForecast,
  postGoods,
  postHousing,
  postKiwis,
  postMapOf,
  postModuleLock,
  postOf,
  postYield,
  rations,
  RASPBERRY,
  routeBetween,
  routeUpkeep,
  standingOf,
  STANDING,
  validateCommand,
  voyageForecast,
  voyagesOut,
  workingPost,
  wormholePads,
  wornOut,
  type Attitude,
  type FruitId,
  type FruitMap,
  type GameState,
  type LandingOrders,
  type OrchardGood,
  type Parcel,
  type PostModule,
  type PostModuleType,
  type TradingPost,
  type VillagerId,
  type VoyagePlan,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon } from '../icons';
import { Icon, type IconName } from '../iconSet';
import { uiStore, useT, useUi, type Translate } from '../store';
import type { TKey } from '../../i18n/i18n';
import { Cost } from './Cost';
import { CrewPicker } from './ExpeditionModal';
import { OrdersPicker, UnitList } from './LandingParts';
import { Modal } from './Modal';
import { CLAN_COLORS } from '../../render/orchardColors';
import { appleSkin } from '../../render/orchardView';

/**
 * Chantier 54 (55: three fruits): the Orchard screen — a tab per fruit (the raspberry from
 * above, the apple cut open with its ripeness, the pineapple unrolled under its crown), a
 * parcel's colony and what we saw there, the voyage planner (visit and trade, give, found the
 * trading post, pillage) with its honest forecast, our posts, the routes between them, and the
 * orchard's goods (a cider evening).
 */

/** The orchard shows once the wormholes are researched (home colony). */
export function orchardVisible(game: GameState): boolean {
  return game.colony.index === 0 && hasTech(game, 'wormholes');
}

/** An attack announced on one of our trading posts. */
export function orchardAlarm(game: GameState): boolean {
  return Object.values(game.orchard.posts).some((p) => !!p.attack?.announced);
}

/** The icon of each fruit. */
export const FRUIT_ICONS: Record<FruitId, IconName> = {
  raspberry: 'raspberry',
  apple: 'apple',
  pineapple: 'pineapple',
};

/** The icon of each good of the orchard. */
export const GOOD_ICONS: Record<OrchardGood, IconName> = {
  nectar: 'nectar',
  cider: 'cider',
  goldFiber: 'goldFiber',
};

export function OrchardModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const fruit = useUi((s) => s.orchardFruit);
  const [picked, setPicked] = useState<string | null>(() => {
    const id = uiStore.getState().orchardDrupelet;
    const f = id ? fruitOfId(id) : null;
    if (f) uiStore.setState({ orchardFruit: f });
    return id;
  });
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none', orchardDrupelet: null });
  const map = fruitOfState(game, fruit);
  const parcel = picked ? (map.byId.get(picked) ?? null) : null;
  const pads = wormholePads(game);
  const post = postOf(game, fruit);
  return (
    <Modal title={t('orchard.title')} onClose={close} class="orchard-modal">
      <p class="small muted">{t('orchard.intro')}</p>
      <div class="row orchard-tabs" role="tablist">
        {FRUIT_IDS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={f === fruit}
            class={`btn btn-small ${f === fruit ? 'btn-active' : ''}`}
            onClick={() => {
              uiStore.setState({ orchardFruit: f });
              setPicked(null);
            }}
          >
            <Icon name={FRUIT_ICONS[f]} size={18} /> {t(`orchard.fruits.${f}`)}
          </button>
        ))}
        <button class="btn btn-small" onClick={() => actions.lookAtOrchard()}>
          {t('orchard.look')}
        </button>
      </div>
      <GoodsLine game={game} />
      {pads.length === 0 && (
        <p class="small warn">{t('orchard.needPad', { level: ORCHARD.padLevel })}</p>
      )}
      <PostLines game={game} />
      <p class="small">{t(`orchard.fruitIntro.${fruit}`)}</p>
      {fruit === 'apple' && <Ripeness game={game} />}
      <div class="orchard-grid">
        <div>
          <FruitMapView
            game={game}
            map={map}
            picked={picked}
            onPick={(id) => setPicked(id === picked ? null : id)}
          />
          <Legend />
        </div>
        <div>
          {parcel ? (
            <ParcelPanel game={game} map={map} d={parcel} />
          ) : (
            <p class="small muted">{t('orchard.pickParcel')}</p>
          )}
        </div>
      </div>
      {parcel && pads.length > 0 && (
        <VoyagePlanner key={parcel.id} game={game} map={map} d={parcel} />
      )}
      {post && <PostPanel game={game} fruit={fruit} post={post} />}
      <RoutesPanel game={game} />
      <VoyageList game={game} />
    </Modal>
  );
}

// --- The orchard's goods, a cider evening -----------------------------------------------------

function GoodsLine({ game }: { game: GameState }) {
  const t = useT();
  const now = useUi((s) => s.now);
  const faceMap = useUi((s) => s.map);
  const cap = (g: OrchardGood) => goodCap(game, g) / NECTAR_SCALE;
  const cmd = { type: 'serveCider' as const };
  const error = faceMap ? validateCommand(game, cmd, { now, map: faceMap }) : null;
  return (
    <div class="field orchard-goods">
      <p class="small">
        <Icon name="nectar" size={14} /> <Icon name="cider" size={14} />{' '}
        <Icon name="goldFiber" size={14} />{' '}
        {t('orchard.stocks', {
          nectar: goodOf(game, 'nectar'),
          nectarCap: cap('nectar'),
          cider: goodOf(game, 'cider'),
          ciderCap: cap('cider'),
          fiber: goodOf(game, 'goldFiber'),
          fiberCap: cap('goldFiber'),
        })}
      </p>
      {goodOf(game, 'cider') > 0 && (
        <p class="small">
          <button
            class="btn btn-small"
            disabled={error !== null}
            onClick={() => actions.dispatch(cmd)}
          >
            <Icon name="cider" size={16} />{' '}
            {t('orchard.ciderEvening', { count: CIDER_EVENING.cider })}
          </button>{' '}
          <span class="muted">{t('orchard.ciderHint', { value: CIDER_EVENING.value })}</span>
          {error && error !== 'notEnoughCider' && error !== 'notNight' && (
            <span class="warn"> · {t(`errors.${error}`)}</span>
          )}
        </p>
      )}
    </div>
  );
}

// --- The apple's ripeness ---------------------------------------------------------------------

function Ripeness({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const cal = appleCalendar(game.orchard.seed, game.now, 4);
  const now = cal[0]!;
  return (
    <section class="field orchard-ripeness">
      <h3>{t('orchard.ripeness.title')}</h3>
      <ol class="ripeness-strip">
        {cal.map((r, i) => (
          <li key={r.since} class={i === 0 ? 'is-now' : ''}>
            <span class="ripeness-dot" style={{ background: appleSkin(r.stage) }} />
            {i === 0
              ? t('orchard.ripeness.now', {
                  stage: t(`orchard.ripeness.stages.${r.stage}`),
                  time: formatDuration(lang, r.until - game.now),
                })
              : t('orchard.ripeness.next', {
                  stage: t(`orchard.ripeness.stages.${r.stage}`),
                  time: formatDuration(lang, r.since - game.now),
                })}
          </li>
        ))}
      </ol>
      <p class="small muted">{t(`orchard.ripeness.effects.${now.stage}`)}</p>
    </section>
  );
}

// --- The fruits drawn flat --------------------------------------------------------------------

/** A drupelet on the disc: the tip in the middle, the shoulders by the stem on the rim. */
export function drupeletSpot(d: Parcel, radius: number): { x: number; y: number } {
  const top = 1 - 2 * RASPBERRY.stemCap;
  const r = ((d.y + 1) / (top + 1)) * radius * 0.92 + radius * 0.06;
  const a = Math.atan2(d.z, d.x);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** The apple cut open: the skin's galleries on the rim, the flesh, the core in the middle. */
function gallerySpot(d: Parcel, radius: number): { x: number; y: number } {
  const r = radius * [0.88, 0.58, 0.28][d.ring]!;
  const a = Math.atan2(d.z, d.x);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** The pineapple unrolled: the angle across, the height up, the crown on top. */
const PINE_W = 180;
const PINE_H = 140;
function scaleSpot(d: Parcel): { x: number; y: number } {
  if (d.crown) return { x: 0, y: -PINE_H - 26 };
  return { x: (Math.atan2(d.z, d.x) / Math.PI) * PINE_W, y: -d.y * PINE_H };
}

function spotOf(fruit: FruitId, d: Parcel, radius: number): { x: number; y: number } {
  return fruit === 'raspberry'
    ? drupeletSpot(d, radius)
    : fruit === 'apple'
      ? gallerySpot(d, radius)
      : scaleSpot(d);
}

/** The name of a clan (its fruit's list of names). */
export function clanName(t: Translate, n: number, fruit: FruitId = 'raspberry'): string {
  const list =
    fruit === 'apple'
      ? 'orchard.appleClans'
      : fruit === 'pineapple'
        ? 'orchard.pineappleClans'
        : 'orchard.clanNames';
  return t(`${list}.n${n}` as TKey);
}

function nameOf(t: Translate, map: FruitMap, clan: string): string {
  return clanName(t, map.clanById.get(clan)?.name ?? 0, map.fruit);
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clanColor(map: FruitMap, clan: string): string {
  const c = map.clanById.get(clan);
  return CLAN_COLORS[(c?.name ?? 0) % CLAN_COLORS.length]!;
}

function FruitMapView(props: {
  game: GameState;
  map: FruitMap;
  picked: string | null;
  onPick(id: string): void;
}) {
  const t = useT();
  const { game, map } = props;
  const fruit = map.fruit;
  const R = 150;
  const post = postOf(game, fruit);
  const out = new Set(voyagesOut(game).flatMap((e) => e.voyage?.stops ?? []));
  const box =
    fruit === 'pineapple'
      ? `${-PINE_W - 14} ${-PINE_H - 40} ${2 * PINE_W + 28} ${2 * PINE_H + 54}`
      : `${-R - 14} ${-R - 14} ${2 * R + 28} ${2 * R + 28}`;
  const dot = fruit === 'pineapple' ? 5.5 : fruit === 'apple' ? 10 : 9;
  return (
    <svg
      class={`orchard-map is-${fruit}`}
      viewBox={box}
      role="group"
      aria-label={t(`orchard.mapLabels.${fruit}`)}
    >
      {fruit === 'pineapple' ? (
        <rect
          x={-PINE_W - 8}
          y={-PINE_H - 8}
          width={2 * PINE_W + 16}
          height={2 * PINE_H + 16}
          rx={40}
          class="orchard-skin is-pineapple"
        />
      ) : fruit === 'apple' ? (
        <>
          <circle r={R + 8} class="orchard-skin is-apple" />
          <circle r={R * 0.73} class="orchard-flesh" />
          <circle r={R * 0.43} class="orchard-core" />
        </>
      ) : (
        <circle r={R + 8} class="orchard-skin" />
      )}
      {map.parcels.map((d) =>
        d.links
          .filter((l) => l > d.id)
          .map((l) => {
            const a = spotOf(fruit, d, R);
            const b = spotOf(fruit, map.byId.get(l)!, R);
            // The pineapple's spirals wrap round: no line across the whole map.
            if (Math.abs(a.x - b.x) > PINE_W) return null;
            const same = map.byId.get(l)!.clan === d.clan;
            return (
              <line
                key={`${d.id}-${l}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                class={`orchard-link ${same ? 'is-clan' : ''}`}
              />
            );
          }),
      )}
      {map.parcels.map((d) => {
        const p = spotOf(fruit, d, R);
        const attitude = attitudeOf(game, d.clan, game.now);
        const isPost = post?.drupelet === d.id;
        const taken = game.orchard.taken[d.id] !== undefined;
        const seen = !!game.orchard.views[d.id];
        const far = !parcelInReach(game, d);
        const label = `${nameOf(t, map, d.clan)} · ${t(`orchard.attitude.${attitude}`)}`;
        const r = d.crown ? 12 : dot + (fruit === 'raspberry' ? d.ring * 1.5 : 0);
        return (
          <g
            key={d.id}
            transform={`translate(${p.x},${p.y})`}
            class={`drupelet is-${attitude} ${props.picked === d.id ? 'is-picked' : ''} ${seen ? 'is-seen' : ''} ${far ? 'is-far' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={() => props.onPick(d.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onPick(d.id);
              }
            }}
          >
            <circle r={r} fill={clanColor(map, d.clan)} />
            {d.crown && <text class="drupelet-glyph">♛</text>}
            {isPost && <text class="drupelet-glyph">⌂</text>}
            {!isPost && taken && <text class="drupelet-glyph">✕</text>}
            {out.has(d.id) && <circle r={r + 5} class="drupelet-ship" />}
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  const t = useT();
  return (
    <p class="small muted orchard-legend">
      <span class="dot is-friendly" /> {t('orchard.attitude.friendly')} ·{' '}
      <span class="dot is-neutral" /> {t('orchard.attitude.neutral')} ·{' '}
      <span class="dot is-hostile" /> {t('orchard.attitude.hostile')} · ⌂ {t('orchard.post')} · ✕{' '}
      {t('orchard.taken')}
    </p>
  );
}

// --- A parcel and its colony ------------------------------------------------------------------

function StandingGauge({ value, attitude }: { value: number; attitude: Attitude }) {
  const pct = ((value - STANDING.min) / (STANDING.max - STANDING.min)) * 100;
  return (
    <span
      class={`standing is-${attitude}`}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={STANDING.min}
      aria-valuemax={STANDING.max}
    >
      <span style={{ left: `${pct}%` }} />
    </span>
  );
}

function ParcelPanel({ game, map, d }: { game: GameState; map: FruitMap; d: Parcel }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const fruit = map.fruit;
  const clan = map.clanById.get(d.clan)!;
  const value = standingOf(game, clan.id, game.now);
  const attitude = attitudeOf(game, clan.id, game.now);
  const view = game.orchard.views[d.id];
  const neighbours = [...new Set(d.links.map((l) => map.byId.get(l)!.clan))].filter(
    (c) => c !== clan.id,
  );
  return (
    <section class="field orchard-drupelet">
      <h3>
        <span class="clan-swatch" style={{ background: clanColor(map, clan.id) }} />{' '}
        {capital(nameOf(t, map, clan.id))}
      </h3>
      <p class="small">
        {t(`orchard.attitude.${attitude}`)} · {t('orchard.standing', { value: Math.round(value) })}
      </p>
      <StandingGauge value={value} attitude={attitude} />
      <p class="small">
        {t('orchard.wants')} <ResourceIcon id={clan.wants} size={16} />{' '}
        {t(`resources.${clan.wants}`)} ·{' '}
        {t('orchard.rate', { rate: formatNumber(lang, voyageRate(game, map, clan.id)) })}
      </p>
      <p class="small muted">
        {d.crown
          ? t('orchard.crown')
          : fruit === 'raspberry'
            ? t('orchard.ring', { ring: d.ring + 1 })
            : t(`orchard.layers.${fruit}.r${d.ring}`)}{' '}
        ·{' '}
        {fruit === 'raspberry'
          ? t('orchard.clanSize', { count: clan.parcels.length })
          : t('orchard.clanSizeAny', { count: clan.parcels.length })}
        {neighbours.length > 0 && ` · ${t('orchard.neighbours', { count: neighbours.length })}`}
      </p>
      {!parcelInReach(game, d) && (
        <p class="small warn">
          {t(fruit === 'pineapple' ? 'orchard.crownLocked' : 'orchard.outOfReach')}
        </p>
      )}
      {view ? (
        <>
          <p class="small">
            {t(`orchard.view.${view.source}`, { time: formatDuration(lang, game.now - view.at) })}
            {view.nest && ` · ${t('orchard.nest')}`}
          </p>
          <UnitList units={view.units} />
          <p class="small">
            <Icon name="nectar" size={14} /> {t('orchard.storedNectar', { count: view.nectar })}
            {view.cider ? (
              <>
                {' · '}
                <Icon name="cider" size={14} /> {t('orchard.storedCider', { count: view.cider })}
              </>
            ) : null}
            {view.goldFiber ? (
              <>
                {' · '}
                <Icon name="goldFiber" size={14} />{' '}
                {t('orchard.storedFiber', { count: view.goldFiber })}
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p class="small muted">{t('orchard.unseen')}</p>
      )}
      {game.orchard.taken[d.id] !== undefined && <p class="small warn">{t('orchard.takenLine')}</p>}
    </section>
  );
}

/** What a clan pays us for 1 000 units when a ship would arrive (the visit's forecast). */
function voyageRate(game: GameState, map: FruitMap, clan: string): number {
  const d = map.parcels.find((x) => x.clan === clan);
  if (!d) return 0;
  const f = voyageForecast(game, {
    launchpadId: (wormholePads(game)[0]?.id ?? 'none') as never,
    mission: 'visit',
    stops: [d.id],
    crew: [],
    provisions: { pulp: 0, juice: 0 },
  });
  return f?.stops[0]?.rate ?? map.clanById.get(clan)!.rate;
}

// --- The voyage planner -----------------------------------------------------------------------

type Mode = 'visit' | 'pillage';

function KiwiChecks(props: {
  legend: string;
  kiwis: { id: VillagerId; name: string; worn?: boolean }[];
  value: VillagerId[];
  onChange(next: VillagerId[]): void;
}) {
  const t = useT();
  return (
    <fieldset class="small orchard-stay">
      <legend>{props.legend}</legend>
      {props.kiwis.map((v) => (
        <label key={v.id} class="toggle-line">
          <input
            type="checkbox"
            checked={props.value.includes(v.id)}
            onChange={(e) =>
              props.onChange(
                (e.target as HTMLInputElement).checked
                  ? [...props.value, v.id]
                  : props.value.filter((x) => x !== v.id),
              )
            }
          />{' '}
          {v.name}
          {v.worn && <span class="warn"> ({t('orchard.worn')})</span>}
        </label>
      ))}
    </fieldset>
  );
}

function VoyagePlanner({ game, map, d }: { game: GameState; map: FruitMap; d: Parcel }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const faceMap = useUi((s) => s.map);
  const fruit = map.fruit;
  const post = postOf(game, fruit);
  const atPost = post && !post.ruined && post.drupelet === d.id;
  const [mode, setMode] = useState<Mode>('visit');
  const [crew, setCrew] = useState<VillagerId[]>([]);
  const [second, setSecond] = useState<string | null>(null);
  const clan = map.clanById.get(d.clan)!;
  const [amount, setAmount] = useState(5000);
  const [gift, setGift] = useState(false);
  const [settle, setSettle] = useState(false);
  const [stay, setStay] = useState<VillagerId[]>([]);
  const [back, setBack] = useState<VillagerId[]>([]);
  const [fuelCider, setFuelCider] = useState(false);
  const [orders, setOrders] = useState<LandingOrders>({ ...LANDING.defaultOrders });
  const pad = wormholePads(game).find((p) => !p.damaged) ?? wormholePads(game)[0]!;
  const members = crewOf(game, crew) ?? [];
  const stops = mode === 'visit' && second ? [d.id, second] : [d.id];
  const base: VoyagePlan = {
    launchpadId: pad.id,
    mission: mode,
    stops,
    crew,
    provisions: { pulp: 0, juice: 0 },
    ...(fuelCider ? { fuelCider: true } : {}),
  };
  const first = voyageForecast(game, base);
  const need = rations(game, members, (first?.travelMs ?? 0) * 2 + (first?.hopsMs ?? 0));
  const up5 = (x: number) => Math.ceil((x * 1.15) / 5) * 5;
  const provisions = { pulp: up5(need.pulp), juice: up5(need.juice) };
  const plan: VoyagePlan =
    mode === 'visit'
      ? {
          ...base,
          provisions,
          ...(amount > 0 ? { goods: { [clan.wants]: amount } } : {}),
          ...(gift ? { gift: true } : {}),
          ...(settle ? { settle: true } : {}),
          ...(stay.length ? { stay: stay.filter((id) => crew.includes(id)) } : {}),
          ...(back.length ? { bringBack: back } : {}),
        }
      : { ...base, provisions, orders };
  const f = voyageForecast(game, plan);
  const cmd = { type: 'voyage' as const, ...plan };
  const error = faceMap ? validateCommand(game, cmd, { now, map: faceMap }) : null;
  const seconds = d.links;
  const resting = post ? postKiwis(game, fruit) : [];
  const harm = f?.pillage ? Object.values(f.pillage.harm) : [];
  const meanHarm = harm.length ? harm.reduce((a, b) => a + b, 0) / harm.length : 0;
  return (
    <section class="field orchard-planner">
      <h3>{t('orchard.planner')}</h3>
      <div class="row" role="tablist">
        {(['visit', 'pillage'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            class={`btn btn-small ${mode === m ? 'btn-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {t(`orchard.mode.${m}`)}
          </button>
        ))}
      </div>
      {f?.ripeness && (
        <p class="small">
          <span class="ripeness-dot" style={{ background: appleSkin(f.ripeness.stage) }} />{' '}
          {t('orchard.ripeness.arrival', {
            stage: t(`orchard.ripeness.stages.${f.ripeness.stage}`),
          })}{' '}
          · <span class="muted">{t(`orchard.ripeness.effects.${f.ripeness.stage}`)}</span>
        </p>
      )}
      <div class="orchard-plan-grid">
        <div>
          <CrewPicker game={game} crew={crew} max={ORCHARD.crew.max} risk={{}} onChange={setCrew} />
        </div>
        <div>
          {mode === 'visit' ? (
            <>
              <label class="small">
                {t('orchard.goods')} <ResourceIcon id={clan.wants} size={14} />{' '}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={amount}
                  class="orchard-amount"
                  onInput={(e) =>
                    setAmount(Math.max(0, Number((e.target as HTMLInputElement).value) || 0))
                  }
                />
              </label>
              <label class="small toggle-line">
                <input
                  type="checkbox"
                  checked={gift}
                  onChange={(e) => setGift((e.target as HTMLInputElement).checked)}
                />{' '}
                {t('orchard.gift')}
              </label>
              {seconds.length > 0 && (
                <label class="small">
                  {t('orchard.second')}{' '}
                  <select
                    value={second ?? ''}
                    onChange={(e) => setSecond((e.target as HTMLSelectElement).value || null)}
                  >
                    <option value="">{t('orchard.noSecond')}</option>
                    {seconds.map((l) => (
                      <option key={l} value={l}>
                        {nameOf(t, map, map.byId.get(l)!.clan)} ({l})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(!post || post.ruined) && (
                <label class="small toggle-line">
                  <input
                    type="checkbox"
                    checked={settle}
                    onChange={(e) => setSettle((e.target as HTMLInputElement).checked)}
                  />{' '}
                  {t(post?.ruined ? 'orchard.rebuild' : 'orchard.settle')}
                </label>
              )}
              {(settle || atPost) && members.length > 0 && (
                <KiwiChecks
                  legend={t('orchard.stay')}
                  kiwis={members}
                  value={stay}
                  onChange={setStay}
                />
              )}
              {(settle || atPost) && fruit === 'pineapple' && (
                <p class="small muted">
                  {t('orchard.bromelainPost', {
                    time: formatDuration(lang, PINEAPPLE.bromelain.postHours * 3_600_000),
                  })}
                </p>
              )}
              {atPost && resting.length > 0 && (
                <KiwiChecks
                  legend={t('orchard.bringBack')}
                  kiwis={resting.map((v) => ({
                    id: v.id,
                    name: v.name,
                    worn: wornOut(v, game.now),
                  }))}
                  value={back}
                  onChange={setBack}
                />
              )}
              {f?.stops.map((s) => (
                <p
                  key={s.drupelet}
                  class={`small ${s.attitude === 'hostile' && !gift ? 'warn' : ''}`}
                >
                  {s.attitude === 'hostile' && !gift
                    ? t('orchard.refuses')
                    : gift
                      ? t('orchard.forecastGift', { standing: s.standing })
                      : t('orchard.forecastTrade', { nectar: s.nectar, standing: s.standing })}
                </p>
              ))}
              {f?.waiting && (
                <p class="small bonus">
                  {t('orchard.collectGoods', {
                    nectar: f.waiting.nectar,
                    cider: f.waiting.cider,
                    fiber: f.waiting.goldFiber,
                  })}
                </p>
              )}
              {f?.settleCost && (
                <p class="small">
                  {t('orchard.settleCost')} <Icon name="nectar" size={14} /> {f.settleCost.nectar} ·{' '}
                  <Icon name="crystal" size={14} /> {f.settleCost.crystal} ·{' '}
                  <Icon name="iron" size={14} /> {f.settleCost.iron}
                </p>
              )}
            </>
          ) : (
            <>
              <OrdersPicker orders={orders} onChange={setOrders} delve />
              {f?.pillage && (
                <section class="field depths-forecast">
                  <p class="small">{t(`orchard.knowledge.${f.pillage.knowledge}`)}</p>
                  <UnitList units={f.pillage.units} />
                  {f.pillage.help.length > 0 && (
                    <p class="small muted">{t('orchard.help', { count: f.pillage.help.length })}</p>
                  )}
                  {meanHarm > 0 && (
                    <p class="small warn">
                      {t('orchard.bromelain', { pct: Math.round(meanHarm * 100) })}
                    </p>
                  )}
                  {f.pillage.trials.length > 0 && (
                    <p class="small">
                      <span class={`odds odds-${f.pillage.odds}`}>
                        {t(`expedition.odds.${f.pillage.odds}`)}
                      </span>{' '}
                      {t('landing.trials', {
                        won: f.pillage.trials.filter((x) => x === 'victory').length,
                      })}
                    </p>
                  )}
                  {f.pillage.expectedDead > 0 && (
                    <p class="small warn">{t('landing.dead', { count: f.pillage.expectedDead })}</p>
                  )}
                  {f.pillage.expectedHurt > 0 && (
                    <p class="small">{t('landing.hurt', { count: f.pillage.expectedHurt })}</p>
                  )}
                  <p class="small">
                    <Icon name="nectar" size={14} />{' '}
                    {t('orchard.loot', { count: f.pillage.nectar })}
                  </p>
                  {fruit === 'apple' && (
                    <p class={`small ${f.pillage.cider > 0 ? 'bonus' : 'muted'}`}>
                      <Icon name="cider" size={14} />{' '}
                      {t('orchard.lootCider', { count: f.pillage.cider })}
                    </p>
                  )}
                  {fruit === 'pineapple' && (
                    <p class="small bonus">
                      <Icon name="goldFiber" size={14} />{' '}
                      {t('orchard.lootFiber', { count: f.pillage.goldFiber })}
                    </p>
                  )}
                  <p class="small warn">{t('orchard.pillageCost')}</p>
                  <p class="small muted">{t('landing.permadeath')}</p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <label class="small toggle-line">
        <input
          type="checkbox"
          checked={fuelCider}
          disabled={goodOf(game, 'cider') < CIDER_FUEL.cider}
          onChange={(e) => setFuelCider((e.target as HTMLInputElement).checked)}
        />{' '}
        <Icon name="cider" size={14} /> {t('orchard.fuelCider', { count: CIDER_FUEL.cider })}
      </label>
      <p class="small">
        {t('depths.rations')} <Cost cost={provisions} have={game.resources} />
        {f && (
          <>
            {' '}
            · {t('orchard.fee')} <Cost cost={f.launchCost} have={game.resources} />
          </>
        )}
      </p>
      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch(cmd)) {
            setCrew([]);
            setStay([]);
            setBack([]);
          }
        }}
      >
        <Icon name={FRUIT_ICONS[fruit]} size={20} /> {t(`orchard.launch.${mode}`)} ·{' '}
        {formatDuration(lang, 2 * (f?.travelMs ?? 0) + (f?.hopsMs ?? 0))}
      </button>
      {error && crew.length > 0 && <p class="small warn">{t(`errors.${error}`)}</p>}
    </section>
  );
}

// --- Our trading posts ------------------------------------------------------------------------

function PostLines({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  return (
    <>
      {FRUIT_IDS.map((fruit) => {
        const a = postOf(game, fruit)?.attack;
        if (!a?.announced || !a.clan) return null;
        const f = postAttackForecast(game, fruit);
        const map = fruitOfState(game, fruit);
        return (
          <p key={fruit} class="small warn orchard-alarm">
            <Icon name={FRUIT_ICONS[fruit]} size={14} />{' '}
            {t('orchard.attack', {
              clan: capital(nameOf(t, map, a.clan)),
              time: formatDuration(lang, Math.max(0, a.at - game.now)),
            })}
            {f && ` · ${t(`orchard.holds.${f.odds}`)}`} · {t('orchard.answers')}
          </p>
        );
      })}
    </>
  );
}

const MODULE_GLYPH: Record<PostModuleType, string> = { hut: '⌂', stall: '✿', palisade: '▥' };
const SIZE = 22;

function PostPanel({ game, fruit, post }: { game: GameState; fruit: FruitId; post: TradingPost }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [tile, setTile] = useState<{ q: number; r: number } | null>(null);
  const map = postMapOf(game, post);
  const span = SIZE * (POST.radius * 2 + 1) * 1.8;
  const corner = (i: number) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${SIZE * 0.94 * Math.cos(a)},${SIZE * 0.94 * Math.sin(a)}`;
  };
  const shape = [0, 1, 2, 3, 4, 5].map(corner).join(' ');
  const here = postKiwis(game, fruit);
  const worn = here.filter((v) => wornOut(v, game.now));
  const picked = tile ? post.modules.find((m) => m.q === tile.q && m.r === tile.r) : undefined;
  const goods = postGoods(post);
  const gathers = workingPost(game, fruit) ? postYield(game, fruit, game.now).good : null;
  return (
    <section class="field orchard-post">
      <h3>
        <Icon name={FRUIT_ICONS[fruit]} size={20} /> {t('orchard.postTitle')} ·{' '}
        {t(`orchard.fruits.${fruit}`)}
      </h3>
      {post.ruined ? (
        <p class="small warn">{t('orchard.ruined')}</p>
      ) : post.readyAt > game.now ? (
        <p class="small muted">
          {t('orchard.building', { time: formatDuration(lang, post.readyAt - game.now) })}
        </p>
      ) : null}
      <p class="small">
        {t('orchard.storeGoods', {
          nectar: goods.nectar,
          nectarCap: POST.storeCap,
          cider: goods.cider,
          ciderCap: POST.goodsCap.cider,
          fiber: goods.goldFiber,
          fiberCap: POST.goodsCap.goldFiber,
        })}
        {' · '}
        {t('orchard.kiwisThere', { count: here.length, room: postHousing(post, game.now) })}
      </p>
      {gathers && (
        <p class="small muted">
          <Icon name={GOOD_ICONS[gathers]} size={14} /> {t(`orchard.gathers.${gathers}`)}
        </p>
      )}
      {here.length > 0 && (
        <p class="small muted">
          {here
            .map((v) => (wornOut(v, game.now) ? `${v.name} (${t('orchard.worn')})` : v.name))
            .join(', ')}
        </p>
      )}
      {worn.length > 0 && <p class="small warn">{t('orchard.wornLine', { count: worn.length })}</p>}
      <div class="orchard-post-grid">
        <svg
          class="orbit-map"
          viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
          role="group"
          aria-label={t('orchard.postMap')}
        >
          <circle r={span * 0.47} class={`orchard-skin is-${fruit}`} />
          {map.tiles.map((x) => {
            const p = hexToPixel(x, SIZE);
            const m = post.modules.find((y) => y.q === x.q && y.r === x.r);
            const sel = tile?.q === x.q && tile?.r === x.r;
            const state = m ? moduleState(m, game.now) : null;
            return (
              <g
                key={`${x.q},${x.r}`}
                transform={`translate(${p.x},${p.y})`}
                class={`orbit-tile is-${x.kind} ${sel ? 'is-picked' : ''} ${state ? `is-${state}` : ''}`}
                role={x.kind === 'ground' ? 'button' : undefined}
                tabIndex={x.kind === 'ground' ? 0 : undefined}
                aria-label={m ? t(`orchard.modules.${m.type}.name`) : t(`orbit.tiles.${x.kind}`)}
                onClick={() => (x.kind === 'ground' ? setTile(sel ? null : x) : undefined)}
              >
                <polygon points={shape} />
                {m && <text class="orbit-glyph">{MODULE_GLYPH[m.type]}</text>}
                {x.kind === 'pad' && <text class="orbit-glyph">✦</text>}
              </g>
            );
          })}
        </svg>
        <div>
          {tile && picked ? (
            <div class="orbit-module">
              <h4>{t(`orchard.modules.${picked.type}.name`)}</h4>
              <p class="small">{t(`orchard.modules.${picked.type}.desc`)}</p>
              <p class="small muted">
                {picked.readyAt > game.now
                  ? t('orbit.state.assembling', {
                      time: formatDuration(lang, picked.readyAt - game.now),
                    })
                  : t(`orbit.state.${picked.broken ? 'broken' : 'working'}`)}
              </p>
              <button
                class="btn btn-small"
                onClick={() => actions.dispatch({ type: 'removePostModule', moduleId: picked.id })}
              >
                {t('orbit.remove')}
              </button>
            </div>
          ) : tile ? (
            POST_MODULE_TYPES.map((type) => {
              const lock = postModuleLock(game, fruit, type, tile);
              const def = POST.modules[type];
              return (
                <div key={type} class="orbit-module">
                  <h4>{t(`orchard.modules.${type}.name`)}</h4>
                  <p class="small">{t(`orchard.modules.${type}.desc`)}</p>
                  <p class="small">
                    <Icon name="nectar" size={14} /> {def.nectar} · <Icon name="iron" size={14} />{' '}
                    {def.iron} · {formatDuration(lang, def.durationMs)}
                  </p>
                  <button
                    class="btn btn-small"
                    disabled={lock !== null}
                    onClick={() => {
                      if (
                        actions.dispatch({
                          type: 'buildPostModule',
                          ...(fruit !== 'raspberry' ? { fruit } : {}),
                          moduleType: type,
                          q: tile.q,
                          r: tile.r,
                        })
                      )
                        setTile(null);
                    }}
                  >
                    {t('orbit.set')}
                  </button>
                  {lock && <p class="small warn">{t(`errors.${lock}`)}</p>}
                </div>
              );
            })
          ) : (
            <p class="small muted">{t('orchard.pickTile')}</p>
          )}
        </div>
      </div>
      {post.reports.length > 0 && (
        <ul class="small orchard-reports">
          {[...post.reports].reverse().map((r) => (
            <li key={r.id} class={r.held ? 'bonus' : 'warn'}>
              {t(r.held ? 'orchard.report.held' : 'orchard.report.fell', {
                time: formatDuration(lang, game.now - r.at),
                dead: r.dead.length,
                hurt: r.hurt.length,
                taken: r.taken,
              })}{' '}
              {r.log && (
                <button class="btn btn-small" onClick={() => actions.watchFruit(r.id)}>
                  {t('orchard.watch')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function moduleState(m: PostModule, now: number): 'assembling' | 'broken' | 'working' {
  if (m.readyAt > now) return 'assembling';
  return m.broken ? 'broken' : 'working';
}

// --- Routes between posts ---------------------------------------------------------------------

function RoutesPanel({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const founded = FRUIT_IDS.filter((f) => postOf(game, f));
  if (founded.length === 0) return null;
  const pairs: [FruitId, FruitId][] = [];
  for (let i = 0; i < FRUIT_IDS.length; i++)
    for (let j = i + 1; j < FRUIT_IDS.length; j++) pairs.push([FRUIT_IDS[i]!, FRUIT_IDS[j]!]);
  return (
    <section class="field orchard-routes">
      <h3>{t('orchard.routes.title')}</h3>
      <p class="small muted">{t('orchard.routes.intro')}</p>
      {founded.length < 2 && <p class="small muted">{t('orchard.routes.needPosts')}</p>}
      <ul class="small orchard-route-list">
        {pairs.map(([a, b]) => {
          const route = routeBetween(game, a, b);
          const lock = openRouteLock(game, a, b);
          const upkeep = routeUpkeep(a, b);
          if (!route && lock === 'noPost') return null;
          return (
            <li key={`${a}-${b}`} class={route && !route.cut ? 'bonus' : ''}>
              <Icon name={FRUIT_ICONS[a]} size={16} /> ↔ <Icon name={FRUIT_ICONS[b]} size={16} />{' '}
              {t('orchard.routes.pair', {
                a: t(`orchard.fruits.${a}`),
                b: t(`orchard.fruits.${b}`),
              })}{' '}
              · {t('orchard.routes.upkeep')}{' '}
              {(Object.entries(upkeep) as [OrchardGood, number][]).map(([g, n]) => (
                <span key={g}>
                  <Icon name={GOOD_ICONS[g]} size={14} /> {n}{' '}
                </span>
              ))}
              ·{' '}
              {route
                ? route.cut
                  ? t('orchard.routes.cut')
                  : t('orchard.routes.paid', {
                      time: formatDuration(lang, Math.max(0, route.paidUntil - game.now)),
                    })
                : t('orchard.routes.none')}{' '}
              {(!route || route.cut) && (
                <button
                  class="btn btn-small"
                  disabled={lock !== null}
                  onClick={() => actions.dispatch({ type: 'openRoute', a, b })}
                >
                  {t('orchard.routes.open')}
                </button>
              )}
              {route && (
                <button
                  class="btn btn-small"
                  onClick={() => actions.dispatch({ type: 'closeRoute', routeId: route.id })}
                >
                  {t('orchard.routes.close')}
                </button>
              )}
              {lock && lock !== 'routeExists' && lock !== 'noPost' && (
                <span class="warn"> {t(`errors.${lock}`)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- Voyages under way ------------------------------------------------------------------------

function VoyageList({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const list = voyagesOut(game);
  // Pillages back home keep their journal: they can be watched again.
  const fought = game.expeditions.filter(
    (e) => e.mission === 'pillage' && e.status === 'done' && !!e.result?.log,
  );
  if (list.length === 0 && fought.length === 0) return null;
  const fruitIcon = (stop: string | undefined) => (
    <Icon name={FRUIT_ICONS[fruitOfId(stop ?? '') ?? 'raspberry']} size={14} />
  );
  return (
    <section class="field">
      <h3>{t('orchard.underWay')}</h3>
      <ul class="small">
        {list.map((e) => (
          <li key={e.id}>
            {fruitIcon(e.voyage?.stops[0])} {t(`orchard.mode.${e.mission as Mode}`)} ·{' '}
            {e.voyage?.stops.join(' → ')} ·{' '}
            {e.status === 'outbound'
              ? e.arriveAt > game.now
                ? t('orchard.arrives', { time: formatDuration(lang, e.arriveAt - game.now) })
                : t('orchard.awaiting')
              : t('orchard.back', {
                  time: formatDuration(lang, Math.max(0, e.returnAt - game.now)),
                })}
          </li>
        ))}
        {fought.map((e) => (
          <li key={e.id}>
            {fruitIcon(e.voyage?.stops[0])} {t('orchard.mode.pillage')} · {e.voyage?.stops[0]} ·{' '}
            {t(`orchard.toast.${e.result!.outcome ?? 'defeat'}`)}{' '}
            <button class="btn btn-small" onClick={() => actions.watchFruit(e.id)}>
              {t('orchard.watch')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
