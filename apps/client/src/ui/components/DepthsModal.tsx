import { useState } from 'preact/hooks';
import {
  DEPTHS,
  LANDING,
  canAfford,
  canDig,
  delveCrewMax,
  delveForecast,
  depthsMapOf,
  doorStrength,
  doorFortifyCost,
  fortifyDoorLock,
  gallerySlots,
  galleryRate,
  galleryResource,
  meteorIronOf,
  minersIn,
  rations,
  reachableRooms,
  techEffects,
  tunnelOf,
  validateCommand,
  workerPower,
  type DelveForecast,
  type DepthRoom,
  type Expedition,
  type GameState,
  type LandingOrders,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { CrewPicker } from './ExpeditionModal';
import { crewHitsAir, LandingReplay, OrdersPicker, UnitList } from './LandingParts';
import { Modal } from './Modal';
import { Icon } from '../iconSet';

/**
 * Chantier 48: the Depths screen — the cut of our half (rooms under the fog, galleries, the
 * entrance), the selected room, the tunnel door, the miners, the delve planner and the reports.
 * The 3D cut is chantier 49.
 */

/** The Depths show once spelunking is known (or a tunnel stands). */
export function depthsVisible(game: GameState): boolean {
  return game.colony.index === 0 && (!!tunnelOf(game) || techEffects(game).depths);
}

export function DepthsModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const [selected, setSelected] = useState<string | null>(null);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none' });
  const tunnel = tunnelOf(game);
  const map = depthsMapOf(game);
  const room = selected ? (map.byId.get(selected) ?? null) : null;
  return (
    <Modal title={t('depths.title')} onClose={close} class="depths-modal">
      {!tunnel ? (
        <section class="field">
          <p>{t('depths.noTunnel')}</p>
          <button
            class="btn btn-primary"
            onClick={() => uiStore.setState({ modal: 'plans', plansTab: 'buildings' })}
          >
            {t('plans.button')}
          </button>
        </section>
      ) : (
        <>
          <p class="small muted">{t('depths.intro')}</p>
          <div class="depths-layout">
            <DepthsCut game={game} selected={selected} onSelect={setSelected} />
            <div class="depths-side">
              {room ? (
                <RoomPanel game={game} room={room} />
              ) : (
                <p class="small muted">{t('depths.pick')}</p>
              )}
            </div>
          </div>
          {room && <RoomActions game={game} room={room} />}
          <DoorBox game={game} />
          <DelveList game={game} />
        </>
      )}
    </Modal>
  );
}

// --- The cut ------------------------------------------------------------------------------------

const W = 300;
const TOP = 16;
const R = 140;
const ROW = 40;

function roomAt(room: DepthRoom): { x: number; y: number } {
  const y = room.depth * ROW;
  const half = Math.sqrt(R * R - y * y) * 0.82;
  return { x: W / 2 + room.x * half, y: TOP + y };
}

const KIND_COLORS: Record<string, string> = {
  bundle: '#c9a35c',
  sap: '#e7a23a',
  nest: '#b5543c',
  scree: '#8b6f4e',
  raphides: '#e9f1f4',
};

function DepthsCut(props: {
  game: GameState;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const t = useT();
  const { game } = props;
  const map = depthsMapOf(game);
  const views = game.depths.views;
  const galleries = game.depths.galleries;
  const open = new Set(reachableRooms(game).map((r) => r.id));
  const going = new Set(
    game.expeditions
      .filter((e) => e.mission === 'delve' && e.status === 'outbound')
      .map((e) => e.room),
  );
  const entrance = { x: W / 2, y: TOP };
  return (
    <svg
      class="depths-cut"
      viewBox={`0 0 ${W} ${TOP + R + 8}`}
      role="img"
      aria-label={t('depths.cut')}
    >
      <path d={`M ${W / 2 - R} ${TOP} A ${R} ${R} 0 0 0 ${W / 2 + R} ${TOP} Z`} class="cut-flesh" />
      {/* The locules and the core, closed until later ages (chantiers 50 and 52). */}
      <path
        d={`M ${W / 2 - 52} ${TOP + R - 4} A 52 52 0 0 1 ${W / 2 + 52} ${TOP + R - 4}`}
        class="cut-locules"
      />
      <path
        d={`M ${W / 2 - 22} ${TOP + R - 4} A 22 22 0 0 1 ${W / 2 + 22} ${TOP + R - 4}`}
        class="cut-core"
      />
      <line x1={W / 2 - R} y1={TOP} x2={W / 2 + R} y2={TOP} class="cut-surface" />
      {map.rooms.map((r) =>
        r.links
          .filter((id) => id > r.id)
          .map((id) => {
            const a = roomAt(r);
            const b = roomAt(map.byId.get(id)!);
            const lit = galleries[r.id] || galleries[id];
            return (
              <line
                key={`${r.id}-${id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                class={`cut-link ${lit ? 'is-lit' : ''}`}
              />
            );
          }),
      )}
      {map.rooms
        .filter((r) => r.entrance)
        .map((r) => {
          const a = roomAt(r);
          return (
            <line
              key={`e-${r.id}`}
              x1={entrance.x}
              y1={entrance.y}
              x2={a.x}
              y2={a.y}
              class="cut-link is-lit"
            />
          );
        })}
      <circle cx={entrance.x} cy={entrance.y} r={7} class="cut-entrance" />
      {map.rooms.map((r) => {
        const p = roomAt(r);
        const v = views[r.id];
        const g = galleries[r.id];
        const kind = g?.kind ?? v?.kind;
        const state = g ? 'gallery' : v?.units ? 'seen' : v ? 'heard' : 'fog';
        return (
          <g
            key={r.id}
            class={`cut-room is-${state} ${props.selected === r.id ? 'is-selected' : ''} ${open.has(r.id) ? 'is-open' : ''}`}
            onClick={() => props.onSelect(r.id)}
            role="button"
            aria-label={roomName(t, game, r)}
          >
            <circle cx={p.x} cy={p.y} r={12} class="cut-room-shape" />
            {kind ? (
              <circle cx={p.x} cy={p.y} r={5} fill={KIND_COLORS[kind]} class="cut-kind" />
            ) : (
              <text x={p.x} y={p.y + 4} class="cut-unknown">
                ?
              </text>
            )}
            {going.has(r.id) && <circle cx={p.x} cy={p.y} r={15} class="cut-going" />}
            {g && minersIn(game, r.id).length > 0 && (
              <text x={p.x + 10} y={p.y - 9} class="cut-miners">
                {minersIn(game, r.id).length}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function roomName(t: Translate, game: GameState, r: DepthRoom): string {
  const kind = game.depths.galleries[r.id]?.kind ?? game.depths.views[r.id]?.kind;
  return t('depths.roomName', {
    kind: kind ? t(`depths.kinds.${kind}`) : t('depths.unknownRoom'),
    depth: r.depth,
  });
}

// --- One room -----------------------------------------------------------------------------------

function RoomPanel({ game, room }: { game: GameState; room: DepthRoom }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const v = game.depths.views[room.id];
  const g = game.depths.galleries[room.id];
  const reachable = reachableRooms(game).some((r) => r.id === room.id);
  return (
    <section class="field depths-room">
      <h3>{roomName(t, game, room)}</h3>
      {g ? (
        <p class="small bonus">{t('depths.gallery')}</p>
      ) : v ? (
        <p class="small muted">
          {t(`depths.source.${v.source}`, {
            ago: formatDuration(lang, Math.max(0, now - v.at)),
          })}
        </p>
      ) : (
        <p class="small muted">{t('depths.fog')}</p>
      )}
      {(g?.kind ?? v?.kind) && (
        <p class="small">{t(`depths.kindHints.${(g?.kind ?? v?.kind)!}`)}</p>
      )}
      {v?.units && v.units.length > 0 && !g && <UnitList units={v.units} />}
      {v?.hazard !== undefined && !g && (
        <p class={`small ${v.hazard ? 'warn' : ''}`}>
          {v.hazard
            ? t(`depths.hazards.${v.hazard.kind}`, { pct: Math.round(v.hazard.strength * 100) })
            : t('depths.noHazard')}
        </p>
      )}
      {!g && !reachable && <p class="small muted">{t('depths.outOfReach')}</p>}
    </section>
  );
}

/** Under the cut, full width: the gallery's miners, or the planner of a delve to the room. */
function RoomActions({ game, room }: { game: GameState; room: DepthRoom }) {
  if (game.depths.galleries[room.id]) return <MinersBox game={game} roomId={room.id} />;
  if (!reachableRooms(game).some((r) => r.id === room.id)) return null;
  return <DelvePlanner key={room.id} game={game} room={room} />;
}

function MinersBox({ game, roomId }: { game: GameState; roomId: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const miners = minersIn(game, roomId);
  const slots = gallerySlots(game, roomId);
  const resource = galleryResource(game, roomId)!;
  const rate = galleryRate(game, roomId);
  const best = (): VillagerId[] =>
    game.villagers
      .filter((v) => canDig(v) && (v.job.kind !== 'mine' || v.job.roomId === roomId))
      .filter((v) => v.job.kind === 'idle' || v.job.kind === 'mine' || !v.locked)
      .sort((a, b) => workerPower(b, resource) - workerPower(a, resource))
      .slice(0, slots)
      .map((v) => v.id);
  return (
    <div class="field depths-miners">
      <p class="small">
        <ResourceIcon id={resource} size={14} />{' '}
        {t('depths.miners', { count: miners.length, slots })}
        {rate > 0 && (
          <span class="muted">
            {' '}
            · {t('depths.perHour', { value: formatNumber(lang, Math.round(rate)) })}
          </span>
        )}
      </p>
      {miners.length > 0 && <p class="small muted">{miners.map((v) => v.name).join(', ')}</p>}
      {game.depths.door.closed ? (
        <p class="small warn">{t('depths.doorClosedMines')}</p>
      ) : (
        <div class="row">
          <button
            class="btn btn-small"
            onClick={() => actions.dispatch({ type: 'postMiners', roomId, villagerIds: best() })}
          >
            {t('depths.sendMiners')}
          </button>
          {miners.length > 0 && (
            <button
              class="btn btn-small"
              onClick={() => actions.dispatch({ type: 'postMiners', roomId, villagerIds: [] })}
            >
              {t('depths.bringUp')}
            </button>
          )}
        </div>
      )}
      <p class="small muted">{t('depths.minersHint')}</p>
    </div>
  );
}

// --- The delve planner --------------------------------------------------------------------------

function DelvePlanner({ game, room }: { game: GameState; room: DepthRoom }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const map = useUi((s) => s.map);
  const [crew, setCrew] = useState<VillagerId[]>([]);
  const [orders, setOrders] = useState<LandingOrders>({ ...LANDING.defaultOrders });
  const members = crew
    .map((id) => game.villagers.find((v) => v.id === id))
    .filter((v): v is Villager => !!v);
  const travel = DEPTHS.travelMs[room.depth - 1]!;
  const need = rations(game, members, 2 * travel);
  const up5 = (x: number) => Math.ceil((x * 1.1) / 5) * 5;
  const provisions = { pulp: up5(need.pulp), juice: up5(need.juice) };
  const f = delveForecast(game, room.id, members, orders);
  const cmd = { type: 'delve' as const, roomId: room.id, crew, provisions, orders };
  const error = map ? validateCommand(game, cmd, { now, map }) : null;
  const max = delveCrewMax(game);
  return (
    <div class="field depths-planner">
      <h3>{t('depths.planner')}</h3>
      <div class="depths-plan-grid">
        <div>
          <CrewPicker game={game} crew={crew} max={max} risk={{}} onChange={setCrew} />
        </div>
        <div>
          {f && <DelveForecastLines forecast={f} crew={members} game={game} />}
          <OrdersPicker orders={orders} onChange={setOrders} delve />
        </div>
      </div>
      <p class="small">
        {t('depths.rations')} <Cost cost={provisions} have={game.resources} />
      </p>
      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch(cmd)) setCrew([]);
        }}
      >
        <Icon name="tunnel" size={20} /> {t('depths.launch')} · {formatDuration(lang, 2 * travel)}
      </button>
      {error && crew.length > 0 && <p class="small warn">{t(`errors.${error}`)}</p>}
    </div>
  );
}

function DelveForecastLines(props: {
  forecast: DelveForecast;
  crew: readonly Villager[];
  game: GameState;
}) {
  const t = useT();
  const f = props.forecast;
  const won = f.trials.filter((x) => x === 'victory').length;
  const hazard = f.hazard ?? (f.possibleHazard ? null : undefined);
  const avg = (k: 'chance' | 'share') =>
    f.harm.length > 0 ? f.harm.reduce((s, h) => s + h[k], 0) / f.harm.length : 0;
  const spelunker = props.crew.some((v) => v.classId === 'spelunker');
  return (
    <section class="field depths-forecast">
      <p class="small">{t(`depths.knowledge.${f.knowledge}`)}</p>
      {f.knowledge !== 'seen' && f.units.length > 0 && (
        <>
          <p class="small muted">{t('depths.estimate')}</p>
          <UnitList units={f.units} />
        </>
      )}
      {f.trials.length > 0 && (
        <p class="small">
          <span class={`odds odds-${f.odds}`}>{t(`expedition.odds.${f.odds}`)}</span>{' '}
          {t('landing.trials', { won })}
        </p>
      )}
      {hazard && (
        <p class="small warn">
          {t(`depths.hazards.${hazard.kind}`, { pct: Math.round(hazard.strength * 100) })}
          {f.harm.length > 0 &&
            ` · ${t('depths.harm', {
              chance: Math.round(avg('chance') * 100),
              share: Math.round(avg('share') * 100),
            })}`}
        </p>
      )}
      {hazard === null && <p class="small muted">{t('depths.maybeHazard')}</p>}
      {spelunker && <p class="small bonus">{t('depths.spelunker')}</p>}
      {f.trials.length > 0 && f.expectedDead > 0 && (
        <p class="small warn">{t('landing.dead', { count: f.expectedDead })}</p>
      )}
      {f.trials.length > 0 && f.expectedHurt > 0 && (
        <p class="small">{t('landing.hurt', { count: f.expectedHurt })}</p>
      )}
      {props.crew.length > 0 && !crewHitsAir(props.crew, props.game) && (
        <p class="small warn">{t('depths.noAir')}</p>
      )}
      <p class="small muted">{t('depths.permadeath')}</p>
    </section>
  );
}

// --- The door -----------------------------------------------------------------------------------

function DoorBox({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const door = game.depths.door;
  const tunnel = tunnelOf(game)!;
  const cost = doorFortifyCost(game);
  const lock = fortifyDoorLock(game);
  const afford = canAfford(game.resources, cost.resources) && meteorIronOf(game) >= cost.iron;
  const up = game.depths.next;
  return (
    <section class="field depths-door">
      <h3>{t('depths.door.title')}</h3>
      <p class="small">
        {t(door.closed ? 'depths.door.closed' : 'depths.door.open')} ·{' '}
        {t('depths.door.strength', { value: doorStrength(game) })}
        {tunnel.damaged && <span class="warn"> · {t('depths.door.damaged')}</span>}
      </p>
      {up?.announced && (
        <p class="small warn">
          {t('depths.upwell', {
            duration: formatDuration(lang, Math.max(0, up.at - now)),
            power: formatNumber(lang, Math.round(up.ground + up.air)),
          })}
        </p>
      )}
      <p class="small">
        {door.fortifying
          ? t('beacons.fortifying', {
              duration: formatDuration(lang, Math.max(0, door.fortifying.until - now)),
            })
          : door.fort
            ? t('beacons.fortified', { level: door.fort })
            : t('beacons.unfortified')}
      </p>
      <div class="row">
        <button
          class="btn btn-small"
          onClick={() => actions.dispatch({ type: 'setTunnelDoor', closed: !door.closed })}
        >
          {t(door.closed ? 'depths.door.openIt' : 'depths.door.closeIt')}
        </button>
        <button
          class="btn btn-small"
          disabled={lock !== null || !afford}
          onClick={() => actions.dispatch({ type: 'fortifyTunnel' })}
        >
          {t(door.fort ? 'beacons.reinforce' : 'beacons.fortify')}
        </button>
      </div>
      {lock === null && (
        <p class="small muted">
          {t('beacons.fortifyCost', {
            hours: Math.round(DEPTHS.fortify.durationMs / 3_600_000),
          })}{' '}
          <Cost
            cost={cost.resources}
            have={game.resources}
            iron={cost.iron}
            haveIron={meteorIronOf(game)}
          />
        </p>
      )}
      {lock && lock !== 'noTunnel' && <p class="small muted">{t(`errors.${lock}`)}</p>}
      <p class="small muted">{t('depths.door.hint')}</p>
    </section>
  );
}

// --- Delves under way and reports ---------------------------------------------------------------

function DelveList({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const delves = game.expeditions.filter((e) => e.mission === 'delve');
  if (delves.length === 0) return null;
  const map = depthsMapOf(game);
  return (
    <section class="field">
      <h3>{t('depths.delves')}</h3>
      <ul class="depths-delves small">
        {delves.map((e) => {
          const room = e.room ? map.byId.get(e.room) : undefined;
          const name = room ? roomName(t, game, room) : '';
          return (
            <li key={e.id}>
              <span>{name}</span>{' '}
              {e.status === 'outbound' ? (
                <span class="muted">
                  {e.arriveAt > now
                    ? t('depths.goingDown', {
                        duration: formatDuration(lang, e.arriveAt - now),
                      })
                    : t('depths.awaiting')}
                </span>
              ) : e.result ? (
                <button
                  class="btn btn-small"
                  onClick={() => uiStore.setState({ modal: 'report', reportId: e.id })}
                >
                  {t(`depths.outcome.${e.result.outcome ?? 'defeat'}`)}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Chantier 48: how a delve ended (in the report). */
export function DelveReport({ e, game }: { e: Expedition; game: GameState }) {
  const t = useT();
  const r = e.result!;
  const room = e.room ? depthsMapOf(game).byId.get(e.room) : undefined;
  const name = room ? roomName(t, game, room) : '';
  const won = r.outcome === 'victory';
  const hits = r.hazard?.hits ?? [];
  return (
    <>
      <h2 class={won ? 'bonus' : 'warn'}>
        {t(`depths.report.${r.outcome ?? 'defeat'}`, { room: name })}
      </h2>
      {r.hazard && (
        <p class="small warn">
          {t(`depths.hazards.${r.hazard.kind}`, { pct: Math.round(r.hazard.strength * 100) })}
          {' · '}
          {hits.length > 0
            ? t('depths.report.hits', {
                names: hits
                  .map((h) => e.roster.find((m) => m.id === h.id)?.name ?? h.id)
                  .join(', '),
              })
            : t('depths.report.noHits')}
        </p>
      )}
      {won && <p class="small bonus">{t('depths.report.gallery')}</p>}
      {r.lantern && <p class="small">{t('depths.report.lantern')}</p>}
      {r.iron ? <p class="small">{t('depths.report.iron', { count: r.iron })}</p> : null}
      {r.outcome === 'retreat' && <p class="small">{t('landing.report.glimpse')}</p>}
      {r.seen && r.seen.length > 0 && (
        <section class="field">
          <h3>{t('landing.report.seen')}</h3>
          <UnitList units={r.seen} />
        </section>
      )}
      {r.log && <LandingReplay log={r.log} delve />}
    </>
  );
}
