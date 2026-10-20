import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { BuildingId, VillagerId } from '../types/ids';
import { buildingResource, workerPower } from './kiwis';
import { researchPower } from './research';
import { workerSlots, workersOf } from './selectors';
import type { Building, GameState, Villager } from './state';

/** What a workplace produces: a resource, or research points (the Library). */
export type PostKind = ResourceId | 'research';

/** What a building's workers produce (null: not a workplace). */
export function postKind(state: GameState, b: Building): PostKind | null {
  if (workerSlots(b) === 0) return null;
  if (b.type === 'library') return 'research';
  return buildingResource(state, b);
}

/** How much a kiwi brings to a kind of post (1 for an average newborn). */
export function kindPower(v: Villager, kind: PostKind): number {
  return kind === 'research' ? researchPower(v) : workerPower(v, kind);
}

/** Average power of the colony's kiwis at a kind of post (Kikiwiwis aside). */
export function averagePower(state: GameState, kind: PostKind): number {
  const kiwis = state.villagers.filter((v) => !v.kikiwiwi);
  if (kiwis.length === 0) return 1;
  return kiwis.reduce((sum, v) => sum + kindPower(v, kind), 0) / kiwis.length;
}

/**
 * Affinity of a kiwi with a kind of post: its power there compared with the colony's average
 * (above 1: better than most at this job).
 */
export function affinity(state: GameState, v: Villager, kind: PostKind): number {
  return kindPower(v, kind) / averagePower(state, kind);
}

/** The worker who would step aside for a newcomer in a full building: the least skilled. */
export function weakestWorker(
  state: GameState,
  b: Building,
  except?: VillagerId,
): Villager | undefined {
  const kind = postKind(state, b);
  const workers = workersOf(state, b.id).filter((v) => v.id !== except);
  if (!kind) return workers[workers.length - 1];
  let weakest: { v: Villager; p: number } | undefined;
  for (const v of workers) {
    const p = kindPower(v, kind);
    if (!weakest || p < weakest.p) weakest = { v, p };
  }
  return weakest?.v;
}

/** One workplace as seen from a kiwi's sheet ("Assign to…"). */
export interface KiwiPost {
  buildingId: BuildingId;
  type: BuildingType;
  level: number;
  kind: PostKind;
  workers: number;
  slots: number;
  /** This kiwi's power at this post. */
  power: number;
  /** Its power compared with the colony's average there. */
  affinity: number;
  /** The kiwi already works here. */
  current: boolean;
  /** Full: the kiwi would swap places with this worker. */
  swapWith: { id: VillagerId; name: string } | null;
  /** The post where this kiwi's affinity is the best. */
  ideal: boolean;
}

/** Every workplace this kiwi could take, best affinity first (same order on ties). */
export function kiwiPosts(state: GameState, v: Villager): KiwiPost[] {
  const posts: KiwiPost[] = [];
  const average = new Map<PostKind, number>();
  for (const b of state.buildings) {
    const kind = postKind(state, b);
    if (!kind) continue;
    if (!average.has(kind)) average.set(kind, averagePower(state, kind));
    const workers = workersOf(state, b.id);
    const slots = workerSlots(b);
    const current = workers.some((x) => x.id === v.id);
    const swap = !current && workers.length >= slots ? weakestWorker(state, b) : undefined;
    const power = kindPower(v, kind);
    posts.push({
      buildingId: b.id,
      type: b.type,
      level: b.level,
      kind,
      workers: workers.length,
      slots,
      power,
      affinity: power / average.get(kind)!,
      current,
      swapWith: swap ? { id: swap.id, name: swap.name } : null,
      ideal: false,
    });
  }
  posts.sort((a, b) => b.affinity - a.affinity);
  if (posts[0]) posts[0].ideal = true;
  return posts;
}
