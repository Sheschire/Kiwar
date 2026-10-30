import { createRng, type DepthsMap, type DepthsState, type RoomKind } from '@kiwar/shared';
import {
  CORE,
  LOCULES,
  ROOM_T,
  SHAFT_T,
  cutLinks,
  roomPoint,
  type CutLink,
  type CutPoint,
} from './cutLayout';

/**
 * Chantier 49: the painted section of the dome — the green flesh and its light bundles, the
 * white ring of the locules and its black seeds, the cream core (both in silhouette while
 * closed), the skin, the shaft, the passages dug and the rooms seen, the fog on the rest.
 * One canvas, repainted only when what we know of the depths changes.
 */

/** Angles of the actinidine lakes in the locules ring (their smoke rises there). */
export const LAKES = [0.55, 2.35] as const;

export const PAINT_W = 1024;
export const PAINT_H = 512;

/** What a room looks like in the cut. */
export type RoomLook = 'fog' | 'heard' | 'seen' | 'gallery';

export interface CutKnowledge {
  looks: Map<string, RoomLook>;
  kinds: Map<string, RoomKind>;
  /** Passages dug (both ends known), and those lit by a gallery's lanterns. */
  known: CutLink[];
  lit: CutLink[];
}

export function cutKnowledge(map: DepthsMap, depths: DepthsState): CutKnowledge {
  const looks = new Map<string, RoomLook>();
  const kinds = new Map<string, RoomKind>();
  for (const r of map.rooms) {
    const g = depths.galleries[r.id];
    const v = depths.views[r.id];
    looks.set(
      r.id,
      g ? 'gallery' : v?.units || v?.source === 'retreat' ? 'seen' : v ? 'heard' : 'fog',
    );
    const kind = g?.kind ?? v?.kind;
    if (kind) kinds.set(r.id, kind);
  }
  const knownRoom = (id: string | null) => id === null || looks.get(id) !== 'fog';
  const links = cutLinks(map);
  const known = links.filter((l) => knownRoom(l.a) && knownRoom(l.b));
  const lit = known.filter(
    (l) => (l.a === null || looks.get(l.a) === 'gallery') && looks.get(l.b) === 'gallery',
  );
  // The way in to a first gallery is lit too.
  for (const l of known)
    if (!lit.includes(l) && (looks.get(l.b) === 'gallery' || (l.a && looks.get(l.a) === 'gallery')))
      lit.push(l);
  return { looks, kinds, known, lit };
}

/** Signature of what the cut shows (repaint only when it changes). */
export function cutSignature(k: CutKnowledge, holes: boolean): string {
  return `${holes ? 1 : 0}|${[...k.looks].map(([id, l]) => `${id}${l[0]}${k.kinds.get(id) ?? ''}`).join(',')}`;
}

export const KIND_TINTS: Record<RoomKind, string> = {
  bundle: '#d8c27a',
  sap: '#f0b23a',
  nest: '#b5543c',
  scree: '#8b6f4e',
  raphides: '#e9f4f6',
  // Chantier 50: the locules.
  forest: '#d6f0f7',
  lake: '#b7d64a',
};

/** Paints the section on `canvas` (sized here); `aspect` = the face's half-width / depth. */
export function paintCut(
  canvas: HTMLCanvasElement,
  map: DepthsMap,
  k: CutKnowledge,
  opts: { aspect: number; seed: string; holes: boolean },
): void {
  canvas.width = PAINT_W;
  canvas.height = PAINT_H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const { aspect } = opts;
  // Section units to pixels; a world length L (in depth units) is L / aspect across.
  const X = (s: number) => ((s + 1) / 2) * PAINT_W;
  const Y = (t: number) => t * PAINT_H;
  const RX = (l: number) => (l / aspect / 2) * PAINT_W;
  const RY = (l: number) => l * PAINT_H;
  const rng = createRng(`${opts.seed}/cut`);
  g.clearRect(0, 0, PAINT_W, PAINT_H);

  // The half-ellipse of the cut.
  const cut = new Path2D();
  cut.ellipse(X(0), 0, PAINT_W / 2, PAINT_H, 0, 0, Math.PI);
  cut.closePath();
  g.save();
  g.clip(cut);

  // The green flesh: deeper towards the skin, paler towards the seeds.
  const flesh = g.createRadialGradient(X(0), Y(1), 0, X(0), Y(1), PAINT_H * 1.05);
  flesh.addColorStop(0, '#c5e07a');
  flesh.addColorStop(0.45, '#8fc243');
  flesh.addColorStop(0.85, '#6aa52f');
  flesh.addColorStop(1, '#4f8a22');
  g.fillStyle = flesh;
  g.fillRect(0, 0, PAINT_W, PAINT_H);
  // Light mottles of the flesh.
  for (let i = 0; i < 160; i++) {
    const s = rng.range(-1, 1);
    const t = rng.range(0, 1);
    if (s * s + t * t > 1) continue;
    g.fillStyle = `rgba(214, 240, 150, ${rng.range(0.04, 0.12).toFixed(3)})`;
    g.beginPath();
    g.ellipse(X(s), Y(t), RX(rng.range(0.02, 0.06)), RY(rng.range(0.01, 0.03)), 0, 0, Math.PI * 2);
    g.fill();
  }
  // The vascular bundles: light rays from the core out to the skin.
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const a = Math.PI * (0.03 + 0.94 * (i / 45)) + rng.range(-0.02, 0.02);
    const from = LOCULES.outer + rng.range(0, 0.05);
    const to = rng.range(0.7, 0.97);
    g.strokeStyle = `rgba(232, 248, 190, ${rng.range(0.18, 0.34).toFixed(3)})`;
    g.lineWidth = rng.range(1.2, 3);
    g.beginPath();
    for (let j = 0; j <= 10; j++) {
      const r = from + ((to - from) * j) / 10;
      const w = Math.sin(j * 0.9 + i) * 0.006;
      const s = -Math.cos(a + w) * r;
      const t = 1 - Math.sin(a + w) * r;
      if (j === 0) g.moveTo(X(s), Y(t));
      else g.lineTo(X(s), Y(t));
    }
    g.stroke();
  }

  // The locules: a white ring around the core, its black seeds (closed: chantier 50).
  const ring = g.createRadialGradient(X(0), Y(1), RY(LOCULES.inner), X(0), Y(1), RY(LOCULES.outer));
  ring.addColorStop(0, '#f5f2dc');
  ring.addColorStop(0.7, '#e6efc4');
  ring.addColorStop(1, 'rgba(200, 228, 140, 0)');
  g.fillStyle = ring;
  g.beginPath();
  g.ellipse(X(0), Y(1), RX(LOCULES.outer), RY(LOCULES.outer), 0, Math.PI, Math.PI * 2);
  g.fill();
  // A point of the ring at angle `a` (0 = left, π/2 = straight up) and radius `r` (depth units).
  const polar = (a: number, r: number): CutPoint => ({
    s: (-Math.cos(a) * r) / aspect,
    t: 1 - Math.sin(a) * r,
  });
  for (let i = 0; i < 34; i++) {
    const a = Math.PI * (0.06 + 0.88 * (i / 33)) + rng.range(-0.03, 0.03);
    const p = polar(a, rng.range(LOCULES.inner + 0.04, LOCULES.outer - 0.05));
    g.fillStyle = '#1d1712';
    g.beginPath();
    g.ellipse(X(p.s), Y(p.t), RX(0.022), RY(0.011), -a, 0, Math.PI * 2);
    g.fill();
  }
  // Actinidine lakes, in the dark of the locules (silhouettes until chantier 50).
  for (const p of LAKES.map((a) => polar(a, (LOCULES.inner + LOCULES.outer) / 2))) {
    g.fillStyle = 'rgba(70, 92, 60, 0.85)';
    g.beginPath();
    g.ellipse(X(p.s), Y(p.t), RX(0.05), RY(0.018), 0, 0, Math.PI * 2);
    g.fill();
  }
  // The cream core.
  g.fillStyle = '#efe3b8';
  g.beginPath();
  g.ellipse(X(0), Y(1), RX(CORE), RY(CORE), 0, Math.PI, Math.PI * 2);
  g.fill();
  // Closed layers: a dark veil, their shapes only.
  g.fillStyle = 'rgba(28, 40, 24, 0.55)';
  g.beginPath();
  g.ellipse(X(0), Y(1), RX(LOCULES.outer), RY(LOCULES.outer), 0, Math.PI, Math.PI * 2);
  g.fill();

  // The shaft of the tunnel, from the surface down to its foot.
  const shaftW = RX(0.05);
  g.fillStyle = '#3b2a1a';
  g.fillRect(X(0) - shaftW, 0, shaftW * 2, Y(SHAFT_T));
  g.beginPath();
  g.ellipse(X(0), Y(SHAFT_T), shaftW * 1.4, RY(0.03), 0, 0, Math.PI * 2);
  g.fill();

  // The passages dug: a dark band with a lighter rim, lanterns' glow on the lit ones.
  const draw = (points: CutPoint[], width: number, style: string) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(X(p.s), Y(p.t)) : g.lineTo(X(p.s), Y(p.t))));
    g.stroke();
  };
  for (const l of k.known) draw(l.points, RY(0.042), 'rgba(196, 226, 120, 0.7)');
  for (const l of k.known) draw(l.points, RY(0.03), '#3b2a1a');
  for (const l of k.lit) draw(l.points, RY(0.012), 'rgba(255, 196, 92, 0.35)');

  // The rooms: hollows of the rooms known, faint shapes under the fog for the others.
  for (const r of map.rooms) {
    const look = k.looks.get(r.id) ?? 'fog';
    const p = roomPoint(map, r);
    const kind = k.kinds.get(r.id);
    const rx = RX(ROOM_T);
    const ry = RY(ROOM_T);
    if (look === 'fog') {
      g.fillStyle = 'rgba(40, 60, 30, 0.35)';
      g.beginPath();
      g.ellipse(X(p.s), Y(p.t), rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    // A rim of packed flesh, tinted by what the room holds.
    g.fillStyle = kind ? KIND_TINTS[kind] : '#9fbf6a';
    g.globalAlpha = 0.75;
    g.beginPath();
    g.ellipse(X(p.s), Y(p.t), rx * 1.22, ry * 1.22, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // The hollow itself (a painted disc; punched out below when the 3D hollows are drawn).
    const hollow = g.createRadialGradient(X(p.s), Y(p.t - ROOM_T * 0.3), 0, X(p.s), Y(p.t), ry);
    hollow.addColorStop(0, look === 'gallery' ? '#6b4a26' : '#3e2c1b');
    hollow.addColorStop(1, '#22180f');
    g.fillStyle = hollow;
    g.beginPath();
    g.ellipse(X(p.s), Y(p.t), rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    if (look === 'gallery') {
      g.fillStyle = 'rgba(255, 200, 100, 0.35)';
      g.beginPath();
      g.ellipse(X(p.s), Y(p.t + ROOM_T * 0.45), rx * 0.8, ry * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // The fog: everywhere but around what we know.
  const fog = document.createElement('canvas');
  fog.width = PAINT_W;
  fog.height = PAINT_H;
  const f = fog.getContext('2d');
  if (f) {
    f.fillStyle = 'rgba(74, 92, 64, 0.74)';
    f.fillRect(0, 0, PAINT_W, PAINT_H);
    for (let i = 0; i < 90; i++) {
      f.fillStyle = `rgba(${rng.chance(0.5) ? '150, 168, 132' : '40, 52, 36'}, ${rng.range(0.1, 0.22).toFixed(3)})`;
      f.beginPath();
      f.ellipse(
        rng.range(0, PAINT_W),
        rng.range(0, PAINT_H),
        rng.range(30, 90),
        rng.range(14, 40),
        0,
        0,
        Math.PI * 2,
      );
      f.fill();
    }
    f.globalCompositeOperation = 'destination-out';
    const clear = (p: CutPoint, r: number) => {
      const grad = f.createRadialGradient(X(p.s), Y(p.t), 0, X(p.s), Y(p.t), RY(r));
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.9)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = grad;
      f.save();
      f.translate(X(p.s), Y(p.t));
      f.scale(RX(1) / RY(1), 1);
      f.translate(-X(p.s), -Y(p.t));
      f.beginPath();
      f.arc(X(p.s), Y(p.t), RY(r), 0, Math.PI * 2);
      f.fill();
      f.restore();
    };
    for (let t = 0; t <= SHAFT_T + 0.02; t += 0.03) clear({ s: 0, t }, 0.14);
    for (const l of k.known) for (const p of l.points) clear(p, 0.09);
    for (const r of map.rooms)
      if (k.looks.get(r.id) !== 'fog') clear(roomPoint(map, r), ROOM_T * 2.6);
    // The closed layers keep their own veil, not the fog.
    clear({ s: 0, t: 1 }, LOCULES.outer * 1.05);
    g.drawImage(fog, 0, 0);
  }

  // Punch the hollows: the 3D rooms show through.
  if (opts.holes) {
    g.globalCompositeOperation = 'destination-out';
    for (const r of map.rooms) {
      if (k.looks.get(r.id) === 'fog') continue;
      const p = roomPoint(map, r);
      g.beginPath();
      g.ellipse(X(p.s), Y(p.t), RX(ROOM_T), RY(ROOM_T), 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();

  // The skin along the rim of the cut.
  g.strokeStyle = '#6b4327';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(X(0), 0, PAINT_W / 2 - 3, PAINT_H - 3, 0, 0, Math.PI);
  g.stroke();
}
