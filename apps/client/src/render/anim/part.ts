import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type BufferGeometry,
  type Material,
  type Matrix4,
} from 'three';

/**
 * Chantier 34: one kind of body part, drawn for every creature that has it this frame (one
 * instanced mesh). `push` per instance, `end` once per frame: the count is set and an
 * unused part is hidden (no draw call).
 */
export class Part {
  readonly mesh: InstancedMesh;
  count = 0;
  constructor(geometry: BufferGeometry, material: Material, max: number, colors = false) {
    this.mesh = new InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    if (colors) this.mesh.setColorAt(0, new Color(1, 1, 1));
  }
  push(m: Matrix4, color?: Color): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.count, m);
    if (color) this.mesh.setColorAt(this.count, color);
    this.count++;
  }
  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.count = 0;
  }
}
