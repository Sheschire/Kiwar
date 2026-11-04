import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { motherVineAt, type FaceMap, type GameState } from '@kiwar/shared';
import { domeShape } from './terrain';

/**
 * Chantier 52: the Mother Vine, once the Great Weevil has fallen. A glowing liana leaves the
 * bottom of our half (the stem, under the core) and runs far out into space, towards the
 * cosmic Orchard where the other fruit-planets hang (chantier 54). Hidden until found.
 */

/** Its curve, from the bottom pole of the dome out into space (world units). */
function vineCurve(map: FaceMap): CatmullRomCurve3 {
  const d = domeShape(map);
  const pole = d.top - d.ay;
  return new CatmullRomCurve3([
    new Vector3(0, pole + 0.5, 0),
    new Vector3(0.5, pole - 6, 1.5),
    new Vector3(-4, pole - 22, 10),
    new Vector3(8, pole - 48, 34),
    new Vector3(36, pole - 82, 80),
    new Vector3(90, pole - 120, 150),
  ]);
}

export class MotherVine {
  readonly group = new Group();
  private readonly glow: MeshBasicMaterial;
  private readonly core: MeshStandardMaterial;
  private shown = false;
  private time = 0;

  constructor(map: FaceMap) {
    const curve = vineCurve(map);
    this.core = new MeshStandardMaterial({
      color: '#5f9a2c',
      emissive: new Color('#9fe060'),
      emissiveIntensity: 0.7,
      roughness: 0.6,
      flatShading: true,
    });
    this.glow = new MeshBasicMaterial({
      color: '#7fc03a',
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new Mesh(new TubeGeometry(curve, 160, 0.55, 7, false), this.core));
    const halo = new Mesh(new TubeGeometry(curve, 120, 1.4, 8, false), this.glow);
    halo.renderOrder = 2;
    this.group.add(halo);
    // Buds of light along it, like fruits to come.
    const bud = new SphereGeometry(0.9, 8, 6);
    for (const u of [0.18, 0.37, 0.55, 0.72, 0.88]) {
      const m = new Mesh(bud, this.glow);
      m.position.copy(curve.getPointAt(u));
      m.scale.setScalar(1 + u * 1.5);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  /** Shown once the Mother Vine is found. */
  sync(state: GameState): void {
    const shown = motherVineAt(state) !== null;
    if (shown === this.shown) return;
    this.shown = shown;
    this.group.visible = shown;
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.6);
    this.glow.opacity = 0.12 + 0.12 * pulse;
    this.core.emissiveIntensity = 0.55 + 0.35 * pulse;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.glow.dispose();
    this.core.dispose();
  }
}
