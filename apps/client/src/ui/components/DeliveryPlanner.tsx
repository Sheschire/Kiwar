import { useState } from 'preact/hooks';
import {
  availableCrew,
  cargoLimit,
  crewOf,
  crewWeight,
  EXPEDITIONS,
  SISTER_FRIEND,
  type Friend,
  type VillagerId,
  deliveryTime,
  emptyResources,
  launchpadOf,
  RESOURCE_IDS,
  validateCommand,
  type BuildingId,
  type GameState,
  type ResourceId,
  type Resources,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon, ShipIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';

/** Who a delivery goes to: an ally by name, or our other colony (chantier 19). */
export function friendName(t: Translate, owner: string): string {
  const face = /^colony:(kiwisu|kiwino)$/.exec(owner)?.[1] as 'kiwisu' | 'kiwino' | undefined;
  return face ? t('colony.title', { face: t(`faces.${face}`) }) : owner;
}

/**
 * A free gift to an ally (multiplayer): pick who, load the ship (sliders per resource, within
 * the cargo), send. The launchpad stays busy until the ship is back.
 */
export function DeliveryPlanner({
  game,
  padId,
  initialFriend,
}: {
  game: GameState;
  padId: BuildingId;
  initialFriend?: string | null;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  const allies = useUi((s) => s.allies);
  const pad = launchpadOf(game, padId);
  const [friendId, setFriendId] = useState(
    () => game.friends.find((f) => f.id === initialFriend)?.id ?? game.friends[0]?.id ?? '',
  );
  const [load, setLoad] = useState<Resources>(emptyResources);
  // Chantier 19: kiwis may move to our other colony.
  const [movers, setMovers] = useState<VillagerId[]>([]);
  const friend = game.friends.find((f) => f.id === friendId);
  if (!pad || !map) return null;
  if (!friend) return <p class="muted">{t('delivery.noFriend')}</p>;

  const toSister = friend.id === SISTER_FRIEND;
  const kiwis = toSister ? movers : [];
  const kiwiLoad = crewWeight(crewOf(game, kiwis) ?? []) / EXPEDITIONS.resourceWeight;
  const limit = cargoLimit(pad);
  const total = RESOURCE_IDS.reduce((sum, r) => sum + load[r], 0) + kiwiLoad;
  const room = allies.find((a) => a.friendId === friend.id)?.room;
  const travel = deliveryTime(game, friend, pad);
  const cmd = {
    type: 'sendCargo' as const,
    launchpadId: padId,
    friendId,
    resources: load,
    ...(kiwis.length ? { villagerIds: kiwis } : {}),
  };
  const nameOf = (f: Friend) => friendName(t, f.owner);
  const error = validateCommand(game, cmd, { now, map });
  const fmt = (v: number) => formatNumber(lang, Math.floor(v));
  const set = (r: ResourceId, v: number) => setLoad((l) => ({ ...l, [r]: v }));
  const maxOf = (r: ResourceId) =>
    Math.max(0, Math.floor(Math.min(game.resources[r], limit - (total - load[r]))));

  return (
    <div class="expedition delivery">
      <section class="field">
        <h3>{t('delivery.to')}</h3>
        <div class="targets">
          {game.friends.map((f) => (
            <button
              key={f.id}
              class={`target-card ${f.id === friendId ? 'is-selected' : ''}`}
              aria-pressed={f.id === friendId}
              onClick={() => setFriendId(f.id)}
            >
              <strong>{nameOf(f)}</strong>
              <span class="small muted">
                {f.id === SISTER_FRIEND
                  ? t('colony.hint')
                  : t('delivery.kiwi', { index: f.kiwiIndex + 1 })}{' '}
                ·{' '}
                {t('expedition.travel', {
                  duration: formatDuration(lang, deliveryTime(game, f, pad)),
                })}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section class="field">
        <div class="title-row">
          <h3>{t('delivery.load')}</h3>
          <span class="stepper-value">
            {fmt(total)} / {fmt(limit)}
          </span>
        </div>
        <div class={`cargo-bar ${total > limit ? 'overloaded' : ''}`} aria-hidden="true">
          <span class="seg-food" style={{ width: `${Math.min(100, (total / limit) * 100)}%` }} />
        </div>
        {RESOURCE_IDS.map((r) => (
          <div key={r} class="delivery-row">
            <ResourceIcon id={r} size={20} />
            <input
              class="slider"
              type="range"
              aria-label={t(`resources.${r}`)}
              min={0}
              max={maxOf(r)}
              step={Math.max(1, Math.round(maxOf(r) / 100))}
              value={load[r]}
              onInput={(e) => set(r, Number((e.target as HTMLInputElement).value))}
            />
            <span class="delivery-value">{fmt(load[r])}</span>
            {room && load[r] > room[r] && (
              <span class="small warn">{t('delivery.full', { room: fmt(room[r]) })}</span>
            )}
          </div>
        ))}
        <p class="small muted">{t('delivery.hint')}</p>
      </section>

      {toSister && (
        <section class="field">
          <div class="title-row">
            <h3>{t('colony.kiwis')}</h3>
            <span class="stepper-value">{movers.length}</span>
          </div>
          <p class="small muted">{t('colony.kiwisHint')}</p>
          <div class="chip-picks">
            {availableCrew(game).map((v) => (
              <label key={v.id} class={`chip-pick ${movers.includes(v.id) ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={movers.includes(v.id)}
                  onChange={() =>
                    setMovers((m) =>
                      m.includes(v.id) ? m.filter((id) => id !== v.id) : [...m, v.id],
                    )
                  }
                />
                {v.name}
              </label>
            ))}
          </div>
        </section>
      )}

      <button
        class="btn btn-primary launch"
        disabled={error !== null}
        onClick={() => {
          if (actions.dispatch(cmd)) uiStore.setState({ modal: 'none', expeditionPad: null });
        }}
      >
        <ShipIcon size={20} /> {t('delivery.send', { name: nameOf(friend) })} ·{' '}
        {formatDuration(lang, travel * 2)}
      </button>
      {error && error !== 'emptyCargo' && <p class="small warn">{t(`errors.${error}`)}</p>}
    </div>
  );
}
