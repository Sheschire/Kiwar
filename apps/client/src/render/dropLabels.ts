import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
import type { ResourceId } from '@kiwar/shared';

/**
 * A "+0.4" and the resource icon rising above a depot when a kiwi drops its load there
 * (chantier 12, in units since chantier 16: what this kiwi gathered since its last drop).
 */

/** The resource icons of `ui/icons.tsx` (32×32 view box), drawn on a canvas. */
function drawIcon(g: CanvasRenderingContext2D, id: ResourceId): void {
  const fill = (d: string, color: string, stroke?: string, width = 2) => {
    const p = new Path2D(d);
    g.fillStyle = color;
    g.fill(p);
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = width;
      g.stroke(p);
    }
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, deg: number, color: string) => {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, (deg * Math.PI) / 180, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  switch (id) {
    case 'pulp':
      fill('M16 3c5 6 10 11 10 17a10 10 0 0 1-20 0c0-6 5-11 10-17z', '#8cc43c', '#4f7419');
      ellipse(12.5, 18, 2.5, 4, 0, 'rgba(214, 238, 154, 0.8)');
      break;
    case 'fiber':
      fill('M9 5h14a2 2 0 0 1 0 4H9a2 2 0 0 1 0-4z', '#a0784c', '#5e4128', 1.6);
      fill('M9 23h14a2 2 0 0 1 0 4H9a2 2 0 0 1 0-4z', '#a0784c', '#5e4128', 1.6);
      fill('M9 9h14v14H9z', '#e5cf9c', '#8a6a3e', 1.6);
      break;
    case 'seeds':
      ellipse(11, 17, 4.2, 7.5, -25, '#2a1f1a');
      ellipse(21, 15, 4.2, 7.5, 20, '#3a2b22');
      ellipse(9.6, 14, 1.1, 2.3, -25, 'rgba(255, 255, 255, 0.7)');
      ellipse(19.8, 12, 1.1, 2.3, 20, 'rgba(255, 255, 255, 0.7)');
      break;
    case 'juice':
      fill('M8 6h16l-2 21H10z', '#fff8e6', '#7a5a40', 1.8);
      fill('M9.2 13h13.6l-1.4 13H10.6z', '#c9dc2e');
      break;
  }
}

const HEIGHT = 0.022;
const ASPECT = 2.6;
const LIFE_S = 1.6;
const RISE = 0.9;
const MAX_LABELS = 16;
const MAX_TEXTURES = 96;

interface Label {
  sprite: Sprite;
  age: number;
}

export class DropLabels {
  readonly group = new Group();
  private readonly textures = new Map<string, Texture>();
  private readonly labels: Label[] = [];

  private texture(text: string, resource: ResourceId, color: string): Texture {
    const key = `${text}|${resource}`;
    let tex = this.textures.get(key);
    if (!tex) {
      const h = 40;
      const w = Math.round(h * ASPECT);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.font = 'bold 26px Georgia, serif';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const icon = 30;
      const width = g.measureText(text).width + 2 + icon;
      const x = Math.max(3, (w - width) / 2);
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(58, 38, 26, 0.85)';
      g.strokeText(text, x, h / 2);
      g.fillStyle = color;
      g.fillText(text, x, h / 2);
      // The icon on a small dark disc, readable on any ground.
      const ix = Math.min(w - icon - 2, x + width - icon);
      g.beginPath();
      g.arc(ix + icon / 2, h / 2, icon / 2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(58, 38, 26, 0.6)';
      g.fill();
      g.save();
      g.translate(ix + 3, h / 2 - icon / 2 + 3);
      g.scale((icon - 6) / 32, (icon - 6) / 32);
      drawIcon(g, resource);
      g.restore();
      tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      // Amounts vary: keep the cache small (the oldest texture goes first).
      if (this.textures.size >= MAX_TEXTURES) {
        const [oldest, old] = this.textures.entries().next().value!;
        old.dispose();
        this.textures.delete(oldest);
      }
      this.textures.set(key, tex);
    }
    return tex;
  }

  spawn(x: number, y: number, z: number, text: string, resource: ResourceId, color: string): void {
    let label = this.labels.find((l) => l.age >= LIFE_S);
    if (!label) {
      if (this.labels.length >= MAX_LABELS) return;
      const sprite = new Sprite(
        new SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }),
      );
      sprite.scale.set(HEIGHT * ASPECT, HEIGHT, 1);
      sprite.renderOrder = 12;
      this.group.add(sprite);
      label = { sprite, age: LIFE_S };
      this.labels.push(label);
    }
    label.age = 0;
    label.sprite.material.map = this.texture(text, resource, color);
    label.sprite.material.needsUpdate = true;
    label.sprite.position.set(x, y, z);
    label.sprite.userData.y = y;
    label.sprite.visible = true;
  }

  update(dt: number): void {
    for (const l of this.labels) {
      if (l.age >= LIFE_S) continue;
      l.age += dt;
      const k = Math.min(1, l.age / LIFE_S);
      l.sprite.visible = k < 1;
      l.sprite.position.y = (l.sprite.userData.y as number) + RISE * (1 - (1 - k) ** 2);
      l.sprite.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    for (const l of this.labels) l.sprite.material.dispose();
  }
}
