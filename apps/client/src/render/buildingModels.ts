import type { BufferGeometry } from 'three';
import { Color, Matrix4, Mesh, Quaternion, Raycaster, Vector3 } from 'three';
import {
  ageOfLevel,
  BUILDING_TYPES,
  LEVELS_PER_AGE,
  type BuildingType,
  type ShipId,
} from '@kiwar/shared';
import {
  bake,
  box,
  C,
  cone,
  cyl,
  emitter,
  ico,
  m,
  MODEL_SCALE,
  sphere,
  type BuildingModel,
  type Part,
  type Parts,
} from './models/kit';
import { hut, nest } from './models/housing';
import { camp, fiberWorkshop, juiceWell, pulpery, seedQuarry } from './models/production';
import { warehouse } from './models/storage';
import { bird, launchpad } from './models/travel';
import { lab, library, school } from './models/knowledge';
import { seedTurret, skyTurret } from './models/defense';
import { monument } from './models/monument';
import { trainingCamp } from './models/training';
import { forge } from './models/forge';
import { A, annex, crown, lamp, type Look } from './models/ageKit';
import { bigSignSpot, spread } from './models/spread';

export type { BuildingEmitter, BuildingModel, BuildingRig, RigMotion } from './models/kit';

/**
 * Procedural low-poly building models (families in `models/`): the public entry points, the
 * per-age dressing, signs, night lights and the caches.
 */

/** Chantier 33: each builder is a recipe of the building's look (age, tier). */
const BUILDERS: Record<BuildingType, (look: Look) => Parts> = {
  camp: () => camp(),
  launchpad,
  nest,
  pulpery,
  fiberWorkshop,
  seedQuarry,
  juiceWell,
  hut,
  warehouse,
  school,
  library,
  monument: (l) => monument(l.level),
  lab: (l) => lab(l.level),
  seedTurret,
  skyTurret,
  trainingCamp,
  forge,
};

/**
 * Recipes that draw their own annex and crown (tiers 2 and 3 of the later ages) instead of the
 * kit's: the Nest's arch, the hut's upper floor, the turrets' armour and spikes.
 */
const CROWNED: ReadonlySet<BuildingType> = new Set(['nest', 'hut', 'seedTurret', 'skyTurret']);
const OWN_ANNEX: ReadonlySet<BuildingType> = new Set(['seedTurret', 'skyTurret']);

/** Where the annex (tier 2) and the crown (tier 3) of the later ages stand (x, z). */
const ANNEX_SPOTS: Partial<Record<BuildingType, [number, number]>> = {};
const CROWN_SPOTS: Partial<Record<BuildingType, [number, number]>> = {};

/**
 * The look of a building: the age of its level (levels 1–3 Eden, 4–6 Stone…). The monument has
 * one level per age, the laboratory belongs to the Iron age (its last level to the Industry).
 */
export function lookOf(type: BuildingType, level: number, colonyAge = 0, docked = true): Look {
  const age =
    type === 'monument'
      ? Math.min(3, level)
      : type === 'lab'
        ? level >= 3
          ? 3
          : 2
        : type === 'trainingCamp' || type === 'forge'
          ? level >= 3
            ? 2
            : 1
          : type === 'camp'
            ? 0
            : ageOfLevel(level);
  const tier =
    type === 'monument' ||
    type === 'lab' ||
    type === 'camp' ||
    type === 'trainingCamp' ||
    type === 'forge'
      ? Math.min(3, level)
      : ((level - 1) % LEVELS_PER_AGE) + 1;
  return { age, tier, level, colonyAge, docked };
}

const cache = new Map<string, BufferGeometry>();
const models = new Map<string, BuildingModel>();

function partsOf(
  type: BuildingType,
  level: number,
  shipAway: boolean,
  colonyAge: number,
  sign = true,
): Parts {
  const look = lookOf(type, level, colonyAge, !shipAway);
  const p = BUILDERS[type](look);
  // Chantier 35: big buildings get their sign once spread over their footprint.
  const big = bigSignSpot(type);
  p.doors = p.filter((part) => part[1] === C.door && !part[3]);
  if (type !== 'camp' && sign && !big) signPost(p, type);
  if (level > 3 && type !== 'monument' && type !== 'lab') {
    if (look.tier >= 2 && !OWN_ANNEX.has(type))
      annex(p, look.age, ...(ANNEX_SPOTS[type] ?? [-0.5, -0.5]));
    if (look.tier >= 3 && !CROWNED.has(type))
      crown(p, look.age, ...(CROWN_SPOTS[type] ?? [0.52, -0.48]));
    grow(p, look);
  }
  if (big) {
    spread(p, type, look);
    p.doors = p.filter((part) => part[1] === C.door && !part[3]);
    if (sign) signPost(p, type, big);
  }
  if (type !== 'camp' && type !== 'monument') dress(p, type, look.age);
  return p;
}

/**
 * Chantier 17: where each building's sign stands (x, z on the unit tile), on the side, clear
 * of its parts; the round icon itself is drawn by `SignsView`.
 */
const SIGN_SPOTS: Partial<Record<BuildingType, [number, number]>> = {
  nest: [0.78, 0.2],
  warehouse: [-0.62, 0.42],
  pulpery: [-0.3, 0.5],
  fiberWorkshop: [0.62, 0.05],
  seedQuarry: [-0.62, 0.1],
  juiceWell: [-0.5, -0.2],
  school: [-0.62, -0.05],
  library: [0.5, 0.05],
  hut: [-0.55, 0.3],
  launchpad: [0.68, 0.1],
  seedTurret: [0.45, -0.35],
  skyTurret: [-0.4, 0.3],
  lab: [0.6, -0.3],
  trainingCamp: [0.62, 0.3],
  forge: [0.55, 0.35],
  monument: [-0.68, -0.1],
};
const SIGN_HEIGHT = 0.5;

function signPost(p: Parts, type: BuildingType, spot?: [number, number]): void {
  const [x, z] = spot ?? SIGN_SPOTS[type] ?? [0.55, 0.4];
  p.push([cyl(5), C.woodDark, m(x, SIGN_HEIGHT / 2, z, 0.022, SIGN_HEIGHT, 0.022)]);
  p.sign = new Vector3(x, SIGN_HEIGHT + 0.16, z);
}

/**
 * Levels 4–12 (chantiers 08, 30 and 33): the recipe of the age, a little bigger with each age
 * and each tier.
 */
function grow(p: Parts, look: Look): void {
  const k = 1 + 0.05 * look.age + 0.015 * (look.tier - 1);
  const scale = new Matrix4().makeScale(k, k, k);
  for (const part of p) part[2] = part[2].clone().premultiply(scale);
  for (const r of p.rigs ?? []) r.pivot.multiplyScalar(k);
  for (const e of p.emitters ?? []) e.at = [e.at[0] * k, e.at[1] * k, e.at[2] * k];
  p.sign?.multiplyScalar(k);
}

/**
 * Chantier 17: the family colours (roofs, signature parts) keep their hue in every age; only
 * the material changes — glazed and a little darker at the Iron age, sheet metal at the
 * Industrial age (a quarter of the way to grey). Wood darkens, walls get lighter.
 */
const FAMILY_COLORS: ReadonlySet<string> = new Set([
  C.leaf,
  C.leafDark,
  C.fiberRoof,
  C.fiberRoofDark,
  C.seedRoof,
  C.seedRoofDark,
  C.juiceRoof,
  C.juiceRoofDark,
  C.slate,
  C.slateDark,
  C.blueRoof,
  C.blueRoofDark,
  C.copper,
]);
const AGE_MATERIALS: readonly Partial<Record<string, string>>[] = [
  {},
  {},
  { [C.wood]: '#93704f', [C.lightWood]: '#c19a68', [C.storeWood]: '#5f402a' },
  {
    [C.wood]: '#8a6a50',
    [C.lightWood]: '#b8956c',
    [C.storeWood]: '#574032',
    [C.cream]: '#ebdcc4',
    [C.guardStone]: '#a3a6a6',
  },
];
const METAL = new Color('#8a949b');
const ageColors = new Map<string, string>();

function ageColor(hex: string, age: number): string {
  if (age < 2) return hex;
  const key = `${hex}:${age}`;
  let out = ageColors.get(key);
  if (!out) {
    const swap = AGE_MATERIALS[Math.min(age, AGE_MATERIALS.length - 1)]![hex];
    if (swap) out = swap;
    else if (FAMILY_COLORS.has(hex)) {
      const c = new Color(hex);
      out = '#' + (age >= 3 ? c.lerp(METAL, 0.25) : c.multiplyScalar(0.88)).getHexString();
    } else out = hex;
    ageColors.set(key, out);
  }
  return out;
}

/**
 * The village changes with the age (chantier 08): a stone plinth (Stone age), an iron lantern
 * and glazed roofs (Iron age), a smoking brick chimney and metal roofs (Industrial age).
 */
function dress(p: Parts, type: BuildingType, age: number): void {
  if (age <= 0) return;
  for (const part of p) part[1] = ageColor(part[1], age);
  const turret = type === 'seedTurret' || type === 'skyTurret';
  p.push([cyl(6), PLINTHS[age]!, m(0, 0.012, 0, 0.6, 0.024, 0.6)]);
  if (age >= 2 && !turret && type !== 'nest') lamp(p, age, -0.5, 0.38, `lamp${age}`);
  if (age >= 3 && !turret && !OWN_CHIMNEY.has(type)) {
    const x = -0.38;
    const z = -0.42;
    p.push([box(), C.brick, m(x, 0.3, z, 0.1, 0.6, 0.1)]);
    p.push([box(), C.ironDark, m(x, 0.61, z, 0.12, 0.03, 0.12)]);
    emitter(p, { kind: 'smoke', at: [x, 0.66, z], rate: 0.7, ambient: true });
  }
}

/** The ground under a building, by age (dry stones, paving, a steel-edged slab). */
const PLINTHS = ['', A.drystoneDark, C.stoneDark, '#8f918d'];

/** Recipes that place their own chimney (or need none). */
const OWN_CHIMNEY: ReadonlySet<BuildingType> = new Set(BUILDING_TYPES.filter((t) => t !== 'lab'));

/**
 * Chantier 30: the reserve heaped by a warehouse (sacks, crates, a pulp mound, a seed pile, a
 * juice barrel), in three sizes; drawn beside the warehouse, in its local space.
 */
export function reserveHeapGeometry(size: 1 | 2 | 3): BufferGeometry {
  const key = `heap:${size}`;
  let g = cache.get(key);
  if (!g) {
    const x = 0.5;
    const z = 0.48;
    const p: Parts = [];
    p.push([sphere(7, 5), C.cream, m(x, 0.07, z, 0.11, 0.09, 0.1)]);
    p.push([box(), C.storeWood, m(x - 0.16, 0.06, z + 0.04, 0.12, 0.12, 0.12, 0, 0.4)]);
    if (size >= 2) {
      p.push([sphere(7, 5), C.pulp, m(x + 0.08, 0.03, z - 0.17, 0.14, 0.09, 0.12)]);
      p.push([cyl(8), C.juice, m(x + 0.17, 0.08, z + 0.06, 0.07, 0.16, 0.07)]);
      p.push([cyl(8), C.woodDark, m(x + 0.17, 0.165, z + 0.06, 0.075, 0.015, 0.075)]);
    }
    if (size >= 3) {
      p.push([box(), C.storeWood, m(x - 0.15, 0.18, z + 0.03, 0.1, 0.1, 0.1, 0, 0.9)]);
      p.push([cone(7), C.seed, m(x - 0.06, 0.06, z - 0.2, 0.1, 0.12, 0.1)]);
      p.push([sphere(7, 5), C.cream, m(x - 0.02, 0.15, z + 0.12, 0.09, 0.08, 0.08)]);
      p.push([sphere(7, 5), C.fur, m(x + 0.02, 0.06, z + 0.2, 0.1, 0.08, 0.09)]);
    }
    g = bake(p);
    cache.set(key, g);
  }
  return g;
}

/** The whole model merged in its rest pose (construction ghosts). */
export function buildingGeometry(
  type: BuildingType,
  level: number,
  shipAway = false,
  age = 0,
): BufferGeometry {
  const key = `${type}:${level}:${age}${shipAway ? ':away' : ''}`;
  let g = cache.get(key);
  if (!g) {
    g = bake(partsOf(type, level, shipAway, age));
    cache.set(key, g);
  }
  return g;
}

/** Static geometry plus the animated rigs of a building. */
export function buildingModel(
  type: BuildingType,
  level: number,
  shipAway = false,
  age = 0,
): BuildingModel {
  const key = `${type}:${level}:${age}${shipAway ? ':away' : ''}`;
  let model = models.get(key);
  if (!model) {
    model = modelOf(partsOf(type, level, shipAway, age));
    models.set(key, model);
  }
  return model;
}

/** Chantier 33: the model without its sign post, for the interface's pictures. */
export function buildingPicture(type: BuildingType, level: number, colonyAge = 0): BuildingModel {
  const key = `${type}:${level}:${colonyAge}:picture`;
  let model = models.get(key);
  if (!model) {
    model = modelOf(partsOf(type, level, false, colonyAge, false));
    models.set(key, model);
  }
  return model;
}

/** The flying mechanical bird of a ship generation (wings as rigs, centred on its body). */
export function shipModel(gen: ShipId): BuildingModel {
  const key = `ship:${gen}`;
  let model = models.get(key);
  if (!model) {
    const p: Parts = [];
    bird(p, gen, false);
    model = modelOf(p);
    models.set(key, model);
  }
  return model;
}

function modelOf(parts: Parts): BuildingModel {
  const geometry = bake(parts.filter((part) => !part[3]));
  const used = (parts.rigs ?? []).filter((r) => parts.some((part) => part[3] === r.name));
  const rigs = used.map((r) => ({
    geometry: bake(
      parts.filter((part) => part[3] === r.name),
      r.pivot,
    ),
    pivot: r.pivot.clone().multiplyScalar(MODEL_SCALE),
    motion: r.motion,
  }));
  const whole = bake(parts);
  const height = whole.boundingBox!.max.y;
  whole.dispose();
  const rigNames = used.map((r) => r.name);
  const emitters = (parts.emitters ?? []).map((e) => ({
    kind: e.kind,
    at: new Vector3(...e.at).multiplyScalar(MODEL_SCALE),
    rate: e.rate ?? 0,
    rig: e.rig ? rigNames.indexOf(e.rig) : -1,
    count: e.count ?? 1,
    phase: e.phase ?? 0,
    ambient: e.ambient ?? false,
  }));
  const sign = parts.sign ? parts.sign.clone().multiplyScalar(MODEL_SCALE) : null;
  const lights = lightSpots(parts.doors ?? [], geometry);
  return { geometry, rigs, emitters, height, sign, lights };
}

/** Wooden scaffolding around a construction site. */
export function scaffoldGeometry(): BufferGeometry {
  let g = cache.get('scaffold');
  if (!g) {
    const p: Parts = [];
    const r = 0.5;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      p.push([box(), C.wood, m(Math.cos(a) * r, 0.45, Math.sin(a) * r, 0.05, 0.9, 0.05)]);
    }
    for (const y of [0.3, 0.75]) {
      p.push([box(), C.woodDark, m(0, y, r * 0.71, r * 1.42, 0.04, 0.04)]);
      p.push([box(), C.woodDark, m(0, y, -r * 0.71, r * 1.42, 0.04, 0.04)]);
      p.push([box(), C.woodDark, m(r * 0.71, y, 0, 0.04, 0.04, r * 1.42)]);
      p.push([box(), C.woodDark, m(-r * 0.71, y, 0, 0.04, 0.04, r * 1.42)]);
    }
    p.push([box(), C.straw, m(0.35, 0.05, 0.45, 0.3, 0.06, 0.12, 0, 0.3, 0)]);
    p.push([box(), C.straw, m(0.33, 0.11, 0.45, 0.28, 0.06, 0.12, 0, 0.1, 0)]);
    g = bake(p);
    cache.set('scaffold', g);
  }
  return g;
}

/** A small wooden stake with a ribbon marking a planned (queued) construction. */
export function stakeGeometry(): BufferGeometry {
  let g = cache.get('stake');
  if (!g) {
    g = bake([
      [box(), C.wood, m(0, 0.25, 0, 0.05, 0.5, 0.05)],
      [box(), C.flagGold, m(0.08, 0.42, 0, 0.16, 0.08, 0.015)],
      [ico(), C.stoneDark, m(0, 0.03, 0, 0.08, 0.05, 0.08)],
    ]);
    cache.set('stake', g);
  }
  return g;
}

const FORWARD = new Vector3(0, 0, 1);
const raycaster = new Raycaster();

/**
 * Chantier 23: where a building glows at night, found from its doors (every model has one).
 * The door pane lights the doorway; a window is tried on each side of the door and kept only
 * where a ray finds the wall right behind it (no window floating beside a narrow front).
 */
function lightSpots(doorParts: Part[], geometry: BufferGeometry): BuildingModel['lights'] {
  const doors: Matrix4[] = [];
  const windows: Matrix4[] = [];
  const mesh = new Mesh(geometry);
  const pos = new Vector3();
  const quat = new Quaternion();
  const size = new Vector3();
  const scale = new Matrix4().makeScale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  for (const [, , matrix] of doorParts) {
    matrix.decompose(pos, quat, size);
    // The thin side of the door box is its facing; it faces away from the building's middle.
    const thinX = Math.abs(size.x) < Math.abs(size.z);
    const normal = new Vector3(thinX ? 1 : 0, 0, thinX ? 0 : 1).applyQuaternion(quat);
    normal.y = 0;
    if (normal.lengthSq() < 0.01) continue;
    normal.normalize();
    if (normal.x * pos.x + normal.z * pos.z < 0) normal.negate();
    const width = Math.abs(thinX ? size.z : size.x);
    const height = Math.abs(size.y);
    const thick = Math.abs(thinX ? size.x : size.z);
    const facing = new Quaternion().setFromUnitVectors(FORWARD, normal);
    const at = pos.clone().addScaledVector(normal, thick / 2 + 0.006);
    doors.push(
      new Matrix4()
        .compose(at, facing, new Vector3(width * 0.62, height * 0.7, 1))
        .premultiply(scale),
    );
    // Windows: either side of the door, a little higher than its middle.
    const side = new Vector3().crossVectors(new Vector3(0, 1, 0), normal);
    const w = Math.min(0.085, Math.max(0.05, width * 0.5));
    for (const k of [-1, 1]) {
      const spot = pos
        .clone()
        .addScaledVector(side, k * (width / 2 + w * 0.9 + 0.03))
        .setY(pos.y + height * 0.12);
      const origin = spot.clone().addScaledVector(normal, 0.18).multiplyScalar(MODEL_SCALE);
      raycaster.set(origin, normal.clone().negate());
      raycaster.far = 0.36 * MODEL_SCALE;
      const hit = raycaster.intersectObject(mesh, false)[0];
      // The wall must be there and face the same way (not a roof or a post).
      if (!hit?.face || hit.face.normal.dot(normal) < 0.7) continue;
      const wall = hit.point.clone().addScaledVector(normal, 0.008);
      windows.push(
        new Matrix4().compose(
          wall,
          facing,
          new Vector3(w * MODEL_SCALE, w * 1.15 * MODEL_SCALE, 1),
        ),
      );
    }
  }
  return { doors, windows };
}
