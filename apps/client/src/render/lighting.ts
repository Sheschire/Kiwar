import { DirectionalLight, Group, HemisphereLight, Object3D } from 'three';
import { PALETTE } from './palette';

/** Warm late-afternoon sun with soft coloured ambient light. */
export class Lighting {
  readonly group = new Group();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly target = new Object3D();

  constructor() {
    this.hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.35);
    this.sun = new DirectionalLight(PALETTE.sun, 2.6);
    this.sun.position.set(-22, 34, 16);
    this.sun.target = this.target;
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.group.add(this.hemi, this.sun, this.target);
  }

  /** Fits the shadow camera to a disc of the given radius. */
  fit(radius: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
  }

  setShadowMapSize(size: number): void {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }
}
