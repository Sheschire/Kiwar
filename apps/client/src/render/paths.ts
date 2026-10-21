import type { BufferGeometry, Material } from 'three';
import {
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
 * its path and building neighbours so that the paths join up. Eden: wooden planks laid across
 * a dirt track; Stone: irregular cobbles; Iron: cut pavers between curbs; Industry: a smooth
 * road with a dashed line and curbs. From the Stone age, lanterns along the way light up at
 * night (an emissive lamp, the bloom makes the halo; no real light).
 *
 * Every segment (centre of a tile → edge towards a neighbour) has the same length on the hex
 * grid: one merged geometry per age and variant holds the track, its details and its curbs,
 * and is instanced once per segment (a few hundred instances, a handful of draw calls).
 */
interface PathStyle {
  /** Colour of the track (hub and strips). */
  bed: string;
  /** Half width of the track. */
  width: number;
  detail: string;
  curb: string | null;
  lanterns: boolean;
}

const STYLES: readonly PathStyle[] = [
  { bed: '#c9ad7a', width: 0.2, detail: '#a7774a', curb: null, lanterns: false },
  { bed: '#bfb29a', width: 0.22, detail: '#a39a88', curb: null, lanterns: true },
  { bed: '#b8b0a2', width: 0.25, detail: '#cfc6b6', curb: '#7d7770', lanterns: true },
  { bed: '#5f5c5a', width: 0.26, detail: '#f4efe2', curb: '#9d9893', lanterns: true },
];

type Part = [BufferGeometry, Color, Matrix4];

const box = new BoxGeometry(1, 1, 1);
/*
 * Pavers and cobbles are only their top face (2 and 5 triangles instead of 12 and 20): seen
 * from above, the track between them reads as the joints. A whole Iron path costs about as
 * many triangles as the old slabs and pebbles.
 */
const slab = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const stone = new CircleGeometry(1, 5).rotateX(-Math.PI / 2);
const UP = new Vector3(0, 1, 0);
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();

function bakeParts(parts: Part[]): BufferGeometry {
  const prepared = parts.map(([geo, color, matrix]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
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

/** One segment of `len` along +x from the tile centre, track centred on z = 0. */
function segmentGeometry(age: number, len: number, rng: Rng): BufferGeometry {
  const style = STYLES[age]!;
  const w = style.width;
  const bed = new Color(style.bed);
  const shade = (base: string, k: number) => new Color(base).multiplyScalar(1 + rng.range(-k, k));
  const p: Part[] = [[box, bed, at(len / 2, 0, 0, 0, len, 0.04, w * 2)]];
  switch (age) {
    case 0:
      // Planks across the track, a little crooked.
      for (let u = 0.12; u < len + 0.02; u += 0.13)
        p.push([
          box,
          shade(style.detail, 0.12),
          at(u, rng.range(-0.02, 0.02), 0.03, rng.range(-0.12, 0.12), 0.09, 0.025, w * 2.1),
        ]);
      break;
    case 1:
      // Irregular cobbles, two or three abreast.
      for (let u = 0.1; u < len; u += 0.15)
        for (const v of [-w * 0.55, w * 0.05, w * 0.6]) {
          if (rng.chance(0.2)) continue;
          const s = rng.range(0.055, 0.08);
          p.push([
            stone,
            shade(style.detail, 0.15),
            at(
              u + rng.range(-0.03, 0.03),
              v + rng.range(-0.02, 0.02),
              0.023 + rng.range(0, 0.002),
              rng.range(0, 3),
              s,
              s * 0.35,
              s * 0.85,
            ),
          ]);
        }
      break;
    case 2: {
      // Cut pavers in a running bond.
      let row = 0;
      for (let u = 0.08; u < len; u += 0.14, row++)
        for (const v of row % 2 === 0 ? [-w * 0.5, w * 0.5] : [-w * 0.75, 0, w * 0.75])
          p.push([
            slab,
            shade(style.detail, 0.06),
            at(u, v, 0.022, 0, 0.12, 0.022, row % 2 === 0 ? w * 0.92 : w * 0.66),
          ]);
      break;
    }
    default:
      // A smooth road with a dashed centre line.
      for (let u = 0.14; u < len - 0.05; u += 0.26)
        p.push([slab, new Color(style.detail), at(u, 0, 0.022, 0, 0.13, 1, 0.03)]);
      break;
  }
  if (style.curb) {
    const curb = new Color(style.curb);
    for (const k of [-1, 1])
      p.push([box, curb, at(len / 2, k * (w + 0.02), 0.025, 0, len, 0.05, 0.035)]);
  }
  return bakeParts(p);
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
  private readonly hubGeometry = new CylinderGeometry(1, 1, 1, 8);
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
    const hubMaterial = new MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    withSeasonLook(hubMaterial, { tint: 0, snow: 0.5 });
    this.hubs = new Batch(this.group, this.hubGeometry, hubMaterial);
    this.posts = new Batch(
      this.group,
      new CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
      this.postMaterial,
      true,
    );
    this.lamps = new Batch(this.group, box, this.lampMaterial);
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
      const hubR = first === null ? w * 1.9 : w * 1.12;
      this.hubs.push(
        tmpM.compose(tmpP.set(c.x, y, c.z), tmpQ.identity(), tmpS.set(hubR, 0.04, hubR)),
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
