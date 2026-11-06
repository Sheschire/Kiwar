import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  ConeGeometry,
  Vector3,
  type BufferGeometry,
  type Ray,
} from 'three';
import {
  comingSwarm,
  getTile,
  hexToPixel,
  kiwaiMapOf,
  yardOf,
  type FaceMap,
  type GameState,
  type Kiwai,
  type ModuleType,
  type OrbitModule,
  type SiteTile,
} from '@kiwar/shared';
import { kiwaiPlace, planetOrientation } from './space';
import { worldPosition } from './terrain';
import { KIWAI_SHINE, KIWAI_SKIN } from './models/orbit';

/**
 * Chantier 53: the kiwais in the sky — smooth green-bronze fruits sliced at the top, their
 * small map on the cut (pad, rocks, ground) with the modules set on it; a shield bubble when
 * raised against a swarm; a kiwai still climbing rises from the orbital yard; the shuttle
 * flies its trip from the yard to a kiwai and back. Everything is read from the public state.
 */

/** Radius of a kiwai (world units) and the size of a tile of its small map. */
const RADIUS = 3.6;
const SQUASH = 0.82;
const TILE = 0.62;
const TOP = RADIUS * SQUASH * 0.55;
/** How much a kiwai leans its cut towards home (more than a planet: it floats higher). */
const KIWAI_TILT = 0.85;

/** The skin stops at the cut (its angle from the top, before the squash). */
const CUT_THETA = Math.acos(TOP / SQUASH / RADIUS);

const geo = {
  skin: new SphereGeometry(RADIUS, 32, 20, 0, Math.PI * 2, CUT_THETA, Math.PI - CUT_THETA),
  shine: new SphereGeometry(RADIUS * 0.28, 12, 8),
  cut: new CylinderGeometry(RADIUS * 0.84, RADIUS * 0.84, 0.16, 36),
  tile: new CylinderGeometry(TILE * 0.93, TILE * 0.93, 0.12, 6),
  rock: new SphereGeometry(TILE * 0.5, 7, 5),
  dome: new SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  post: new CylinderGeometry(0.05, 0.05, 0.6, 6),
  dish: new ConeGeometry(0.34, 0.16, 12, 1, true),
  panel: new BoxGeometry(0.9, 0.05, 0.62),
  ring: new TorusGeometry(0.34, 0.07, 8, 18),
  shield: new SphereGeometry(RADIUS * 1.45, 28, 18),
  hull: new CylinderGeometry(0.28, 0.36, 0.9, 10),
  nose: new ConeGeometry(0.28, 0.45, 10),
};

const materials = new Map<string, MeshStandardMaterial>();
function mat(color: string, opts: { opacity?: number; metal?: number } = {}): MeshStandardMaterial {
  const key = `${color}|${opts.opacity ?? 1}|${opts.metal ?? 0}`;
  let m = materials.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
    });
    materials.set(key, m);
  }
  return m;
}

const TILE_COLORS: Record<SiteTile['kind'], string> = {
  pad: '#f6edc0',
  ground: '#b8cf6a',
  rock: '#6c6658',
};

const MODULE_COLORS: Record<ModuleType, string> = {
  habitat: '#ece7f2',
  panel: '#34407a',
  sensor: '#e0bf5c',
  dome: '#c4ecf7',
  berth: '#d6aa45',
};

function moduleMesh(m: OrbitModule, now: number): Group {
  const g = new Group();
  const broken = m.broken !== undefined;
  const assembling = m.readyAt > now;
  const color = broken ? '#7a4a3a' : MODULE_COLORS[m.type];
  const material = assembling ? mat(color, { opacity: 0.45 }) : mat(color, { metal: 0.2 });
  const add = (geometry: BufferGeometry, y: number, rx = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.y = y;
    mesh.rotation.x = rx;
    g.add(mesh);
    return mesh;
  };
  if (m.type === 'habitat' || m.type === 'dome') add(geo.dome, 0.06);
  else if (m.type === 'panel') add(geo.panel, 0.2, -0.35);
  else if (m.type === 'sensor') {
    add(geo.post, 0.3);
    add(geo.dish, 0.62, Math.PI);
  } else add(geo.ring, 0.3, Math.PI / 2);
  if (broken) g.rotation.z = 0.35;
  return g;
}

interface KiwaiView {
  group: Group;
  body: Group;
  shield: Mesh;
  key: string;
  spin: number;
}

export class OrbitView {
  readonly group = new Group();
  private readonly views = new Map<string, KiwaiView>();
  private readonly shuttle = new Group();
  private state: GameState | null = null;
  private readonly yard = new Vector3();
  private readonly tmp = new Vector3();

  constructor(private readonly map: FaceMap) {
    this.group.name = 'orbit';
    const hull = new Mesh(geo.hull, mat('#ece7f2', { metal: 0.3 }));
    const nose = new Mesh(geo.nose, mat('#e0bf5c', { metal: 0.4 }));
    nose.position.y = 0.67;
    this.shuttle.add(hull, nose);
    this.shuttle.visible = false;
    this.group.add(this.shuttle);
  }

  /** Rebuilds the kiwais whose look changed (cheap when nothing did). */
  sync(state: GameState): void {
    this.state = state;
    const yard = yardOf(state);
    if (yard) {
      const p = worldPosition(yard);
      this.yard.set(p.x, (getTile(this.map, yard)?.height ?? 0) + 1.2, p.z);
    }
    const swarm = comingSwarm(state);
    const seen = new Set<string>();
    for (const k of state.orbit.kiwais) {
      seen.add(k.id);
      const key = `${k.type}|${k.place}|${k.readyAt <= state.now}|${k.shield === swarm?.id}|${k.modules
        .map((m) => `${m.id}:${m.q},${m.r}:${m.readyAt <= state.now}:${m.broken ?? ''}`)
        .join(';')}`;
      const old = this.views.get(k.id);
      if (old && old.key === key) continue;
      if (old) this.remove(k.id);
      this.views.set(k.id, this.build(state, k, key, swarm?.id));
    }
    for (const id of [...this.views.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private build(state: GameState, k: Kiwai, key: string, swarm: string | undefined): KiwaiView {
    const group = new Group();
    const body = new Group();
    const skin = new Mesh(geo.skin, mat(KIWAI_SKIN, { metal: 0.35 }));
    skin.scale.set(1, SQUASH, 1);
    const shine = new Mesh(geo.shine, mat(KIWAI_SHINE));
    shine.position.set(-RADIUS * 0.45, RADIUS * 0.25, RADIUS * 0.6);
    shine.scale.set(1, 0.6, 0.4);
    const cut = new Mesh(geo.cut, mat('#a9c95a'));
    cut.position.y = TOP;
    body.add(skin, shine, cut);
    for (const tile of kiwaiMapOf(state, k).tiles) {
      const p = hexToPixel(tile, TILE);
      const mesh = new Mesh(
        tile.kind === 'rock' ? geo.rock : geo.tile,
        mat(TILE_COLORS[tile.kind]),
      );
      mesh.position.set(p.x, TOP + 0.12, p.y);
      body.add(mesh);
    }
    for (const m of k.modules) {
      const p = hexToPixel(m, TILE);
      const mesh = moduleMesh(m, state.now);
      mesh.position.set(p.x, TOP + 0.18, p.y);
      body.add(mesh);
    }
    group.add(body);
    const shield = new Mesh(geo.shield, mat('#9fd8ff', { opacity: 0.22 }));
    shield.visible = !!swarm && k.shield === swarm;
    group.add(shield);
    group.userData.kiwaiId = k.id;
    this.group.add(group);
    return { group, body, shield, key, spin: (k.place * 1.7) % (Math.PI * 2) };
  }

  private remove(id: string): void {
    const v = this.views.get(id);
    if (!v) return;
    this.group.remove(v.group);
    this.views.delete(id);
  }

  /** Places the kiwais (a climbing one rises from the yard) and the shuttle; true while moving. */
  update(dt: number, elapsed: number, now: number): boolean {
    const s = this.state;
    if (!s) return false;
    let moving = false;
    for (const k of s.orbit.kiwais) {
      const v = this.views.get(k.id);
      if (!v) continue;
      const place = kiwaiPlace(k.place);
      const target = this.tmp.set(place.x, place.y, place.z);
      if (k.readyAt > now) {
        const t = Math.max(0, Math.min(1, (now - k.launchedAt) / (k.readyAt - k.launchedAt)));
        const e = t * t * (3 - 2 * t);
        v.group.position.copy(this.yard).lerp(target, e);
        v.group.scale.setScalar(0.25 + 0.75 * e);
        moving = true;
      } else {
        v.group.position.copy(target);
        v.group.position.y += Math.sin(elapsed * 0.4 + k.place) * 0.3;
        v.group.scale.setScalar(1);
      }
      // Its cut turned towards home, like the planets (chantier 24), so the modules show.
      const o = planetOrientation(place);
      v.group.rotation.set(0, 0, 0);
      v.group.rotateY(o.yaw);
      v.group.rotateX(KIWAI_TILT);
      v.spin += dt * 0.05;
      v.body.rotation.y = v.spin;
    }
    const sh = s.orbit.shuttle;
    const kiwai = sh ? s.orbit.kiwais.find((k) => k.id === sh.kiwaiId) : undefined;
    if (sh && kiwai && now >= sh.leftAt && now <= sh.backAt) {
      const v = this.views.get(kiwai.id);
      const top = v ? v.group.localToWorld(new Vector3(0, TOP + 0.6, 0)) : new Vector3();
      const up = now < sh.upAt;
      const t = up
        ? (now - sh.leftAt) / Math.max(1, sh.upAt - sh.leftAt)
        : (now - sh.upAt) / Math.max(1, sh.backAt - sh.upAt);
      const from = up ? this.yard : top;
      const to = up ? top : this.yard;
      const p = new Vector3().lerpVectors(from, to, t);
      p.y += Math.sin(Math.PI * t) * 6;
      this.shuttle.position.copy(p);
      this.shuttle.lookAt(to.x, to.y + 50, to.z);
      this.shuttle.visible = true;
      moving = true;
    } else this.shuttle.visible = false;
    return moving;
  }

  /** The kiwai under a ray (nearest), or null. */
  pick(ray: Ray): { kiwaiId: string; distance: number } | null {
    let best: { kiwaiId: string; distance: number } | null = null;
    for (const [id, v] of this.views) {
      const c = v.group.position;
      const r = RADIUS * 1.2 * v.group.scale.x;
      const toC = this.tmp.copy(c).sub(ray.origin);
      const along = toC.dot(ray.direction);
      if (along < 0) continue;
      const d2 = toC.lengthSq() - along * along;
      if (d2 > r * r) continue;
      if (!best || along < best.distance) best = { kiwaiId: id, distance: along };
    }
    return best;
  }

  /** Where a kiwai floats (for the camera), or null. */
  positionOf(kiwaiId: string): Vector3 | null {
    return this.views.get(kiwaiId)?.group.position ?? null;
  }

  dispose(): void {
    for (const id of [...this.views.keys()]) this.remove(id);
    this.group.remove(this.shuttle);
  }
}
