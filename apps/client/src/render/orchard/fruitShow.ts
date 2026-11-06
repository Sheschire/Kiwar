import type { Camera } from 'three';
import { Group, Vector3 } from 'three';
import {
  ageOf,
  type BattleLog,
  type Expedition,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { BattleShow } from '../battle/BattleShow';
import { worldPosition } from '../terrain';

/** Seconds of the ship setting down before the fight, and after the journal's tail. */
export const FRUIT_LEAD = 1.5;
const FRUIT_TAIL = 1.5;
/** Radius of the field in hexes (`battle/fruit.ts`: the delve's round field of radius 4). */
const FIELD_HEXES = 4;
const UNIT_SCALE = 1.3;

/** The field on a drupelet is flat: no tile of the face (`getTile` finds nothing). */
const FLAT: FaceMap = { index: new Map(), tiles: [] } as unknown as FaceMap;

/** What a fruit show plays: a pillage (our crew, side 1) or an attack on our post (side 0). */
export interface FruitSource {
  id: string;
  drupelet: string;
  log: BattleLog;
  ours: 0 | 1;
  roster?: Expedition['roster'];
}

/**
 * Chantier 54: a battle on the raspberry replayed from its journal on the top of its drupelet —
 * the battle show of chantier 36, scaled down onto the little sphere (the fighters drawn bigger
 * to be read). Attached to the drupelet in the raspberry's own frame. Like every show, it never
 * decides anything: the journal is what happened.
 */
export class FruitShow {
  readonly group = new Group();
  readonly battle = new BattleShow(FLAT);
  source: FruitSource | null = null;

  constructor() {
    this.group.add(this.battle.group);
  }

  get playing(): boolean {
    return this.battle.playing;
  }

  /** Scale that fits the whole field on a drupelet of this radius. */
  static fit(radius: number): number {
    const edge = worldPosition({ q: 0, r: FIELD_HEXES });
    return (radius * 2.2) / (Math.hypot(edge.x, edge.z) + 1);
  }

  play(state: GameState, source: FruitSource, live: boolean): boolean {
    this.source = source;
    void live;
    return this.battle.play(state, { id: source.id, kind: 'fruit', log: source.log }, -FRUIT_LEAD, {
      ours: source.ours,
      age: ageOf(state),
      lead: FRUIT_LEAD,
      tail: FRUIT_TAIL,
      ...(source.roster ? { roster: source.roster } : {}),
      unitScale: UNIT_SCALE,
    });
  }

  /** The middle of the field in the world (the camera's framing). */
  center(out: Vector3): Vector3 {
    return this.group.getWorldPosition(out);
  }

  skip(): void {
    this.battle.skip();
  }

  stop(): void {
    this.battle.stop();
    this.source = null;
  }

  update(dt: number, camera: Camera): void {
    this.battle.update(dt, camera);
  }

  setParticles(on: boolean): void {
    this.battle.setParticles(on);
  }

  dispose(): void {
    this.stop();
    this.battle.dispose();
  }
}
