import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  createRng,
  getTile,
  parseHexKey,
  type FaceMap,
  type Season,
  type Tile,
} from '@kiwar/shared';
import { withSeasonLook } from './seasonLook';
import { withWind } from './wind';
import { worldPosition } from './terrain';

/**
 * Chantier 23: harvested tiles look cultivated, and the crop shows how full the deposit is.
 * As soon as a producer owns a tile (its pool), the wild props of the tile give way to rows of
 * pulp sprouts on mounds, trimmed fibre tufts and a bale, seeds laid in furrows, or a little
 * jetty with buckets on the juice. Plants grow, thin out and dry with the fill ratio of the
 * deposit (8 steps, as the terrain tint), and regrow smoothly. One instanced mesh per kind of
 * piece for the whole face; matrices change only when a tile changes step (or while it grows).
 */

type PieceKind =
  | 'mound'
  | 'sprout'
  | 'bulb'
  | 'tuft'
  | 'bale'
  | 'ridge'
  | 'stalk'
  | 'pod'
  | 'plank'
  | 'post'
  | 'bucket'
  | 'flower';

interface PieceDef {
  geometry: BufferGeometry;
  /** Grows with the ratio ('y': height only, 'all': uniform), or stays ('none'). */
  grows: 'y' | 'all' | 'none';
  /** Fresh and dried colours (plants dry as the deposit empties). */
  fresh: string;
  dry?: string;
  wind?: number;
  season: { tint: number; snow: number };
  shadow?: boolean;
}

const PIECES: Record<PieceKind, PieceDef> = {
  mound: {
    geometry: new SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    grows: 'none',
    fresh: '#a8875a',
    season: { tint: 0, snow: 0.9 },
  },
  sprout: {
    geometry: new ConeGeometry(0.05, 1, 4, 1).translate(0, 0.5, 0),
    grows: 'y',
    fresh: '#76bd34',
    dry: '#b9a46a',
    wind: 0.9,
    season: { tint: 0.8, snow: 0.4 },
  },
  bulb: {
    geometry: new SphereGeometry(0.5, 6, 4),
    grows: 'all',
    fresh: '#c8e57a',
    dry: '#b8a878',
    season: { tint: 0.3, snow: 0.6 },
  },
  tuft: {
    geometry: new CylinderGeometry(0.05, 0.085, 1, 6, 1).translate(0, 0.5, 0),
    grows: 'y',
    fresh: '#d6b77e',
    dry: '#a99069',
    wind: 0.35,
    season: { tint: 0.5, snow: 0.8 },
    shadow: true,
  },
  bale: {
    geometry: new CylinderGeometry(0.5, 0.5, 1, 8),
    grows: 'none',
    fresh: '#e2c487',
    season: { tint: 0, snow: 0.9 },
    shadow: true,
  },
  // Chantier 32: seed fields are rows of plants on soft ridges, not furrows with beads.
  ridge: {
    geometry: new SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2),
    grows: 'none',
    fresh: '#9a7a54',
    season: { tint: 0, snow: 0.9 },
  },
  stalk: {
    geometry: new ConeGeometry(0.035, 1, 4, 1).translate(0, 0.5, 0),
    grows: 'y',
    fresh: '#8cb046',
    dry: '#b9a46a',
    wind: 1,
    season: { tint: 0.8, snow: 0.4 },
  },
  pod: {
    // A seed pod: a plump spindle, hung at the top of its stalk.
    geometry: new SphereGeometry(0.5, 5, 4).scale(0.55, 1, 0.55),
    grows: 'all',
    fresh: '#d8b04e',
    dry: '#9a7444',
    season: { tint: 0.4, snow: 0.6 },
    shadow: true,
  },
  plank: {
    geometry: new BoxGeometry(1, 1, 1),
    grows: 'none',
    fresh: '#8a5f38',
    season: { tint: 0, snow: 0.9 },
    shadow: true,
  },
  post: {
    geometry: new CylinderGeometry(0.5, 0.5, 1, 5).translate(0, 0.5, 0),
    grows: 'none',
    fresh: '#6b4a2c',
    season: { tint: 0, snow: 0.5 },
  },
  bucket: {
    geometry: new CylinderGeometry(0.5, 0.4, 1, 7).translate(0, 0.5, 0),
    grows: 'none',
    fresh: '#a7774a',
    season: { tint: 0, snow: 0.6 },
  },
  flower: {
    geometry: new IcosahedronGeometry(0.5, 0),
    grows: 'all',
    fresh: '#fff2f6',
    season: { tint: 0, snow: 0 },
  },
};
const KINDS = Object.keys(PIECES) as PieceKind[];

interface Piece {
  kind: PieceKind;
  pos: Vector3;
  quat: Quaternion;
  scale: Vector3;
  /** Shown only while the deposit is at least this full (sparser crops as it empties). */
  above: number;
  /** Spring only (flowers). */
  spring?: boolean;
  /** Its own shade (varies the colours a little). */
  shade: number;
  index: number;
}

interface CropTile {
  key: string;
  pieces: Piece[];
  /** Fill ratio aimed at (8 steps) and shown (eases towards it: regrowth). */
  target: number;
  shown: number;
}

const STEP = 8;
const GROW_PER_S = 0.35;
const tmpM = new Matrix4();
const tmpS = new Vector3();
const tmpC = new Color();
const UP = new Vector3(0, 1, 0);

export interface CropZone {
  key: string;
  type: Tile['type'];
  /** Fill ratio of the deposit, 0..1. */
  ratio: number;
}

export class CropsView {
  readonly group = new Group();
  private readonly meshes = new Map<PieceKind, InstancedMesh>();
  private readonly colors = new Map<PieceKind, [Color, Color]>();
  private tiles = new Map<string, CropTile>();
  private layoutSig = '';
  private season: Season = 'spring';
  private growing = false;

  constructor(
    private readonly map: FaceMap,
    /** Low quality: fewer pieces. */
    private readonly density: number,
  ) {
    for (const kind of KINDS) {
      const def = PIECES[kind];
      const material = new MeshStandardMaterial({ roughness: 0.9, flatShading: true });
      withSeasonLook(material, def.season);
      if (def.wind) withWind(material, def.wind);
      this.colors.set(kind, [new Color(def.fresh), new Color(def.dry ?? def.fresh)]);
      const mesh = new InstancedMesh(def.geometry, material, 1);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = !!def.shadow;
      mesh.receiveShadow = true;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** The cultivated tiles (producers' pools) with their fill ratio, and the season. */
  sync(zones: readonly CropZone[], season: Season): void {
    const layout = `${season === 'spring' ? 's' : ''}|${zones.map((z) => z.key).join(';')}`;
    if (layout !== this.layoutSig) {
      this.layoutSig = layout;
      this.season = season;
      this.rebuild(zones);
      return;
    }
    for (const z of zones) {
      const tile = this.tiles.get(z.key);
      if (!tile) continue;
      const target = Math.round(z.ratio * STEP) / STEP;
      if (target === tile.target) continue;
      tile.target = target;
      // Emptying shows at once; refilling grows back slowly.
      if (target < tile.shown) {
        tile.shown = target;
        this.place(tile);
        this.flush();
      } else this.growing = true;
    }
  }

  /** Regrowth: tiles whose deposit refilled grow back over a few seconds. */
  update(dt: number): void {
    if (!this.growing) return;
    this.growing = false;
    for (const tile of this.tiles.values()) {
      if (tile.shown >= tile.target) continue;
      tile.shown = Math.min(tile.target, tile.shown + GROW_PER_S * dt);
      this.place(tile);
      if (tile.shown < tile.target) this.growing = true;
    }
    this.flush();
  }

  private rebuild(zones: readonly CropZone[]): void {
    const old = this.tiles;
    this.tiles = new Map();
    const counts = new Map<PieceKind, number>(KINDS.map((k) => [k, 0]));
    for (const z of zones) {
      const t = getTile(this.map, parseHexKey(z.key));
      if (!t) continue;
      const pieces = layoutOf(t, z.type, this.density);
      if (pieces.length === 0) continue;
      for (const p of pieces) {
        p.index = counts.get(p.kind)!;
        counts.set(p.kind, p.index + 1);
      }
      const target = Math.round(z.ratio * STEP) / STEP;
      const was = old.get(z.key);
      this.tiles.set(z.key, {
        key: z.key,
        pieces,
        target,
        shown: was ? Math.min(was.shown, target) : target,
      });
    }
    for (const kind of KINDS) {
      const n = counts.get(kind)!;
      let mesh = this.meshes.get(kind)!;
      if (mesh.instanceMatrix.count < n) {
        // Grow the capacity (rare: a new producer or a bigger zone).
        const bigger = new InstancedMesh(mesh.geometry, mesh.material, Math.ceil(n * 1.5));
        bigger.frustumCulled = false;
        bigger.castShadow = mesh.castShadow;
        bigger.receiveShadow = true;
        bigger.instanceMatrix.setUsage(DynamicDrawUsage);
        this.group.remove(mesh);
        mesh.dispose();
        this.group.add(bigger);
        this.meshes.set(kind, bigger);
        mesh = bigger;
      }
      mesh.count = n;
    }
    for (const tile of this.tiles.values()) {
      if (tile.shown < tile.target) this.growing = true;
      this.place(tile);
    }
    this.flush();
  }

  /** Writes the matrices and colours of one tile's pieces for its shown ratio. */
  private place(tile: CropTile): void {
    const r = tile.shown;
    for (const p of tile.pieces) {
      const mesh = this.meshes.get(p.kind)!;
      const def = PIECES[p.kind];
      const hidden = r < p.above || (p.spring && this.season !== 'spring');
      tmpS.copy(p.scale);
      if (hidden) tmpS.setScalar(0);
      else if (def.grows === 'y') tmpS.y *= 0.3 + 0.7 * r;
      else if (def.grows === 'all') tmpS.multiplyScalar(0.4 + 0.6 * r);
      mesh.setMatrixAt(p.index, tmpM.compose(p.pos, p.quat, tmpS));
      const [fresh, dry] = this.colors.get(p.kind)!;
      tmpC.copy(fresh).lerp(dry, (1 - r) * 0.85);
      tmpC.multiplyScalar(p.shade);
      mesh.setColorAt(p.index, tmpC);
    }
  }

  private flush(): void {
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }
}

/** The pieces of one cultivated tile (deterministic per tile). */
function layoutOf(tile: Tile, type: Tile['type'], density: number): Piece[] {
  const rng = createRng(`crop/${tile.q},${tile.r}`);
  const c = worldPosition(tile);
  const y = tile.height;
  const angle = rng.range(0, Math.PI);
  const along = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const across = new Vector3(-along.z, 0, along.x);
  const out: Piece[] = [];
  const add = (
    kind: PieceKind,
    pos: Vector3,
    scale: Vector3,
    o: { yaw?: number; tilt?: Euler; above?: number; spring?: boolean } = {},
  ) => {
    const quat = new Quaternion().setFromAxisAngle(UP, o.yaw ?? -angle);
    if (o.tilt) quat.multiply(new Quaternion().setFromEuler(o.tilt));
    out.push({
      kind,
      pos,
      quat,
      scale,
      above: o.above ?? 0,
      spring: o.spring,
      shade: rng.range(0.9, 1.08),
      index: 0,
    });
  };
  const at = (u: number, v: number, dy = 0) =>
    new Vector3(c.x, y + dy, c.z).addScaledVector(along, u).addScaledVector(across, v);
  // Medium and high keep every piece; low keeps a share.
  const keep = (share: number) => rng.next() < (density >= 0.7 ? 1 : share);

  switch (type) {
    case 'flesh': {
      // Three rows of mounds, each with a pulp bulb and a sprout.
      for (const v of [-0.34, 0, 0.34]) {
        for (const u of [-0.32, 0.02, 0.36]) {
          if (Math.abs(u) + Math.abs(v) > 0.62 || !keep(0.7)) continue;
          const p = at(u + rng.range(-0.04, 0.04), v + rng.range(-0.03, 0.03));
          const rank = rng.next();
          add('mound', p.clone(), new Vector3(0.3, 0.12, 0.2));
          add('bulb', p.clone().setY(y + 0.08), new Vector3(0.17, 0.13, 0.17), {
            above: rank * 0.35,
          });
          const h = rng.range(0.22, 0.36);
          add('sprout', p.clone().setY(y + 0.08), new Vector3(1, h, 1), {
            yaw: rng.range(0, 6),
            tilt: new Euler(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)),
            above: rank * 0.6,
          });
          if (rng.chance(0.5))
            add('flower', p.clone().setY(y + 0.08 + h * 0.95), new Vector3(0.05, 0.05, 0.05), {
              above: 0.5,
              spring: true,
            });
        }
      }
      break;
    }
    case 'grove': {
      // Trimmed fibre tufts in a loose grid and a bale tied by the side.
      for (const [u, v] of [
        [-0.3, -0.22],
        [0.05, -0.3],
        [0.32, -0.08],
        [-0.25, 0.18],
        [0.12, 0.2],
        [-0.02, -0.02],
      ] as const) {
        if (!keep(0.7)) continue;
        const h = rng.range(0.32, 0.5);
        add('tuft', at(u, v), new Vector3(1, h, 1), {
          yaw: rng.range(0, 6),
          tilt: new Euler(rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)),
          above: rng.next() * 0.55,
        });
      }
      add('bale', at(0.34, 0.3, 0.09), new Vector3(0.18, 0.3, 0.18), {
        tilt: new Euler(0, 0, Math.PI / 2),
      });
      break;
    }
    case 'seedRing': {
      // Rows of seed plants on soft ridges: stalks of every height, leaning a little, each
      // with one or two pods of its own size and angle.
      for (const v of [-0.27, 0, 0.27]) {
        const span = 0.82 - Math.abs(v) * 0.9;
        add('ridge', at(rng.range(-0.03, 0.03), v, -0.01), new Vector3(span, 0.07, 0.15));
        const n = Math.round(span / 0.16);
        for (let i = 0; i < n; i++) {
          if (!keep(0.7)) continue;
          const u = -span / 2 + (i + 0.5) * (span / n) + rng.range(-0.035, 0.035);
          const base = at(u, v + rng.range(-0.035, 0.035), 0.03);
          const rank = rng.next();
          const h = rng.range(0.16, 0.34);
          const lean = new Euler(rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25));
          const yaw = rng.range(0, 6);
          add('stalk', base.clone(), new Vector3(1, h, 1), { yaw, tilt: lean, above: rank * 0.5 });
          // The top of the leaning stalk, where its pods hang.
          const turn = new Quaternion()
            .setFromAxisAngle(UP, yaw)
            .multiply(new Quaternion().setFromEuler(lean));
          const top = base.clone().add(new Vector3(0, h * 0.95, 0).applyQuaternion(turn));
          const pods = rng.chance(0.45) ? 2 : 1;
          for (let k = 0; k < pods; k++) {
            const size = rng.range(0.06, 0.1);
            add(
              'pod',
              top.clone().add(new Vector3(0, -k * 0.05, 0)),
              new Vector3(size, size * 1.7, size),
              {
                yaw: rng.range(0, 6),
                tilt: new Euler(rng.range(0.4, 1.1) * (k ? -1 : 1), 0, rng.range(-0.3, 0.3)),
                above: 0.2 + rank * 0.75,
              },
            );
          }
        }
      }
      break;
    }
    case 'juice': {
      // A small jetty reaching over the juice, two buckets on it.
      const u0 = 0.18;
      add('plank', at(u0, 0, 0.06), new Vector3(0.55, 0.04, 0.22));
      for (const [u, v] of [
        [u0 - 0.24, -0.1],
        [u0 - 0.24, 0.1],
        [u0 + 0.24, -0.1],
        [u0 + 0.24, 0.1],
      ] as const)
        add('post', at(u, v, -0.12), new Vector3(0.035, 0.22, 0.035));
      add('bucket', at(u0 + 0.12, 0.04, 0.08), new Vector3(0.09, 0.1, 0.09));
      if (rng.chance(0.6)) add('bucket', at(u0 - 0.1, -0.05, 0.08), new Vector3(0.08, 0.09, 0.08));
      break;
    }
    default:
      break;
  }
  return out;
}
