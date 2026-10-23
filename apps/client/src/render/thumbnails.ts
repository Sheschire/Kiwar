import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { BuildingType } from '@kiwar/shared';
import { buildingPicture } from './buildingModels';
import { PALETTE } from './palette';

/**
 * Chantier 33: thumbnails of the real buildings for the interface. Each (type, level) is drawn
 * once, off screen, with the game's WebGL context (no second context), read back into a small
 * PNG and kept in memory as an object URL; a locked building is the same picture in a black
 * silhouette. Requests are queued and drawn a few per frame; the SVG icon stands in meanwhile
 * (and for good when there is no renderer).
 */

/** Pixel size of a thumbnail (drawn at twice that and scaled down: smooth edges). */
export const THUMB_SIZE = 96;
const DRAW = THUMB_SIZE * 2;
/** Thumbnails drawn per animation frame at most. */
const PER_FRAME = 2;
/** Colour of the silhouettes (the interface's dark ink). */
const SILHOUETTE = [43, 33, 28];

export interface ThumbKey {
  type: BuildingType;
  level: number;
  locked: boolean;
  /** Age of the colony (the ship on the launch pad). */
  colonyAge: number;
}

const keyOf = (k: ThumbKey) =>
  `${k.type}:${k.level}:${k.locked ? 1 : 0}:${k.type === 'launchpad' ? k.colonyAge : 0}`;

let gl: WebGLRenderer | null = null;
let stage: Stage | null = null;
const urls = new Map<string, string>();
const queue = new Map<string, ThumbKey>();
const listeners = new Set<() => void>();
let scheduled = false;

/** Gives the thumbnails the game's renderer (from `startGame`). */
export function setThumbnailRenderer(renderer: WebGLRenderer | null): void {
  gl = renderer;
}

/** Called whenever a new thumbnail is ready. */
export function onThumbnail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The thumbnail is drawn. */
export function thumbnailReady(key: ThumbKey): boolean {
  return urls.has(keyOf(key));
}

/** The thumbnail's URL if drawn, else null (and it is queued). */
export function thumbnailUrl(key: ThumbKey): string | null {
  const k = keyOf(key);
  const url = urls.get(k);
  if (url) return url;
  if (!gl) return null;
  if (!queue.has(k)) {
    queue.set(k, key);
    schedule();
  }
  return null;
}

function schedule(): void {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    let drawn = 0;
    for (const [k, key] of queue) {
      if (drawn >= PER_FRAME) break;
      queue.delete(k);
      const url = draw(key);
      if (url) {
        urls.set(k, url);
        drawn++;
      }
    }
    if (drawn > 0) for (const l of listeners) l();
    if (queue.size > 0) schedule();
  });
}

/** The little lit scene the thumbnails are drawn in. */
class Stage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  readonly target = new WebGLRenderTarget(DRAW, DRAW, { samples: 4 });
  readonly model = new Group();
  readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
  });
  readonly pixels = new Uint8Array(DRAW * DRAW * 4);
  readonly canvas = document.createElement('canvas');
  readonly big = document.createElement('canvas');

  constructor() {
    this.target.texture.colorSpace = SRGBColorSpace;
    const hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6);
    const sun = new DirectionalLight(PALETTE.sun, 2.4);
    sun.position.set(-3, 5, 4);
    this.scene.add(hemi, sun, this.model);
    this.canvas.width = this.canvas.height = THUMB_SIZE;
    this.big.width = this.big.height = DRAW;
  }
}

const box = new Box3();
const centre = new Vector3();
const size = new Vector3();
const clear = new Color();

function draw(key: ThumbKey): string | null {
  if (!gl) return null;
  stage ??= new Stage();
  const s = stage;
  const model = buildingPicture(key.type, key.level, key.colonyAge);
  s.model.clear();
  s.model.add(new Mesh(model.geometry, s.material));
  for (const r of model.rigs) {
    const part = new Mesh(r.geometry, s.material);
    part.position.copy(r.pivot);
    s.model.add(part);
  }
  // Frame the model from the game's three-quarter view.
  box.setFromObject(s.model);
  box.getCenter(centre);
  box.getSize(size);
  const radius = Math.max(size.x, size.z) * 0.5 + size.y * 0.22;
  const distance = radius / Math.tan((s.camera.fov * Math.PI) / 360);
  const polar = 1.0;
  const azimuth = 0.55;
  s.camera.position.set(
    centre.x + Math.sin(polar) * Math.sin(azimuth) * distance,
    centre.y + Math.cos(polar) * distance,
    centre.z + Math.sin(polar) * Math.cos(azimuth) * distance,
  );
  s.camera.lookAt(centre);
  s.camera.updateProjectionMatrix();

  // Draw into the off-screen target with the game's context, then restore its state.
  const previous = gl.getRenderTarget();
  const shadows = gl.shadowMap.needsUpdate;
  const alpha = gl.getClearAlpha();
  gl.getClearColor(clear);
  gl.shadowMap.needsUpdate = false;
  gl.setRenderTarget(s.target);
  gl.setClearColor(0x000000, 0);
  gl.clear();
  gl.render(s.scene, s.camera);
  gl.readRenderTargetPixels(s.target, 0, 0, DRAW, DRAW, s.pixels);
  gl.setRenderTarget(previous);
  gl.setClearColor(clear, alpha);
  gl.shadowMap.needsUpdate = shadows;
  s.model.clear();

  // Flip the rows (GL reads bottom-up), make the silhouette, scale down.
  const big = s.big.getContext('2d');
  const out = s.canvas.getContext('2d');
  if (!big || !out) return null;
  const image = big.createImageData(DRAW, DRAW);
  const row = DRAW * 4;
  for (let y = 0; y < DRAW; y++)
    image.data.set(s.pixels.subarray((DRAW - 1 - y) * row, (DRAW - y) * row), y * row);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 0) continue;
    if (key.locked) {
      d[i] = SILHOUETTE[0]!;
      d[i + 1] = SILHOUETTE[1]!;
      d[i + 2] = SILHOUETTE[2]!;
    } else if (a < 255) {
      // The resolved edges are premultiplied by their coverage.
      const k = 255 / a;
      d[i] = Math.min(255, d[i]! * k);
      d[i + 1] = Math.min(255, d[i + 1]! * k);
      d[i + 2] = Math.min(255, d[i + 2]! * k);
    }
  }
  big.putImageData(image, 0, 0);
  out.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  out.drawImage(s.big, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return dataUrlToObjectUrl(s.canvas.toDataURL('image/png'));
}

/** A data URL as an object URL (smaller strings in the DOM, freed with the page). */
function dataUrlToObjectUrl(data: string): string {
  const bytes = atob(data.slice(data.indexOf(',') + 1));
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
}
