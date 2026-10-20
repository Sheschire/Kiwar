import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';

/** Pose of a Kikiwiwi for one frame, taken from its agent in `KiwisView`. */
export interface TitanPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Walk cycle phase (radians). */
  phase: number;
  moving: boolean;
  /** Stomping (titan works, chantier 08) or resting. */
  activity: 'walk' | 'work' | 'idle' | 'build' | 'drop' | 'sleep';
  /** Size multiplier (stats). */
  scale: number;
  /** No juice left at home: dimmer veins, heavier steps. */
  weak: boolean;
}

interface Figure {
  root: Group;
  body: Group;
  legs: [Group, Group];
  drops: Mesh[];
  dropT: number[];
}

const VEIN = new Color('#7dff6a');

/**
 * The Kikiwiwis (chantier 08): kiwis swollen with planet juice. Bigger and taller than the
 * others, darker feathers, green veins pulsing on the body, glowing eyes, heavy steps, and a
 * trail of juice drops. One small group of meshes per Kikiwiwi (there are at most two).
 */
export class TitansView {
  readonly group = new Group();
  private readonly figures = new Map<string, Figure>();
  private readonly geo = {
    body: new SphereGeometry(1, 14, 10),
    head: new SphereGeometry(1, 12, 9),
    beak: new ConeGeometry(1, 1, 6),
    eye: new SphereGeometry(1, 8, 6),
    leg: new CylinderGeometry(1, 0.8, 1, 6).translate(0, -0.5, 0),
    toe: new ConeGeometry(1, 1, 4),
    vein: new TorusGeometry(1, 0.11, 5, 20, Math.PI * 1.15),
    drop: new SphereGeometry(1, 6, 5),
  } satisfies Record<string, BufferGeometry>;
  private readonly mat = {
    feathers: new MeshStandardMaterial({ color: '#45402a', roughness: 0.9, flatShading: true }),
    belly: new MeshStandardMaterial({ color: '#5e4a2f', roughness: 0.9, flatShading: true }),
    beak: new MeshStandardMaterial({ color: '#d8b46a', roughness: 0.7, flatShading: true }),
    leg: new MeshStandardMaterial({ color: '#b98a4a', roughness: 0.8, flatShading: true }),
    vein: new MeshStandardMaterial({
      color: '#3f8f2c',
      emissive: VEIN.clone(),
      emissiveIntensity: 0.9,
      roughness: 0.5,
    }),
    eye: new MeshBasicMaterial({ color: '#b8ff7a', toneMapped: false }),
    drop: new MeshBasicMaterial({ color: '#c6f04a', transparent: true, opacity: 0.85 }),
  };
  private time = 0;

  /** Shows exactly these Kikiwiwis (by villager id). */
  keep(ids: ReadonlySet<string>): void {
    for (const [id, f] of this.figures) {
      if (ids.has(id)) continue;
      this.group.remove(f.root);
      this.figures.delete(id);
    }
  }

  private part(parent: Group, geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial) {
    const m = new Mesh(geo, mat);
    m.castShadow = mat instanceof MeshStandardMaterial;
    parent.add(m);
    return m;
  }

  private create(): Figure {
    const root = new Group();
    const body = new Group();
    root.add(body);
    // Body: a tall, broad kiwi.
    const torso = this.part(body, this.geo.body, this.mat.feathers);
    torso.scale.set(0.24, 0.24, 0.29);
    torso.position.set(0, 0.3, 0);
    const belly = this.part(body, this.geo.body, this.mat.belly);
    belly.scale.set(0.2, 0.18, 0.2);
    belly.position.set(0, 0.24, 0.07);
    const head = this.part(body, this.geo.head, this.mat.feathers);
    head.scale.set(0.12, 0.115, 0.12);
    head.position.set(0, 0.46, 0.22);
    const beak = this.part(body, this.geo.beak, this.mat.beak);
    beak.scale.set(0.028, 0.34, 0.028);
    beak.position.set(0, 0.4, 0.44);
    beak.rotation.x = Math.PI / 2 + 0.5;
    for (const side of [-1, 1]) {
      const eye = this.part(body, this.geo.eye, this.mat.eye);
      eye.scale.setScalar(0.032);
      eye.position.set(side * 0.075, 0.49, 0.31);
    }
    // Veins of juice wrapped around the body.
    const veins: [number, number, number, number, number, number][] = [
      [0.17, 0.32, 0.12, 0.13, 0.4, 0.2],
      [-0.17, 0.3, 0.05, 0.14, -0.5, 2.4],
      [0.05, 0.42, -0.17, 0.15, 1.3, 0.8],
      [-0.08, 0.2, 0.2, 0.12, 0.2, -1.1],
      [0.2, 0.24, -0.1, 0.11, -1.2, 1.9],
      [-0.2, 0.36, -0.12, 0.12, 0.9, -2.2],
      [0, 0.5, 0.05, 0.12, 1.57, 0],
      [0.06, 0.48, 0.24, 0.07, 0.3, 1.2],
    ];
    for (const [x, y, z, r, rx, ry] of veins) {
      const v = this.part(body, this.geo.vein, this.mat.vein);
      v.scale.setScalar(r);
      v.position.set(x, y, z);
      v.rotation.set(rx, ry, 0);
      v.castShadow = false;
    }
    // Thick legs with clawed toes.
    const legs: Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new Group();
      leg.position.set(side * 0.1, 0.2, 0.02);
      const shin = this.part(leg, this.geo.leg, this.mat.leg);
      shin.scale.set(0.035, 0.2, 0.035);
      for (const a of [-0.5, 0, 0.5]) {
        const toe = this.part(leg, this.geo.toe, this.mat.leg);
        toe.scale.set(0.018, 0.08, 0.018);
        toe.position.set(Math.sin(a) * 0.03, -0.2, Math.cos(a) * 0.04);
        toe.rotation.x = Math.PI / 2;
        toe.rotation.y = a;
      }
      root.add(leg);
      legs.push(leg);
    }
    // Juice dripping behind it.
    const drops: Mesh[] = [];
    const dropT: number[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Mesh(this.geo.drop, this.mat.drop);
      d.scale.setScalar(0.025);
      d.visible = false;
      this.group.add(d);
      drops.push(d);
      dropT.push(i / 5);
    }
    this.group.add(root);
    return { root, body, legs: legs as [Group, Group], drops, dropT };
  }

  /** Places and animates one Kikiwiwi (call every frame for each one drawn). */
  pose(id: string, p: TitanPose, dt: number): void {
    let f = this.figures.get(id);
    if (!f) {
      f = this.create();
      this.figures.set(id, f);
    }
    const sc = p.scale * 1.15;
    f.root.position.set(p.x, p.y, p.z);
    f.root.rotation.y = p.heading;
    f.root.scale.setScalar(sc);
    f.root.visible = true;
    const t = this.time;
    let bob = 0;
    let pitch = 0;
    let roll = 0;
    let squash = 1 + Math.sin(t * 1.8) * 0.02; // breathing
    if (p.moving) {
      // Heavy steps: a deep bob and a sway.
      bob = Math.abs(Math.sin(p.phase * 0.7)) * 0.05;
      roll = Math.sin(p.phase * 0.7) * 0.1;
      pitch = 0.08;
    } else if (p.activity === 'build' || p.activity === 'work') {
      // Stomping: lifts, then slams down.
      const c = (t * 1.4) % 1;
      bob = c < 0.7 ? (c / 0.7) * 0.12 : (1 - (c - 0.7) / 0.3) * 0.12;
      pitch = -0.2 + (c < 0.7 ? 0 : 0.35);
      squash = c > 0.95 ? 0.9 : 1;
    } else if (p.activity === 'sleep') {
      roll = 0.9;
      bob = -0.08;
    }
    f.body.position.y = bob;
    f.body.rotation.set(pitch, 0, roll);
    f.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    for (let l = 0; l < 2; l++) {
      const swing = p.moving ? Math.sin(p.phase * 0.7 + l * Math.PI) * 0.6 : 0;
      f.legs[l]!.rotation.x = swing;
      f.legs[l]!.position.y = 0.2 + bob * 0.5;
    }
    // Drops fall behind it now and then.
    for (let i = 0; i < f.drops.length; i++) {
      const d = f.drops[i]!;
      f.dropT[i] = (f.dropT[i]! + dt * (p.moving ? 0.9 : 0.35)) % 1;
      const k = f.dropT[i]!;
      if (k < dt * 1.5) {
        // Respawn at the body, slightly behind.
        d.userData.x = p.x - Math.sin(p.heading) * 0.12 * sc + Math.sin(i * 2.1) * 0.08 * sc;
        d.userData.z = p.z - Math.cos(p.heading) * 0.12 * sc + Math.cos(i * 1.7) * 0.08 * sc;
        d.userData.y = p.y + 0.3 * sc;
      }
      if (d.userData.y === undefined) continue;
      d.visible = !p.weak || i % 2 === 0;
      d.position.set(d.userData.x, d.userData.y - k * k * 0.32 * sc, d.userData.z);
      d.scale.setScalar(0.03 * sc * (1 - k * 0.6));
    }
  }

  /** Hides a Kikiwiwi this frame (inside a building, away). */
  hide(id: string): void {
    const f = this.figures.get(id);
    if (!f) return;
    f.root.visible = false;
    for (const d of f.drops) d.visible = false;
  }

  /** Veins pulse; dimmer when the colony runs out of juice. */
  update(dt: number, weak: boolean): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    this.mat.vein.emissiveIntensity = (weak ? 0.25 : 0.7) + pulse * (weak ? 0.15 : 0.6);
    this.mat.eye.color.setHSL(0.27, 1, weak ? 0.55 : 0.65 + pulse * 0.1);
  }

  dispose(): void {
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    this.figures.clear();
  }
}
