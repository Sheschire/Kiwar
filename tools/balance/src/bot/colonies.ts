import {
  capacity,
  cargoLimit,
  isLaunchpadBusy,
  RESOURCE_IDS,
  SISTER_FRIEND,
  type Command,
  type GameState,
  type Resources,
} from '@kiwar/shared';

/** The sister gets help when a stock is below this share of its storage… */
const SISTER_LOW = 0.3;
/** …from a home stock above this share of its own. */
const HOME_HIGH = 0.6;

/**
 * Chantier 19: the home colony sends what the young sister colony lacks (one load at a time,
 * a free gift between our own faces), from a stock it has plenty of.
 */
export function linkOrder(home: GameState, sister: GameState): Command | null {
  if (!home.friends.some((f) => f.id === SISTER_FRIEND)) return null;
  const pad = home.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(home, b.id),
  );
  if (!pad) return null;
  const capHome = capacity(home);
  const capSister = capacity(sister);
  const coming = (id: keyof Resources) =>
    sister.incoming.reduce((sum, d) => sum + d.resources[id], 0);
  let left = cargoLimit(pad);
  const load = {} as Resources;
  for (const id of RESOURCE_IDS) {
    load[id] = 0;
    const room = capSister[id] - sister.resources[id] - coming(id);
    if (sister.resources[id] + coming(id) >= capSister[id] * SISTER_LOW) continue;
    if (home.resources[id] < capHome[id] * HOME_HIGH) continue;
    const give = Math.floor(Math.min(room, left, home.resources[id] - capHome[id] * HOME_HIGH));
    if (give <= 0) continue;
    load[id] = give;
    left -= give;
  }
  if (RESOURCE_IDS.every((id) => load[id] === 0)) return null;
  return { type: 'sendCargo', launchpadId: pad.id, friendId: SISTER_FRIEND, resources: load };
}
