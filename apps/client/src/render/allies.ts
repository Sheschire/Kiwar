import { Group, type Ray, type Vector3 } from 'three';
import { applyTerraform, generateFace, type AllySnapshot } from '@kiwar/shared';
import { allyPlace } from './space';
import { TwinView } from './twin';

export interface AllyPlanet {
  kiwiIndex: number;
  owner: string;
  view: TwinView;
}

/**
 * The other players of a shared universe, each on their own kiwi far away: their face floats at
 * a fixed place on the outer ring of the map of space (`allyPlace`, chantier 24; layout only,
 * as the server last reported it). Tapping one, or the
 * "visit" button, flies the camera there (`GameRenderer.travelTo`).
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
      const base = generateFace(ally.seed, ally.face, ally.params);
      // Tiles their Kikiwiwis reshaped (chantier 08).
      const map = ally.terraform ? applyTerraform(base, ally.terraform) : base;
      const view = new TwinView(map, { fog: false, friend: ally });
      view.place(allyPlace(rank, Math.abs(ally.kiwiIndex - myKiwi)));
      this.group.add(view.group);
      this.planets.push({ kiwiIndex: ally.kiwiIndex, owner: ally.owner, view });
    });
  }

  private visited: AllyPlanet | null = null;

  /** The name ribbons hide on the planet being visited (they would cover it); it holds still. */
  setVisited(planet: AllyPlanet | null): void {
    this.visited = planet;
    for (const p of this.planets) p.view.setLabelVisible(p !== planet);
  }

  find(kiwiIndex: number): AllyPlanet | null {
    return this.planets.find((p) => p.kiwiIndex === kiwiIndex) ?? null;
  }

  update(dt: number, time: number, eye: Vector3): void {
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i]!;
      p.view.update(dt, time, eye, p === this.visited, i * 1.7);
    }
  }

  /** The nearest planet under a ray, if any, and how far along the ray. */
  pick(ray: Ray): { planet: AllyPlanet; distance: number } | null {
    let best: { planet: AllyPlanet; distance: number } | null = null;
    for (const planet of this.planets) {
      const distance = planet.view.rayHit(ray);
      if (distance !== null && (!best || distance < best.distance)) best = { planet, distance };
    }
    return best;
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
