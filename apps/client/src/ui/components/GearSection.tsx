import {
  familyOf,
  GEAR_SLOTS,
  ITEMS,
  wearLock,
  type GameState,
  type GearSlot,
  type ItemId,
  type Villager,
} from '@kiwar/shared';
import { actions } from '../actions';
import { Icon } from '../iconSet';
import { useT } from '../store';
import { ItemEffects } from './ForgeInfo';

/**
 * Chantier 38: a kiwi's two slots — what it wears, the pieces of the armory it could wear
 * instead, and a button to take a piece off. Shown once the colony has a Forge, gear or pieces.
 */
export function GearSection({ game, v }: { game: GameState; v: Villager }) {
  const t = useT();
  const hasForge = game.buildings.some((b) => b.type === 'forge');
  const armory = Object.keys(game.forge.armory) as ItemId[];
  if (v.kikiwiwi || (!hasForge && !v.gear && armory.length === 0)) return null;
  const away = v.job.kind === 'expedition' || v.job.kind === 'outpost';
  const choices = (slot: GearSlot) =>
    armory.filter((id) => ITEMS[id].slot === slot && !wearLock(v, id) && id !== v.gear?.[slot]);
  return (
    <section class="field gear">
      <h3>
        <Icon name="forge" size={18} /> {t('gear.title')}
      </h3>
      <div class="gear-slots">
        {GEAR_SLOTS.map((slot) => {
          const worn = v.gear?.[slot];
          const noWeapon = slot === 'weapon' && familyOf(v) === null;
          return (
            <div class="gear-slot" key={slot}>
              <span class="gear-slot-label small">{t(`gear.${slot}`)}</span>
              {worn ? (
                <>
                  <span class="small">
                    <Icon name={slot === 'armor' ? 'armor' : 'forge'} size={16} />{' '}
                    {t(`gear.items.${worn}`)}
                  </span>
                  <ItemEffects def={ITEMS[worn]} />
                  {!away && (
                    <button
                      class="btn btn-small"
                      onClick={() =>
                        actions.dispatch({ type: 'equip', villagerId: v.id, slot, item: null })
                      }
                    >
                      {t('gear.remove')}
                    </button>
                  )}
                </>
              ) : (
                <span class="small muted">{noWeapon ? t('gear.noWeapon') : t('gear.none')}</span>
              )}
              {!away && choices(slot).length > 0 && (
                <div class="gear-choices">
                  {choices(slot).map((id) => (
                    <button
                      key={id}
                      class="btn btn-small"
                      onClick={() =>
                        actions.dispatch({ type: 'equip', villagerId: v.id, slot, item: id })
                      }
                    >
                      {t('gear.equip')} · {t(`gear.items.${id}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p class="small muted">
        {away ? t('gear.away') : v.gear?.kept ? t('gear.kept') : t('gear.auto')}
      </p>
    </section>
  );
}
