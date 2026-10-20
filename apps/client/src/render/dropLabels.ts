import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';

/**
 * Chantier 12: a "+12/h" rising above a depot when a kiwi drops its load there: what this kiwi
 * adds to the stock every hour (the simulation stays an exact hourly rate; this shows it).
 */

const HEIGHT = 0.022;
const ASPECT = 2.4;
const LIFE_S = 1.6;
const RISE = 0.9;
const MAX_LABELS = 16;

interface Label {
  sprite: Sprite;
  age: number;
}

export class DropLabels {
  readonly group = new Group();
  private readonly textures = new Map<string, Texture>();
  private readonly labels: Label[] = [];

  private texture(text: string, color: string): Texture {
    const key = `${text}|${color}`;
    let tex = this.textures.get(key);
    if (!tex) {
      const h = 40;
      const w = Math.round(h * ASPECT);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.font = 'bold 26px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(58, 38, 26, 0.85)';
      g.strokeText(text, w / 2, h / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2);
      tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      this.textures.set(key, tex);
    }
    return tex;
  }

  spawn(x: number, y: number, z: number, text: string, color: string): void {
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
    label.sprite.material.map = this.texture(text, color);
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
