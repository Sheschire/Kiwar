import type { Color } from 'three';
import {
  BoxGeometry,
  TorusGeometry,
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { CLASS_IDS, CLASSES, type ClassId } from '@kiwar/shared';
import { colored, mat, merged } from './geometry';
import { PROP_IDS, type Pose, type PropId } from './pose';
import { PROPS } from './props';
import { Part } from './part';

/**
 * Chantier 34: the kiwi bird as a set of instanced parts — body, head, two wings, two legs,
 * class outfit (head and body pieces), held accessory, load on the back, magic glow and blob
 * shadow — posed from a `Pose`. One draw call per part kind whatever the number of kiwis;
 * a part kind nobody uses this frame is hidden.
 */

/** Where the head turns, in the body frame (before the kiwi's scale). */
const NECK = new Vector3(0, 0.25, 0.1);
/** Where the left wing hangs (the right one is mirrored). */
const SHOULDER = new Vector3(0.165, 0.27, 0.0);
/** Grip of a held accessory, in the wing frame. */
const WING_TIP = new Vector3(0, -0.12, 0.05);
/** Height of the hips above the ground (the legs' length). */
const LEG = 0.13;

function bodyGeometry(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 12, 9), '#8a6440', mat(0, 0.2, 0, 0.19, 0.16, 0.23)),
    // A small tuft of a tail.
    colored(new ConeGeometry(1, 1, 5), '#7a5636', mat(0, 0.24, -0.22, 0.04, 0.08, 0.03, -2.1)),
  ]);
}

/** Head, beak and eyes, around the neck pivot. */
function headGeometry(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 10, 8), '#7d5a39', mat(0, 0.27, 0.17, 0.1, 0.095, 0.1)),
    colored(
      new ConeGeometry(1, 1, 6),
      '#e3c07a',
      mat(0, 0.2, 0.36, 0.022, 0.26, 0.022, Math.PI / 2 + 0.55),
    ),
    colored(new SphereGeometry(1, 6, 5), '#1a120e', mat(0.06, 0.3, 0.24, 0.018, 0.018, 0.018)),
    colored(new SphereGeometry(1, 6, 5), '#1a120e', mat(-0.06, 0.3, 0.24, 0.018, 0.018, 0.018)),
  ]).translate(-NECK.x, -NECK.y, -NECK.z);
}

/** A stubby wing hanging from its shoulder. */
function wingGeometry(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 8, 6), '#6f4f31', mat(0, -0.065, 0.01, 0.03, 0.085, 0.11, 0.25)),
  ]);
}

type OutfitPart = [geometry: BufferGeometry, onHead: boolean];

/** Chantier 37: the cape colour of each advanced or master class. */
const CAPES: Partial<Record<ClassId, string>> = {
  architect: '#d9a82e',
  navigator: '#5fa8c9',
  champion: '#c0504a',
  archmage: '#6a4fb3',
  herbalist: '#5d8a3a',
  minstrel: '#3e7fbf',
  engineer: '#b87333',
  paladin: '#f4e6c4',
  druid: '#3f6b2a',
  ranger: '#4a6b3a',
  titan: '#7a5233',
  oracle: '#2b2f6b',
};

/**
 * Chantier 37: a higher tier wears its parent's outfit with a cape down the back and a golden
 * clasp (a gold circlet too at tier 3).
 */
function tierParts(cls: ClassId): OutfitPart[] {
  const def = CLASSES[cls];
  const cape = CAPES[cls] ?? '#8a6440';
  const parts: OutfitPart[] = [
    // A cape down the back and a mantle collar over the shoulders, in the class's colour.
    [
      colored(new BoxGeometry(1, 1, 1), cape, mat(0, 0.16, -0.21, 0.24, 0.26, 0.02, 0.45, 0, 0)),
      false,
    ],
    [colored(new CylinderGeometry(1, 1, 1, 12), cape, mat(0, 0.25, 0.02, 0.205, 0.04, 0.2)), false],
    [
      colored(new SphereGeometry(1, 6, 5), '#f2c14e', mat(0, 0.25, 0.22, 0.028, 0.028, 0.02)),
      false,
    ],
  ];
  if (def.tier >= 3)
    parts.push([
      colored(
        new TorusGeometry(1, 0.15, 4, 14),
        '#f2c14e',
        mat(0, 0.36, 0.17, 0.1, 0.1, 0.1, Math.PI / 2),
      ),
      true,
    ]);
  return parts;
}

/** Class outfits, authored in the body frame; `onHead` parts follow the head. */
function outfitParts(cls: ClassId): OutfitPart[] {
  const halfSphere = () => new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const def = CLASSES[cls];
  if (def.tier > 1) return [...outfitParts(def.parents![0]!), ...tierParts(cls)];
  switch (cls) {
    case 'builder':
      return [
        [colored(halfSphere(), '#f2c14e', mat(0, 0.33, 0.17, 0.105, 0.08, 0.105)), true],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#d9a82e',
            mat(0, 0.335, 0.2, 0.12, 0.01, 0.13),
          ),
          true,
        ],
      ];
    case 'warrior':
      return [
        [colored(halfSphere(), '#a8a296', mat(0, 0.32, 0.17, 0.108, 0.09, 0.108)), true],
        [colored(new ConeGeometry(1, 1, 4), '#c0504a', mat(0, 0.43, 0.16, 0.02, 0.06, 0.02)), true],
        // Scabbard on the hip.
        [
          colored(
            new CylinderGeometry(1, 1, 1, 4),
            '#7a5233',
            mat(-0.19, 0.14, -0.04, 0.014, 0.2, 0.02, 0.9, 0, 0),
          ),
          false,
        ],
      ];
    case 'mage':
      return [
        [
          colored(
            new ConeGeometry(1, 1, 8),
            '#6a4fb3',
            mat(0, 0.45, 0.15, 0.075, 0.24, 0.075, -0.2, 0, 0),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#4a3590',
            mat(0, 0.34, 0.17, 0.13, 0.012, 0.13),
          ),
          true,
        ],
        [
          colored(
            new IcosahedronGeometry(1, 0),
            '#f2c14e',
            mat(0, 0.45, 0.205, 0.016, 0.016, 0.016),
          ),
          true,
        ],
      ];
    case 'scout':
      return [
        ...[-1, 1].map((side): OutfitPart => [
          colored(
            new CylinderGeometry(1, 1, 1, 3),
            '#c9c0ae',
            mat(side * 0.15, 0.3, -0.12, 0.08, 0.012, 0.12, 0, 0, side * 0.4),
          ),
          false,
        ]),
        [
          colored(new SphereGeometry(1, 6, 5), '#bfe3ff', mat(0.05, 0.31, 0.24, 0.03, 0.03, 0.02)),
          true,
        ],
        [
          colored(new SphereGeometry(1, 6, 5), '#bfe3ff', mat(-0.05, 0.31, 0.24, 0.03, 0.03, 0.02)),
          true,
        ],
      ];
    case 'mayor':
      return [
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#2b2522',
            mat(0, 0.42, 0.16, 0.06, 0.13, 0.06),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#2b2522',
            mat(0, 0.36, 0.16, 0.1, 0.012, 0.1),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#c0504a',
            mat(0, 0.38, 0.16, 0.062, 0.02, 0.062),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 6),
            '#c0504a',
            mat(0, 0.2, 0.02, 0.2, 0.025, 0.035, 0, 0.7, 0.9),
          ),
          false,
        ],
      ];
    // Chantier 37: a wide straw hat and a satchel across the body.
    case 'gatherer':
      return [
        [
          colored(
            new CylinderGeometry(1, 1, 1, 14),
            '#e2c47a',
            mat(0, 0.34, 0.17, 0.17, 0.01, 0.17),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(0.8, 1, 1, 12),
            '#d4b061',
            mat(0, 0.37, 0.17, 0.085, 0.06, 0.085),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 12),
            '#7aa64a',
            mat(0, 0.352, 0.17, 0.088, 0.012, 0.088),
          ),
          true,
        ],
        [
          colored(new BoxGeometry(1, 1, 1), '#8a5a35', mat(0.17, 0.12, 0.02, 0.06, 0.07, 0.09)),
          false,
        ],
      ];
    // Chantier 37: a soft beret with a long feather.
    case 'bard':
      return [
        [
          colored(
            new SphereGeometry(1, 10, 6),
            '#3e7fbf',
            mat(0.02, 0.35, 0.15, 0.115, 0.04, 0.11, 0, 0, -0.2),
          ),
          true,
        ],
        [
          colored(
            new ConeGeometry(1, 1, 4),
            '#f2c14e',
            mat(-0.07, 0.42, 0.11, 0.012, 0.16, 0.006, -0.6, 0, 0.5),
          ),
          true,
        ],
        [
          colored(
            new CylinderGeometry(1, 1, 1, 6),
            '#c0504a',
            mat(0, 0.2, 0.02, 0.2, 0.02, 0.03, 0, -0.7, 0.9),
          ),
          false,
        ],
      ];
  }
  return [];
}

function outfitGeometry(cls: ClassId, onHead: boolean): BufferGeometry | null {
  const parts = outfitParts(cls)
    .filter(([, head]) => head === onHead)
    .map(([g]) => g);
  if (parts.length === 0) return null;
  const g = merged(parts);
  return onHead ? g.translate(-NECK.x, -NECK.y, -NECK.z) : g;
}

/** One kiwi to draw this frame. */
export interface KiwiDraw {
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
  pose: Pose;
  tint: Color;
  classId: ClassId | null;
  /** Colour of the load on the back, or none. */
  load: Color | null;
}

export class KiwiRig {
  readonly group = new Group();
  private readonly body: Part;
  private readonly head: Part;
  private readonly wings: Part;
  private readonly legs: Part;
  private readonly shadows: Part;
  private readonly loads: Part;
  private readonly glows: Part;
  private readonly outfitHead = new Map<ClassId, Part>();
  private readonly outfitBody = new Map<ClassId, Part>();
  private readonly props = new Map<PropId, Part>();
  private readonly parts: Part[] = [];
  private readonly materials: Material[] = [];
  private readonly root = new Matrix4();
  private readonly bodyM = new Matrix4();
  private readonly local = new Matrix4();
  private readonly out = new Matrix4();
  private readonly wingM = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly one = new Vector3(1, 1, 1);

  constructor(max: number) {
    const feathers = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    const cloth = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      flatShading: true,
    });
    const legs = new MeshStandardMaterial({ color: '#d9a35f', roughness: 0.8 });
    const shadow = new MeshBasicMaterial({
      color: '#2b1a24',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const load = new MeshStandardMaterial({ roughness: 0.6 });
    const glow = new MeshBasicMaterial({
      color: '#c9b4ff',
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push(feathers, cloth, legs, shadow, load, glow);
    const add = (p: Part) => {
      this.parts.push(p);
      this.group.add(p.mesh);
      return p;
    };
    this.body = add(new Part(bodyGeometry(), feathers, max, true));
    this.head = add(new Part(headGeometry(), feathers, max, true));
    this.wings = add(new Part(wingGeometry(), feathers, max * 2, true));
    this.legs = add(
      new Part(new CylinderGeometry(0.014, 0.012, LEG, 5).translate(0, -LEG / 2, 0), legs, max * 2),
    );
    this.shadows = add(new Part(new CircleGeometry(0.2, 16).rotateX(-Math.PI / 2), shadow, max));
    this.shadows.mesh.renderOrder = 1;
    this.loads = add(new Part(new IcosahedronGeometry(0.075, 0), load, max, true));
    this.glows = add(new Part(new SphereGeometry(1, 10, 8), glow, max));
    for (const cls of CLASS_IDS) {
      const h = outfitGeometry(cls, true);
      const b = outfitGeometry(cls, false);
      if (h) this.outfitHead.set(cls, add(new Part(h, cloth, max)));
      if (b) this.outfitBody.set(cls, add(new Part(b, cloth, max)));
    }
    for (const id of PROP_IDS) this.props.set(id, add(new Part(PROPS[id].geometry(), cloth, max)));
  }

  /** Draws one kiwi; call between frames' `end()`s, in any order. */
  draw(k: KiwiDraw): void {
    const p = k.pose;
    const sc = k.scale;
    // Root: on the ground, turned to the heading.
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), k.heading);
    this.root.compose(this.v.set(k.x, k.y, k.z), this.q, this.s.set(sc, sc, sc));

    // Body: lifted by the legs (folded when sitting), then bob, turn, bend and roll.
    const lift = LEG * 0.85 * (1 - 0.75 * p.sit) + p.bob;
    this.e.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(0, lift, 0), this.q, this.s.set(1, p.squash, 1));
    this.bodyM.multiplyMatrices(this.root, this.local);
    this.body.push(this.bodyM, k.tint);
    if (k.classId) this.outfitBody.get(k.classId)?.push(this.bodyM);

    // Head.
    this.e.set(p.headPitch, p.headYaw, p.headRoll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(NECK, this.q, this.one);
    this.out.multiplyMatrices(this.bodyM, this.local);
    this.head.push(this.out, k.tint);
    if (k.classId) this.outfitHead.get(k.classId)?.push(this.out);

    // Wings: raised outward about the body's length, swung forward about its width.
    for (const side of [1, -1] as const) {
      const raise = side === 1 ? p.wingL : p.wingR;
      const fwd = side === 1 ? p.wingLF : p.wingRF;
      this.e.set(-fwd, 0, side * raise, 'XYZ');
      this.q.setFromEuler(this.e);
      this.local.compose(this.v.set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z), this.q, this.one);
      this.wingM.multiplyMatrices(this.bodyM, this.local);
      this.wings.push(this.wingM, k.tint);
      if (side === -1 && p.prop) this.drawProp(p.prop, p);
    }

    // Legs: swing, and fold under a sitting kiwi.
    for (const side of [1, -1] as const) {
      const swing = side === 1 ? p.legL : p.legR;
      this.e.set(swing, 0, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      const fold = 1 - 0.8 * p.sit;
      this.local.compose(
        this.v.set(side * 0.06, LEG * 0.9 * (1 - 0.75 * p.sit) + p.bob, 0),
        this.q,
        this.s.set(1, fold, 1),
      );
      this.out.multiplyMatrices(this.root, this.local);
      this.legs.push(this.out);
    }

    // Blob shadow (smaller when hopping).
    const shrink = Math.max(0.5, 1 - p.bob * 2);
    this.out.compose(
      this.v.set(k.x, k.y + 0.012, k.z),
      this.q.identity(),
      this.s.set(sc * shrink, 1, sc * shrink),
    );
    this.shadows.push(this.out);

    // Load on the back.
    if (k.load) {
      this.local.makeTranslation(0, 0.36, -0.06);
      this.out.multiplyMatrices(this.bodyM, this.local);
      this.loads.push(this.out, k.load);
    }
  }

  /** The accessory (and its companion) at its anchor; the wing matrix is the right wing's. */
  private drawProp(id: PropId, p: Pose): void {
    const def = PROPS[id];
    const at =
      def.anchor === 'wing'
        ? this.out
            .multiplyMatrices(
              this.wingM,
              this.local.makeTranslation(WING_TIP.x, WING_TIP.y, WING_TIP.z),
            )
            .multiply(this.local.makeRotationX(-p.propSwing))
        : this.out.copy(def.anchor === 'front' ? this.bodyM : this.root);
    this.props.get(id)!.push(at);
    if (p.glow > 0.02) {
      const r = 0.05 + p.glow * 0.07;
      this.local.compose(def.tip, this.q.identity(), this.s.set(r, r, r));
      this.glows.push(this.local.premultiply(at));
    }
    if (def.companion) {
      const c = PROPS[def.companion];
      this.props
        .get(def.companion)!
        .push(c.anchor === 'front' ? this.bodyM : c.anchor === 'ground' ? this.root : at);
    }
  }

  /** Closes the frame: instance counts set, unused part kinds hidden. */
  end(): void {
    for (const p of this.parts) p.end();
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
