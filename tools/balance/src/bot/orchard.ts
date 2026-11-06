import {
  attitudeOf,
  canAfford,
  crystalUnits,
  hasTech,
  isLaunchpadBusy,
  levelDef,
  meteorIronOf,
  nectarOf,
  ORCHARD,
  orchardOpen,
  postAttackForecast,
  postCost,
  postKiwis,
  postMapOf,
  postModuleLock,
  rations,
  raspberryOfState,
  standingOf,
  STANDING,
  tradeRate,
  upgradeLock,
  voyageForecast,
  voyageLock,
  EXPEDITIONS,
  type Resources,
  voyagesOut,
  voyageTime,
  workingPost,
  type Building,
  type Command,
  type GameState,
  type PostModuleType,
  type Villager,
  type VoyagePlan,
} from '@kiwar/shared';

/**
 * Chantier 54: the bot in the orchard — a launchpad raised to level 9 once the wormholes are
 * known, then peaceful voyages: a trade with the clan that pays best (it makes friends), a
 * trading post with the first friendly clan (two kiwis stay there), its stall, a hut and a
 * palisade, the store brought home on the way. Against an announced attack an attentive bot
 * calms the clan with a gift (when the post would not hold), or brings its kiwis home. The
 * bot never pillages (a player's choice the probe does not need to weigh).
 */

const HOUR_MS = 3_600_000;
/** Goods carried per visit (what the clan asks for), and what must stay in store. */
const GOODS = 10_000;
const KEEP = 50_000;

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

function provisions(state: GameState, pad: Building, crew: Villager[]): VoyagePlan['provisions'] {
  const need = rations(state, crew, 2 * voyageTime(state, pad, crew) + ORCHARD.hopMs);
  return { pulp: Math.ceil(need.pulp * 1.2), juice: Math.ceil(need.juice * 1.2) };
}

function plan(
  state: GameState,
  pad: Building,
  crew: Villager[],
  extra: Partial<VoyagePlan> & Pick<VoyagePlan, 'stops'>,
): VoyagePlan {
  return {
    launchpadId: pad.id,
    mission: 'visit',
    crew: crew.map((v) => v.id),
    provisions: provisions(state, pad, crew),
    ...extra,
  };
}

/** A gift (or the kiwis home) against an announced attack the post would not hold. */
function defend(state: GameState, pad: Building): VoyagePlan | null {
  const post = state.orchard.post;
  const a = post?.attack;
  if (!post || !a?.announced || !a.clan) return null;
  if (voyagesOut(state).length > 0) return null;
  const f = postAttackForecast(state);
  if (f?.odds === 'likely') return null;
  const map = raspberryOfState(state);
  const crew = sailors(state, 1);
  if (crew.length === 0) return null;
  // A gift big enough to bring the clan back above hostile, if the ship is back in time.
  const target = map.drupelets.find((d) => d.clan === a.clan && d.links.includes(post.drupelet));
  const clan = map.clanById.get(a.clan)!;
  const travel = voyageTime(state, pad, crew);
  if (target && state.now + travel < a.at) {
    const missing = STANDING.hostile + 1 - standingOf(state, a.clan, state.now);
    const amount = Math.min(15_000, Math.ceil((missing / STANDING.gift) * 5000));
    if (state.resources[clan.wants] > amount + KEEP)
      return plan(state, pad, crew, {
        stops: [target.id],
        goods: { [clan.wants]: amount },
        gift: true,
      });
  }
  // Otherwise everyone at the post comes home (the post falls to a ruin, nobody dies).
  const here = postKiwis(state).map((v) => v.id);
  if (here.length === 0) return null;
  return plan(state, pad, crew, { stops: [post.drupelet], bringBack: here });
}

/** The next module of the post: a stall, a hut, a palisade (nectar and iron allowing). */
function postModule(state: GameState): Command | null {
  const post = workingPost(state);
  if (!post) return null;
  const want: PostModuleType[] = ['stall', 'palisade', 'hut'];
  const type = want.find((t) => !post.modules.some((m) => m.type === t));
  if (!type) return null;
  const tile = postMapOf(state, post).tiles.find(
    (x) => x.kind === 'ground' && postModuleLock(state, type, x) === null,
  );
  return tile ? { type: 'buildPostModule', moduleType: type, q: tile.q, r: tile.r } : null;
}

/** A trade with the clan that pays best (not hostile), or the post founded with a friend. */
function voyage(state: GameState, pad: Building): VoyagePlan | null {
  if (voyagesOut(state).length > 0) return null;
  const map = raspberryOfState(state);
  const post = state.orchard.post;
  // The post, once a clan is friendly (two kiwis stay there).
  if (!post || post.ruined) {
    const cost = postCost(state);
    const friend = map.drupelets.find(
      (d) =>
        attitudeOf(state, d.clan, state.now) === 'friendly' ||
        (post?.ruined && d.id === post.drupelet),
    );
    if (
      friend &&
      nectarOf(state) >= cost.nectar &&
      crystalUnits(state.crystal) >= cost.crystal + 20 &&
      meteorIronOf(state) >= cost.iron
    ) {
      const crew = sailors(state, 3);
      if (crew.length === 3)
        return plan(state, pad, crew, {
          stops: [friend.id],
          settle: true,
          stay: crew.slice(0, 2).map((v) => v.id),
          ...(state.resources[map.clanById.get(friend.clan)!.wants] > GOODS + KEEP
            ? { goods: { [map.clanById.get(friend.clan)!.wants]: GOODS } }
            : {}),
        });
    }
  }
  // A trade: before the post, with one partner clan (the best standing, then the best rate)
  // until it is a friend; then the best rate (the post's own clan when nectar waits there).
  const open = map.clans
    .filter((c) => attitudeOf(state, c.id, state.now) !== 'hostile')
    .filter((c) => state.resources[c.wants] > GOODS + KEEP);
  const byRate = (a: (typeof open)[number], b: (typeof open)[number]) =>
    tradeRate(state, b.id, state.now) - tradeRate(state, a.id, state.now);
  const best =
    !post || post.ruined
      ? [...open].sort(
          (a, b) =>
            standingOf(state, b.id, state.now) - standingOf(state, a.id, state.now) || byRate(a, b),
        )[0]
      : [...open].sort(byRate)[0];
  if (!best) return null;
  const at =
    post && !post.ruined && map.byId.get(post.drupelet)!.clan === best.id
      ? post.drupelet
      : best.drupelets[0]!;
  const crew = sailors(state, 1);
  if (crew.length === 0) return null;
  return plan(state, pad, crew, { stops: [at], goods: { [best.wants]: GOODS } });
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

/** Why the last look at the orchard sent no ship (the probe prints it). */
export const orchardWhy: Record<string, number> = {};
const why = (k: string) => (orchardWhy[k] = (orchardWhy[k] ?? 0) + 1);

/** Everything the bot does in the orchard this round (looked at once an hour of game time). */
export function orchardOrders(state: GameState, prepared: boolean): Command[] {
  if (!orchardOpen(state)) return [];
  const out: Command[] = [];
  const module = postModule(state);
  if (module) out.push(module);
  const pad = freePad(state);
  if (!pad) {
    why(
      state.buildings.some((b) => b.type === 'launchpad' && b.level >= ORCHARD.padLevel)
        ? 'padBusy'
        : 'noPad',
    );
    return out;
  }
  const raw = (prepared ? defend(state, pad) : null) ?? voyage(state, pad);
  const v = raw ? fitHold(state, raw) : null;
  if (!v) why(voyagesOut(state).length > 0 ? 'underWay' : 'noPlan');
  const lock = v ? voyageLock(state, v) : null;
  if (lock) why(lock);
  if (v && lock === null) out.push({ type: 'voyage', ...v });
  return out;
}

export const ORCHARD_LOOK_MS = HOUR_MS;
