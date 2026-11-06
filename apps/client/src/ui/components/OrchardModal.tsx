import { useState } from 'preact/hooks';
import {
  attitudeOf,
  crewOf,
  hasTech,
  hexToPixel,
  LANDING,
  ORCHARD,
  POST,
  POST_MODULE_TYPES,
  postAttackForecast,
  postHousing,
  postKiwis,
  postMapOf,
  postModuleLock,
  postStore,
  raspberryOfState,
  rations,
  RASPBERRY,
  standingOf,
  STANDING,
  validateCommand,
  voyageForecast,
  voyagesOut,
  wormholePads,
  type Attitude,
  type Drupelet,
  type GameState,
  type LandingOrders,
  type PostModule,
  type PostModuleType,
  type Raspberry,
  type TradingPost,
  type VillagerId,
  type VoyagePlan,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon } from '../icons';
import { Icon } from '../iconSet';
import { uiStore, useT, useUi, type Translate } from '../store';
import type { TKey } from '../../i18n/i18n';
import { Cost } from './Cost';
import { CrewPicker } from './ExpeditionModal';
import { OrdersPicker, UnitList } from './LandingParts';
import { Modal } from './Modal';
import { CLAN_COLORS } from '../../render/orchardColors';

/**
 * Chantier 54: the Orchard screen — the raspberry seen from above (its drupelets coloured by
 * clan, our standing with each), a drupelet's clan and what we saw there, the voyage planner
 * (visit and trade, give, found the trading post, pillage) with its honest forecast, and our
 * trading post (its small map, its store, its kiwis, an attack announced and its answers).
 */

/** The orchard shows once the wormholes are researched (home colony). */
export function orchardVisible(game: GameState): boolean {
  return game.colony.index === 0 && hasTech(game, 'wormholes');
}

/** An attack announced on our trading post. */
export function orchardAlarm(game: GameState): boolean {
  return !!game.orchard.post?.attack?.announced;
}

export function OrchardModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const [picked, setPicked] = useState<string | null>(() => uiStore.getState().orchardDrupelet);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none', orchardDrupelet: null });
  const map = raspberryOfState(game);
  const drupelet = picked ? (map.byId.get(picked) ?? null) : null;
  const pads = wormholePads(game);
  return (
    <Modal title={t('orchard.title')} onClose={close} class="orchard-modal">
      <p class="small muted">{t('orchard.intro')}</p>
      <button class="btn btn-small" onClick={() => actions.lookAtOrchard()}>
        {t('orchard.look')}
      </button>
      {pads.length === 0 && (
        <p class="small warn">{t('orchard.needPad', { level: ORCHARD.padLevel })}</p>
      )}
      <PostLine game={game} />
      <div class="orchard-grid">
        <div>
          <RaspberryMap
            game={game}
            map={map}
            picked={picked}
            onPick={(id) => setPicked(id === picked ? null : id)}
          />
          <Legend />
        </div>
        <div>
          {drupelet ? (
            <DrupeletPanel game={game} map={map} d={drupelet} />
          ) : (
            <p class="small muted">{t('orchard.pick')}</p>
          )}
        </div>
      </div>
      {drupelet && pads.length > 0 && (
        <VoyagePlanner key={drupelet.id} game={game} map={map} d={drupelet} />
      )}
      {game.orchard.post && <PostPanel game={game} post={game.orchard.post} />}
      <VoyageList game={game} />
    </Modal>
  );
}

// --- The raspberry from above -----------------------------------------------------------------

/** A drupelet on the disc: the tip in the middle, the shoulders by the stem on the rim. */
export function drupeletSpot(d: Drupelet, radius: number): { x: number; y: number } {
  const top = 1 - 2 * RASPBERRY.stemCap;
  const r = ((d.y + 1) / (top + 1)) * radius * 0.92 + radius * 0.06;
  const a = Math.atan2(d.z, d.x);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** The name of a clan by its name index. */
export function clanName(t: Translate, n: number): string {
  return t(`orchard.clanNames.n${n}` as TKey);
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clanColor(map: Raspberry, clan: string): string {
  const c = map.clanById.get(clan);
  return CLAN_COLORS[(c?.name ?? 0) % CLAN_COLORS.length]!;
}

function RaspberryMap(props: {
  game: GameState;
  map: Raspberry;
  picked: string | null;
  onPick(id: string): void;
}) {
  const t = useT();
  const { game, map } = props;
  const R = 150;
  const post = game.orchard.post;
  const out = new Set(voyagesOut(game).flatMap((e) => e.voyage?.stops ?? []));
  return (
    <svg
      class="orchard-map"
      viewBox={`${-R - 14} ${-R - 14} ${2 * R + 28} ${2 * R + 28}`}
      role="group"
      aria-label={t('orchard.mapLabel')}
    >
      <circle r={R + 8} class="orchard-skin" />
      {map.drupelets.map((d) =>
        d.links
          .filter((l) => l > d.id)
          .map((l) => {
            const a = drupeletSpot(d, R);
            const b = drupeletSpot(map.byId.get(l)!, R);
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
      {map.drupelets.map((d) => {
        const p = drupeletSpot(d, R);
        const attitude = attitudeOf(game, d.clan, game.now);
        const isPost = post?.drupelet === d.id;
        const taken = game.orchard.taken[d.id] !== undefined;
        const seen = !!game.orchard.views[d.id];
        const label = `${clanName(t, map.clanById.get(d.clan)!.name)} · ${t(`orchard.attitude.${attitude}`)}`;
        return (
          <g
            key={d.id}
            transform={`translate(${p.x},${p.y})`}
            class={`drupelet is-${attitude} ${props.picked === d.id ? 'is-picked' : ''} ${seen ? 'is-seen' : ''}`}
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
            <circle r={9 + d.ring * 1.5} fill={clanColor(map, d.clan)} />
            {isPost && <text class="drupelet-glyph">⌂</text>}
            {!isPost && taken && <text class="drupelet-glyph">✕</text>}
            {out.has(d.id) && <circle r={14 + d.ring * 1.5} class="drupelet-ship" />}
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

// --- A drupelet and its clan ------------------------------------------------------------------

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

function DrupeletPanel({ game, map, d }: { game: GameState; map: Raspberry; d: Drupelet }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
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
        {capital(clanName(t, clan.name))}
      </h3>
      <p class="small">
        {t(`orchard.attitude.${attitude}`)} · {t('orchard.standing', { value: Math.round(value) })}
      </p>
      <StandingGauge value={value} attitude={attitude} />
      <p class="small">
        {t('orchard.wants')} <ResourceIcon id={clan.wants} size={16} />{' '}
        {t(`resources.${clan.wants}`)} ·{' '}
        {t('orchard.rate', { rate: formatNumber(lang, tradeRateShown(game, clan.id)) })}
      </p>
      <p class="small muted">
        {t('orchard.ring', { ring: d.ring + 1 })} ·{' '}
        {t('orchard.clanSize', { count: clan.drupelets.length })}
        {neighbours.length > 0 && ` · ${t('orchard.neighbours', { count: neighbours.length })}`}
      </p>
      {view ? (
        <>
          <p class="small">
            {t(`orchard.view.${view.source}`, { time: formatDuration(lang, game.now - view.at) })}
            {view.nest && ` · ${t('orchard.nest')}`}
          </p>
          <UnitList units={view.units} />
          <p class="small">
            <Icon name="nectar" size={14} /> {t('orchard.storedNectar', { count: view.nectar })}
          </p>
        </>
      ) : (
        <p class="small muted">{t('orchard.unseen')}</p>
      )}
      {game.orchard.taken[d.id] !== undefined && <p class="small warn">{t('orchard.takenLine')}</p>}
    </section>
  );
}

function tradeRateShown(game: GameState, clan: string): number {
  return voyageRate(game, clan);
}

function voyageRate(game: GameState, clan: string): number {
  // The same number as the forecast of a visit (what the clan pays us for 1 000 units now).
  const map = raspberryOfState(game);
  const d = map.drupelets.find((x) => x.clan === clan);
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

function VoyagePlanner({ game, map, d }: { game: GameState; map: Raspberry; d: Drupelet }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const faceMap = useUi((s) => s.map);
  const post = game.orchard.post;
  const atPost = post && !post.ruined && post.drupelet === d.id;
  const [mode, setMode] = useState<Mode>('visit');
  const [crew, setCrew] = useState<VillagerId[]>([]);
  const [second, setSecond] = useState<string | null>(null);
  const clan = map.clanById.get(d.clan)!;
  const [amount, setAmount] = useState(10000);
  const [gift, setGift] = useState(false);
  const [settle, setSettle] = useState(false);
  const [stay, setStay] = useState<VillagerId[]>([]);
  const [back, setBack] = useState<VillagerId[]>([]);
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
  const resting = post ? postKiwis(game) : [];
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
                        {clanName(t, map.clanById.get(map.byId.get(l)!.clan)!.name)} ({l})
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
                <fieldset class="small orchard-stay">
                  <legend>{t('orchard.stay')}</legend>
                  {members.map((v) => (
                    <label key={v.id} class="toggle-line">
                      <input
                        type="checkbox"
                        checked={stay.includes(v.id)}
                        onChange={(e) =>
                          setStay((s) =>
                            (e.target as HTMLInputElement).checked
                              ? [...s, v.id]
                              : s.filter((x) => x !== v.id),
                          )
                        }
                      />{' '}
                      {v.name}
                    </label>
                  ))}
                </fieldset>
              )}
              {atPost && resting.length > 0 && (
                <fieldset class="small orchard-stay">
                  <legend>{t('orchard.bringBack')}</legend>
                  {resting.map((v) => (
                    <label key={v.id} class="toggle-line">
                      <input
                        type="checkbox"
                        checked={back.includes(v.id)}
                        onChange={(e) =>
                          setBack((s) =>
                            (e.target as HTMLInputElement).checked
                              ? [...s, v.id]
                              : s.filter((x) => x !== v.id),
                          )
                        }
                      />{' '}
                      {v.name}
                    </label>
                  ))}
                </fieldset>
              )}
              {f?.stops.map((s) => (
                <p key={s.drupelet} class={`small ${s.attitude === 'hostile' ? 'warn' : ''}`}>
                  {s.attitude === 'hostile'
                    ? t('orchard.refuses')
                    : gift
                      ? t('orchard.forecastGift', { standing: s.standing })
                      : t('orchard.forecastTrade', { nectar: s.nectar, standing: s.standing })}
                </p>
              ))}
              {f && f.store > 0 && (
                <p class="small bonus">{t('orchard.collect', { count: f.store })}</p>
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
                  <p class="small warn">{t('orchard.pillageCost')}</p>
                  <p class="small muted">{t('landing.permadeath')}</p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
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
        <Icon name="raspberry" size={20} /> {t(`orchard.launch.${mode}`)} ·{' '}
        {formatDuration(lang, 2 * (f?.travelMs ?? 0) + (f?.hopsMs ?? 0))}
      </button>
      {error && crew.length > 0 && <p class="small warn">{t(`errors.${error}`)}</p>}
    </section>
  );
}

// --- Our trading post -------------------------------------------------------------------------

function PostLine({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const a = game.orchard.post?.attack;
  if (!a?.announced) return null;
  const f = postAttackForecast(game);
  return (
    <p class="small warn orchard-alarm">
      {t('orchard.attack', {
        clan: capital(clanName(t, raspberryOfState(game).clanById.get(a.clan!)!.name)),
        time: formatDuration(lang, Math.max(0, a.at - game.now)),
      })}
      {f && ` · ${t(`orchard.holds.${f.odds}`)}`} · {t('orchard.answers')}
    </p>
  );
}

const MODULE_GLYPH: Record<PostModuleType, string> = { hut: '⌂', stall: '✿', palisade: '▥' };
const SIZE = 22;

function PostPanel({ game, post }: { game: GameState; post: TradingPost }) {
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
  const here = postKiwis(game);
  const picked = tile ? post.modules.find((m) => m.q === tile.q && m.r === tile.r) : undefined;
  return (
    <section class="field orchard-post">
      <h3>
        <Icon name="raspberry" size={20} /> {t('orchard.postTitle')}
      </h3>
      {post.ruined ? (
        <p class="small warn">{t('orchard.ruined')}</p>
      ) : post.readyAt > game.now ? (
        <p class="small muted">
          {t('orchard.building', { time: formatDuration(lang, post.readyAt - game.now) })}
        </p>
      ) : null}
      <p class="small">
        <Icon name="nectar" size={14} />{' '}
        {t('orchard.store', { count: postStore(post), cap: POST.storeCap })}
        {' · '}
        {t('orchard.kiwisThere', { count: here.length, room: postHousing(post, game.now) })}
      </p>
      {here.length > 0 && <p class="small muted">{here.map((v) => v.name).join(', ')}</p>}
      <div class="orchard-post-grid">
        <svg
          class="orbit-map"
          viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
          role="group"
          aria-label={t('orchard.postMap')}
        >
          <circle r={span * 0.47} class="orchard-skin" />
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
              const lock = postModuleLock(game, type, tile);
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
              })}
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

// --- Voyages under way ------------------------------------------------------------------------

function VoyageList({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const list = voyagesOut(game);
  if (list.length === 0) return null;
  return (
    <section class="field">
      <h3>{t('orchard.underWay')}</h3>
      <ul class="small">
        {list.map((e) => (
          <li key={e.id}>
            {t(`orchard.mode.${e.mission as Mode}`)} · {e.voyage?.stops.join(' → ')} ·{' '}
            {e.status === 'outbound'
              ? e.arriveAt > game.now
                ? t('orchard.arrives', { time: formatDuration(lang, e.arriveAt - game.now) })
                : t('orchard.awaiting')
              : t('orchard.back', {
                  time: formatDuration(lang, Math.max(0, e.returnAt - game.now)),
                })}
          </li>
        ))}
      </ul>
    </section>
  );
}
