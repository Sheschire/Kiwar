import {
  AdditiveBlending,
  NormalBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type ColorRepresentation,
} from 'three';
import type { Tile } from '@kiwar/shared';
import { HEX_VISUAL_RADIUS, worldPosition } from './terrain';

function createHexRingGeometry(inner: number, outer: number): BufferGeometry {
  const positions: number[] = [];
  const c = (i: number, r: number) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    const ai = c(i, inner);
    const aj = c(j, inner);
    const bi = c(i, outer);
    const bj = c(j, outer);
    // Counter-clockwise seen from above (same winding as the tile tops).
    positions.push(...ai, ...aj, ...bj, ...ai, ...bj, ...bi);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return g;
}

class HexMarker {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  constructor(
    color: ColorRepresentation,
    private readonly baseOpacity: number,
    additive: boolean,
    inner: number,
  ) {
    this.material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
    });
    this.mesh = new Mesh(
      createHexRingGeometry(HEX_VISUAL_RADIUS * inner, HEX_VISUAL_RADIUS * 0.92),
      this.material,
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }
  show(tile: Tile | null): void {
    this.mesh.visible = !!tile;
    if (!tile) return;
    const p = worldPosition(tile);
    this.mesh.position.set(p.x, tile.height + 0.025, p.z);
  }
  pulse(time: number, speed: number): void {
    this.material.opacity = this.baseOpacity * (0.75 + 0.25 * Math.sin(time * speed));
    const s = 1 + 0.03 * Math.sin(time * speed);
    this.mesh.scale.set(s, 1, s);
  }
}

/** Hover and selection outlines on top of tiles. */
export class SelectionView {
  readonly group = new Group();
  private readonly hover = new HexMarker('#fff6d8', 0.35, true, 0.76);
  private readonly selected = new HexMarker('#ffd24a', 1, false, 0.7);

  constructor() {
    this.group.add(this.hover.mesh, this.selected.mesh);
  }

  setHover(tile: Tile | null): void {
    this.hover.show(tile);
  }

  setSelected(tile: Tile | null): void {
    this.selected.show(tile);
  }

  update(time: number): void {
    this.selected.pulse(time, 4);
    this.hover.pulse(time, 2);
  }
}
