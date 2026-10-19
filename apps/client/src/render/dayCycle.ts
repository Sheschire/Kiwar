import { Color, Vector3 } from 'three';
import { CALENDAR, type CalendarView } from '@kiwar/shared';
import { PALETTE } from './palette';

/** Every colour and light the day/night cycle drives. */
interface SkyKey {
  zenith: Color;
  mid: Color;
  horizon: Color;
  below: Color;
  cloud: Color;
  cloudShade: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
}

const key = (o: Record<keyof SkyKey, string | number>): SkyKey =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? v : new Color(v)]),
  ) as unknown as SkyKey;

const DAY: SkyKey = {
  zenith: PALETTE.skyZenith,
  mid: PALETTE.skyMid,
  horizon: PALETTE.skyHorizon,
  below: PALETTE.skyBelow,
  cloud: PALETTE.cloud,
  cloudShade: PALETTE.cloudShade,
  sun: PALETTE.sun,
  sunIntensity: 2.6,
  hemiSky: PALETTE.hemiSky,
  hemiGround: PALETTE.hemiGround,
  hemiIntensity: 1.35,
};

// Nights stay readable: a bright blue moonlight rather than darkness.
const NIGHT = key({
  zenith: '#1c1e4a',
  mid: '#363c80',
  horizon: '#6c6cae',
  below: '#4c4a8a',
  cloud: '#9496cc',
  cloudShade: '#5f5c9c',
  sun: '#a9bcff',
  sunIntensity: 0.75,
  hemiSky: '#9da2d4',
  hemiGround: '#46425e',
  hemiIntensity: 0.85,
});

const DAWN = key({
  zenith: '#8a72c0',
  mid: '#e6a6d6',
  horizon: '#ffb3c1',
  below: '#f5b3c8',
  cloud: '#ffe0e6',
  cloudShade: '#e7a2be',
  sun: '#ffb59a',
  sunIntensity: 1.7,
  hemiSky: '#f0c8f0',
  hemiGround: '#ffb89e',
  hemiIntensity: 1.15,
});

const DUSK = key({
  zenith: '#6c5aa8',
  mid: '#e48aa8',
  horizon: '#ffa66e',
  below: '#f0a0a8',
  cloud: '#ffd2b8',
  cloudShade: '#d98fa8',
  sun: '#ff9a5a',
  sunIntensity: 1.7,
  hemiSky: '#e0b0e0',
  hemiGround: '#ffa070',
  hemiIntensity: 1.1,
});

export interface SkyState extends SkyKey {
  /** Direction towards the light (sun by day, moon by night), normalised. */
  lightDir: Vector3;
  /** 0 at night, 1 in full day. */
  daylight: number;
  /** 1 deep in the night (lights, fireflies). */
  night: number;
}

const FIELDS = Object.keys(DAY) as (keyof SkyKey)[];

function blend(out: SkyKey, a: SkyKey, b: SkyKey, k: number): void {
  for (const f of FIELDS) {
    const va = a[f];
    const vb = b[f];
    if (typeof va === 'number') (out[f] as number) = va + ((vb as number) - va) * k;
    else (out[f] as Color).copy(va).lerp(vb as Color, k);
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Computes the sky and lights of a calendar moment (reuses one output object). */
export class DayCycle {
  private readonly out: SkyState = {
    ...key({
      zenith: '#000',
      mid: '#000',
      horizon: '#000',
      below: '#000',
      cloud: '#000',
      cloudShade: '#000',
      sun: '#000',
      sunIntensity: 0,
      hemiSky: '#000',
      hemiGround: '#000',
      hemiIntensity: 0,
    }),
    lightDir: new Vector3(),
    daylight: 1,
    night: 0,
  };
  private readonly tmp: SkyKey = { ...this.out };

  constructor() {
    for (const f of FIELDS) {
      const v = this.out[f];
      if (v instanceof Color) (this.tmp[f] as Color) = v.clone();
    }
  }

  update(c: CalendarView): SkyState {
    const nightShare = CALENDAR.nightMs[c.season] / CALENDAR.dayMs;
    const dayShare = 1 - nightShare;
    const p = c.dayProgress;
    // Sun elevation: an arc over the day, negative during the night.
    const elevation =
      p < dayShare
        ? Math.sin((Math.PI * p) / dayShare)
        : -Math.sin((Math.PI * (p - dayShare)) / nightShare);
    const daylight = smoothstep(-0.2, 0.15, elevation);
    const twilight = Math.exp(-((elevation / 0.2) ** 2));
    const morning = p < dayShare / 2 || p >= dayShare + nightShare / 2;
    blend(this.tmp, NIGHT, DAY, daylight);
    blend(this.out, this.tmp, morning ? DAWN : DUSK, twilight * 0.65);
    this.out.daylight = daylight;
    this.out.night = 1 - smoothstep(-0.45, 0.05, elevation);

    if (p < dayShare) {
      // The sun crosses the sky from east to west, never too low (shadows stay short).
      const a = (Math.PI * p) / dayShare;
      const h = 0.35 + 0.9 * Math.max(0, elevation);
      this.out.lightDir.set(Math.cos(a) * -1, h, 0.45 - Math.sin(a) * 0.25).normalize();
    } else {
      // A moon high in the sky, drifting slowly.
      const a = (p - dayShare) / nightShare;
      this.out.lightDir.set(0.5 - a, 1.4, -0.4).normalize();
    }
    return this.out;
  }
}
