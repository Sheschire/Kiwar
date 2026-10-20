import { useEffect, useState } from 'preact/hooks';
import {
  alienDefOf,
  availableCrew,
  intelView,
  crewWeight,
  EXPEDITIONS,
  forecastExpedition,
  kiwiStrength,
  launchpadOf,
  maxCrew,
  travelTime,
  validateCommand,
  type BuildingId,
  type ExpeditionTarget,
  type GameState,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { KiwiIcon, ResourceIcon, ShipIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
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

/** Exact round-trip rations for a crew, with a 10 % safety margin, rounded up to 5. */
function suggestedProvisions(
  game: GameState,
  plan: { launchpadId: BuildingId; targetId: string; crew: VillagerId[] },
): { pulp: number; juice: number } {
  const f = forecastExpedition(game, { ...plan, provisions: { pulp: 0, juice: 0 } });
  if (!f) return { pulp: 0, juice: 0 };
  const up5 = (v: number) => Math.ceil((v * 2 * 1.1) / 5) * 5;
  return { pulp: up5(f.needOneWay.pulp), juice: up5(f.needOneWay.juice) };
}

/** Available kiwis, strongest first. */
function candidates(game: GameState) {
  return availableCrew(game)
    .map((v) => ({ v, strength: kiwiStrength(v) }))
    .sort((a, b) => b.strength - a.strength || a.v.name.localeCompare(b.v.name));
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
                <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={34} />
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
                  {on && risk !== undefined && (
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
  const [targetId, setTargetId] = useState(game.targets[0]?.id ?? '');
  const max = pad ? maxCrew(game, pad) : 0;
  const target = game.targets.find((x) => x.id === targetId);
  const [crew, setCrew] = useState<VillagerId[]>(() =>
    candidates(game)
      .slice(0, Math.min(6, max))
      .map((c) => c.v.id),
  );
  const [food, setFood] = useState(() =>
    target
      ? suggestedProvisions(game, { launchpadId: padId, targetId, crew })
      : { pulp: 0, juice: 0 },
  );
  if (!pad || !target || !map) return null;

  const plan = { launchpadId: padId, targetId, crew, provisions: food };
  const f = forecastExpedition(game, plan)!;
  const error = validateCommand(game, { type: 'launchExpedition', ...plan }, { now, map });
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / f.cargo) * 100))}%`;
  const kiwisWeight = crewWeight(f.crew);
  const foodWeight = (food.pulp + food.juice) * EXPEDITIONS.resourceWeight;
  const outShort = {
    pulp: Math.max(0, f.needOneWay.pulp - food.pulp),
    juice: Math.max(0, f.needOneWay.juice - food.juice),
  };
  const backOk = f.returnSurplus.pulp >= -1e-6 && f.returnSurplus.juice >= -1e-6;
  const setCrewAndFood = (c: VillagerId[]) => {
    setCrew(c);
    setFood(suggestedProvisions(game, { launchpadId: padId, targetId, crew: c }));
  };

  return (
    <div class="expedition">
      <section class="field">
        <h3>{t('expedition.target')}</h3>
        <div class="targets">
          {game.targets.map((x) => (
            <button
              key={x.id}
              class={`target-card ${x.id === targetId ? 'is-selected' : ''}`}
              aria-pressed={x.id === targetId}
              onClick={() => {
                setTargetId(x.id);
                setFood(suggestedProvisions(game, { launchpadId: padId, targetId: x.id, crew }));
              }}
            >
              <strong>{targetLabel(t, x)}</strong>
              <span class="small muted">
                {t('expedition.aliens')} · <IntelLine game={game} target={x} />
              </span>
              <span class="small muted">
                {t('expedition.travel', { duration: formatDuration(lang, travelTime(x, pad)) })}
              </span>
              <span class="small">
                {t('expedition.potentialLoot')} <Cost cost={alienDefOf(x.distance).loot} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.crew')}</h3>
          <span class="stepper-value">
            <KiwiIcon size={18} /> {crew.length} / {max}
          </span>
        </div>
        <CrewPicker game={game} crew={crew} max={max} risk={f.risk} onChange={setCrewAndFood} />
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.provisions')}</h3>
          <button
            class="btn btn-small"
            onClick={() =>
              setFood(suggestedProvisions(game, { launchpadId: padId, targetId, crew }))
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
      </section>

      <section class="forecast">
        <div class="title-row">
          <span class="small">{t('expedition.cargo', { used: fmt(f.weight), max: f.cargo })}</span>
          <span class={`odds odds-${f.odds}`}>{t(`expedition.odds.${f.odds}`)}</span>
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
          <span>
            <i class="dot seg-loot" /> {t('expedition.cargoLoot')} {fmt(f.lootRoom)}
          </span>
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
        <p class="small">
          {t('expedition.rationsBack')}{' '}
          {backOk ? (
            <span class="bonus">✔ {t('expedition.enough')}</span>
          ) : (
            <span class="warn">⚠ {t('expedition.shortBack')}</span>
          )}
        </p>
        <p class="small">
          {t('expedition.strength', {
            min: formatNumber(lang, Math.round(f.strength.min * 10) / 10),
            max: formatNumber(lang, Math.round(f.strength.max * 10) / 10),
            defense: f.defense ? range(lang, f.defense) : '?',
          })}
        </p>
        {f.crew.length > 0 && (
          <p class="small">
            {t('expedition.expectedLosses', { count: Math.round(f.expectedLosses * 10) / 10 })}
          </p>
        )}
        {f.fed < 1 && <p class="small muted">{t('expedition.hungry')}</p>}
      </section>

      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch({ type: 'launchExpedition', ...plan }))
            uiStore.setState({ modal: 'none', expeditionPad: null });
        }}
      >
        <ShipIcon size={20} /> {t('expedition.launch')} · {formatDuration(lang, f.travelMs * 2)}
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
  if (!game || !padId) return null;
  const close = () => uiStore.setState({ modal: 'none', expeditionPad: null });
  return (
    <Modal title={t('expedition.title')} onClose={close} class="modal-wide">
      <Planner game={game} padId={padId as BuildingId} />
    </Modal>
  );
}
