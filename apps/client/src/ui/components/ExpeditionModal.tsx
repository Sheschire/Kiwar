import { useState } from 'preact/hooks';
import {
  EXPEDITIONS,
  forecastExpedition,
  launchpadOf,
  maxCrew,
  targetDefense,
  travelTime,
  validateCommand,
  type BuildingId,
  type ExpeditionTarget,
  type GameState,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { KiwiIcon, ResourceIcon, ShipIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { Modal } from './Modal';

/** Exact round-trip rations for a crew, with a 10 % safety margin, rounded up to 5. */
function suggestedProvisions(crew: number, travelMs: number): { pulp: number; juice: number } {
  const hours = (2 * travelMs) / 3_600_000;
  const up5 = (v: number) => Math.ceil((v * 1.1) / 5) * 5;
  return {
    pulp: up5(crew * EXPEDITIONS.hourlyRations.pulp * hours),
    juice: up5(crew * EXPEDITIONS.hourlyRations.juice * hours),
  };
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
  const [crew, setCrew] = useState(
    Math.min(Math.max(EXPEDITIONS.minCrew, 6), Math.max(max, EXPEDITIONS.minCrew)),
  );
  const [food, setFood] = useState(() =>
    pad && target ? suggestedProvisions(crew, travelTime(target, pad)) : { pulp: 0, juice: 0 },
  );
  if (!pad || !target || !map) return null;

  const plan = { launchpadId: padId, targetId, crew, provisions: food };
  const f = forecastExpedition(game, plan)!;
  const error = validateCommand(game, { type: 'launchExpedition', ...plan }, { now, map });
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / f.cargo) * 100))}%`;
  const crewWeight = crew * EXPEDITIONS.kiwiWeight;
  const foodWeight = (food.pulp + food.juice) * EXPEDITIONS.resourceWeight;
  const outShort = {
    pulp: Math.max(0, f.needOneWay.pulp - food.pulp),
    juice: Math.max(0, f.needOneWay.juice - food.juice),
  };
  const backOk = f.returnSurplus.pulp >= -1e-6 && f.returnSurplus.juice >= -1e-6;
  const setCrewAndFood = (c: number) => {
    setCrew(c);
    setFood(suggestedProvisions(c, f.travelMs));
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
                setFood(suggestedProvisions(crew, travelTime(x, pad)));
              }}
            >
              <strong>{targetLabel(t, x)}</strong>
              <span class="small muted">
                {t('expedition.aliens')} ·{' '}
                {t('expedition.defense', { value: targetDefense(game, x) })}
              </span>
              <span class="small muted">
                {t('expedition.travel', { duration: formatDuration(lang, travelTime(x, pad)) })}
              </span>
              <span class="small">
                {t('expedition.potentialLoot')} <Cost cost={x.loot} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.crew')}</h3>
          <span class="stepper-value">
            <KiwiIcon size={18} /> {crew} / {max}
          </span>
        </div>
        <Slider
          label={t('expedition.crew')}
          value={crew}
          min={EXPEDITIONS.minCrew}
          max={max}
          step={1}
          onChange={setCrewAndFood}
        />
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('expedition.provisions')}</h3>
          <button
            class="btn btn-small"
            onClick={() => setFood(suggestedProvisions(crew, f.travelMs))}
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
          <span class="seg-crew" style={{ width: pct(crewWeight) }} />
          <span class="seg-food" style={{ width: pct(foodWeight) }} />
        </div>
        <div class="legend small muted">
          <span>
            <i class="dot seg-crew" /> {t('expedition.cargoCrew')} {fmt(crewWeight)}
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
            defense: f.defense,
          })}
        </p>
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
