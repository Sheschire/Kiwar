import type { Camera } from 'three';
import { Group, Vector3 } from 'three';
import {
  ageOf,
  type DepthRoom,
  type Expedition,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { BattleShow } from '../battle/BattleShow';
import { worldPosition } from '../terrain';
import { roomPoint } from './cutLayout';
import type { DepthsCutView } from './DepthsCutView';

/** Seconds of the crew stepping into the room before the fight. */
export const DELVE_LEAD = 1.5;
/** Seconds after the journal's own tail. */
const DELVE_TAIL = 1.5;
/** Radius of a delve's field in hexes (`battle/delve.ts`: a round room of radius 4). */
const FIELD_HEXES = 4;
const UNIT_SCALE = 1.8;

/**
 * The field of a delve has no tiles of the face: every hex is at height 0 (a flat room).
 * `getTile` finds nothing in it.
 */
const FLAT: FaceMap = { index: new Map(), tiles: [] } as unknown as FaceMap;

/**
 * Chantier 49: a delve replayed from its journal in its room of the cut — the battle show of
 * chantier 36, scaled down onto the room's floor, the passage the crew came in by turned
 * towards the shaft. Like every show, it never decides anything: the journal is what happened.
 */
export class DelveShow {
  readonly group = new Group();
  readonly battle = new BattleShow(FLAT);
  expeditionId: string | null = null;
  room: DepthRoom | null = null;
  private readonly v = new Vector3();
  private readonly t = new Vector3();

  constructor(private readonly cut: DepthsCutView) {
    this.group.add(this.battle.group);
  }

  get playing(): boolean {
    return this.battle.playing;
  }

  /** Plays a delve's journal in its room (false without a journal or a room). */
  play(state: GameState, e: Expedition, live: boolean): boolean {
    const log = e.result?.log;
    const map = this.cut.network;
    const room = e.room && map ? map.byId.get(e.room) : undefined;
    if (!log || !room || !map) return false;
    this.expeditionId = e.id;
    this.room = room;
    this.place(room);
    void live;
    return this.battle.play(state, { id: e.id, kind: 'delve', log }, -DELVE_LEAD, {
      ours: 1,
      age: ageOf(state),
      lead: DELVE_LEAD,
      tail: DELVE_TAIL,
      roster: e.roster,
      seen: e.result?.seen,
      // A room is small: the fighters are drawn bigger than their field to be read.
      unitScale: UNIT_SCALE,
    });
  }

  /** Puts the field on the room's floor, its way in turned towards the shaft. */
  private place(room: DepthRoom): void {
    const cut = this.cut;
    const p = roomPoint(cut.network!, room);
    cut.floorSpot(room, 0, 0, this.group.position);
    // The field's entry (q 0, r 4) in its own frame, and where it should point in the world.
    const entry = worldPosition({ q: 0, r: FIELD_HEXES });
    cut.worldOf({ s: p.s * 0.5, t: p.t }, this.t).sub(cut.worldOf(p, this.v));
    const want = Math.atan2(this.t.x, this.t.z);
    const has = Math.atan2(entry.x, entry.z);
    this.group.rotation.set(0, want - has, 0);
    // The whole field fits on the floor.
    const field = Math.hypot(entry.x, entry.z) + 1;
    this.group.scale.setScalar((cut.roomRadius * 0.72) / field);
  }

  /** The middle of the field in the world (the camera's framing). */
  center(out: Vector3): Vector3 {
    return out.copy(this.group.position);
  }

  skip(): void {
    this.battle.skip();
  }

  stop(): void {
    this.battle.stop();
    this.expeditionId = null;
    this.room = null;
  }

  update(dt: number, camera: Camera): void {
    // The faces still turn while the quarter opens: the field follows its room.
    if (this.room) this.place(this.room);
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
