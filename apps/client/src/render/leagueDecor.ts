import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getTile,
  hexDistance,
  parseHexKey,
  type FaceMap,
  type GameState,
  type LeagueLook,
} from '@kiwar/shared';
import { worldPosition } from './terrain';

/**
 * Chantier 56: the league cosmetics a colony wears — a banner by the Nest, pennants along the
 * paths around it, a laurel crown on the monument (the capes are drawn by the kiwi rig). The
 * colour tells the best rank (gold, silver, bronze). Cosmetic only: nothing here comes from
 * or goes to the simulation.
 */

/** Colour of a podium place (1 gold, 2 silver, 3 bronze). */
export function rankColor(rank: number): Color {
  return new Color(rank === 1 ? '#e2b33c' : rank === 2 ? '#c9cfd6' : '#c27a43');
}

/** Pennants stand on path tiles this close to the Nest, at most this many. */
const PENNANT_REACH = 3;
const PENNANT_MAX = 24;

export interface BuildingStand {
  x: number;
  y: number;
  z: number;
  height: number;
}

const UP = new Vector3(0, 1, 0);
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpP = new Vector3();
const tmpS = new Vector3(1, 1, 1);

function flagGeometry(w: number, h: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(w * 0.35, 0.04, w * 0.65, -0.04, w, 0);
  shape.lineTo(w * 0.86, -h / 2);
  shape.lineTo(w, -h);
  shape.bezierCurveTo(w * 0.65, -h - 0.04, w * 0.35, -h + 0.04, 0, -h);
  shape.closePath();
  return new ShapeGeometry(shape, 6);
}

export class LeagueDecor {
  readonly group = new Group();
  private readonly wood = new MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 });
  private readonly cloth = new MeshStandardMaterial({
    color: '#e2b33c',
    roughness: 0.75,
    side: DoubleSide,
  });
  private readonly gold = new MeshStandardMaterial({
    color: '#f2d27a',
    roughness: 0.35,
    metalness: 0.6,
  });
  /** The banner's knob and star (the crown's gold takes the rank's colour). */
  private readonly brass = new MeshStandardMaterial({
    color: '#f2d27a',
    roughness: 0.35,
    metalness: 0.6,
  });
  private readonly laurel = new MeshStandardMaterial({ color: '#7fa34a', roughness: 0.7 });
  private readonly pennantCloth = new MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.75,
    side: DoubleSide,
  });
  private readonly banner: Group;
  private readonly crown: Group;
  private readonly pennantPosts: InstancedMesh;
  private readonly pennants: InstancedMesh;
  private signature = '';

  constructor(private readonly map: FaceMap) {
    this.banner = new Group();
    const pole = new Mesh(
      new CylinderGeometry(0.022, 0.028, 1.5, 6).translate(0, 0.75, 0),
      this.wood,
    );
    const knob = new Mesh(new ConeGeometry(0.05, 0.12, 6).translate(0, 1.56, 0), this.brass);
    const bar = new Mesh(new BoxGeometry(0.46, 0.025, 0.025).translate(0.21, 1.42, 0), this.wood);
    const flag = new Mesh(flagGeometry(0.42, 0.62).translate(0.01, 1.41, 0), this.cloth);
    flag.castShadow = true;
    const star = new Mesh(
      new ConeGeometry(0.07, 0.02, 5).rotateX(Math.PI / 2).translate(0.21, 1.12, 0.012),
      this.brass,
    );
    this.banner.add(pole, knob, bar, flag, star);
    this.banner.visible = false;

    this.crown = new Group();
    const ring = new Mesh(new TorusGeometry(0.34, 0.035, 6, 24).rotateX(Math.PI / 2), this.gold);
    const leaves: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      leaves.push(
        new ConeGeometry(0.05, 0.17, 4)
          .scale(1, 1, 0.35)
          .rotateZ(-1.05)
          .rotateY(-a)
          .translate(Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34),
      );
    }
    this.crown.add(ring, new Mesh(mergeGeometries(leaves), this.laurel));
    this.crown.visible = false;

    const post = new CylinderGeometry(0.016, 0.018, 0.62, 5).translate(0, 0.31, 0);
    this.pennantPosts = new InstancedMesh(post, this.wood, PENNANT_MAX);
    const pennant = new ConeGeometry(0.1, 0.3, 3)
      .rotateZ(Math.PI / 2)
      .scale(1, 1, 0.12)
      .translate(0.15, 0.52, 0);
    this.pennants = new InstancedMesh(pennant, this.pennantCloth, PENNANT_MAX);
    for (const m of [this.pennantPosts, this.pennants]) {
      m.count = 0;
      m.frustumCulled = false;
    }
    this.group.add(this.banner, this.crown, this.pennantPosts, this.pennants);
  }

  /** Cheap when nothing changed (signature of the look, the Nest, the monument and paths). */
  sync(
    state: GameState,
    look: LeagueLook | null,
    standOf: (id: string) => BuildingStand | null,
  ): boolean {
    const nest = state.buildings.find((b) => b.type === 'nest');
    const monument = state.buildings.find((b) => b.type === 'monument');
    const nestAt = nest ? standOf(nest.id) : null;
    const monAt = monument ? standOf(monument.id) : null;
    const sig = [
      JSON.stringify(look ?? {}),
      nestAt ? `${nestAt.x},${nestAt.y},${nestAt.height}` : '-',
      monAt ? `${monAt.x},${monAt.y},${monAt.height}` : '-',
      look?.pennants ? state.paths.length : 0,
    ].join('|');
    if (sig === this.signature) return false;
    this.signature = sig;

    // The banner, planted beside the Nest.
    this.banner.visible = !!(look?.banner && nestAt);
    if (look?.banner && nestAt) {
      this.cloth.color.copy(rankColor(look.banner.rank));
      this.banner.position.set(nestAt.x + 0.62, nestAt.y, nestAt.z + 0.38);
      this.banner.scale.setScalar(Math.max(1, nestAt.height / 1.4));
    }
    // The laurel crown, on top of the monument.
    this.crown.visible = !!(look?.crown && monAt);
    if (look?.crown && monAt) {
      this.gold.color.copy(rankColor(look.crown.rank)).lerp(new Color('#fff2c0'), 0.25);
      this.crown.position.set(monAt.x, monAt.y + monAt.height + 0.06, monAt.z);
    }
    // Pennants on the paths around the Nest.
    let n = 0;
    if (look?.pennants && nest) {
      const color = rankColor(look.pennants.rank);
      const cream = new Color('#f4ead2');
      const keys = state.paths
        .map((k) => parseHexKey(k))
        .filter((h) => hexDistance(h, nest) <= PENNANT_REACH)
        .sort((a, b) => hexDistance(a, nest) - hexDistance(b, nest) || a.q - b.q || a.r - b.r)
        .slice(0, PENNANT_MAX);
      for (const h of keys) {
        const tile = getTile(this.map, h);
        if (!tile) continue;
        const c = worldPosition(tile);
        const yaw = Math.atan2(c.z - (nestAt?.z ?? 0), c.x - (nestAt?.x ?? 0));
        tmpP.set(c.x + 0.28 * Math.cos(yaw + 1.2), tile.height, c.z + 0.28 * Math.sin(yaw + 1.2));
        tmpM.compose(tmpP, tmpQ.setFromAxisAngle(UP, -yaw), tmpS);
        this.pennantPosts.setMatrixAt(n, tmpM);
        this.pennants.setMatrixAt(n, tmpM);
        this.pennants.setColorAt(n, n % 2 === 0 ? color : cream);
        n++;
      }
    }
    this.pennantPosts.count = n;
    this.pennants.count = n;
    this.pennantPosts.instanceMatrix.needsUpdate = true;
    this.pennants.instanceMatrix.needsUpdate = true;
    if (this.pennants.instanceColor) this.pennants.instanceColor.needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of [this.wood, this.cloth, this.gold, this.brass, this.laurel, this.pennantCloth])
      m.dispose();
  }
}
