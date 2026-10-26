import { Group } from 'three';
import { ageOf, hexKey, type FaceMap, type GameState } from '@kiwar/shared';
import { BuildingsView } from './buildings';
import { KiwisView } from './kiwis';
import { PathsView } from './paths';

/**
 * Chantier 59: an ally's village alive on their planet while we visit it — the same views as
 * home (living buildings, kiwis at their jobs, sites, paths), fed by the server's `allyVillage`
 * (their colony now, without stocks). Lives in the planet's local frame (`TwinView.setLife`).
 * Their game time runs on from the snapshot between two refreshes.
 */
export class VillageLife {
  readonly group = new Group();
  private readonly buildings: BuildingsView;
  private readonly kiwis: KiwisView;
  private readonly paths: PathsView;
  private state: GameState | null = null;
  private receivedAt = 0;

  constructor(map: FaceMap, animated: boolean, particles: boolean) {
    // Far from the home shadows: nothing to refresh when its meshes change.
    this.buildings = new BuildingsView(map, () => {});
    this.buildings.setAnimated(animated, particles);
    this.kiwis = new KiwisView(map);
    this.paths = new PathsView(map);
    this.group.add(this.paths.group, this.buildings.group, this.kiwis.group);
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
  }

  update(dt: number, time: number): void {
    if (!this.state) return;
    const now = this.state.now + (performance.now() - this.receivedAt);
    this.buildings.update(dt, now);
    this.kiwis.update(dt, time, now);
  }

  dispose(): void {
    this.buildings.dispose();
    this.kiwis.dispose();
    this.paths.dispose();
  }
}
