import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

/**
 * Chantier 12: logistics labels ("92 %") above the producers (logistics overlay) or on the
 * tiles where a producer can be placed. Green from 100 %, amber from 80 %, orange below.
 */

/** Share of the screen height. */
const BADGE_HEIGHT = 0.026;
const ASPECT = 2;

export interface PercentBadge {
  key: string;
  x: number;
  y: number;
  z: number;
  /** Logistics efficiency (1 = 100 %). */
  value: number;
  /** Tapping the label selects this tile. */
  q?: number;
  r?: number;
}

export function efficiencyColor(value: number): string {
  if (value >= 0.995) return '#4f9a1c';
  if (value >= 0.8) return '#c48a12';
  return '#c4542a';
}

/** Brighter tint for the glowing placement tiles. */
export function efficiencyGlow(value: number): string {
  if (value >= 0.995) return '#a6ef5e';
  if (value >= 0.8) return '#ffd65a';
  return '#ff8c4a';
}

function badgeTexture(percent: number, color: string): CanvasTexture {
  const h = 48;
  const w = h * ASPECT;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const r = 18;
  g.beginPath();
  g.roundRect(3, 5, w - 6, h - 10, r);
  g.fillStyle = '#fbf3df';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 24px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${percent} %`, w / 2, h / 2 + 1);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class LogisticsBadges {
  readonly group = new Group();
  private readonly sprites = new Map<string, Sprite>();
  private readonly materials = new Map<number, SpriteMaterial>();
  private signature = '';

  private material(value: number): SpriteMaterial {
    const percent = Math.round(value * 100);
    let mat = this.materials.get(percent);
    if (!mat) {
      mat = new SpriteMaterial({
        map: badgeTexture(percent, efficiencyColor(value)),
        depthTest: false,
        transparent: true,
        sizeAttenuation: false,
      });
      this.materials.set(percent, mat);
    }
    return mat;
  }

  /** Shows exactly these labels (cheap when nothing changed). */
  show(rows: readonly PercentBadge[]): void {
    const sig = rows
      .map((b) => `${b.key}:${Math.round(b.value * 100)}:${b.y.toFixed(2)}`)
      .join(',');
    if (sig === this.signature) return;
    this.signature = sig;
    const seen = new Set<string>();
    for (const b of rows) {
      seen.add(b.key);
      let s = this.sprites.get(b.key);
      if (!s) {
        s = new Sprite();
        s.scale.set(BADGE_HEIGHT * ASPECT, BADGE_HEIGHT, 1);
        s.renderOrder = 12;
        this.sprites.set(b.key, s);
        this.group.add(s);
      }
      s.material = this.material(b.value);
      s.position.set(b.x, b.y, b.z);
      s.userData = b.q !== undefined ? { q: b.q, r: b.r } : {};
    }
    for (const [key, s] of this.sprites) {
      if (seen.has(key)) continue;
      this.group.remove(s);
      this.sprites.delete(key);
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
