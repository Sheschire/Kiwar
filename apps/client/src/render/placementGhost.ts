import { CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { BuildingType, FaceMap, Tile } from '@kiwar/shared';
import { buildingGeometry } from './buildingModels';
import { footprintFrame, groundY } from './footprintFrame';
import { worldPosition } from './terrain';
import { WATER_LEVEL } from './water';

/** Chantier 35: at most the monument's seven tiles. */
const PADS = 7;

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
  /** Chantier 35: the tiles the footprint covers, lit under the ghost. */
  private readonly padMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  private readonly padGeometry = new CircleGeometry(0.9, 6, Math.PI / 6).rotateX(-Math.PI / 2);
  private readonly pads: Mesh[] = [];
  private modelKey = '';
  private type: BuildingType | null = null;
  private baseY = 0;

  constructor() {
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);
    for (let i = 0; i < PADS; i++) {
      const pad = new Mesh(this.padGeometry, this.padMaterial);
      pad.renderOrder = 5;
      pad.visible = false;
      this.pads.push(pad);
      this.group.add(pad);
    }
    this.group.visible = false;
  }

  /** The building to show (null hides the ghost). */
  setModel(type: BuildingType | null, age: number): void {
    const key = type ? `${type}:${age}` : '';
    if (key === this.modelKey) return;
    this.modelKey = key;
    this.type = type;
    if (type) this.mesh.geometry = buildingGeometry(type, 1, false, age);
    if (!type) this.group.visible = false;
  }

  /**
   * Where the ghost hovers (null hides it), turned by `rot`, and whether the building can go
   * there. Chantier 35: it stands at the centre of its footprint, whose tiles are lit.
   */
  setTile(tile: Tile | null, valid: boolean, map: FaceMap | null = null, rot = 0): void {
    this.group.visible = !!tile && this.modelKey !== '';
    if (!tile) return;
    const tint = valid ? VALID : INVALID;
    this.material.emissive.copy(tint);
    this.material.color.copy(tint).lerp(WHITE, 0.55);
    this.padMaterial.color.copy(tint);
    if (map && this.type) {
      const f = footprintFrame(map, this.type, { q: tile.q, r: tile.r, rot });
      this.baseY = f.y + (tile.type === 'juice' ? WATER_LEVEL : 0) + LIFT;
      this.mesh.position.set(f.x, 0, f.z);
      this.mesh.rotation.y = f.angle;
      this.pads.forEach((pad, i) => {
        const h = f.tiles.length > 1 ? f.tiles[i] : undefined;
        pad.visible = !!h;
        if (!h) return;
        const p = worldPosition(h);
        pad.position.set(p.x, groundY(map, h) + 0.04, p.z);
      });
      return;
    }
    const p = worldPosition(tile);
    this.baseY = tile.height + (tile.type === 'juice' ? WATER_LEVEL : 0) + LIFT;
    this.mesh.position.set(p.x, 0, p.z);
    this.mesh.rotation.y = 0;
    for (const pad of this.pads) pad.visible = false;
  }

  update(time: number): void {
    if (!this.group.visible) return;
    this.mesh.position.y = this.baseY + BOB * Math.sin(time * 2.2);
  }

  dispose(): void {
    // The model geometry belongs to the model cache.
    this.material.dispose();
    this.padMaterial.dispose();
    this.padGeometry.dispose();
  }
}
