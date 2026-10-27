import { Group } from 'three';
import {
  ageOf,
  BIOMES,
  depletedTiles,
  harvestedTileType,
  hexKey,
  occupancy,
  seasonOf,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { BuildingsView } from './buildings';
import { ButterfliesView } from './butterflies';
import { CropsView, type CropZone } from './crops';
import { KiwisView } from './kiwis';
import { MeteorsView } from './meteors';
import { ObstaclesView } from './obstacles';
import { PathsView } from './paths';
import { PropsView } from './props';
import { seasonUniforms } from './seasonLook';
import type { TerrainView } from './terrain';
import type { WaterView } from './water';

/** What `VillageLife` dresses on the planet that holds it (`TwinView.setLife`). */
export interface VillageGround {
  terrain: TerrainView;
  water: WaterView | null;
}

/**
 * Chantier 59: an ally's colony on their planet while we visit it, as they see it at home —
 * living buildings, kiwis at their jobs, sites, paths, the wild props and the crops, worn
 * tiles, floods, craters, obstacles, butterflies and the lamps at night — fed by the server's
 * `allyVillage` (their colony now, without stocks). Lives in the planet's local frame; their
 * game time runs on from the snapshot between two refreshes. The sun's shadows come to the
 * visited planet (`GameRenderer.setAllyVillage`).
 */
export class VillageLife {
  readonly group = new Group();
  private readonly buildings: BuildingsView;
  private readonly kiwis: KiwisView;
  private readonly paths: PathsView;
  private readonly props: PropsView;
  private readonly crops: CropsView;
  private readonly meteors: MeteorsView;
  private readonly obstacles: ObstaclesView;
  private readonly butterflies: ButterfliesView;
  private ground: VillageGround | null = null;
  private readonly cleared = new Set<string>();
  private state: GameState | null = null;
  private receivedAt = 0;

  constructor(
    private readonly map: FaceMap,
    quality: { buildingAnimations: boolean; particles: boolean; propDensity: number },
  ) {
    // The sun's shadows over the visited planet are refreshed by the renderer on each sync.
    this.buildings = new BuildingsView(map, () => {});
    this.buildings.setAnimated(quality.buildingAnimations, quality.particles);
    this.kiwis = new KiwisView(map);
    this.paths = new PathsView(map);
    this.props = new PropsView(map, quality.propDensity);
    this.crops = new CropsView(map, quality.propDensity);
    this.meteors = new MeteorsView(map);
    this.obstacles = new ObstaclesView(map, () => {});
    this.butterflies = new ButterfliesView(map);
    this.group.add(
      this.props.group,
      this.crops.group,
      this.paths.group,
      this.meteors.group,
      this.obstacles.group,
      this.buildings.group,
      this.kiwis.group,
      this.butterflies.mesh,
    );
  }

  /** The planet's own terrain and water, worn and flooded like theirs while we watch. */
  bind(ground: VillageGround | null): void {
    this.ground = ground;
    if (ground && this.state) this.dressGround(this.state);
  }

  sync(state: GameState): void {
    this.state = state;
    this.receivedAt = performance.now();
    this.buildings.sync(state);
    this.kiwis.sync(state);
    this.paths.sync(
      state.paths,
      ageOf(state),
      new Set([...state.buildings.map(hexKey), ...state.queue.map(hexKey)]),
    );
    this.meteors.sync(state);
    this.obstacles.sync(state);
    // Wild props give way to buildings, sites, paths, obstacles and crops, as at home.
    const occupied = new Set<string>(state.paths);
    for (const key of occupancy(state).tiles.keys()) occupied.add(key);
    for (const i of state.queue) occupied.add(hexKey(i));
    for (const o of state.obstacles) occupied.add(hexKey(o));
    const depleted = depletedTiles(state, this.map);
    const zones: CropZone[] = [];
    for (const b of state.buildings) {
      if (!b.pool || b.type === 'camp') continue;
      const type = harvestedTileType(this.map, b);
      if (!type) continue;
      for (const key of b.pool.tiles)
        if (!occupied.has(key)) zones.push({ key, type, ratio: depleted.get(key) ?? 1 });
    }
    this.crops.sync(zones, seasonOf(state));
    for (const z of zones) occupied.add(z.key);
    for (const key of occupied) {
      if (this.cleared.has(key)) continue;
      this.cleared.add(key);
      this.props.setTileCleared(tileOf(key), true);
    }
    for (const key of [...this.cleared]) {
      if (occupied.has(key)) continue;
      this.cleared.delete(key);
      this.props.setTileCleared(tileOf(key), false);
    }
    this.dressGround(state, depleted);
  }

  private dressGround(state: GameState, depleted = depletedTiles(state, this.map)): void {
    if (!this.ground) return;
    this.ground.terrain.setDepletion(depleted);
    this.ground.water?.setFlooded(BIOMES[state.params.biome].floods === seasonOf(state));
  }

  update(dt: number, time: number): void {
    if (!this.state) return;
    const now = this.state.now + (performance.now() - this.receivedAt);
    this.buildings.update(dt, now);
    this.kiwis.update(dt, time, now);
    this.crops.update(dt);
    this.meteors.update(dt, now);
    this.obstacles.update(dt);
    // Same sky as home (one calendar per universe): lamps on at dusk, as `updateCycles` does.
    const daylight = 1 - seasonUniforms.uNight.value;
    const dim = Math.min(1, Math.max(0, (0.85 - daylight) / 0.5));
    const lamps = dim * dim * (3 - 2 * dim);
    this.buildings.windows.setGlow(lamps);
    this.paths.setGlow(lamps);
    this.butterflies.update(time, daylight);
    this.ground?.water?.update(time);
    this.ground?.water?.setIce(seasonUniforms.uSnow.value);
  }

  dispose(): void {
    this.buildings.dispose();
    this.kiwis.dispose();
    this.paths.dispose();
    this.props.dispose();
    this.crops.dispose();
    this.meteors.dispose();
    this.obstacles.dispose();
    this.butterflies.dispose();
  }
}

function tileOf(key: string): { q: number; r: number } {
  const [q, r] = key.split(',').map(Number) as [number, number];
  return { q, r };
}
