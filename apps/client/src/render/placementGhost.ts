import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { BuildingType, Tile } from '@kiwar/shared';
import { buildingGeometry } from './buildingModels';
import { worldPosition } from './terrain';
import { WATER_LEVEL } from './water';

const VALID = new Color('#7ee06a');
const INVALID = new Color('#ff5a4a');
const WHITE = new Color('#ffffff');
/** Height above the tile and amplitude of the hovering. */
const LIFT = 0.28;
const BOB = 0.07;

/**
 * Chantier 16: the building being placed, translucent, hovering above the pointed tile (green
 * where it can go, red elsewhere). One mesh and one material, the geometry comes from the
 * model cache: nothing is allocated while the pointer moves.
 */
export class PlacementGhost {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    emissiveIntensity: 0.45,
  });
  private readonly mesh = new Mesh(undefined, this.material);
  private modelKey = '';
  private baseY = 0;

  constructor() {
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  /** The building to show (null hides the ghost). */
  setModel(type: BuildingType | null, age: number): void {
    const key = type ? `${type}:${age}` : '';
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (type) this.mesh.geometry = buildingGeometry(type, 1, false, age);
    if (!type) this.group.visible = false;
  }

  /** Where the ghost hovers (null hides it) and whether the building can go there. */
  setTile(tile: Tile | null, valid: boolean): void {
    this.group.visible = !!tile && this.modelKey !== '';
    if (!tile) return;
    const p = worldPosition(tile);
    this.baseY = tile.height + (tile.type === 'juice' ? WATER_LEVEL : 0) + LIFT;
    this.group.position.set(p.x, this.baseY, p.z);
    const tint = valid ? VALID : INVALID;
    this.material.emissive.copy(tint);
    this.material.color.copy(tint).lerp(WHITE, 0.55);
  }

  update(time: number): void {
    if (!this.group.visible) return;
    this.group.position.y = this.baseY + BOB * Math.sin(time * 2.2);
    this.mesh.rotation.y = 0.12 * Math.sin(time * 0.9);
  }

  dispose(): void {
    // The geometry belongs to the model cache.
    this.material.dispose();
  }
}
