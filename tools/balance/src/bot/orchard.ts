import {
  appleStage,
  attitudeOf,
  calendarAt,
  canAfford,
  CIDER_EVENING,
  crystalUnits,
  EXPEDITIONS,
  FRUIT_IDS,
  fruitOfState,
  GILD,
  goodOf,
  hasTech,
  isDecor,
  isLaunchpadBusy,
  levelDef,
  meteorIronOf,
  nectarOf,
  openRouteLock,
  ORCHARD,
  orchardOpen,
  parcelInReach,
  postAttackForecast,
  postCost,
  postKiwis,
  postMapOf,
  postModuleLock,
  postOf,
  rations,
  routeBetween,
  routeUpkeep,
  standingOf,
  STANDING,
  tradeRate,
  upgradeLock,
  voyageForecast,
  voyageLock,
  voyagesOut,
  voyageTime,
  workingPost,
  wornOut,
  type Building,
  type Command,
  type FruitId,
  type GameState,
  type OrchardGood,
  type PostModuleType,
  type Resources,
  type Villager,
  type VoyagePlan,
} from '@kiwar/shared';

/**
 * Chantier 54 (55: three fruits): the bot in the orchard — a launchpad raised to level 9 once
 * the wormholes are known, then peaceful voyages: trades with the clan that pays best (it makes
 * friends), a trading post with the first friendly clan of each fruit in turn (raspberry, apple,
 * pineapple; two kiwis stay there), its stall, a palisade and a hut, the stores brought home on
 * the way. The apple is traded with only when the ship lands before it is overripe (its cider
 * comes from the post's stalls then); the pineapple's worn-out kiwis are relieved. The orchard's
 * goods go to routes between posts, cider evenings and gilded decorations. Against an announced
 * attack an attentive bot calms the clan with a gift (when the post would not hold), or brings
 * its kiwis home. The bot never pillages (a player's choice the probe does not need to weigh).
 */

const HOUR_MS = 3_600_000;
/** Goods carried per visit (what the clan asks for), and what must stay in store. */
const GOODS = 10_000;
const KEEP = 50_000;
/** Days of a route's upkeep kept in store before opening it. */
const ROUTE_DAYS = 3;

/** The launchpad raised to the wormhole's level once the technology is known. */
export function wormholePadDecision(state: GameState): Command | null {
  // Once the Mother Vine is found (the wormholes come next), or once they are known.
  const soon = state.depths.weevil?.fellAt !== undefined || hasTech(state, 'wormholes');
  if (!soon || state.colony.index !== 0) return null;
  const pads = state.buildings.filter((b) => b.type === 'launchpad');
  if (pads.some((b) => b.level >= ORCHARD.padLevel)) return null;
  const pad = [...pads].sort((a, b) => b.level - a.level)[0];
  if (!pad || upgradeLock(state, pad) !== null) return null;
  if (state.queue.some((q) => q.buildingId === pad.id)) return null;
  const next = levelDef('launchpad', pad.level + 1);
  if (!next || !canAfford(state.resources, next.cost)) return null;
  if (meteorIronOf(state) < (next.iron ?? 0)) return null;
  if (crystalUnits(state.crystal) < (next.crystal ?? 0)) return null;
  return { type: 'upgrade', buildingId: pad.id };
}

/**
 * The orchard wants the ship (the wormhole is open, a launchpad high enough, no voyage out and
 * none back within the last 12 h): deliveries to the sister colony wait for it.
 */
export function orchardWantsPad(state: GameState): boolean {
  if (!orchardOpen(state)) return false;
  if (!state.buildings.some((b) => b.type === 'launchpad' && b.level >= ORCHARD.padLevel))
    return false;
  if (voyagesOut(state).length > 0) return false;
  const last = state.expeditions
    .filter((e) => e.mission === 'visit' || e.mission === 'pillage')
    .reduce((t, e) => Math.max(t, e.returnAt), 0);
  return state.now - last >= 12 * HOUR_MS;
}

/** An announced attack on one of our posts (the bot looks every round then). */
export function orchardAttackAnnounced(state: GameState): boolean {
  return FRUIT_IDS.some((f) => !!postOf(state, f)?.attack?.announced);
}

function freePad(state: GameState): Building | undefined {
  return state.buildings.find(
    (b) =>
      b.type === 'launchpad' &&
      b.level >= ORCHARD.padLevel &&
      !b.damaged &&
      !isLaunchpadBusy(state, b.id),
  );
}

/** Kiwis free to sail: idle or at work, never the Library's, the Forge's or the drill's. */
function sailors(state: GameState, n: number): Villager[] {
  const keep = new Set(
    state.buildings
      .filter((b) => b.type === 'library' || b.type === 'forge')
      .map((b) => b.id as string),
  );
  return state.villagers
    .filter(
      (v) =>
        !v.kikiwiwi &&
        (v.job.kind === 'idle' || (v.job.kind === 'work' && !keep.has(v.job.buildingId))),
    )
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
    .slice(0, n);
}

function provisions(
  state: GameState,
  pad: Building,
  crew: Villager[],
  fruit: FruitId,
): VoyagePlan['provisions'] {
  const need = rations(state, crew, 2 * voyageTime(state, pad, crew, false, fruit) + ORCHARD.hopMs);
  return { pulp: Math.ceil(need.pulp * 1.2), juice: Math.ceil(need.juice * 1.2) };
}

function plan(
  state: GameState,
  pad: Building,
  crew: Villager[],
  fruit: FruitId,
  extra: Partial<VoyagePlan> & Pick<VoyagePlan, 'stops'>,
): VoyagePlan {
  return {
    launchpadId: pad.id,
    mission: 'visit',
    crew: crew.map((v) => v.id),
    provisions: provisions(state, pad, crew, fruit),
    ...extra,
  };
}

/** A gift (or the kiwis home) against an announced attack a post would not hold. */
function defend(state: GameState, pad: Building, fruit: FruitId): VoyagePlan | null {
  const post = postOf(state, fruit);
  const a = post?.attack;
  if (!post || !a?.announced || !a.clan) return null;
  if (voyagesOut(state).length > 0) return null;
  const f = postAttackForecast(state, fruit);
  if (f?.odds === 'likely') return null;
  const map = fruitOfState(state, fruit);
  const crew = sailors(state, 1);
  if (crew.length === 0) return null;
  // A gift big enough to bring the clan back above hostile, if the ship is back in time.
  const target = map.parcels.find(
    (d) => d.clan === a.clan && d.links.includes(post.drupelet) && parcelInReach(state, d),
  );
  const clan = map.clanById.get(a.clan)!;
  const travel = voyageTime(state, pad, crew, false, fruit);
  if (target && state.now + travel < a.at) {
    const missing = STANDING.hostile + 1 - standingOf(state, a.clan, state.now);
    const amount = Math.min(15_000, Math.ceil((missing / STANDING.gift) * 5000));
    if (state.resources[clan.wants] > amount + KEEP)
      return plan(state, pad, crew, fruit, {
        stops: [target.id],
        goods: { [clan.wants]: amount },
        gift: true,
      });
  }
  // Otherwise everyone at the post comes home (the post falls to a ruin, nobody dies).
  const here = postKiwis(state, fruit).map((v) => v.id);
  if (here.length === 0) return null;
  return plan(state, pad, crew, fruit, { stops: [post.drupelet], bringBack: here });
}

/** The next module of a post: a stall, a palisade, a hut (nectar and iron allowing). */
function postModule(state: GameState): Command | null {
  for (const fruit of FRUIT_IDS) {
    const post = workingPost(state, fruit);
    if (!post) continue;
    const want: PostModuleType[] = ['stall', 'palisade', 'hut'];
    const type = want.find((t) => !post.modules.some((m) => m.type === t));
    if (!type) continue;
    const tile = postMapOf(state, post).tiles.find(
      (x) => x.kind === 'ground' && postModuleLock(state, fruit, type, x) === null,
    );
    if (tile)
      return {
        type: 'buildPostModule',
        ...(fruit !== 'raspberry' ? { fruit } : {}),
        moduleType: type,
        q: tile.q,
        r: tile.r,
      };
  }
  return null;
}

/** The pineapple's worn-out kiwis brought home, two fresh ones left in their place. */
function relieve(state: GameState, pad: Building): VoyagePlan | null {
  const post = workingPost(state, 'pineapple');
  if (!post) return null;
  const worn = postKiwis(state, 'pineapple').filter((v) => wornOut(v, state.now));
  if (worn.length === 0) return null;
  const crew = sailors(state, worn.length + 1);
  if (crew.length < worn.length + 1) return null;
  return plan(state, pad, crew, 'pineapple', {
    stops: [post.drupelet],
    bringBack: worn.map((v) => v.id),
    stay: crew.slice(0, worn.length).map((v) => v.id),
  });
}

/** When a ship leaving now lands on a fruit (the apple's ripeness is read then). */
function arrival(state: GameState, pad: Building, fruit: FruitId): number {
  return state.now + voyageTime(state, pad, sailors(state, 1), false, fruit);
}

/** A trade with the clan that pays best (not hostile), or the post founded with a friend. */
function voyage(state: GameState, pad: Building, fruit: FruitId): VoyagePlan | null {
  const map = fruitOfState(state, fruit);
  const post = postOf(state, fruit);
  const at = arrival(state, pad, fruit);
  // The apple is visited ripe or green: an overripe apple pays half (its cider is the post's).
  if (fruit === 'apple' && appleStage(state.orchard.seed, at).stage === 'overripe') return null;
  // The post, once a clan is friendly (two kiwis stay there).
  if (!post || post.ruined) {
    const cost = postCost(state, fruit);
    const friend = map.parcels.find(
      (d) =>
        parcelInReach(state, d) &&
        (attitudeOf(state, d.clan, state.now) === 'friendly' ||
          (post?.ruined && d.id === post.drupelet)),
    );
    if (
      friend &&
      nectarOf(state) >= cost.nectar &&
      crystalUnits(state.crystal) >= cost.crystal + 20 &&
      meteorIronOf(state) >= cost.iron
    ) {
      const crew = sailors(state, 3);
      const wants = map.clanById.get(friend.clan)!.wants;
      if (crew.length === 3)
        return plan(state, pad, crew, fruit, {
          stops: [friend.id],
          settle: true,
          stay: crew.slice(0, 2).map((v) => v.id),
          ...(state.resources[wants] > GOODS + KEEP ? { goods: { [wants]: GOODS } } : {}),
        });
    }
  }
  // A trade: before the post, with one partner clan (the best standing, then the best rate)
  // until it is a friend; then the best rate (the post's own clan when goods wait there).
  const reach = new Set(map.parcels.filter((d) => parcelInReach(state, d)).map((d) => d.clan));
  const open = map.clans
    .filter((c) => reach.has(c.id))
    .filter((c) => attitudeOf(state, c.id, state.now) !== 'hostile')
    .filter((c) => state.resources[c.wants] > GOODS + KEEP);
  const byRate = (a: (typeof open)[number], b: (typeof open)[number]) =>
    tradeRate(state, b.id, at) - tradeRate(state, a.id, at);
  const best =
    !post || post.ruined
      ? [...open].sort(
          (a, b) =>
            standingOf(state, b.id, state.now) - standingOf(state, a.id, state.now) || byRate(a, b),
        )[0]
      : [...open].sort(byRate)[0];
  if (!best) return null;
  const stop =
    post && !post.ruined && map.byId.get(post.drupelet)!.clan === best.id
      ? post.drupelet
      : best.parcels.find((id) => parcelInReach(state, map.byId.get(id)!))!;
  const crew = sailors(state, 1);
  if (crew.length === 0) return null;
  return plan(state, pad, crew, fruit, { stops: [stop], goods: { [best.wants]: GOODS } });
}

/**
 * Where the ship goes: the next fruit without a post (raspberry, apple, pineapple), else the
 * fruits in turn (one voyage each).
 */
function anyVoyage(state: GameState, pad: Building): VoyagePlan | null {
  if (voyagesOut(state).length > 0) return null;
  const relief = relieve(state, pad);
  if (relief) return relief;
  const next = FRUIT_IDS.find((f) => !workingPost(state, f));
  if (next) {
    const v = voyage(state, pad, next);
    if (v) return v;
  }
  const turn = state.orchard.visits % FRUIT_IDS.length;
  for (let i = 0; i < FRUIT_IDS.length; i++) {
    const v = voyage(state, pad, FRUIT_IDS[(turn + i) % FRUIT_IDS.length]!);
    if (v) return v;
  }
  return null;
}

/** Goods cut down to what the hold carries (the crew and provisions come first). */
function fitHold(state: GameState, v: VoyagePlan): VoyagePlan {
  const f = voyageForecast(state, { ...v, goods: {} });
  if (!f || !v.goods) return v;
  const room = Math.max(0, Math.floor(((f.cargo - f.weight) / EXPEDITIONS.resourceWeight) * 0.95));
  const goods: Partial<Resources> = {};
  let left = room;
  for (const [k, n] of Object.entries(v.goods) as [keyof Resources, number][]) {
    goods[k] = Math.min(n, left);
    left -= goods[k]!;
  }
  return { ...v, goods };
}

/** Chantier 55: a route between two posts working, with a few days of its upkeep in store. */
function routeOrder(state: GameState): Command | null {
  for (let i = 0; i < FRUIT_IDS.length; i++)
    for (let j = i + 1; j < FRUIT_IDS.length; j++) {
      const a = FRUIT_IDS[i]!;
      const b = FRUIT_IDS[j]!;
      const old = routeBetween(state, a, b);
      if (old && !old.cut) continue;
      if (openRouteLock(state, a, b) !== null) continue;
      const upkeep = Object.entries(routeUpkeep(a, b)) as [OrchardGood, number][];
      if (upkeep.every(([g, n]) => goodOf(state, g) >= n * ROUTE_DAYS))
        return { type: 'openRoute', a, b };
    }
  return null;
}

/** Chantier 55: a cider evening at night, when there is cider to spare (two evenings' worth). */
function ciderOrder(state: GameState): Command | null {
  if (goodOf(state, 'cider') < 2 * CIDER_EVENING.cider + ROUTE_DAYS * 6) return null;
  const c = calendarAt(state.calendarStart, state.now);
  if (!c.night || state.village.ciderNight === c.nightAt) return null;
  return { type: 'serveCider' };
}

/** Chantier 55: a decoration gilded when nectar and golden fibre are to spare. */
function gildOrder(state: GameState): Command | null {
  if (goodOf(state, 'nectar') < GILD.nectar + 40) return null;
  if (goodOf(state, 'goldFiber') < GILD.goldFiber + ROUTE_DAYS * 6) return null;
  const decor = state.buildings.find((b) => isDecor(b.type) && !b.gilded);
  return decor ? { type: 'gildDecor', buildingId: decor.id } : null;
}

/** Why the last look at the orchard sent no ship (the probe prints it). */
export const orchardWhy: Record<string, number> = {};
const why = (k: string) => (orchardWhy[k] = (orchardWhy[k] ?? 0) + 1);

/** Everything the bot does in the orchard this round (looked at once an hour of game time). */
export function orchardOrders(state: GameState, prepared: boolean): Command[] {
  if (!orchardOpen(state)) return [];
  const out: Command[] = [];
  const module = postModule(state);
  if (module) out.push(module);
  for (const sink of [routeOrder(state), ciderOrder(state), gildOrder(state)])
    if (sink) out.push(sink);
  const pad = freePad(state);
  if (!pad) {
    why(
      state.buildings.some((b) => b.type === 'launchpad' && b.level >= ORCHARD.padLevel)
        ? 'padBusy'
        : 'noPad',
    );
    return out;
  }
  let raw: VoyagePlan | null = null;
  if (prepared)
    for (const f of FRUIT_IDS) {
      raw = defend(state, pad, f);
      if (raw) break;
    }
  raw ??= anyVoyage(state, pad);
  const v = raw ? fitHold(state, raw) : null;
  if (!v) why(voyagesOut(state).length > 0 ? 'underWay' : 'noPlan');
  const lock = v ? voyageLock(state, v) : null;
  if (lock) why(lock);
  if (v && lock === null) out.push({ type: 'voyage', ...v });
  return out;
}

export const ORCHARD_LOOK_MS = HOUR_MS;
