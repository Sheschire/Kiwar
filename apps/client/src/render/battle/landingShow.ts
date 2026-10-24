import type { Camera } from 'three';
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import {
  getTile,
  hexKey,
  landingTile,
  parcelView,
  shipIdForAge,
  ageOf,
  type Expedition,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';
import { shipModel } from '../buildingModels';
import { worldPosition } from '../terrain';
import { BattleShow } from './BattleShow';

/** Seconds of the ship coming down before the battle. */
export const LANDING_LEAD = 3.5;
/** Seconds after the journal's tail: the beacon, the crew boarding, the ship leaving. */
const TAIL = 4.5;
/** The ship touches the ground this long before the battle (the clouds part then). */
const TOUCH = 0.5;
/** After the fight: the beacon is planted, then the crew boards and the ship takes off. */
const PLANT_AFTER = 1;
const BOARD_AFTER = 2.2;
const LIFT_AFTER = 2.6;
const LIFT_S = 2.2;
/** Seconds between two puffs of flame on a burning building. */
const FIRE_EVERY = 0.3;
/** Body centre above the bird's local origin (as in `ShipsView`). */
const BODY_Y = 0.46 * 1.3;

/**
 * Chantier 41: a landing replayed on the twin from its journal — the mechanical bird comes down
 * on its tile, the crew steps out and fights (the battle show of chantier 36, drawn in the
 * twin's frame), the parcel burns when the crew set it on fire, the beacon is planted on a
 * victory and the ship flies off with the survivors. Like every show, it never decides anything.
 */
export class LandingShow {
  readonly group = new Group();
  readonly battle: BattleShow;
  private readonly ship = new Group();
  private wings: Mesh[] = [];
  private shipGen = '';
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    flatShading: true,
    fog: false,
  });
  private readonly pad = new Vector3();
  private readonly sky = new Vector3();
  private readonly v = new Vector3();
  private outcome: 'victory' | 'retreat' | 'defeat' = 'defeat';
  private burnt = false;
  private fires: Vector3[] = [];
  private fireTimer = 0;
  private touched = false;
  private planted = false;
  private elapsed = 0;
  /** Expedition on show. */
  expeditionId: string | null = null;
  sector = 0;
  /** The ship touched the ground (the clouds part over the parcel). */
  onTouchdown: (() => void) | null = null;
  /** The beacon is planted (a victory). */
  onPlant: (() => void) | null = null;

  constructor(readonly map: FaceMap) {
    this.battle = new BattleShow(map);
    this.group.add(this.battle.group, this.ship);
    this.ship.visible = false;
  }

  get playing(): boolean {
    return this.battle.playing;
  }

  play(state: GameState, e: Expedition, live: boolean): boolean {
    const r = e.result;
    if (!r?.log || e.sector === undefined) return false;
    const log = r.log;
    this.expeditionId = e.id;
    this.sector = e.sector;
    this.outcome = r.outcome ?? (r.victory ? 'victory' : 'defeat');
    this.burnt = !!r.burnt;
    this.touched = false;
    this.planted = false;
    // The ship's tile, as the battle placed it (never on a building).
    const blocked = new Set(log.buildings.map((b) => hexKey({ q: b[2], r: b[3] })));
    const tile = landingTile(e.sector, blocked);
    const p = worldPosition(tile);
    this.pad.set(p.x, (getTile(this.map, tile)?.height ?? 0) + 0.2, p.z);
    // It comes down from above the rim of the face, over its parcel.
    const out = Math.hypot(p.x, p.z) || 1;
    this.sky.set(p.x + (p.x / out) * 9, this.pad.y + 11, p.z + (p.z / out) * 9);
    this.fires = log.buildings.map((b) => {
      const w = worldPosition({ q: b[2], r: b[3] });
      return new Vector3(w.x, (getTile(this.map, { q: b[2], r: b[3] })?.height ?? 0) + 0.45, w.z);
    });
    this.setShip(shipIdForAge(ageOf(state)));
    const fight = log.result.duration;
    const view = parcelView(state, e.targetId, e.sector);
    const ok = this.battle.play(state, { id: e.id, kind: 'landing', log }, -LANDING_LEAD, {
      ours: 1,
      age: view?.age ?? 0,
      lead: LANDING_LEAD,
      tail: TAIL,
      boardAt: this.outcome === 'defeat' ? undefined : fight + BOARD_AFTER,
      roster: e.roster,
      seen: r.seen,
    });
    void live;
    return ok;
  }

  private setShip(gen: string): void {
    if (gen === this.shipGen) return;
    this.shipGen = gen;
    this.ship.clear();
    const model = shipModel(gen as Parameters<typeof shipModel>[0]);
    const body = new Mesh(model.geometry, this.material);
    body.position.y = -BODY_Y;
    this.ship.add(body);
    this.wings = model.rigs.map((r) => {
      const w = new Mesh(r.geometry, this.material);
      w.position.copy(r.pivot).setY(r.pivot.y - BODY_Y);
      this.ship.add(w);
      return w;
    });
    this.ship.scale.setScalar(0.95);
  }

  /** Ends the show now. */
  skip(): void {
    this.battle.skip();
  }

  stop(): void {
    this.battle.stop();
    this.ship.visible = false;
    this.expeditionId = null;
  }

  update(dt: number, camera: Camera): void {
    this.elapsed += dt;
    const before = this.battle.time;
    const active = this.battle.source !== null;
    this.battle.update(dt, camera);
    if (!active || this.battle.source === null) {
      this.ship.visible = false;
      return;
    }
    const t = this.battle.time;
    const fight = this.battle.fightEnd;
    // A rewind: what happened later is not there yet.
    if (t < before) {
      this.touched = t >= -TOUCH;
      this.planted = t >= fight + PLANT_AFTER;
    }
    if (!this.touched && t >= -TOUCH) {
      this.touched = true;
      this.battle.particles.effect('puff', this.pad, 1.6);
      this.onTouchdown?.();
    }
    if (!this.planted && this.outcome === 'victory' && t >= fight + PLANT_AFTER) {
      this.planted = true;
      this.battle.particles.effect('loot', this.v.copy(this.pad).setY(this.pad.y + 0.6), 1.2);
      this.onPlant?.();
    }
    // The parcel burns once the field is cleared (the crew set it on fire).
    if (this.burnt && this.outcome === 'victory' && t >= fight) {
      this.fireTimer -= dt * this.battle.speed;
      if (this.fireTimer <= 0) {
        this.fireTimer = FIRE_EVERY;
        for (const f of this.fires) {
          this.battle.particles.effect('fire', f, 2);
          if (Math.random() < 0.4) this.battle.particles.effect('soot', f, 1.6);
        }
      }
    }
    this.poseShip(t, fight);
  }

  private poseShip(t: number, fight: number): void {
    const ship = this.ship;
    const lift = this.outcome === 'defeat' ? Infinity : fight + LIFT_AFTER;
    let flapping = false;
    ship.visible = true;
    if (t < -TOUCH) {
      // Coming down along a gentle curve, nose towards the pad.
      const u = Math.min(1, Math.max(0, (t + LANDING_LEAD) / (LANDING_LEAD - TOUCH)));
      const e = 1 - (1 - u) * (1 - u);
      this.v.lerpVectors(this.sky, this.pad, e);
      this.v.y += Math.sin(u * Math.PI) * 1.2 * (1 - u);
      ship.position.copy(this.v);
      ship.lookAt(
        this.pad.x * 2 - this.sky.x,
        ship.position.y - 1.5 * (1 - u),
        this.pad.z * 2 - this.sky.z,
      );
      flapping = true;
    } else if (t < lift) {
      ship.position.copy(this.pad);
      ship.position.y += Math.sin(this.elapsed * 1.5) * 0.02;
      ship.lookAt(this.pad.x * 2 - this.sky.x, this.pad.y, this.pad.z * 2 - this.sky.z);
    } else {
      const u = Math.min(1, (t - lift) / LIFT_S);
      this.v.lerpVectors(this.pad, this.sky, u * u);
      ship.position.copy(this.v);
      ship.lookAt(this.sky.x * 2 - this.pad.x, this.v.y + 2, this.sky.z * 2 - this.pad.z);
      ship.visible = u < 1;
      flapping = true;
    }
    const beat = flapping ? Math.sin(this.elapsed * 8) * 0.7 : 0.1;
    if (this.wings[0]) this.wings[0].rotation.z = beat;
    if (this.wings[1]) this.wings[1].rotation.z = -beat;
  }

  setParticles(on: boolean): void {
    this.battle.setParticles(on);
  }

  dispose(): void {
    this.stop();
    this.battle.dispose();
    this.material.dispose();
  }
}
