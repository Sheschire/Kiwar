import { useEffect, useState } from 'preact/hooks';
import {
  availableCrew,
  beaconsOf,
  crewWeight,
  EXPEDITIONS,
  faceViewOf,
  forecastExpedition,
  kiwiStrength,
  LANDING,
  launchpadOf,
  maxCrew,
  travelTime,
  techEffects,
  validateCommand,
  type BuildingId,
  type ExpeditionPlan,
  type ExpeditionTarget,
  type GameState,
  type LandingOrders,
  type MissionKind,
  type VillagerId,
  FUEL,
  stardustOf,
  twinTarget,
  BUILDINGS,
  emptyResources,
  RESOURCE_IDS,
  type ResourceId,
  type Resources,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { KiwiIcon, ResourceIcon, ShipIcon, StardustIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { CivCard } from './CivCard';
import { DeliveryPlanner } from './DeliveryPlanner';
import { useJobLabel } from './VillageModal';
import { LandingForecastLines, LandingMap, OrdersPicker, ParcelPanel } from './LandingParts';

type PlanBase = Omit<ExpeditionPlan, 'provisions' | 'crew'> & {
  crew: VillagerId[];
  mission: MissionKind;
};

/** Exact round-trip rations for a crew, with a 10 % safety margin, rounded up to 5. */
function suggestedProvisions(game: GameState, plan: PlanBase): { pulp: number; juice: number } {
  const f = forecastExpedition(game, { ...plan, provisions: { pulp: 0, juice: 0 } });
  if (!f) return { pulp: 0, juice: 0 };
  // With nothing aboard, the shortfall of the way back is what the returning kiwis eat.
  const up5 = (out: number, back: number) => Math.ceil(((out - back) * 1.1) / 5) * 5;
  return {
    pulp: up5(f.needOneWay.pulp, f.returnSurplus.pulp),
    juice: up5(f.needOneWay.juice, f.returnSurplus.juice),
  };
}

/** Available kiwis, strongest first. */
function candidates(game: GameState) {
  return availableCrew(game)
    .map((v) => ({ v, strength: kiwiStrength(v) }))
    .sort((a, b) => b.strength - a.strength || a.v.name.localeCompare(b.v.name));
}

function cargoTotal(r: Resources): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + r[id], 0);
}

/** Chantier 19: the settlers' freight (sliders within the hold and the stocks). */
function FreightPicker(props: {
  game: GameState;
  freight: Resources;
  room: number;
  onChange(freight: Resources): void;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const total = cargoTotal(props.freight);
  const cap = BUILDINGS.nest.levels[0]?.storage ?? 0;
  const maxOf = (id: ResourceId) =>
    Math.max(
      0,
      Math.floor(
        Math.min(
          props.game.resources[id],
          cap,
          props.freight[id] + props.room / EXPEDITIONS.resourceWeight,
        ),
      ),
    );
  return (
    <section class="field">
      <div class="title-row">
        <h3>{t('colony.freight')}</h3>
        <span class="stepper-value">{formatNumber(lang, total)}</span>
      </div>
      {RESOURCE_IDS.map((id) => (
        <div class="provision-row" key={id}>
          <ResourceIcon id={id} size={20} />
          <Slider
            label={t(`resources.${id}`)}
            value={props.freight[id]}
            min={0}
            max={maxOf(id)}
            step={5}
            onChange={(v) => props.onChange({ ...props.freight, [id]: v })}
          />
          <span class="provision-value">{formatNumber(lang, props.freight[id])}</span>
        </div>
      ))}
      <p class="small muted">{t('colony.freightHint', { cap: formatNumber(lang, cap) })}</p>
    </section>
  );
}

function CrewPicker(props: {
  game: GameState;
  crew: VillagerId[];
  max: number;
  risk: Record<string, number>;
  onChange(crew: VillagerId[]): void;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const jobLabel = useJobLabel();
  const list = candidates(props.game);
  const chosen = new Set(props.crew);
  const full = props.crew.length >= props.max;
  return (
    <>
      <p class="small muted">{t('expedition.crewHint')}</p>
      <div class="row">
        <button
          class="btn btn-small"
          onClick={() => props.onChange(list.slice(0, props.max).map((c) => c.v.id))}
        >
          {t('expedition.strongest')}
        </button>
        <button class="btn btn-small" onClick={() => props.onChange([])}>
          {t('expedition.clearCrew')}
        </button>
      </div>
      <ul class="crew-list">
        {list.map(({ v, strength }) => {
          const on = chosen.has(v.id);
          const risk = props.risk[v.id];
          return (
            <li key={v.id}>
              <label class={`crew-row ${on ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  onChange={() =>
                    props.onChange(
                      on ? props.crew.filter((id) => id !== v.id) : [...props.crew, v.id],
                    )
                  }
                />
                <KiwiPortrait
                  shiny={v.shiny}
                  classId={v.classId}
                  titan={!!v.kikiwiwi}
                  seed={v.id}
                  size={34}
                />
                <span class="kiwi-row-main">
                  <span class="kiwi-row-name">
                    {v.name}{' '}
                    <span class="small muted">{t('common.levelShort', { level: v.level })}</span>
                    {(v.veteran ?? 0) > 0 && (
                      <span class="small bonus">
                        {' '}
                        · {t('landing.veteran', { count: v.veteran! })}
                      </span>
                    )}
                  </span>
                  <span class="small muted">{jobLabel(props.game, v)}</span>
                </span>
                <span class="crew-numbers small">
                  <span>
                    {t('expedition.kiwiStrength', {
                      value: formatNumber(lang, Math.round(strength * 10) / 10),
                    })}
                  </span>
                  {on && risk !== undefined && risk > 0 && (
                    <span class={risk > 0.5 ? 'warn' : 'muted'}>
                      {t('expedition.risk', { pct: Math.round(risk * 100) })}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function targetLabel(t: Translate, target: ExpeditionTarget): string {
  const face = t(`faces.${target.face}`);
  return target.distance === 0
    ? t('expedition.twin', { face })
    : t('expedition.face', { face, index: target.kiwiIndex + 1 });
}

/** Chantier 19: a face whose queen fell takes no more missions. */
function conquered(game: GameState, target: ExpeditionTarget): boolean {
  return game.siege.conqueredAt > 0 && twinTarget(game)?.id === target.id;
}

/** The parcel a landing is aimed at by default: the first edge parcel without our beacon. */
function defaultSector(game: GameState, targetId: string): number {
  const lit = new Set(beaconsOf(game, targetId));
  for (let s = 6; s < 12; s++) if (!lit.has(s)) return s;
  for (let s = 0; s < 6; s++) if (!lit.has(s)) return s;
  return 6;
}

function Slider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
  label: string;
}) {
  return (
    <input
      class="slider"
      type="range"
      aria-label={props.label}
      min={props.min}
      max={Math.max(props.min, props.max)}
      step={props.step}
      value={props.value}
      onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
    />
  );
}

function Planner({ game, padId }: { game: GameState; padId: BuildingId }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  const pad = launchpadOf(game, padId);
  // Chantier 19: the settlers' ship is prepared from the colony screen; chantier 40: a
  // landing may come with its parcel (picked on the twin).
  const preset = useUi((s) => s.siegePlan);
  const founding = preset?.mission === 'found';
  const mission: MissionKind = founding ? 'found' : 'land';
  const twin = twinTarget(game);
  const [targetId, setTargetId] = useState(
    (founding ? twin?.id : preset?.targetId) ??
      game.targets.find((x) => !conquered(game, x))?.id ??
      '',
  );
  const [sector, setSector] = useState<number>(
    () => preset?.sector ?? defaultSector(game, targetId),
  );
  const [orders, setOrders] = useState<LandingOrders>(() => ({ ...LANDING.defaultOrders }));
  const max = pad ? maxCrew(game, pad, mission) : 0;
  const target = game.targets.find((x) => x.id === targetId);
  const pick = () => {
    const n = Math.min(6, max);
    let titans = 0;
    return candidates(game)
      .filter((c) => !c.v.kikiwiwi || titans++ < 1)
      .slice(0, n)
      .map((c) => c.v.id);
  };
  const [crew, setCrew] = useState<VillagerId[]>(pick);
  const landing = (s = sector) => (founding ? {} : { sector: s, orders });
  const [food, setFood] = useState(() =>
    target
      ? suggestedProvisions(game, { launchpadId: padId, targetId, crew, mission, ...landing() })
      : { pulp: 0, juice: 0 },
  );
  // Chantier 13: stardust burnt as fuel, once the colony has seen some.
  const [fuel, setFuel] = useState(false);
  // Chantier 19: what the settlers carry to found the colony.
  const [freight, setFreight] = useState<Resources>(emptyResources);
  if (!pad || !target || !map) return null;

  const showFuel = game.stardust > 0 || game.comets.passes > 0;
  const plan = {
    launchpadId: padId,
    targetId,
    crew,
    provisions: food,
    mission,
    ...landing(),
    ...(fuel ? { fuel: true } : {}),
    ...(founding ? { freight } : {}),
  };
  const fresh = (c: VillagerId[], id = targetId) =>
    suggestedProvisions(game, { launchpadId: padId, targetId: id, crew: c, mission, ...landing() });
  const f = forecastExpedition(game, plan)!;
  const error = validateCommand(game, { type: 'launchExpedition', ...plan }, { now, map });
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / f.cargo) * 100))}%`;
  const kiwisWeight = crewWeight(f.crew);
  const foodWeight =
    (food.pulp + food.juice + (founding ? cargoTotal(freight) : 0)) * EXPEDITIONS.resourceWeight;
  const outShort = {
    pulp: Math.max(0, f.needOneWay.pulp - food.pulp),
    juice: Math.max(0, f.needOneWay.juice - food.juice),
  };
  const backOk = f.returnSurplus.pulp >= -1e-6 && f.returnSurplus.juice >= -1e-6;
  const setCrewAndFood = (c: VillagerId[]) => {
    setCrew(c);
    setFood(fresh(c));
  };
  const targets = game.targets.filter((x) => !conquered(game, x));

  return (
    <div class="expedition">
      {!founding && (
        <section class="field">
          <p class="small muted">{t('recon.hints.land')}</p>
          {targets.length > 1 && (
            <div class="targets">
              {targets.map((x) => (
                <button
                  key={x.id}
                  class={`target-card ${x.id === targetId ? 'is-selected' : ''}`}
                  aria-pressed={x.id === targetId}
                  onClick={() => {
                    setTargetId(x.id);
                    setSector(defaultSector(game, x.id));
                    setFood(fresh(crew, x.id));
                  }}
                >
                  <strong>{targetLabel(t, x)}</strong>
                  <span class="small muted">
                    {t('expedition.travel', {
                      duration: formatDuration(
                        lang,
                        travelTime(x, pad, [], 'land', techEffects(game).travel),
                      ),
                    })}{' '}
                    ·{' '}
                    {t('landing.mapLabel', {
                      beacons: beaconsOf(game, x.id).length,
                      seen: Object.keys(faceViewOf(game, x.id).parcels).length,
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
          <h3>{t('landing.plan')}</h3>
          <div class="landing-layout">
            <LandingMap
              game={game}
              target={target}
              selected={sector}
              onSelect={(s) => {
                setSector(s);
                setFood(
                  suggestedProvisions(game, {
                    launchpadId: padId,
                    targetId,
                    crew,
                    mission,
                    ...landing(s),
                  }),
                );
              }}
              size={230}
            />
            <ParcelPanel game={game} target={target} sector={sector} />
          </div>
          <div class="row">
            <button class="btn btn-small" onClick={() => uiStore.setState({ bestiaryOpen: true })}>
              {t('landing.bestiary.open')}
            </button>
          </div>
        </section>
      )}
      {target.distance === 0 && !founding && <CivCard game={game} />}

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.crew')}</h3>
          <span class="stepper-value">
            <KiwiIcon size={18} /> {crew.length} / {max}
          </span>
        </div>
        <CrewPicker game={game} crew={crew} max={max} risk={f.risk} onChange={setCrewAndFood} />
      </section>

      {!founding && <OrdersPicker orders={orders} onChange={setOrders} />}

      {founding && (
        <FreightPicker
          game={game}
          freight={freight}
          room={Math.max(0, f.cargo - f.weight + cargoTotal(freight) * EXPEDITIONS.resourceWeight)}
          onChange={setFreight}
        />
      )}

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.provisions')}</h3>
          <button class="btn btn-small" onClick={() => setFood(fresh(crew))}>
            {t('expedition.suggest')}
          </button>
        </div>
        {(['pulp', 'juice'] as const).map((id) => (
          <div class="provision-row" key={id}>
            <ResourceIcon id={id} size={20} />
            <Slider
              label={t(`resources.${id}`)}
              value={food[id]}
              min={0}
              max={Math.floor(Math.min(game.resources[id], 1000) / 5) * 5}
              step={5}
              onChange={(v) => setFood({ ...food, [id]: v })}
            />
            <span class="provision-value">{fmt(food[id])}</span>
          </div>
        ))}
        {(f.launchCost.fiber > 0 || f.launchCost.juice > 0) && (
          <p class="launch-cost small">
            <span>{t('expedition.launchCost', { count: f.crew.length })}</span>
            <Cost
              cost={f.launchCost}
              have={{ ...game.resources, juice: game.resources.juice - food.juice }}
            />
          </p>
        )}
      </section>

      <section class="forecast">
        <div class="title-row">
          <span class="small">{t('expedition.cargo', { used: fmt(f.weight), max: f.cargo })}</span>
          {!founding && <span class={`odds odds-${f.odds}`}>{t(`expedition.odds.${f.odds}`)}</span>}
        </div>
        <div class={`cargo-bar ${f.weight > f.cargo ? 'overloaded' : ''}`} aria-hidden="true">
          <span class="seg-crew" style={{ width: pct(kiwisWeight) }} />
          <span class="seg-food" style={{ width: pct(foodWeight) }} />
        </div>
        <div class="legend small muted">
          <span>
            <i class="dot seg-crew" /> {t('expedition.cargoCrew')} {fmt(kiwisWeight)}
          </span>
          <span>
            <i class="dot seg-food" /> {t('expedition.cargoFood')} {fmt(foodWeight)}
          </span>
          {!founding && (
            <span>
              <i class="dot seg-loot" /> {t('expedition.cargoLoot')} {fmt(f.lootRoom)}
            </span>
          )}
        </div>
        <p class="small">
          {t('expedition.rationsOut')}{' '}
          {f.fed >= 1 ? (
            <span class="bonus">✔ {t('expedition.enough')}</span>
          ) : (
            <span class="warn">
              ⚠ {t('expedition.short', { pulp: fmt(outShort.pulp), juice: fmt(outShort.juice) })}
            </span>
          )}
        </p>
        {!founding && (
          <p class="small">
            {t('expedition.rationsBack')}{' '}
            {backOk ? (
              <span class="bonus">✔ {t('expedition.enough')}</span>
            ) : (
              <span class="warn">⚠ {t('expedition.shortBack')}</span>
            )}
          </p>
        )}
        {founding ? (
          <p class="small">{t('colony.noFight')}</p>
        ) : (
          f.landing && <LandingForecastLines forecast={f.landing} crew={f.crew} game={game} />
        )}
        {f.fed < 1 && <p class="small muted">{t('expedition.hungry')}</p>}
        <p class="small ship-line">
          <ShipIcon size={16} />
          {t('ship.line', {
            name: t(`ship.names.${f.ship.id}`),
            pct: Math.round(f.reliability * 100),
          })}
        </p>
        {showFuel && (
          <label class={`fuel-toggle small ${stardustOf(game) < FUEL.stardust ? 'is-short' : ''}`}>
            <input
              type="checkbox"
              checked={fuel}
              disabled={!fuel && stardustOf(game) < FUEL.stardust}
              onChange={(e) => setFuel((e.target as HTMLInputElement).checked)}
            />
            <StardustIcon size={16} />
            {t('ship.fuel', {
              dust: FUEL.stardust,
              travel: Math.round((1 - FUEL.travel) * 100),
              reliability: Math.round(FUEL.reliability * 100),
            })}
          </label>
        )}
        {pad.damaged && (
          <p class="small warn">{t(pad.shipLost ? 'landing.report.shipLost' : 'ship.damaged')}</p>
        )}
      </section>

      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch({ type: 'launchExpedition', ...plan }))
            uiStore.setState({ modal: 'none', expeditionPad: null, siegePlan: null });
        }}
      >
        <ShipIcon size={20} /> {t(founding ? 'siege.launch.found' : 'landing.launch')} ·{' '}
        {formatDuration(lang, f.travelMs * 2)}
      </button>
      {error && <p class="small warn">{t(`errors.${error}`)}</p>}
    </div>
  );
}

export function ExpeditionModal() {
  const t = useT();
  // Friends may have claimed alien faces since the colony was loaded.
  useEffect(() => actions.refreshUniverse(), []);
  const game = useUi((s) => s.game);
  const padId = useUi((s) => s.expeditionPad);
  const deliverTo = useUi((s) => s.deliverTo);
  const [deliver, setDeliver] = useState(() => deliverTo !== null);
  const preset = useUi((s) => s.siegePlan);
  if (!game || !padId) return null;
  const close = () =>
    uiStore.setState({ modal: 'none', expeditionPad: null, deliverTo: null, siegePlan: null });
  const friends = game.friends.length > 0;
  const founding = preset?.mission === 'found';
  return (
    <Modal
      title={t(
        founding ? 'siege.planTitle' : deliver && friends ? 'delivery.title' : 'landing.title',
      )}
      onClose={close}
      class="modal-wide"
    >
      {friends && !founding && (
        <div class="segmented mission-switch" role="group" aria-label={t('delivery.kind')}>
          {[false, true].map((d) => (
            <button
              key={String(d)}
              class={`btn ${d === deliver ? 'btn-active' : ''}`}
              aria-pressed={d === deliver}
              onClick={() => setDeliver(d)}
            >
              {t(d ? 'delivery.tab' : 'delivery.expeditionTab')}
            </button>
          ))}
        </div>
      )}
      {deliver && friends && !founding ? (
        <DeliveryPlanner game={game} padId={padId as BuildingId} initialFriend={deliverTo} />
      ) : (
        <Planner game={game} padId={padId as BuildingId} />
      )}
    </Modal>
  );
}
