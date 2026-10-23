import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Material,
  type BufferGeometry,
} from 'three';
import { getTile, SECTOR_IDS, type FaceMap, type GameState } from '@kiwar/shared';
import { worldPosition } from '../terrain';
import { SECTOR_COLORS } from '../sectors';

/**
 * Chantier 36: while a wave is announced, the gate where each pack will come in pulses on the
 * rampart (a ring and an arrow pointing in), in the colour of its sector.
 */
export class GateMarkers {
  readonly group = new Group();
  private readonly marks = new Map<string, Group>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private key = '';

  constructor(private readonly map: FaceMap) {}

  sync(state: GameState): void {
    const wave = state.threats.next;
    const gates = wave?.announced ? wave.gates : undefined;
    const key = gates ? `${wave!.id}|${JSON.stringify(gates)}` : '';
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!gates) return;
    for (const sector of SECTOR_IDS) {
      const h = gates[sector];
      if (!h || !wave!.squads?.some((q) => q.sector === sector)) continue;
      const p = worldPosition(h);
      const y = (getTile(this.map, h)?.height ?? 0) + 0.06;
      const mat = new MeshBasicMaterial({
        color: SECTOR_COLORS[sector],
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const ring = new RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2);
      // The arrow points from the rampart towards the heart.
      const arrow = new ConeGeometry(0.22, 0.5, 4).rotateX(Math.PI / 2);
      this.geometries.push(ring, arrow);
      this.materials.push(mat);
      const g = new Group();
      g.add(new Mesh(ring, mat));
      const a = new Mesh(arrow, mat);
      a.position.set(0, 0.9, 0);
      g.add(a);
      g.position.set(p.x, y, p.z);
      g.lookAt(0, y, 0);
      g.renderOrder = 5;
      this.marks.set(sector, g);
      this.group.add(g);
    }
  }

  update(time: number): void {
    const pulse = 1 + Math.sin(time * 3) * 0.12;
    for (const g of this.marks.values()) {
      g.children[0]!.scale.setScalar(pulse);
      g.children[1]!.position.y = 0.9 + Math.sin(time * 3) * 0.12;
    }
  }

  private clear(): void {
    for (const g of this.marks.values()) this.group.remove(g);
    this.marks.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }

  dispose(): void {
    this.clear();
  }
}
