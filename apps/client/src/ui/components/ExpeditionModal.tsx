import { useEffect, useState } from 'preact/hooks';
import {
  potentialLoot,
  availableCrew,
  intelView,
  reconForecast,
  crewWeight,
  EXPEDITIONS,
  forecastExpedition,
  kiwiStrength,
  launchpadOf,
  maxCrew,
  travelTime,
  techEffects,
  validateCommand,
  type BuildingId,
  type ExpeditionPlan,
  type ExpeditionTarget,
  type GameState,
  type MissionKind,
  type Villager,
  type VillagerId,
  FUEL,
  stardustOf,
  twinTarget,
  allHolders,
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
import type { TKey } from '../../i18n/i18n';
import { BringBackPicker, FinalLines, HoldersPicker, SiegeHeader, SiegeMap } from './SiegeParts';
import { Cost } from './Cost';
import { IntelMap } from './IntelMap';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { DeliveryPlanner } from './DeliveryPlanner';
import { useJobLabel } from './VillageModal';

const range = (lang: Parameters<typeof formatNumber>[0], r: { min: number; max: number }) =>
  r.min === r.max
    ? formatNumber(lang, r.min)
    : `${formatNumber(lang, r.min)}–${formatNumber(lang, r.max)}`;

/** What the latest report says about a target (aged), or that nothing is known. */
export function IntelLine(props: { game: GameState; target: ExpeditionTarget }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const view = intelView(props.game, props.target.id, now);
  if (!view)
    return (
      <>
        {t('expedition.defenseUnknown')} · {t('expedition.neverSeen')}
      </>
    );
  return (
    <>
      {view.defense.min === view.defense.max
        ? t('expedition.defense', { value: formatNumber(lang, view.defense.min) })
        : t('expedition.defenseRange', {
            min: formatNumber(lang, view.defense.min),
            max: formatNumber(lang, view.defense.max),
          })}{' '}
      ·{' '}
      <span class={`freshness-${view.freshness}`}>
        {t('expedition.seen', { ago: formatDuration(lang, view.age) })}
      </span>
    </>
  );
}

export const qualityLabel = (q: number) => (q >= 0.6 ? 'sharp' : q >= 0.35 ? 'fair' : 'rough');

/** Ferrets and bats as the latest report tells (aged). */
export function EnemyLine(props: { game: GameState; targetId: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const now = useUi((s) => s.now);
  const view = intelView(props.game, props.targetId, now);
  if (!view) return null;
  return (
    <p class="small">
      {t('recon.enemies', { ferrets: range(lang, view.ferrets), bats: range(lang, view.bats) })}
      {view.report.spotted ? ` · ${t('recon.spottedShort')}` : ''}
    </p>
  );
}

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

/** Available kiwis, strongest first (most discreet first for a reconnaissance). */
function candidates(game: GameState, mission: MissionKind = 'raid') {
  const score = (v: Villager) =>
    mission === 'recon' ? reconForecast([v]).quality : kiwiStrength(v);
  return availableCrew(game)
    .map((v) => ({ v, strength: kiwiStrength(v), score: score(v) }))
    .sort((a, b) => b.score - a.score || a.v.name.localeCompare(b.v.name));
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
  mission: MissionKind;
  onChange(crew: VillagerId[]): void;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const jobLabel = useJobLabel();
  const list = candidates(props.game, props.mission);
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
          {t(props.mission === 'recon' ? 'recon.bestScouts' : 'expedition.strongest')}
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
                  </span>
                  <span class="small muted">{jobLabel(props.game, v)}</span>
                </span>
                <span class="crew-numbers small">
                  <span>
                    {t('expedition.kiwiStrength', {
                      value: formatNumber(lang, Math.round(strength * 10) / 10),
                    })}
                  </span>
                  {props.mission === 'recon' && (
                    <span class="muted">
                      {t('recon.stealth', {
                        value: formatNumber(lang, v.stats.agility + v.stats.spirit),
                      })}
                    </span>
                  )}
                  {props.mission !== 'recon' && on && risk !== undefined && (
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

const DEFAULT_CREW: Record<MissionKind, number> = {
  raid: 6,
  recon: 1,
  assault: 8,
  reinforce: 2,
  final: 0,
  retreat: 0,
  found: 6,
};

const LAUNCH_LABEL = {
  raid: 'expedition.launch',
  recon: 'recon.launch',
  assault: 'siege.launch.assault',
  reinforce: 'siege.launch.reinforce',
  final: 'siege.launch.final',
  retreat: 'expedition.launch',
  found: 'siege.launch.found',
} as const satisfies Record<MissionKind, TKey>;

/** Chantier 19: a face whose queen fell takes no more missions. */
function conquered(game: GameState, target: ExpeditionTarget): boolean {
  return game.siege.conqueredAt > 0 && twinTarget(game)?.id === target.id;
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
  // Chantier 19: a siege mission prepared from the Siege screen sticks to the twin face.
  const siege = useUi((s) => s.siegePlan);
  const twin = twinTarget(game);
  const [targetId, setTargetId] = useState(
    (siege ? twin?.id : undefined) ?? game.targets.find((x) => !conquered(game, x))?.id ?? '',
  );
  // Nothing known yet about the twin face: suggest scouting it first.
  const [mission, setMission] = useState<MissionKind>(() =>
    siege ? siege.mission : game.targets[0] && !game.intel[game.targets[0].id] ? 'recon' : 'raid',
  );
  const sector = siege?.sector;
  const max = pad ? maxCrew(game, pad, mission) : 0;
  const target = game.targets.find((x) => x.id === targetId);
  const pick = (m: MissionKind) => {
    const room = pad ? maxCrew(game, pad, m) : 0;
    // The final assault takes as many as the hold allows (with room for the rations).
    // The posted kiwis fly back with it: they need their seats too.
    const n =
      m === 'final'
        ? Math.max(1, Math.floor(room * 0.75) - allHolders(game).length)
        : Math.min(DEFAULT_CREW[m], room);
    let titans = 0;
    return candidates(game, m)
      .filter((c) => !c.v.kikiwiwi || titans++ < 1)
      .slice(0, n)
      .map((c) => c.v.id);
  };
  const [crew, setCrew] = useState<VillagerId[]>(() => pick(mission));
  // Assault: who stays on the bridgehead (the strongest third by default).
  const [holders, setHolders] = useState<VillagerId[]>(() =>
    crew.slice(0, Math.max(1, Math.round(crew.length / 3))),
  );
  const [bringBack, setBringBack] = useState<VillagerId[]>([]);
  const extra = (c: VillagerId[] = crew) => ({
    ...(sector !== undefined ? { sector } : {}),
    ...(mission === 'assault' ? { holders: holders.filter((id) => c.includes(id)) } : {}),
    ...(mission === 'reinforce' ? { bringBack } : {}),
  });
  const [food, setFood] = useState(() =>
    target
      ? suggestedProvisions(game, { launchpadId: padId, targetId, crew, mission, ...extra() })
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
    ...extra(),
    ...(fuel ? { fuel: true } : {}),
    ...(mission === 'found' ? { freight } : {}),
  };
  const switchTo = (m: MissionKind) => {
    if (m === mission) return;
    const c = pick(m);
    setMission(m);
    setCrew(c);
    setFood(suggestedProvisions(game, { launchpadId: padId, targetId, crew: c, mission: m }));
  };
  const fresh = (c: VillagerId[], back = bringBack) =>
    suggestedProvisions(game, {
      launchpadId: padId,
      targetId,
      crew: c,
      mission,
      ...extra(c),
      ...(mission === 'reinforce' ? { bringBack: back } : {}),
    });
  const f = forecastExpedition(game, plan)!;
  const error = validateCommand(game, { type: 'launchExpedition', ...plan }, { now, map });
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / f.cargo) * 100))}%`;
  const kiwisWeight = crewWeight(f.crew);
  const foodWeight =
    (food.pulp + food.juice + (mission === 'found' ? cargoTotal(freight) : 0)) *
    EXPEDITIONS.resourceWeight;
  const founding = mission === 'found';
  const outShort = {
    pulp: Math.max(0, f.needOneWay.pulp - food.pulp),
    juice: Math.max(0, f.needOneWay.juice - food.juice),
  };
  const backOk = f.returnSurplus.pulp >= -1e-6 && f.returnSurplus.juice >= -1e-6;
  const setCrewAndFood = (c: VillagerId[]) => {
    setCrew(c);
    setFood(fresh(c));
  };
  const intel = game.intel[targetId];

  return (
    <div class="expedition">
      {siege ? (
        <SiegeHeader game={game} mission={mission} sector={sector} />
      ) : (
        <section class="field">
          <h3>{t('recon.mission')}</h3>
          <div class="segmented mission-switch" role="group" aria-label={t('recon.mission')}>
            {(['recon', 'raid'] as const).map((m) => (
              <button
                key={m}
                class={`btn ${m === mission ? 'btn-active' : ''}`}
                aria-pressed={m === mission}
                onClick={() => switchTo(m)}
              >
                {t(`recon.kinds.${m}`)}
              </button>
            ))}
          </div>
          <p class="small muted">{t(`recon.hints.${mission}`)}</p>
        </section>
      )}

      <section class="field">
        {!siege && <h3>{t('expedition.target')}</h3>}
        <div class="targets">
          {!siege &&
            game.targets
              .filter((x) => !conquered(game, x))
              .map((x) => (
                <button
                  key={x.id}
                  class={`target-card ${x.id === targetId ? 'is-selected' : ''}`}
                  aria-pressed={x.id === targetId}
                  onClick={() => {
                    setTargetId(x.id);
                    setFood(
                      suggestedProvisions(game, {
                        launchpadId: padId,
                        targetId: x.id,
                        crew,
                        mission,
                      }),
                    );
                  }}
                >
                  <strong>{targetLabel(t, x)}</strong>
                  <span class="small muted">
                    {t('expedition.aliens')} · <IntelLine game={game} target={x} />
                  </span>
                  <span class="small muted">
                    {t('expedition.travel', {
                      duration: formatDuration(
                        lang,
                        travelTime(x, pad, [], mission, techEffects(game).travel),
                      ),
                    })}{' '}
                    ·{' '}
                    {t('recon.mapLabel', {
                      seen: game.intel[x.id]?.sectors.length ?? 0,
                      total: 12,
                    })}
                  </span>
                  {mission === 'raid' && (
                    <span class="small">
                      {t('expedition.potentialLoot')}{' '}
                      <Cost cost={potentialLoot(game, x.distance)} />
                    </span>
                  )}
                </button>
              ))}
        </div>
        {siege ? (
          mission !== 'found' && <SiegeMap game={game} selected={sector} size={170} />
        ) : (
          <IntelMap game={game} target={target} intel={intel} size={180} />
        )}
        {intel && !siege && <EnemyLine game={game} targetId={targetId} />}
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.crew')}</h3>
          <span class="stepper-value">
            <KiwiIcon size={18} /> {crew.length} / {max}
          </span>
        </div>
        <CrewPicker
          game={game}
          crew={crew}
          max={max}
          risk={f.risk}
          mission={mission}
          onChange={setCrewAndFood}
        />
      </section>

      {mission === 'assault' && (
        <HoldersPicker
          game={game}
          crew={crew}
          chosen={holders}
          onChange={(h) => {
            setHolders(h);
            setFood(
              suggestedProvisions(game, {
                launchpadId: padId,
                targetId,
                crew,
                mission,
                ...(sector !== undefined ? { sector } : {}),
                holders: h,
              }),
            );
          }}
        />
      )}
      {mission === 'reinforce' && sector !== undefined && (
        <BringBackPicker
          game={game}
          sector={sector}
          chosen={bringBack}
          onChange={(b) => {
            setBringBack(b);
            setFood(fresh(crew, b));
          }}
        />
      )}

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
          <button
            class="btn btn-small"
            onClick={() =>
              setFood(suggestedProvisions(game, { launchpadId: padId, targetId, crew, mission }))
            }
          >
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
          {f.recon ? (
            <span class={`odds ${f.recon.spotChance > 0.3 ? 'odds-uncertain' : 'odds-likely'}`}>
              {t('recon.spotChance', { pct: Math.round(f.recon.spotChance * 100) })}
            </span>
          ) : (
            <span class={`odds odds-${f.odds}`}>{t(`expedition.odds.${f.odds}`)}</span>
          )}
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
          {mission === 'raid' && (
            <span>
              <i class="dot seg-loot" /> {t('expedition.cargoLoot')} {fmt(f.lootRoom)}
            </span>
          )}
          {f.returnCrew.length !== f.crew.length && (
            <span>{t('siege.returning', { count: f.returnCrew.length })}</span>
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
        {f.recon ? (
          <p class="small">
            {t('recon.quality', {
              quality: t(`recon.qualities.${qualityLabel(f.recon.quality)}`),
              sectors: f.recon.sectors,
              spread: Math.round(f.recon.spread * 100),
            })}
          </p>
        ) : f.final ? (
          <FinalLines forecast={f.final} />
        ) : mission === 'reinforce' ? (
          <p class="small">{t('siege.noFight')}</p>
        ) : founding ? (
          <p class="small">{t('colony.noFight')}</p>
        ) : (
          <p class="small">
            {t('expedition.strength', {
              min: formatNumber(lang, Math.round(f.strength.min * 10) / 10),
              max: formatNumber(lang, Math.round(f.strength.max * 10) / 10),
              defense: f.defense ? range(lang, f.defense) : '?',
            })}
          </p>
        )}
        {!f.recon && mission !== 'reinforce' && !founding && f.crew.length > 0 && (
          <p class="small">
            {t(f.woundsOnly ? 'expedition.expectedWounds' : 'expedition.expectedLosses', {
              count: Math.round(f.expectedLosses * 10) / 10,
            })}
          </p>
        )}
        {f.fed < 1 && <p class="small muted">{t('expedition.hungry')}</p>}
        <p class="small ship-line">
          <ShipIcon size={16} />
          {t('ship.line', {
            name: t(`ship.names.${f.ship.id}`),
            pct: Math.round(f.reliability * 100),
          })}
          {f.ship.armor > 0 &&
            !f.recon &&
            ` · ${t('ship.armor', { pct: Math.round(f.ship.armor * 100) })}`}
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
        {pad.damaged && <p class="small warn">{t('ship.damaged')}</p>}
      </section>

      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch({ type: 'launchExpedition', ...plan }))
            uiStore.setState({ modal: 'none', expeditionPad: null, siegePlan: null });
        }}
      >
        <ShipIcon size={20} /> {t(LAUNCH_LABEL[mission])} · {formatDuration(lang, f.travelMs * 2)}
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
  const siege = useUi((s) => s.siegePlan);
  if (!game || !padId) return null;
  const close = () =>
    uiStore.setState({ modal: 'none', expeditionPad: null, deliverTo: null, siegePlan: null });
  const friends = game.friends.length > 0;
  return (
    <Modal
      title={t(
        siege ? 'siege.planTitle' : deliver && friends ? 'delivery.title' : 'expedition.title',
      )}
      onClose={close}
      class="modal-wide"
    >
      {friends && !siege && (
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
      {deliver && friends && !siege ? (
        <DeliveryPlanner game={game} padId={padId as BuildingId} initialFriend={deliverTo} />
      ) : (
        <Planner game={game} padId={padId as BuildingId} />
      )}
    </Modal>
  );
}
