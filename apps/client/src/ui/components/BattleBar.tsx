import { actions } from '../actions';
import { useBattle } from '../battleStore';
import type { ItemId } from '@kiwar/shared';
import { useT, useUi } from '../store';
import type { UnitInfo } from '../../render/battle/BattleShow';

/** m:ss */
const clock = (s: number) => {
  const total = Math.max(0, Math.floor(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Chantier 36: while a battle plays (live or replayed): its clock, rewind, ×1/×2/×4, skip, and
 * the card of the fighter the player tapped.
 */
export function BattleBar() {
  const t = useT();
  const reportId = useBattle((s) => s.reportId);
  const live = useBattle((s) => s.live);
  const time = useBattle((s) => s.time);
  const duration = useBattle((s) => s.duration);
  const speed = useBattle((s) => s.speed);
  const unit = useBattle((s) => s.unit);
  if (!reportId) return null;
  return (
    <div class="battle-dock pe">
      {unit && <UnitCard unit={unit} />}
      <div class="battle-bar parchment" role="toolbar" aria-label={t('battle.live')}>
        <div class="battle-title">
          <strong>{t(live ? 'battle.live' : 'battle.replay')}</strong>
          <span class="small muted">
            {t('battle.clock', { time: clock(time), duration: clock(duration) })}
          </span>
        </div>
        <div class="battle-progress" aria-hidden="true">
          <span style={{ width: `${duration > 0 ? (100 * time) / duration : 0}%` }} />
        </div>
        <div class="battle-actions">
          <button class="btn btn-small" onClick={() => actions.battleRewind()}>
            {t('battle.rewind')}
          </button>
          <div class="battle-speed" role="group" aria-label={t('battle.speed')}>
            {([1, 2, 4] as const).map((k) => (
              <button
                key={k}
                class={`btn btn-small ${speed === k ? 'is-on' : ''}`}
                aria-pressed={speed === k}
                onClick={() => actions.battleSpeed(k)}
              >
                ×{k}
              </button>
            ))}
          </div>
          <button class="btn btn-small" onClick={() => actions.battleSkip()}>
            {t('battle.skip')}
          </button>
        </div>
        {!unit && <span class="small muted battle-hint">{t('battle.tapHint')}</span>}
      </div>
    </div>
  );
}

/** Chantier 38: what the kiwi wears (read from the colony: the journal keeps no gear). */
function UnitGear({ ref_ }: { ref_: string }) {
  const t = useT();
  const worn = useUi((s) => {
    const gear = s.game?.villagers.find((v) => v.id === ref_)?.gear;
    return [gear?.weapon, gear?.armor].filter(Boolean).join(',');
  });
  const items = worn ? (worn.split(',') as ItemId[]) : [];
  return (
    <span class="small muted">
      {items.length > 0
        ? t('battle.unit.gear', { items: items.map((id) => t(`gear.items.${id}`)).join(', ') })
        : t('battle.unit.noGear')}
    </span>
  );
}

function UnitCard({ unit }: { unit: UnitInfo }) {
  const t = useT();
  const title =
    unit.body === 'ferret' || unit.body === 'bat'
      ? t(`battle.enemies.${unit.kind as 'soldier'}`)
      : unit.body === 'turret'
        ? t(`buildings.${unit.kind as 'seedTurret'}.name`)
        : unit.name;
  const role =
    unit.body === 'turret'
      ? t('battle.unit.turret')
      : unit.side === 1
        ? t('battle.unit.enemy')
        : unit.classId
          ? t(`classes.${unit.classId as 'warrior'}.name`)
          : t(unit.body === 'kikiwiwi' ? 'battle.unit.kikiwiwi' : 'battle.unit.kiwi');
  const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
  return (
    <div class={`unit-card parchment ${unit.side === 1 ? 'is-enemy' : ''}`}>
      <div class="unit-card-head">
        <div>
          <strong>{title}</strong>
          <span class="small muted">
            {role} · {t('battle.unit.level', { level: unit.level })}
          </span>
        </div>
        <button
          class="btn btn-small"
          aria-label={t('battle.unit.close')}
          onClick={() => actions.battleUnit(null)}
        >
          ✕
        </button>
      </div>
      <div class="unit-hp" aria-hidden="true">
        <span style={{ width: `${Math.round(100 * ratio)}%` }} />
      </div>
      <span class="small">
        {unit.fallen
          ? t('battle.unit.fallen')
          : t('battle.unit.hp', { hp: Math.ceil(unit.hp), max: Math.ceil(unit.maxHp) })}
      </span>
      <span class="small">
        {t('battle.unit.weapon', { weapon: t(`battle.weapons.${unit.weapon}`) })}
      </span>
      {unit.side === 0 && unit.classId && (
        <span class="small muted">{t(`classes.${unit.classId as 'warrior'}.combat`)}</span>
      )}
      {unit.side === 0 && unit.body !== 'turret' && <UnitGear ref_={unit.ref} />}
    </div>
  );
}
