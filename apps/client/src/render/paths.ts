import type { Material } from 'three';
import {
  BufferGeometry,
  BoxGeometry,
  Color,
  CircleGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withSeasonLook } from './seasonLook';
import {
  createRng,
  getTile,
  hexKey,
  hexNeighbors,
  parseHexKey,
  type FaceMap,
  type Rng,
  type Tile,
} from '@kiwar/shared';
import { HEX_VISUAL_RADIUS, worldPosition } from './terrain';

const MAX_PATHS = 200;
const MAX_PREVIEW = 400;
/** Segment shapes baked per age (picked per segment, so that the paths do not repeat). */
const VARIANTS = 2;

/**
 * Chantier 23: the material of the paths follows the ages, and each path tile reaches towards
 * its path and building neighbours so that the paths join up. From the Stone age, lanterns
 * along the way light up at night (an emissive lamp, the bloom makes the halo; no real light).
 *
 * Chantier 32: the paths lie in the ground instead of standing on it like tubes: the track is
 * a flat ribbon just above the tile, with irregular edges (wider and narrower along the way,
 * a darker trodden rim), and its details are flat too. Eden: packed earth with a few pebbles;
 * Stone: flat stepping stones of every size on the earth; Iron: cut pavers bordered by small
 * stones; Industry: a smooth road with a dashed line and low curbs.
 *
 * Every segment (centre of a tile → edge towards a neighbour) has the same length on the hex
 * grid: one merged geometry per age and variant holds the track, its details and its curbs,
 * and is instanced once per segment (a few hundred instances, a handful of draw calls). The
 * ribbon keeps its exact width at both ends, so the segments of two tiles always meet.
 */
interface PathStyle {
  /** Colour of the track (hub and ribbon). */
  bed: string;
  /** Its trodden rim. */
  rim: string;
  /** Half width of the track. */
  width: number;
  detail: string;
  curb: string | null;
  lanterns: boolean;
}

const STYLES: readonly PathStyle[] = [
  { bed: '#a68459', rim: '#86663f', width: 0.2, detail: '#d8c7a4', curb: null, lanterns: false },
  { bed: '#a38d6a', rim: '#857052', width: 0.22, detail: '#c9c0ae', curb: null, lanterns: true },
  {
    bed: '#9c9282',
    rim: '#7e766a',
    width: 0.25,
    detail: '#d3cabb',
    curb: '#8d877e',
    lanterns: true,
  },
  {
    bed: '#6a6662',
    rim: '#57534f',
    width: 0.26,
    detail: '#f4efe2',
    curb: '#aaa59f',
    lanterns: true,
  },
  // Chantier 51: star-stone slabs edged with celestial brass.
  {
    bed: '#bdb6cc',
    rim: '#9a93ad',
    width: 0.27,
    detail: '#f6f2fb',
    curb: '#d8b95a',
    lanterns: true,
  },
];

type Part = [BufferGeometry, Color, Matrix4];

/*
 * Pavers, stones and pebbles are only their top face (2 and 5 triangles instead of 12 and
 * 20): seen from above, the track between them reads as the joints.
 */
const slab = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const stone = new CircleGeometry(1, 5).rotateX(-Math.PI / 2);
const pebble = new CircleGeometry(1, 4).rotateX(-Math.PI / 2);
const UP = new Vector3(0, 1, 0);
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
/** Height of the ribbon and of its details above the tile (flat: no sides to see). */
const BED_Y = 0.004;
/** Share of a segment, from the centre, where it crosses the others of its tile. */
const CROSSING = 0.4;
const DETAIL_Y = 0.01;

function bakeParts(parts: Part[]): BufferGeometry {
  const prepared = parts.map(([geo, color, matrix]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('color')) {
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
      g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Failed to merge path parts');
  merged.computeVertexNormals();
  return merged;
}

const at = (u: number, v: number, y: number, rot: number, sx: number, sy: number, sz: number) =>
  new Matrix4().compose(
    new Vector3(u, y, v),
    new Quaternion().setFromAxisAngle(UP, rot),
    new Vector3(sx, sy, sz),
  );

/**
 * The flat track of one segment: from the tile centre (u = 0) to the edge (u = `len`), its
 * half width wandering inside, exactly `w` at both ends. Three vertices across (rim, middle,
 * rim): the rim is darker, like trodden ground.
 */
function ribbon(len: number, w: number, bed: Color, rim: Color, rng: Rng): BufferGeometry {
  const steps = 6;
  const positions: number[] = [];
  const colors: number[] = [];
  const rows: { u: number; l: number; r: number; m: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * len;
    // Near the centre the segments of a tile overlap: plain there (no rim, no wobble), so
    // crossings never show stripes.
    const inner = i > 0 && i < steps && u > len * CROSSING;
    const l = w * (inner ? rng.range(0.8, 1.22) : 1);
    const r = w * (inner ? rng.range(0.8, 1.22) : 1);
    rows.push({ u, l, r, m: inner ? rng.range(-0.03, 0.03) : 0 });
  }
  const push = (u: number, v: number, c: Color) => {
    positions.push(u, BED_Y, v);
    colors.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < steps; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    const rimA = a.u > len * CROSSING ? rim : bed;
    const rimB = b.u > len * CROSSING ? rim : bed;
    // Two strips: rim → middle on each side (winding: counter-clockwise seen from above).
    for (const side of [-1, 1] as const) {
      const ea = side < 0 ? -a.l : a.r;
      const eb = side < 0 ? -b.l : b.r;
      const quad: [
        [number, number, Color],
        [number, number, Color],
        [number, number, Color],
        [number, number, Color],
      ] =
        side < 0
          ? [
              [a.u, ea, rimA],
              [a.u, a.m, bed],
              [b.u, b.m, bed],
              [b.u, eb, rimB],
            ]
          : [
              [a.u, a.m, bed],
              [a.u, ea, rimA],
              [b.u, eb, rimB],
              [b.u, b.m, bed],
            ];
      const [p0, p1, p2, p3] = quad;
      for (const [u, v, c] of [p0, p1, p2, p0, p2, p3]) push(u, v, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** One segment of `len` along +x from the tile centre, track centred on z = 0. */
function segmentGeometry(age: number, len: number, rng: Rng): BufferGeometry {
  const style = STYLES[age]!;
  const w = style.width;
  const shade = (base: string, k: number) => new Color(base).multiplyScalar(1 + rng.range(-k, k));
  const p: Part[] = [
    [ribbon(len, w, new Color(style.bed), new Color(style.rim), rng), new Color(), new Matrix4()],
  ];
  switch (age) {
    case 0:
      // Packed earth: a few pebbles and lighter dusty patches.
      for (let u = 0.08; u < len; u += 0.11) {
        if (rng.chance(0.45)) continue;
        const s = rng.range(0.018, 0.035);
        p.push([
          pebble,
          shade(style.detail, 0.12),
          at(u, rng.range(-w * 0.7, w * 0.7), DETAIL_Y, rng.range(0, 3), s, 1, s * 0.8),
        ]);
      }
      for (let i = 0; i < 2; i++) {
        const s = rng.range(0.05, 0.08);
        p.push([
          stone,
          shade(style.bed, 0.05).lerp(new Color(style.detail), 0.35),
          at(
            rng.range(0.1, len - 0.05),
            rng.range(-w * 0.4, w * 0.4),
            BED_Y + 0.002,
            rng.range(0, 3),
            s * 1.6,
            1,
            s,
          ),
        ]);
      }
      break;
    case 1:
      // Flat stepping stones of every size, set in the earth.
      for (let u = 0.07; u < len; u += rng.range(0.1, 0.15))
        for (const v of [-w * 0.45, w * 0.4]) {
          if (rng.chance(0.25)) continue;
          const s = rng.range(0.05, 0.1);
          p.push([
            stone,
            shade(style.detail, 0.14),
            at(
              u + rng.range(-0.03, 0.03),
              v + rng.range(-0.04, 0.04),
              DETAIL_Y,
              rng.range(0, 3),
              s,
              1,
              s * rng.range(0.7, 0.95),
            ),
          ]);
        }
      break;
    case 2: {
      // Cut pavers in a running bond, flush with the ground.
      let row = 0;
      for (let u = 0.08; u < len; u += 0.14, row++)
        for (const v of row % 2 === 0 ? [-w * 0.5, w * 0.5] : [-w * 0.75, 0, w * 0.75])
          p.push([
            slab,
            shade(style.detail, 0.06),
            at(u, v, DETAIL_Y, 0, 0.12, 1, row % 2 === 0 ? w * 0.92 : w * 0.66),
          ]);
      break;
    }
    default:
      // A smooth road with a dashed centre line.
      for (let u = len * CROSSING + 0.06; u < len - 0.05; u += 0.26)
        p.push([slab, new Color(style.detail), at(u, 0, DETAIL_Y, 0, 0.13, 1, 0.03)]);
      break;
  }
  if (style.curb) {
    const curb = new Color(style.curb);
    if (age === 2)
      // Small border stones along both edges.
      for (const k of [-1, 1])
        for (let u = len * CROSSING; u < len; u += 0.07) {
          const s = rng.range(0.022, 0.034);
          p.push([
            stone,
            shade(style.curb, 0.12),
            at(u, k * (w + 0.015), DETAIL_Y, rng.range(0, 3), s, 1, s),
          ]);
        }
    else
      for (const k of [-1, 1])
        p.push([
          slab,
          curb,
          at(
            (len * (1 + CROSSING)) / 2,
            k * (w + 0.015),
            DETAIL_Y,
            0,
            len * (1 - CROSSING),
            1,
            0.03,
          ),
        ]);
  }
  return bakeParts(p);
}

/**
 * Chantier 32: the hub of a path tile, a flat patch with a wobbly outline (turned at random
 * per tile, so no two look alike), its rim darker like the ribbon's.
 */
function hubGeometry(): BufferGeometry {
  const rng = createRng('path-hub');
  const n = 12;
  const positions: number[] = [];
  const colors: number[] = [];
  const rim = 0.82;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rng.range(0.86, 1.12);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[(i + 1) % n]!;
    // Centre (full colour) then two rim points (darker): counter-clockwise from above.
    positions.push(0, 0, 0, x0, 0, -z0, x1, 0, -z1);
    colors.push(1, 1, 1, rim, rim, rim, rim, rim, rim);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** One instanced mesh, its capacity grown on demand. */
class Batch {
  mesh: InstancedMesh;
  private n = 0;

  constructor(
    private readonly group: Group,
    geometry: BufferGeometry,
    material: Material,
    private readonly shadow = false,
  ) {
    this.mesh = this.create(geometry, material, 32);
  }

  private create(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = this.shadow;
    this.group.add(mesh);
    return mesh;
  }

  begin(): void {
    this.n = 0;
  }

  push(m: Matrix4): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.create(old.geometry, old.material as Material, old.instanceMatrix.count * 2);
      for (let i = 0; i < this.n; i++) {
        old.getMatrixAt(i, tmpM);
        this.mesh.setMatrixAt(i, tmpM);
      }
      this.group.remove(old);
      old.dispose();
    }
    this.mesh.setMatrixAt(this.n++, m);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.remove(this.mesh);
    this.mesh.dispose();
  }
}

/** By day the lamp is dark glass; at night a warm light bright enough to bloom. */
const LAMP_DAY = new Color('#5a4a3a');
const LAMP_NIGHT = new Color('#ffc46e').multiplyScalar(2.8);

export class PathsView {
  readonly group = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly hubs: Batch;
  private readonly hubGeometry = hubGeometry();
  /** Segment meshes of the current age (one per variant). */
  private segments: Batch[] = [];
  private segmentAge = -1;
  private readonly posts: Batch;
  private readonly lamps: Batch;
  private readonly lampMaterial = new MeshBasicMaterial({ color: LAMP_DAY.clone() });
  private readonly postMaterial: MeshStandardMaterial;
  private readonly preview: InstancedMesh;
  private readonly previewMaterial: MeshBasicMaterial;
  private signature = '';
  private glow = -1;
  /** Length of a segment: half the distance between two neighbouring tile centres. */
  private readonly len: number;

  constructor(private readonly map: FaceMap) {
    this.material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    withSeasonLook(this.material, { tint: 0, snow: 0.5 });
    this.postMaterial = new MeshStandardMaterial({
      color: '#3c3a3a',
      roughness: 0.6,
      metalness: 0.3,
    });
    withSeasonLook(this.postMaterial, { tint: 0, snow: 0.3 });
    const hubMaterial = new MeshStandardMaterial({
      roughness: 0.95,
      flatShading: true,
      vertexColors: true,
    });
    withSeasonLook(hubMaterial, { tint: 0, snow: 0.5 });
    this.hubs = new Batch(this.group, this.hubGeometry, hubMaterial);
    this.posts = new Batch(
      this.group,
      new CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
      this.postMaterial,
      true,
    );
    this.lamps = new Batch(this.group, new BoxGeometry(1, 1, 1), this.lampMaterial);
    const a = worldPosition({ q: 0, r: 0 });
    const b = worldPosition({ q: 1, r: 0 });
    this.len = Math.hypot(b.x - a.x, b.z - a.z) / 2;

    this.previewMaterial = new MeshBasicMaterial({
      color: '#9be15d',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    });
    this.preview = new InstancedMesh(
      new CylinderGeometry(HEX_VISUAL_RADIUS * 0.7, HEX_VISUAL_RADIUS * 0.7, 0.02, 6),
      this.previewMaterial,
      MAX_PREVIEW,
    );
    this.preview.renderOrder = 6;
    this.preview.instanceMatrix.setUsage(DynamicDrawUsage);
    this.preview.count = 0;
    this.preview.frustumCulled = false;
    this.group.add(this.preview);
  }

  private useAge(age: number): void {
    if (age === this.segmentAge) return;
    this.segmentAge = age;
    for (const s of this.segments) {
      s.mesh.geometry.dispose();
      s.dispose();
    }
    this.segments = [];
    for (let v = 0; v < VARIANTS; v++)
      this.segments.push(
        new Batch(
          this.group,
          segmentGeometry(age, this.len, createRng(`path-style/${age}/${v}`)),
          this.material,
        ),
      );
    (this.hubs.mesh.material as MeshStandardMaterial).color.set(STYLES[age]!.bed);
  }

  /**
   * `ends`: tiles a path may lead into besides other paths (buildings, construction sites), so
   * that the way reaches their door.
   */
  sync(paths: readonly string[], age = 0, ends: ReadonlySet<string> = new Set()): void {
    const shown = paths.slice(0, MAX_PATHS);
    const set = new Set(shown);
    const reach = (key: string) => set.has(key) || ends.has(key);
    const look = Math.min(age, STYLES.length - 1);
    // Neighbours count only when they change which way a path goes.
    const sig = `${look}|${shown
      .map(
        (k) =>
          `${k}>${hexNeighbors(parseHexKey(k))
            .map((h) => (reach(hexKey(h)) ? 1 : 0))
            .join('')}`,
      )
      .join(';')}`;
    if (sig === this.signature) return;
    this.signature = sig;

    this.useAge(look);
    const style = STYLES[look]!;
    const w = style.width;
    for (const b of [this.hubs, this.posts, this.lamps, ...this.segments]) b.begin();
    for (const key of shown) {
      const tile = getTile(this.map, parseHexKey(key));
      if (!tile) continue;
      const rng = createRng(`path/${key}`);
      const c = worldPosition(tile);
      const y = tile.height + 0.012;
      let first: number | null = null;
      for (const h of hexNeighbors(tile)) {
        if (!reach(hexKey(h))) continue;
        const p = worldPosition(h);
        const yaw = Math.atan2(-(p.z - c.z), p.x - c.x);
        first ??= yaw;
        const variant = this.segments[rng.int(0, VARIANTS - 1)]!;
        variant.push(
          tmpM.compose(tmpP.set(c.x, y, c.z), tmpQ.setFromAxisAngle(UP, yaw), tmpS.set(1, 1, 1)),
        );
      }
      const hubR = (first === null ? w * 1.9 : w * 1.15) * rng.range(0.95, 1.1);
      this.hubs.push(
        tmpM.compose(
          tmpP.set(c.x, y + BED_Y + 0.001, c.z),
          tmpQ.setFromAxisAngle(UP, rng.range(0, Math.PI * 2)),
          tmpS.set(hubR, 1, hubR),
        ),
      );
      // A lantern on some path tiles from the Stone age, beside the track.
      if (style.lanterns && rng.chance(0.34)) {
        const yaw = (first ?? 0) + Math.PI / 2;
        const d = w + 0.09;
        tmpP.set(c.x + Math.cos(yaw) * d, tile.height, c.z - Math.sin(yaw) * d);
        this.posts.push(tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(0.018, 0.42, 0.018)));
        tmpP.y += 0.45;
        this.lamps.push(
          tmpM.compose(
            tmpP,
            tmpQ.setFromAxisAngle(UP, rng.range(0, 1)),
            tmpS.set(0.07, 0.08, 0.07),
          ),
        );
      }
    }
    for (const b of [this.hubs, this.posts, this.lamps, ...this.segments]) b.end();
  }

  /** 0 by day, 1 when the lanterns are fully lit. */
  setGlow(glow: number): void {
    const g = Math.round(glow * 50) / 50;
    if (g === this.glow) return;
    this.glow = g;
    this.lampMaterial.color.copy(LAMP_DAY).lerp(LAMP_NIGHT, g);
  }

  setPreview(tiles: readonly Tile[], erase: boolean): void {
    this.previewMaterial.color.set(erase ? '#ff7a6b' : '#9be15d');
    let n = 0;
    for (const t of tiles.slice(0, MAX_PREVIEW)) {
      const pos = worldPosition(t);
      tmpM.makeTranslation(pos.x, t.height + 0.07, pos.z);
      this.preview.setMatrixAt(n++, tmpM);
    }
    this.preview.count = n;
    this.preview.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const s of this.segments) {
      s.mesh.geometry.dispose();
      s.dispose();
    }
    this.hubs.dispose();
    this.posts.dispose();
    this.lamps.dispose();
    this.hubGeometry.dispose();
    this.material.dispose();
    (this.hubs.mesh.material as Material).dispose();
    this.postMaterial.dispose();
    this.lampMaterial.dispose();
    this.preview.geometry.dispose();
    this.previewMaterial.dispose();
  }
}
