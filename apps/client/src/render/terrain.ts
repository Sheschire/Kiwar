import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Plane,
} from 'three';
import {
  hexKey,
  hexToPixel,
  pixelToHex,
  type BiomeId,
  type FaceMap,
  type HexKey,
  type Tile,
  type TileType,
} from '@kiwar/shared';
import { GLSL_NOISE } from './shaderChunks';
import { withSeasonLook } from './seasonLook';

/** Visual radius of a hex top (the logical circumradius is 1; the gap shows the thick edges). */
export const HEX_VISUAL_RADIUS = 0.955;
/** How deep tiles extend below their top surface. */
export const TILE_DEPTH = 3.2;
/** World height of the top of the kiwi "dome" below the tiles. */
export const DOME_TOP = -1.9;

export const TILE_COLORS: Record<TileType, Color> = {
  heart: new Color('#fbf1d2'),
  ray: new Color('#eef2c6'),
  seedRing: new Color('#b5d65a'),
  flesh: new Color('#86bf35'),
  grove: new Color('#9aa94a'),
  juice: new Color('#b7a548'),
  skin: new Color('#74513a'),
};

/** Kiwi flesh is paler near the heart and deeper green near the skin. */
const FLESH_INNER = new Color('#b9dc62');
const FLESH_OUTER = new Color('#6aa82a');

interface BiomeLook {
  flesh?: readonly [string, string];
  tiles?: Partial<Record<TileType, string>>;
}

/** Palette of each biome (chantier 05): the flesh gradient and a few tile colours. */
const BIOME_LOOKS: Record<BiomeId, BiomeLook> = {
  classic: {},
  orchard: { flesh: ['#c8f060', '#3f9a1c'], tiles: { grove: '#86a83c' } },
  highlands: {
    flesh: ['#c8d98c', '#78a24a'],
    tiles: { grove: '#aaa97c', skin: '#6a4a36', seedRing: '#bcd47a' },
  },
  delta: { flesh: ['#e2d866', '#93a224'], tiles: { grove: '#b39c45', ray: '#f7ecb8' } },
  seedCrown: { flesh: ['#9cc44c', '#4f7f22'], tiles: { seedRing: '#a8c447', ray: '#e6eab4' } },
  lagoons: { flesh: ['#a8e090', '#4aa25a'], tiles: { grove: '#86b064' } },
  tundra: {
    flesh: ['#dbe6c4', '#86a284'],
    tiles: { grove: '#c2c4b6', skin: '#7d6152', seedRing: '#cfdcb0', heart: '#f6f6ee' },
  },
};

const lookCache = new Map<
  BiomeId,
  { inner: Color; outer: Color; tiles: Record<TileType, Color> }
>();

function biomeLook(biome: BiomeId) {
  let look = lookCache.get(biome);
  if (!look) {
    const def = BIOME_LOOKS[biome];
    const tiles = { ...TILE_COLORS };
    for (const [type, hex] of Object.entries(def.tiles ?? {}))
      tiles[type as TileType] = new Color(hex);
    look = {
      inner: def.flesh ? new Color(def.flesh[0]) : FLESH_INNER,
      outer: def.flesh ? new Color(def.flesh[1]) : FLESH_OUTER,
      tiles,
    };
    lookCache.set(biome, look);
  }
  return look;
}

export function worldPosition(tile: { q: number; r: number }): { x: number; z: number } {
  const p = hexToPixel(tile);
  return { x: p.x, z: p.y };
}

export function tileTopColor(tile: Tile, out = new Color(), biome: BiomeId = 'classic'): Color {
  const look = biomeLook(biome);
  if (tile.type === 'flesh') {
    out.copy(look.inner).lerp(look.outer, Math.min(1, Math.max(0, (tile.rho - 0.15) / 0.75)));
  } else {
    out.copy(look.tiles[tile.type]);
  }
  // Small per-tile variation so the ground is not a flat colour.
  const v = (tile.variant - 0.5) * 0.09;
  out.offsetHSL(v * 0.3, 0, v);
  return out;
}

/**
 * Bevelled hexagonal prism, flat-shaded. The top sits at y = 0 and the body goes down to
 * -TILE_DEPTH. Attribute `aTop` is 1 on the top cap, ~0.7 on the bevel and 0 on the sides,
 * so the shader can paint earth strata on the sides.
 */
export function createHexPrismGeometry(
  radius = HEX_VISUAL_RADIUS,
  depth = TILE_DEPTH,
): BufferGeometry {
  const inner = radius * 0.86;
  const bevelDrop = 0.07;
  const corner = (i: number, r: number, y: number) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [Math.cos(a) * r, y, Math.sin(a) * r] as const;
  };
  const positions: number[] = [];
  const tops: number[] = [];
  const pushTri = (
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    top: number,
  ) => {
    positions.push(...a, ...b, ...c);
    tops.push(top, top, top);
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // Top cap (counter-clockwise when seen from above).
    pushTri([0, 0, 0], corner(j, inner, 0), corner(i, inner, 0), 1);
    // Bevel ring.
    const ai = corner(i, inner, 0);
    const aj = corner(j, inner, 0);
    const bi = corner(i, radius, -bevelDrop);
    const bj = corner(j, radius, -bevelDrop);
    pushTri(ai, aj, bj, 0.75);
    pushTri(ai, bj, bi, 0.75);
    // Sides.
    const ci = corner(i, radius, -depth);
    const cj = corner(j, radius, -depth);
    pushTri(bi, bj, cj, 0);
    pushTri(bi, cj, ci, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aTop', new Float32BufferAttribute(tops, 1));
  g.computeVertexNormals();
  return g;
}

/** Patches a standard material so tile sides show kiwi strata instead of the top colour. */
function createTileMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.88, metalness: 0, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTop;
        attribute float aSkin;
        varying float vTop;
        varying float vSkin;
        varying float vLocalY;
        varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTop = aTop;
        vSkin = aSkin;
        vLocalY = position.y;
        vWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vTop;
        varying float vSkin;
        varying float vLocalY;
        varying vec3 vWorldPos;
        ${GLSL_NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Tops (most of the screen) keep their colour: the strata only run on the sides.
        if (vTop < 0.5) {
          vec3 topColor = diffuseColor.rgb;
          float depth = -vLocalY;
          float wobble = (kNoise(vWorldPos.xz * 1.7 + vWorldPos.y) - 0.5) * 0.22;
          float wy = vWorldPos.y + wobble;
          vec3 fleshLight = vec3(0.62, 0.78, 0.30);
          vec3 fleshDeep = vec3(0.36, 0.55, 0.14);
          vec3 pith = vec3(0.86, 0.88, 0.62);
          vec3 skinBrown = vec3(0.33, 0.20, 0.11);
          vec3 strata = mix(fleshLight, fleshDeep, smoothstep(0.1, -1.0, wy));
          strata = mix(strata, pith, smoothstep(-1.15, -1.3, wy) * (1.0 - smoothstep(-1.45, -1.6, wy)));
          strata = mix(strata, skinBrown, smoothstep(-1.55, -1.75, wy));
          // Furry brown skin cliffs stay brown all the way.
          vec3 skinSide = topColor * (0.78 + 0.25 * kNoise(vec2(atan(vWorldPos.z, vWorldPos.x) * 40.0, wy * 3.0)));
          strata = mix(strata, skinSide, vSkin);
          // A darker lip of the top colour just under the bevel.
          vec3 lip = topColor * 0.72;
          vec3 side = mix(lip, strata, smoothstep(0.1, 0.32, depth));
          // Soft fake occlusion towards the bottom of each visible side.
          side *= 0.82 + 0.18 * smoothstep(-2.0, 0.0, wy);
          diffuseColor.rgb = side;
        } else {
          diffuseColor.rgb *= 0.92 + 0.08 * vTop;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'kiwar-tile';
  withSeasonLook(material, { tint: 1, snow: 1 });
  return material;
}

const DRY = new Color('#b89a5e');

export class TerrainView {
  readonly group = new Group();
  readonly tiles: InstancedMesh;
  private readonly map: FaceMap;
  private readonly dome: Mesh;
  private tinted = new Set<string>();
  private depletionSig = '';

  constructor(map: FaceMap) {
    this.map = map;
    const geometry = createHexPrismGeometry();
    const skinAttr = new Float32Array(map.tiles.length);
    map.tiles.forEach((t, i) => (skinAttr[i] = t.type === 'skin' ? 1 : 0));
    geometry.setAttribute('aSkin', new InstancedBufferAttribute(skinAttr, 1));

    this.tiles = new InstancedMesh(geometry, createTileMaterial(), map.tiles.length);
    this.tiles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tiles.castShadow = true;
    this.tiles.receiveShadow = true;
    const m = new Matrix4();
    const c = new Color();
    map.tiles.forEach((tile, i) => {
      const p = worldPosition(tile);
      m.makeTranslation(p.x, tile.height, p.z);
      this.tiles.setMatrixAt(i, m);
      this.tiles.setColorAt(i, tileTopColor(tile, c, map.params.biome));
    });
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.tiles.computeBoundingSphere();
    this.tiles.computeBoundingBox();
    this.group.add(this.tiles);

    this.dome = createKiwiDome(map);
    this.group.add(this.dome);
  }

  /**
   * Tints harvested deposits towards a dry straw colour according to how depleted they are
   * (`ratios`: fill ratio by hex key; tiles absent from it are full).
   */
  setDepletion(ratios: ReadonlyMap<string, number>): void {
    const quantized = new Map<string, number>();
    for (const [k, v] of ratios) {
      const step = Math.round(v * 8) / 8;
      if (step < 1) quantized.set(k, step);
    }
    const sig = [...quantized].map(([k, v]) => `${k}=${v}`).join(';');
    if (sig === this.depletionSig) return;
    this.depletionSig = sig;
    const c = new Color();
    for (const key of new Set([...this.tinted, ...quantized.keys()])) {
      const i = this.map.index.get(key as HexKey);
      const tile = i === undefined ? undefined : this.map.tiles[i];
      if (!tile || i === undefined) continue;
      tileTopColor(tile, c, this.map.params.biome);
      const ratio = quantized.get(key);
      if (ratio !== undefined) c.lerp(DRY, (1 - ratio) * 0.7);
      this.tiles.setColorAt(i, c);
    }
    this.tinted = new Set(quantized.keys());
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  /**
   * Chantier 49: clips the skin dome (the quarter of the cut opens): `planes` with
   * `clipIntersection` remove the wedge between them; null closes the fruit again.
   */
  setDomeClip(planes: Plane[] | null): void {
    this.dome.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as MeshStandardMaterial;
      const had = (m.clippingPlanes?.length ?? 0) > 0;
      m.clippingPlanes = planes;
      m.clipIntersection = true;
      if (had !== !!planes) m.needsUpdate = true;
    });
  }

  /** Index in `map.tiles` of the tile under a ray hit (instance id). */
  tileOfInstance(instanceId: number): Tile | undefined {
    return this.map.tiles[instanceId];
  }

  /** World-space top centre of a tile. */
  tileTop(tile: Tile, out = new Vector3()): Vector3 {
    const p = worldPosition(tile);
    return out.set(p.x, tile.height, p.z);
  }

  /** Extent of the disc on X and Z (half sizes). */
  extent(): { x: number; z: number } {
    const box = this.tiles.boundingBox!;
    return { x: Math.max(-box.min.x, box.max.x), z: Math.max(-box.min.z, box.max.z) };
  }

  dispose(): void {
    this.tiles.geometry.dispose();
    (this.tiles.material as MeshStandardMaterial).dispose();
    this.dome.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      (o.material as MeshStandardMaterial).dispose();
    });
  }
}

const domeRadii = new WeakMap<FaceMap, number>();

/**
 * Radius of the skin dome (semi-axes `r·ellipse` and `r/√ellipse`, like the disc): the largest
 * one whose rim stays under the tiles all around, so no ledge shows beyond the rim tiles.
 */
export function domeRadius(map: FaceMap): number {
  const cached = domeRadii.get(map);
  if (cached !== undefined) return cached;
  const ax = map.ellipse;
  const az = 1 / Math.sqrt(map.ellipse);
  const fits = (r: number) => {
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      const h = pixelToHex(Math.cos(a) * r * ax, Math.sin(a) * r * az);
      if (!map.index.has(hexKey(h))) return false;
    }
    return true;
  };
  let lo = 1;
  let hi = map.params.radius * Math.sqrt(3) + 0.9;
  for (let step = 0; step < 20; step++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // A little inside, so the rim never peeks between two samples.
  const r = lo - 0.15;
  domeRadii.set(map, r);
  return r;
}

/** Chantier 49: the skin dome's semi-axes (across x, down, across z) and its top. */
export interface DomeShape {
  ax: number;
  ay: number;
  az: number;
  top: number;
}

export function domeShape(map: FaceMap): DomeShape {
  const radius = domeRadius(map);
  return {
    ax: radius * map.ellipse,
    ay: radius * DOME_DEPTH,
    az: radius / Math.sqrt(map.ellipse),
    top: DOME_TOP,
  };
}

/** Depth of the dome, in radii. */
const DOME_DEPTH = 0.55;

/** The other half of the kiwi: a furry brown dome hanging under the tiles. */
/** The cut under the tiles: only seen through the gaps between them, like a shadow. */
const SKIN_CUT = new Color('#3d2817');

function createKiwiDome(map: FaceMap): Mesh {
  const radius = domeRadius(map);
  const geometry = new SphereGeometry(1, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const material = new MeshStandardMaterial({
    color: '#7a4e2e',
    roughness: 1,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float a = atan(vObj.z, vObj.x);
          float fur = kNoise(vec2(a * 60.0, vObj.y * 18.0)) * 0.5 + kNoise(vec2(a * 140.0, vObj.y * 40.0)) * 0.5;
          diffuseColor.rgb *= 0.72 + 0.4 * fur;
          diffuseColor.rgb *= 0.65 + 0.35 * smoothstep(-1.0, 0.0, vObj.y);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'kiwar-dome';
  const dome = new Mesh(geometry, material);
  dome.scale.set(radius * map.ellipse, radius * DOME_DEPTH, radius / Math.sqrt(map.ellipse));
  dome.position.y = DOME_TOP;
  dome.receiveShadow = true;
  // The cut closes the bowl: through the gaps between tiles one never sees inside the skin.
  const pulp = new Mesh(
    new CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({
      color: SKIN_CUT,
      roughness: 1,
    }),
  );
  pulp.receiveShadow = true;
  dome.add(pulp);
  return dome;
}
