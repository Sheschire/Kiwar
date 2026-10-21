import { EXPEDITIONS } from '../data/expeditions';
import { emptyResources, RESOURCE_IDS, type Resources } from '../data/resources';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { emigrate, settle } from './colonies';
import type { GameEvent } from './advance';
import { shipCargo, travelTime } from './expeditions';
import { techEffects } from './research';
import { capacity } from './selectors';
import {
  cloneVillager,
  nextId,
  type Building,
  type Delivery,
  type Friend,
  type GameState,
  type Shipment,
} from './state';

/**
 * Deliveries between allies (multiplayer): the launchpad's ship carries resources to an ally's
 * planet and flies back empty. Free gifts, no crew, no risk: only the flight time and the
 * launchpad being busy (no raid meanwhile) count. The ally's side is written by the server
 * (`GameState.incoming`), credited when it lands.
 */

/** Cargo units taken by a load of resources (same weight as provisions and loot). */
export function cargoWeight(resources: Partial<Resources>): number {
  return (
    RESOURCE_IDS.reduce((sum, id) => sum + (resources[id] ?? 0), 0) * EXPEDITIONS.resourceWeight
  );
}

/** Most resources (all kinds together) the ship of this launchpad can carry. */
export function cargoLimit(launchpad: Building): number {
  return Math.floor(shipCargo(launchpad) / EXPEDITIONS.resourceWeight);
}

/** One-way flight time to an ally from this launchpad. */
export function deliveryTime(state: GameState, friend: Friend, launchpad: Building): number {
  return travelTime(friend, launchpad, [], 'raid', techEffects(state).travel);
}

/** Loads the ship and sends it (validation is done by the command). */
export function sendShipment(
  state: GameState,
  launchpadId: BuildingId,
  friend: Friend,
  launchpad: Building,
  resources: Resources,
  now: TimeMs,
  id: string,
  villagers: readonly VillagerId[] = [],
): Shipment {
  const travelMs = deliveryTime(state, friend, launchpad);
  for (const r of RESOURCE_IDS) state.resources[r] -= resources[r];
  // Chantier 19: kiwis moving to our other colony leave this one for good (alive).
  const movers = state.villagers.filter((v) => villagers.includes(v.id)).map(settle);
  emigrate(state, villagers);
  const shipment: Shipment = {
    id,
    launchpadId,
    friendId: friend.id,
    owner: friend.owner,
    kiwiIndex: friend.kiwiIndex,
    resources: { ...resources },
    departedAt: now,
    arriveAt: now + travelMs,
    returnAt: now + 2 * travelMs,
    status: 'outbound',
    ...(movers.length ? { villagers: movers } : {}),
  };
  state.shipments.push(shipment);
  return shipment;
}

/** Next time something happens to a shipment or a delivery (Infinity: nothing planned). */
export function nextDeliveryEvent(s: GameState): TimeMs {
  let at = Infinity;
  for (const x of s.shipments) at = Math.min(at, x.status === 'outbound' ? x.arriveAt : x.returnAt);
  for (const d of s.incoming) at = Math.min(at, d.arriveAt);
  return at;
}

/** Ships that reached the ally, ships back home, gifts that landed here. */
export function deliveryTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const x of s.shipments) {
    if (x.status === 'outbound' && x.arriveAt === at) {
      x.status = 'returning';
      events.push({
        type: 'cargoDelivered',
        at,
        shipmentId: x.id,
        to: x.owner,
        resources: { ...x.resources },
      });
    }
  }
  const back = s.shipments.filter((x) => x.status === 'returning' && x.returnAt === at);
  if (back.length) {
    s.shipments = s.shipments.filter((x) => !back.includes(x));
    for (const x of back) events.push({ type: 'shipmentReturned', at, shipmentId: x.id });
  }
  const landed = s.incoming.filter((d) => d.arriveAt === at);
  if (!landed.length) return;
  s.incoming = s.incoming.filter((d) => !landed.includes(d));
  const cap = capacity(s);
  for (const d of landed) {
    const received = emptyResources();
    const lost = emptyResources();
    for (const r of RESOURCE_IDS) {
      // A gift never pushes a stock past the storage (the rest is lost).
      const room = Math.max(0, cap[r] - s.resources[r]);
      received[r] = Math.min(room, d.resources[r]);
      lost[r] = d.resources[r] - received[r];
      s.resources[r] += received[r];
    }
    events.push({ type: 'cargoReceived', at, deliveryId: d.id, from: d.from, received, lost });
    if (d.villagers?.length) {
      for (const v of d.villagers)
        s.villagers.push({ ...settle(v), id: nextId(s, 'v') as VillagerId });
      events.push({
        type: 'settlersArrived',
        at,
        deliveryId: d.id,
        names: d.villagers.map((v) => v.name),
      });
    }
  }
}

/** What an ally sees landing on their planet (the server copies it into their game). */
export function deliveryOf(shipment: Shipment, from: string, senderId: string): Delivery {
  return {
    id: `${senderId}:${shipment.id}`,
    from,
    resources: { ...shipment.resources },
    departedAt: shipment.departedAt,
    arriveAt: shipment.arriveAt,
    ...(shipment.villagers?.length ? { villagers: shipment.villagers.map(cloneVillager) } : {}),
  };
}
