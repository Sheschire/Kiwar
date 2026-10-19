export const RESOURCE_IDS = ['pulp', 'fiber', 'seeds', 'juice'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, number>;
export type ResourceCost = Partial<Resources>;

export const emptyResources = (): Resources => ({ pulp: 0, fiber: 0, seeds: 0, juice: 0 });

export interface ResourceDef {
  id: ResourceId;
  /** Rare resources are shown with emphasis and are needed for upgrades. */
  rare: boolean;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  pulp: { id: 'pulp', rare: false },
  fiber: { id: 'fiber', rare: false },
  seeds: { id: 'seeds', rare: true },
  juice: { id: 'juice', rare: false },
};
