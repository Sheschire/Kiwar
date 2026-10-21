import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';

const MAX_LIT = 320;
const MAX_DARK = 320;
/** By day a lit doorway is just the door; at night a warm lamplight bright enough to bloom. */
const DAY_PANE = new Color('#46352b');
const NIGHT_PANE = new Color('#ffb661').multiplyScalar(2.6);
const DARK_PANE = new Color('#3a2e29');

export interface WindowSpots {
  /** World matrix of the building (position and rotation). */
  world: Matrix4;
  doors: readonly Matrix4[];
  windows: readonly Matrix4[];
  lit: boolean;
}

/**
 * Chantier 23: windows and doorways that light up at dusk where kiwis sleep or work (an empty
 * building stays dark). Two instanced meshes for the whole colony (lit and dark panes), no real
 * light: the bloom makes the halo. Matrices are rebuilt only when the buildings or who is home
 * change; the night only changes one material colour.
 */
export class WindowsView {
  readonly group = new Group();
  private readonly lit: InstancedMesh;
  private readonly dark: InstancedMesh;
  private readonly litMaterial = new MeshBasicMaterial({ color: DAY_PANE.clone() });
  private readonly m = new Matrix4();
  private glow = -1;

  constructor() {
    const plane = new PlaneGeometry(1, 1);
    this.lit = new InstancedMesh(plane, this.litMaterial, MAX_LIT);
    this.dark = new InstancedMesh(plane, new MeshBasicMaterial({ color: DARK_PANE }), MAX_DARK);
    for (const mesh of [this.lit, this.dark]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  sync(buildings: readonly WindowSpots[]): void {
    let lit = 0;
    let dark = 0;
    for (const b of buildings) {
      if (b.lit) {
        for (const d of b.doors) {
          if (lit >= MAX_LIT) break;
          this.lit.setMatrixAt(lit++, this.m.multiplyMatrices(b.world, d));
        }
      }
      for (const w of b.windows) {
        if (b.lit && lit < MAX_LIT)
          this.lit.setMatrixAt(lit++, this.m.multiplyMatrices(b.world, w));
        else if (!b.lit && dark < MAX_DARK)
          this.dark.setMatrixAt(dark++, this.m.multiplyMatrices(b.world, w));
      }
    }
    this.lit.count = lit;
    this.dark.count = dark;
    this.lit.instanceMatrix.needsUpdate = true;
    this.dark.instanceMatrix.needsUpdate = true;
  }

  /** 0 by day, 1 when the lamps are fully lit (from dusk to dawn). */
  setGlow(glow: number): void {
    const g = Math.round(glow * 50) / 50;
    if (g === this.glow) return;
    this.glow = g;
    this.litMaterial.color.copy(DAY_PANE).lerp(NIGHT_PANE, g);
  }

  dispose(): void {
    this.lit.geometry.dispose();
    this.litMaterial.dispose();
    (this.dark.material as MeshBasicMaterial).dispose();
  }
}
