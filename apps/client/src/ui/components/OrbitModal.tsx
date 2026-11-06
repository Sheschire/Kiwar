import { useState } from 'preact/hooks';
import {
  canFly,
  comingSwarm,
  crystalUnits,
  dockTravel,
  dustPoints,
  dustTank,
  greenhouseRates,
  hexToPixel,
  kiwaiCap,
  kiwaiDustRate,
  kiwaiHousing,
  kiwaiLaunchCost,
  kiwaiMapOf,
  KIWAI_TYPES,
  launchLock,
  meteorIronOf,
  moduleFits,
  moduleLock,
  moduleSlots,
  MODULE_TYPES,
  MODULES,
  observatoryResearch,
  ORBIT,
  orbitCrew,
  orbitPower,
  serviceLock,
  shieldLock,
  shuttleLock,
  wearAnnounced,
  yardOf,
  type GameState,
  type Kiwai,
  type KiwaiType,
  type ModuleType,
  type OrbitModule,
  type SiteTile,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { Cost } from './Cost';
import { Modal } from './Modal';
import { Icon } from '../iconSet';
import { useJobLabel } from './VillageModal';

/**
 * Chantier 53: the Orbit screen — launching kiwais from the orbital yard, each kiwai's small
 * map (tap a tile to set a module), its crew and the shuttle, what it gives, and its risks
 * (a breakdown announced, a comet swarm coming) with their answers.
 */

/** The Orbit shows once the colony has its orbital yard. */
export function orbitVisible(game: GameState): boolean {
  return !!yardOf(game);
}

/** Something in orbit asks for the player (a swarm coming on kiwis unshielded, a breakdown). */
export function orbitAlarm(game: GameState): boolean {
  const swarm = comingSwarm(game);
  return game.orbit.kiwais.some(
    (k) =>
      (swarm && k.readyAt <= game.now && k.shield !== swarm.id) ||
      wearAnnounced(k, game.now) ||
      k.modules.some((m) => m.broken !== undefined && m.repairAt === undefined),
  );
}

export function OrbitModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const [selected, setSelected] = useState<string | null>(() => uiStore.getState().orbitKiwai);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none', orbitKiwai: null });
  const kiwai = game.orbit.kiwais.find((k) => k.id === selected) ?? game.orbit.kiwais[0] ?? null;
  return (
    <Modal title={t('orbit.title')} onClose={close} class="orbit-modal">
      {!yardOf(game) ? (
        <section class="field">
          <p>{t('orbit.noYard')}</p>
          <button
            class="btn btn-primary"
            onClick={() => uiStore.setState({ modal: 'plans', plansTab: 'buildings' })}
          >
            {t('plans.button')}
          </button>
        </section>
      ) : (
        <>
          <p class="small muted">{t('orbit.intro')}</p>
          <SwarmLine game={game} />
          {game.orbit.kiwais.length > 0 && (
            <div class="row orbit-tabs" role="tablist">
              {game.orbit.kiwais.map((k) => (
                <button
                  key={k.id}
                  role="tab"
                  aria-selected={kiwai?.id === k.id}
                  class={`btn btn-small ${kiwai?.id === k.id ? 'btn-active' : ''}`}
                  onClick={() => setSelected(k.id)}
                >
                  {t(`orbit.types.${k.type}.name`)}
                </button>
              ))}
            </div>
          )}
          {kiwai && <KiwaiPanel game={game} kiwai={kiwai} />}
          <LaunchBox game={game} />
        </>
      )}
    </Modal>
  );
}

// --- Launch ---------------------------------------------------------------------------------

function LaunchBox({ game }: { game: GameState }) {
  const t = useT();
  const [type, setType] = useState<KiwaiType>('harvest');
  const cap = kiwaiCap(game);
  if (game.orbit.kiwais.length >= cap) {
    return <p class="small muted">{t('orbit.full', { count: game.orbit.kiwais.length, cap })}</p>;
  }
  const cost = kiwaiLaunchCost(game);
  const lock = launchLock(game);
  return (
    <section class="field orbit-launch">
      <h3>{t('orbit.launchTitle', { n: game.orbit.kiwais.length + 1, cap })}</h3>
      <div class="orbit-types">
        {KIWAI_TYPES.map((k) => (
          <button
            key={k}
            class={`orbit-type ${type === k ? 'is-picked' : ''}`}
            aria-pressed={type === k}
            onClick={() => setType(k)}
          >
            <strong>{t(`orbit.types.${k}.name`)}</strong>
            <span class="small">{t(`orbit.types.${k}.gives`)}</span>
          </button>
        ))}
      </div>
      <Cost
        cost={{}}
        durationMs={cost.durationMs}
        giantSeeds={cost.giantSeeds}
        haveSeeds={game.giantSeeds}
        crystal={cost.crystal}
        haveCrystal={crystalUnits(game.crystal)}
        iron={cost.iron}
        haveIron={meteorIronOf(game)}
        stardust={cost.stardust}
        haveDust={dustPoints(game.stardust)}
      />
      {lock && <p class="small warn">{t(`errors.${lock}`)}</p>}
      <button
        class="btn btn-primary"
        disabled={!!lock}
        onClick={() => {
          actions.dispatch({ type: 'launchKiwai', kiwaiType: type });
        }}
      >
        {t('orbit.launch', { type: t(`orbit.types.${type}.name`) })}
      </button>
    </section>
  );
}

// --- A kiwai ----------------------------------------------------------------------------------

function KiwaiPanel({ game, kiwai }: { game: GameState; kiwai: Kiwai }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [tile, setTile] = useState<{ q: number; r: number } | null>(null);
  if (kiwai.readyAt > game.now) {
    return (
      <section class="field">
        <p>
          {t('orbit.launching', {
            type: t(`orbit.types.${kiwai.type}.name`),
            time: formatDuration(lang, kiwai.readyAt - game.now),
          })}
        </p>
      </section>
    );
  }
  const module = tile ? kiwai.modules.find((m) => m.q === tile.q && m.r === tile.r) : undefined;
  return (
    <section class="field orbit-kiwai">
      <div class="row orbit-head">
        <p class="small">{t(`orbit.types.${kiwai.type}.desc`)}</p>
        <button class="btn btn-small" onClick={() => actions.lookAtKiwai(kiwai.id)}>
          {t('orbit.look')}
        </button>
      </div>
      <div class="orbit-layout">
        <KiwaiMap game={game} kiwai={kiwai} selected={tile} onSelect={setTile} />
        <div class="orbit-side">
          <OutputLine game={game} kiwai={kiwai} />
          <p class="small muted">
            {t('orbit.places', {
              used: kiwai.modules.length,
              slots: moduleSlots(game),
              housed: orbitCrew(game, kiwai.id).length,
              housing: kiwaiHousing(kiwai, game.now),
            })}
          </p>
          {tile && module && <ModuleBox game={game} kiwai={kiwai} module={module} />}
          {tile && !module && <BuildBox game={game} kiwai={kiwai} tile={tile} />}
          {!tile && <p class="small muted">{t('orbit.pickTile')}</p>}
        </div>
      </div>
      <WearLine game={game} kiwai={kiwai} />
      <ShuttleBox game={game} kiwai={kiwai} />
    </section>
  );
}

const MODULE_GLYPH: Record<ModuleType, string> = {
  habitat: '⌂',
  panel: '▦',
  sensor: '◎',
  dome: '◒',
  berth: '⊚',
};

const SIZE = 22;

/** The kiwai's small map in 2D: pad, rocks, ground; modules as glyphs, broken ones in red. */
function KiwaiMap(props: {
  game: GameState;
  kiwai: Kiwai;
  selected: { q: number; r: number } | null;
  onSelect(tile: { q: number; r: number } | null): void;
}) {
  const t = useT();
  const { game, kiwai } = props;
  const map = kiwaiMapOf(game, kiwai);
  const span = SIZE * (ORBIT.radius * 2 + 1) * 1.8;
  const corner = (i: number) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${SIZE * 0.94 * Math.cos(a)},${SIZE * 0.94 * Math.sin(a)}`;
  };
  const shape = [0, 1, 2, 3, 4, 5].map(corner).join(' ');
  return (
    <svg
      class="orbit-map"
      viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
      role="group"
      aria-label={t('orbit.mapLabel')}
    >
      <circle r={span * 0.47} class="orbit-skin" />
      {map.tiles.map((tile: SiteTile) => {
        const p = hexToPixel(tile, SIZE);
        const m = kiwai.modules.find((x) => x.q === tile.q && x.r === tile.r);
        const picked = props.selected?.q === tile.q && props.selected?.r === tile.r;
        const state = m ? moduleState(m, game.now) : null;
        return (
          <g
            key={`${tile.q},${tile.r}`}
            transform={`translate(${p.x},${p.y})`}
            class={`orbit-tile is-${tile.kind} ${picked ? 'is-picked' : ''} ${state ? `is-${state}` : ''}`}
            role={tile.kind === 'ground' ? 'button' : undefined}
            tabIndex={tile.kind === 'ground' ? 0 : undefined}
            aria-label={m ? t(`orbit.modules.${m.type}.name`) : t(`orbit.tiles.${tile.kind}`)}
            onClick={() =>
              tile.kind === 'ground' ? props.onSelect(picked ? null : tile) : undefined
            }
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && tile.kind === 'ground') {
                e.preventDefault();
                props.onSelect(picked ? null : tile);
              }
            }}
          >
            <polygon points={shape} />
            {m && <text class="orbit-glyph">{MODULE_GLYPH[m.type]}</text>}
            {tile.kind === 'pad' && <text class="orbit-glyph">✦</text>}
          </g>
        );
      })}
    </svg>
  );
}

type ModuleState = 'assembling' | 'broken' | 'repairing' | 'working';

function moduleState(m: OrbitModule, now: number): ModuleState {
  if (m.readyAt > now) return 'assembling';
  if (m.broken !== undefined) return m.repairAt !== undefined ? 'repairing' : 'broken';
  return 'working';
}

function ModuleBox({
  game,
  kiwai,
  module: m,
}: {
  game: GameState;
  kiwai: Kiwai;
  module: OrbitModule;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const state = moduleState(m, game.now);
  return (
    <div class="orbit-module">
      <h4>{t(`orbit.modules.${m.type}.name`)}</h4>
      <p class="small">{t(`orbit.modules.${m.type}.desc`)}</p>
      <p class={`small ${state === 'broken' ? 'warn' : 'muted'}`}>
        {state === 'assembling'
          ? t('orbit.state.assembling', { time: formatDuration(lang, m.readyAt - game.now) })
          : state === 'repairing'
            ? t('orbit.state.repairing', { time: formatDuration(lang, m.repairAt! - game.now) })
            : t(`orbit.state.${state}`)}
      </p>
      <button
        class="btn btn-small"
        onClick={() => {
          actions.dispatch({ type: 'removeModule', kiwaiId: kiwai.id, moduleId: m.id });
        }}
      >
        {t('orbit.remove')}
      </button>
    </div>
  );
}

function BuildBox({
  game,
  kiwai,
  tile,
}: {
  game: GameState;
  kiwai: Kiwai;
  tile: { q: number; r: number };
}) {
  const t = useT();
  const fitting = MODULE_TYPES.filter((type) => moduleFits(type, kiwai.type));
  return (
    <div class="orbit-build">
      {fitting.map((type) => {
        const def = MODULES[type];
        const lock = moduleLock(game, kiwai, type, tile);
        return (
          <div key={type} class="orbit-build-row">
            <strong>{t(`orbit.modules.${type}.name`)}</strong>
            <span class="small muted">{t(`orbit.modules.${type}.desc`)}</span>
            <Cost
              cost={def.cost}
              have={game.resources}
              durationMs={def.durationMs}
              crystal={def.crystal}
              haveCrystal={crystalUnits(game.crystal)}
              iron={def.iron}
              haveIron={meteorIronOf(game)}
            />
            {lock && lock !== 'notEnoughResources' && (
              <span class="small warn">{t(`errors.${lock}`)}</span>
            )}
            <button
              class="btn btn-small btn-primary"
              disabled={!!lock}
              onClick={() => {
                actions.dispatch({
                  type: 'buildModule',
                  kiwaiId: kiwai.id,
                  moduleType: type,
                  q: tile.q,
                  r: tile.r,
                });
              }}
            >
              {t('orbit.set')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** What the kiwai gives right now. */
function OutputLine({ game, kiwai }: { game: GameState; kiwai: Kiwai }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const n = (v: number) => formatNumber(lang, v);
  if (kiwai.type === 'greenhouse') {
    const r = greenhouseRates(game);
    return (
      <p class="orbit-output">
        <ResourceIcon id="juice" /> +{n(r.juice ?? 0)}/h <ResourceIcon id="fiber" /> +
        {n(r.fiber ?? 0)}/h
      </p>
    );
  }
  if (kiwai.type === 'observatory') {
    return (
      <p class="orbit-output">
        <Icon name="research" /> {t('orbit.research', { n: n(observatoryResearch(game)) })}
      </p>
    );
  }
  if (kiwai.type === 'dock') {
    return (
      <p class="orbit-output">
        {t('orbit.travel', { pct: Math.round((1 - dockTravel(game)) * 100) })}
      </p>
    );
  }
  const rate = (kiwaiDustRate(game, kiwai) * 3_600_000) / (dustTank() / ORBIT.dust.tank);
  return (
    <p class="orbit-output">
      <Icon name="stardust" />{' '}
      {t('orbit.tank', {
        n: dustPoints(kiwai.dust),
        cap: ORBIT.dust.tank,
        rate: n(rate),
      })}
    </p>
  );
}

/** The next breakdown once announced (a service puts it off), broken modules waiting. */
function WearLine({ game, kiwai }: { game: GameState; kiwai: Kiwai }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const waiting = kiwai.modules.filter((m) => m.broken !== undefined && m.repairAt === undefined);
  const announced = wearAnnounced(kiwai, game.now);
  const planned = kiwai.modules.find((m) => m.id === kiwai.wear.moduleId);
  if (!announced && waiting.length === 0) return null;
  const lock = serviceLock(game, kiwai);
  return (
    <div class="orbit-risk">
      {announced && planned && (
        <p class="small warn">
          {t('orbit.wear', {
            module: t(`orbit.modules.${planned.type}.name`),
            time: formatDuration(lang, kiwai.wear.at - game.now),
          })}
        </p>
      )}
      {waiting.length > 0 && (
        <p class="small warn">{t('orbit.brokenWaiting', { count: waiting.length })}</p>
      )}
      {announced && (
        <button
          class="btn btn-small"
          disabled={!!lock}
          onClick={() => {
            actions.dispatch({ type: 'serviceKiwai', kiwaiId: kiwai.id });
          }}
        >
          {t('orbit.service', { iron: ORBIT.wear.serviceIron })}
        </button>
      )}
    </div>
  );
}

/** A comet swarm coming: shield every kiwai, or evacuate. */
function SwarmLine({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const swarm = comingSwarm(game);
  if (!swarm) return null;
  const open = game.orbit.kiwais.filter((k) => k.readyAt <= game.now && k.shield !== swarm.id);
  return (
    <div class="orbit-risk orbit-swarm">
      <p class="small warn">
        {t('orbit.swarm', { time: formatDuration(lang, swarm.at - game.now) })}
      </p>
      {open.map((k) => {
        const lock = shieldLock(game, k);
        const crew = orbitCrew(game, k.id).map((v) => v.id);
        return (
          <div key={k.id} class="row">
            <span class="small">{t(`orbit.types.${k.type}.name`)}</span>
            <button
              class="btn btn-small"
              disabled={!!lock}
              onClick={() => {
                actions.dispatch({ type: 'raiseShield', kiwaiId: k.id });
              }}
            >
              {t('orbit.shield', { dust: ORBIT.swarm.shieldDust })}
            </button>
            {crew.length > 0 && (
              <button
                class="btn btn-small"
                disabled={
                  !!shuttleLock(game, {
                    kiwaiId: k.id,
                    up: [],
                    down: crew.slice(0, ORBIT.shuttle.seats),
                  })
                }
                onClick={() => {
                  actions.dispatch({
                    type: 'sendShuttle',
                    kiwaiId: k.id,
                    up: [],
                    down: crew.slice(0, ORBIT.shuttle.seats),
                  });
                }}
              >
                {t('orbit.evacuate')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Crew and shuttle -------------------------------------------------------------------------

function powerOf(v: Villager, kiwai: Kiwai): number {
  return orbitPower(v, kiwai.type);
}

function ShuttleBox({ game, kiwai }: { game: GameState; kiwai: Kiwai }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const jobLabel = useJobLabel();
  const [up, setUp] = useState<VillagerId[]>([]);
  const [down, setDown] = useState<VillagerId[]>([]);
  const crew = orbitCrew(game, kiwai.id);
  const sh = game.orbit.shuttle;
  const flying = game.villagers.filter(
    (v) => v.job.kind === 'orbit' && v.job.kiwaiId === kiwai.id && v.job.aboard,
  );
  const candidates = game.villagers
    .filter((v) => canFly(v) && !v.locked)
    .concat(game.villagers.filter((v) => canFly(v) && v.locked))
    .sort((a, b) => powerOf(b, kiwai) - powerOf(a, kiwai));
  const plan = {
    kiwaiId: kiwai.id,
    up: up.filter((id) => candidates.some((v) => v.id === id)),
    down: down.filter((id) => crew.some((v) => v.id === id)),
  };
  const lock = shuttleLock(game, plan);
  const toggle = (list: VillagerId[], set: (l: VillagerId[]) => void, id: VillagerId) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div class="orbit-shuttle">
      <h4>{t('orbit.crew', { count: crew.length })}</h4>
      {crew.length > 0 && (
        <ul class="orbit-kiwis">
          {crew.map((v) => (
            <li key={v.id}>
              <label>
                <input
                  type="checkbox"
                  checked={down.includes(v.id)}
                  onChange={() => toggle(down, setDown, v.id)}
                />{' '}
                {v.name} <span class="small muted">· {t('orbit.comeDown')}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {flying.length > 0 && (
        <p class="small muted">{t('orbit.aboard', { count: flying.length })}</p>
      )}
      {sh ? (
        <p class="small">
          {t(sh.kiwaiId === kiwai.id ? 'orbit.shuttleHere' : 'orbit.shuttleAway', {
            time: formatDuration(lang, (sh.docked ? sh.backAt : sh.upAt) - game.now),
          })}
        </p>
      ) : (
        <>
          <p class="small muted">{t('orbit.sendHint', { seats: ORBIT.shuttle.seats })}</p>
          <ul class="orbit-kiwis orbit-candidates">
            {candidates.slice(0, 12).map((v) => (
              <li key={v.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={up.includes(v.id)}
                    onChange={() => toggle(up, setUp, v.id)}
                  />{' '}
                  {v.name}{' '}
                  <span class="small muted">
                    · {formatNumber(lang, powerOf(v, kiwai))} · {jobLabel(game, v)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {lock && (plan.up.length > 0 || plan.down.length > 0) && (
            <p class="small warn">{t(`errors.${lock}`)}</p>
          )}
          <button
            class="btn btn-primary"
            disabled={!!lock}
            onClick={() => {
              if (actions.dispatch({ type: 'sendShuttle', ...plan })) {
                setUp([]);
                setDown([]);
              }
            }}
          >
            {plan.up.length === 0 && plan.down.length === 0
              ? t('orbit.fetch')
              : t('orbit.send', { up: plan.up.length, down: plan.down.length })}
          </button>
        </>
      )}
    </div>
  );
}
