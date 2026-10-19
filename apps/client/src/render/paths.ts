import {
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { createRng, getTile, parseHexKey, type FaceMap, type Tile } from '@kiwar/shared';
import { HEX_VISUAL_RADIUS, worldPosition } from './terrain';

const MAX_PATHS = 200;
const PEBBLES = 3;
const MAX_PREVIEW = 400;

/**
 * Player paths: a sandy slab with a few flat stepping stones on each path tile, plus the live
 * preview of the tiles being painted (green to add, red to erase).
 */
export class PathsView {
  readonly group = new Group();
  private readonly slabs: InstancedMesh;
  private readonly pebbles: InstancedMesh;
  private readonly preview: InstancedMesh;
  private readonly previewMaterial: MeshBasicMaterial;
  private signature = '';
  private readonly m = new Matrix4();

  constructor(private readonly map: FaceMap) {
    this.slabs = new InstancedMesh(
      new CylinderGeometry(HEX_VISUAL_RADIUS * 0.8, HEX_VISUAL_RADIUS * 0.84, 0.05, 6),
      new MeshStandardMaterial({ color: '#e3cf9c', roughness: 1, flatShading: true }),
      MAX_PATHS,
    );
    this.pebbles = new InstancedMesh(
      new IcosahedronGeometry(1, 0),
      new MeshStandardMaterial({ color: '#c8bba0', roughness: 0.9, flatShading: true }),
      MAX_PATHS * PEBBLES,
    );
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
    for (const mesh of [this.slabs, this.pebbles, this.preview]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.slabs.receiveShadow = true;
    this.pebbles.receiveShadow = true;
  }

  sync(paths: readonly string[]): void {
    const sig = paths.join(';');
    if (sig === this.signature) return;
    this.signature = sig;
    let n = 0;
    let p = 0;
    const q = new Quaternion();
    const e = new Euler();
    for (const key of paths.slice(0, MAX_PATHS)) {
      const tile = getTile(this.map, parseHexKey(key));
      if (!tile) continue;
      const pos = worldPosition(tile);
      this.m.makeTranslation(pos.x, tile.height + 0.01, pos.z);
      this.slabs.setMatrixAt(n++, this.m);
      const rng = createRng(`path/${key}`);
      for (let i = 0; i < PEBBLES; i++) {
        const a = (i / PEBBLES) * Math.PI * 2 + rng.range(0, 1);
        const d = rng.range(0.15, 0.42);
        const s = rng.range(0.13, 0.2);
        q.setFromEuler(e.set(0, rng.range(0, Math.PI), 0));
        this.m.compose(
          new Vector3(pos.x + Math.cos(a) * d, tile.height + 0.045, pos.z + Math.sin(a) * d),
          q,
          new Vector3(s, 0.035, s * 0.8),
        );
        this.pebbles.setMatrixAt(p++, this.m);
      }
    }
    this.slabs.count = n;
    this.pebbles.count = p;
    this.slabs.instanceMatrix.needsUpdate = true;
    this.pebbles.instanceMatrix.needsUpdate = true;
  }

  setPreview(tiles: readonly Tile[], erase: boolean): void {
    this.previewMaterial.color.set(erase ? '#ff7a6b' : '#9be15d');
    let n = 0;
    for (const t of tiles.slice(0, MAX_PREVIEW)) {
      const pos = worldPosition(t);
      this.m.makeTranslation(pos.x, t.height + 0.07, pos.z);
      this.preview.setMatrixAt(n++, this.m);
    }
    this.preview.count = n;
    this.preview.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.slabs, this.pebbles, this.preview]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
  }
}
