import {
  AdditiveBlending,
  NormalBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Color,
  type ColorRepresentation,
} from 'three';
import type { Tile } from '@kiwar/shared';
import { HEX_VISUAL_RADIUS, worldPosition } from './terrain';
import { WATER_LEVEL } from './water';

const PLACEMENT_COLOR = '#ffe27a';
/** Chantier 20: eligible tiles while placing, kept below the aimed zone (0.75 + rim). */
const PLACEMENT_OPACITY = 0.24;

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
    this.mesh.position.set(
      p.x,
      tile.height + (tile.type === 'juice' ? WATER_LEVEL : 0) + 0.025,
      p.z,
    );
  }
  pulse(time: number, speed: number): void {
    this.material.opacity = this.baseOpacity * (0.75 + 0.25 * Math.sin(time * speed));
    const s = 1 + 0.03 * Math.sin(time * speed);
    this.mesh.scale.set(s, 1, s);
  }
}

const MAX_CATCHMENT = 64;
const CATCHMENT_COLOR = '#c6f27a';
const MAX_PLACEMENT = 600;
/** Chantier 16: tiles of the catchment planned around the placement ghost (radius 3 max). */
const MAX_PLANNED = 37;
/** Chantier 16: tiles of the zones overlay (every producer's catchment). */
const MAX_ZONES = 400;

function plannedMesh(
  color: ColorRepresentation,
  opacity: number,
  max = MAX_PLANNED,
  inner = 0,
  outer = 0.84,
): InstancedMesh {
  const mesh = new InstancedMesh(
    createHexRingGeometry(HEX_VISUAL_RADIUS * inner, HEX_VISUAL_RADIUS * outer),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    }),
    max,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

function placeTiles(mesh: InstancedMesh, tiles: readonly Tile[], lift: number): void {
  const m = new Matrix4();
  let n = 0;
  for (const t of tiles.slice(0, mesh.instanceMatrix.count)) {
    const p = worldPosition(t);
    m.makeTranslation(p.x, t.height + (t.type === 'juice' ? WATER_LEVEL : 0) + lift, p.z);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}

/** Hover and selection outlines on top of tiles, and the catchment of a selected producer. */
export class SelectionView {
  readonly group = new Group();
  private readonly hover = new HexMarker('#fff6d8', 0.35, true, 0.76);
  private readonly selected = new HexMarker('#ffd24a', 1, false, 0.7);
  private readonly catchment = new InstancedMesh(
    createHexRingGeometry(HEX_VISUAL_RADIUS * 0.74, HEX_VISUAL_RADIUS * 0.92),
    new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      toneMapped: false,
    }),
    MAX_CATCHMENT,
  );

  /** Chantier 11: tiles where the building chosen in the tree can be placed. */
  private readonly placement = new InstancedMesh(
    createHexRingGeometry(HEX_VISUAL_RADIUS * 0.12, HEX_VISUAL_RADIUS * 0.86),
    new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: PLACEMENT_OPACITY,
      depthWrite: false,
      toneMapped: false,
    }),
    MAX_PLACEMENT,
  );

  /** Chantier 16: deposit tiles a producer placed under the ghost would harvest, and the
   * ones in its reach that other buildings keep (grey). */
  private readonly plannedFree = plannedMesh('#8df06e', 0.75);
  private readonly plannedTaken = plannedMesh('#4a4440', 0.65);
  /** Chantier 20: a white rim around the planned tiles, so the aimed zone stands out from the
   * (quieter) eligible tiles. */
  private readonly plannedRim = plannedMesh('#ffffff', 0.9, MAX_PLANNED * 2, 0.84, 0.97);

  /** Chantier 16: every producer's catchment (logistics overlay) and the contested tiles. */
  private readonly zones = new InstancedMesh(
    createHexRingGeometry(0, HEX_VISUAL_RADIUS * 0.84),
    new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      toneMapped: false,
    }),
    MAX_ZONES,
  );
  private readonly contested = plannedMesh('#3b3632', 0.8, MAX_ZONES, 0.62);
  /** Chantier 35: the selected building's covered tiles, and a cramped one's blockers. */
  private readonly footprint = plannedMesh('#ffd24a', 0.55, 7, 0.78, 0.9);
  private readonly blockers = plannedMesh('#ff5a4a', 0.7, 6, 0, 0.84);

  constructor() {
    this.zones.count = 0;
    this.zones.instanceColor = new InstancedBufferAttribute(
      new Float32Array(MAX_ZONES * 3).fill(1),
      3,
    );
    this.zones.frustumCulled = false;
    this.zones.renderOrder = 3;
    this.catchment.count = 0;
    this.catchment.instanceColor = new InstancedBufferAttribute(
      new Float32Array(MAX_CATCHMENT * 3).fill(1),
      3,
    );
    this.catchment.frustumCulled = false;
    this.catchment.renderOrder = 4;
    this.placement.count = 0;
    // Per-tile colours from the start (the shader is compiled with them).
    this.placement.instanceColor = new InstancedBufferAttribute(
      new Float32Array(MAX_PLACEMENT * 3).fill(1),
      3,
    );
    this.placement.frustumCulled = false;
    this.placement.renderOrder = 4;
    this.group.add(
      this.hover.mesh,
      this.selected.mesh,
      this.catchment,
      this.placement,
      this.plannedFree,
      this.plannedTaken,
      this.plannedRim,
      this.zones,
      this.contested,
      this.footprint,
      this.blockers,
    );
  }

  /** Chantier 12: each tile may carry its own colour (logistics of a producer placed there). */
  setPlacement(tiles: readonly Tile[], colors?: readonly string[]): void {
    const m = new Matrix4();
    const c = new Color();
    let n = 0;
    for (const t of tiles.slice(0, MAX_PLACEMENT)) {
      const p = worldPosition(t);
      // Above the water of the juice pools.
      m.makeTranslation(p.x, t.height + (t.type === 'juice' ? WATER_LEVEL : 0) + 0.03, p.z);
      this.placement.setColorAt(n, c.set(colors?.[n] ?? PLACEMENT_COLOR));
      this.placement.setMatrixAt(n++, m);
    }
    this.placement.count = n;
    this.placement.instanceMatrix.needsUpdate = true;
    if (this.placement.instanceColor) this.placement.instanceColor.needsUpdate = true;
  }

  /**
   * Highlights the deposit tiles harvested by the selected building, or (chantier 12) the
   * rampart a turret defends, coloured by sector.
   */
  setCatchment(tiles: readonly Tile[], colors?: readonly string[], faint = false): void {
    // Chantier 20: a hovered building shows its zone paler than a selected one.
    (this.catchment.material as MeshBasicMaterial).opacity = faint ? 0.5 : 0.7;
    const m = new Matrix4();
    const c = new Color();
    let n = 0;
    for (const t of tiles.slice(0, MAX_CATCHMENT)) {
      const p = worldPosition(t);
      // Over a juice tile the ring floats on the juice (under it, it was hidden).
      m.makeTranslation(p.x, t.height + (t.type === 'juice' ? WATER_LEVEL : 0) + 0.02, p.z);
      this.catchment.setColorAt(n, c.set(colors?.[n] ?? CATCHMENT_COLOR));
      this.catchment.setMatrixAt(n++, m);
    }
    this.catchment.count = n;
    this.catchment.instanceMatrix.needsUpdate = true;
    if (this.catchment.instanceColor) this.catchment.instanceColor.needsUpdate = true;
  }

  /** Chantier 16: the catchment planned around the placement ghost (empty lists hide it). */
  setPlanned(free: readonly Tile[], taken: readonly Tile[]): void {
    placeTiles(this.plannedFree, free, 0.04);
    placeTiles(this.plannedTaken, taken, 0.04);
    placeTiles(this.plannedRim, [...free, ...taken], 0.05);
  }

  /** Chantier 16: catchments by producer colour, and contested tiles ringed (empty: off). */
  setZones(tiles: readonly Tile[], colors: readonly string[], contested: readonly Tile[]): void {
    placeTiles(this.zones, tiles, 0.035);
    const c = new Color();
    for (let i = 0; i < this.zones.count; i++) this.zones.setColorAt(i, c.set(colors[i]!));
    if (this.zones.instanceColor) this.zones.instanceColor.needsUpdate = true;
    placeTiles(this.contested, contested, 0.045);
  }

  /** Chantier 35: the footprint of the selected big building, and what blocks it (red). */
  setFootprint(tiles: readonly Tile[], blockers: readonly Tile[]): void {
    placeTiles(this.footprint, tiles, 0.03);
    placeTiles(this.blockers, blockers, 0.032);
  }

  setHover(tile: Tile | null): void {
    this.hover.show(tile);
  }

  setSelected(tile: Tile | null): void {
    this.selected.show(tile);
  }

  update(time: number): void {
    // Chantier 20: the eligible tiles stay still and quiet; the aimed zone pulses, bright.
    if (this.plannedFree.count > 0)
      (this.plannedFree.material as MeshBasicMaterial).opacity = 0.68 + 0.14 * Math.sin(time * 5);
    if (this.plannedRim.count > 0)
      (this.plannedRim.material as MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(time * 5);
    this.selected.pulse(time, 4);
    this.hover.pulse(time, 2);
  }
}
