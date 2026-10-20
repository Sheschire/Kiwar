import { Group, Vector3, type Raycaster } from 'three';
import { generateFace, type AllySnapshot } from '@kiwar/shared';
import { TwinView } from './twin';

/**
 * Directions of the ally planets around the colony (radians, 0 = +X; -π/2 is the far side in
 * the starting view), nearest kiwi first: the two far corners, then further around.
 */
const SLOTS = [-0.68, -0.32, -0.84, -0.16, -0.5, -1.0, 0].map((x) => x * Math.PI);
/** Distance from the heart of our face, growing with the kiwi gap. */
const RING = 95;
const RING_STEP = 14;
/** Below our rim (above the sea of clouds), so they peek over the far corners when zooming out. */
const DEPTH = -14;
/** Tilt of each planet towards our colony, so its surface shows from afar. */
const TILT = 0.38;

export interface AllyPlanet {
  kiwiIndex: number;
  owner: string;
  view: TwinView;
  /** Resting place (the planet bobs gently around it). */
  home: Vector3;
}

/**
 * The other players of a shared universe, each on their own kiwi far away: their face floats at
 * a fixed place around ours (layout only, as the server last reported it). Tapping one, or the
 * "visit" button, flies the camera there (`GameRenderer.visitAlly`).
 */
export class AlliesView {
  readonly group = new Group();
  planets: AllyPlanet[] = [];
  private key = '';

  set(allies: AllySnapshot[], myKiwi: number): void {
    const key = allies
      .map(
        (a) =>
          `${a.owner}|${a.kiwiIndex}|${a.face}|${a.params.biome}|` +
          a.buildings.map((b) => `${b.type}${b.level}@${b.q},${b.r}`).join(','),
      )
      .join(';');
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const sorted = [...allies].sort(
      (a, b) =>
        Math.abs(a.kiwiIndex - myKiwi) - Math.abs(b.kiwiIndex - myKiwi) ||
        a.kiwiIndex - b.kiwiIndex,
    );
    sorted.forEach((ally, rank) => {
      const map = generateFace(ally.seed, ally.face, ally.params);
      const view = new TwinView(map, { fog: false, friend: ally, anchored: true });
      const angle = SLOTS[rank % SLOTS.length]!;
      const distance = RING + RING_STEP * (Math.abs(ally.kiwiIndex - myKiwi) - 1);
      const home = new Vector3(
        Math.cos(angle) * distance,
        DEPTH - (rank % 2) * 6,
        Math.sin(angle) * distance,
      );
      view.group.position.copy(home);
      // Face our colony, then lean the far rim up so the surface shows.
      view.group.lookAt(0, home.y, 0);
      view.group.rotateX(TILT);
      this.group.add(view.group);
      this.planets.push({ kiwiIndex: ally.kiwiIndex, owner: ally.owner, view, home });
    });
  }

  /** The name ribbons hide on the planet being visited (they would cover it). */
  setVisited(planet: AllyPlanet | null): void {
    for (const p of this.planets) p.view.setLabelVisible(p !== planet);
  }

  find(kiwiIndex: number): AllyPlanet | null {
    return this.planets.find((p) => p.kiwiIndex === kiwiIndex) ?? null;
  }

  update(time: number): void {
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i]!;
      p.view.group.position.y = p.home.y + Math.sin(time * 0.25 + i * 1.7) * 0.5;
    }
  }

  /** The planet under a ray, if any. */
  pick(ray: Raycaster): AllyPlanet | null {
    let best: { planet: AllyPlanet; distance: number } | null = null;
    for (const planet of this.planets) {
      const hit = ray.intersectObject(planet.view.group, true)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { planet, distance: hit.distance };
    }
    return best?.planet ?? null;
  }

  setSky(...args: Parameters<TwinView['setSky']>): void {
    for (const p of this.planets) p.view.setSky(...args);
  }

  private clear(): void {
    for (const p of this.planets) {
      this.group.remove(p.view.group);
      p.view.dispose();
    }
    this.planets = [];
  }

  dispose(): void {
    this.clear();
    this.key = '';
  }
}
