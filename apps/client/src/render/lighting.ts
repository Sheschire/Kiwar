import { DirectionalLight, Group, HemisphereLight, Object3D, Vector3 } from 'three';
import type { SkyState } from './dayCycle';
import { PALETTE } from './palette';

/** Warm late-afternoon sun with soft coloured ambient light. */
export class Lighting {
  readonly group = new Group();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** Chantier 23: warm back light of the golden hours (no shadow, no extra pass). */
  readonly rim: DirectionalLight;
  private readonly target = new Object3D();
  /** Where the sun's shadows fall: home (origin) or a visited planet (chantier 59). */
  private readonly center = new Vector3();
  private homeRadius = 30;

  constructor() {
    this.hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.35);
    this.sun = new DirectionalLight(PALETTE.sun, 2.6);
    this.sun.position.set(-22, 34, 16);
    this.sun.target = this.target;
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.rim = new DirectionalLight('#ffc070', 0);
    this.rim.target = this.target;
    this.group.add(this.hemi, this.sun, this.rim, this.target);
  }

  /** Colours, intensities and direction of the day/night cycle. */
  applySky(sky: SkyState): void {
    this.sun.color.copy(sky.sun);
    this.sun.intensity = sky.sunIntensity;
    this.sun.position.copy(sky.lightDir).multiplyScalar(45).add(this.center);
    this.hemi.color.copy(sky.hemiSky);
    this.hemi.groundColor.copy(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity;
    this.rim.color.copy(sky.rim);
    this.rim.intensity = sky.rimIntensity;
    this.rim.position.copy(sky.rimDir).multiplyScalar(45).add(this.center);
  }

  /** Low quality: no rim light (one light less in every lit shader). */
  setRim(on: boolean): void {
    this.rim.visible = on;
  }

  /**
   * Chantier 59: the sun's shadows over a visited planet (its centre and world radius), or back
   * home (null). The next `applySky` moves the sun; refresh the shadow map after.
   */
  focus(center: Vector3 | null, radius = 0): void {
    if (center) this.center.copy(center);
    else this.center.set(0, 0, 0);
    this.target.position.copy(this.center);
    this.target.updateMatrixWorld();
    this.setFrustum(center ? radius : this.homeRadius);
  }

  /** Fits the shadow camera to a disc of the given radius (home). */
  fit(radius: number): void {
    this.homeRadius = radius;
    this.setFrustum(radius);
  }

  private setFrustum(radius: number): void {
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
