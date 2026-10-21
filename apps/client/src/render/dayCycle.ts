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
  /** A warm back light without shadow, strongest at the golden hours (rims of the shapes). */
  rim: Color;
  rimIntensity: number;
}

const key = (o: Record<keyof SkyKey, string | number>): SkyKey =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? v : new Color(v)]),
  ) as unknown as SkyKey;

/*
 * Chantier 23: continuous curves instead of four blended presets. Two strings of keys along the
 * sun's elevation (1 at noon, 0 on the horizon, -1 at midnight): the morning one is rosier and
 * cooler, the evening one more golden. Between two keys every colour and intensity is a
 * smooth interpolation, so the light flows from one moment to the next.
 */
const NOON: SkyKey = {
  zenith: PALETTE.skyZenith,
  mid: PALETTE.skyMid,
  horizon: PALETTE.skyHorizon,
  below: PALETTE.skyBelow,
  cloud: PALETTE.cloud,
  cloudShade: PALETTE.cloudShade,
  // Midday: a frank, almost neutral sun and crisp short shadows.
  sun: new Color('#fff0d8'),
  sunIntensity: 2.55,
  hemiSky: PALETTE.hemiSky,
  hemiGround: PALETTE.hemiGround,
  hemiIntensity: 1.3,
  rim: new Color('#ffd9a0'),
  rimIntensity: 0,
};

const HIGH = { ...NOON, sun: PALETTE.sun, sunIntensity: 2.6, hemiIntensity: 1.35 };

// Nights stay readable: a bright blue moonlight rather than darkness.
const NIGHT = key({
  zenith: '#1c1e4a',
  mid: '#363c80',
  horizon: '#6c6cae',
  below: '#4c4a8a',
  cloud: '#9496cc',
  cloudShade: '#5f5c9c',
  sun: '#a4b8ff',
  sunIntensity: 0.75,
  hemiSky: '#9da2d4',
  hemiGround: '#46425e',
  hemiIntensity: 0.85,
  rim: '#7c8cff',
  rimIntensity: 0.12,
});

// The blue hour: the sun just under the horizon, the sky violet, the horizon still warm.
const BLUE_EVENING = key({
  zenith: '#2a2c6c',
  mid: '#5c4c9e',
  horizon: '#d0809a',
  below: '#7a5a9c',
  cloud: '#b89ad0',
  cloudShade: '#6a5a9e',
  sun: '#8c92e8',
  sunIntensity: 0.3,
  hemiSky: '#9a92d8',
  hemiGround: '#6a4c6c',
  hemiIntensity: 0.9,
  rim: '#ff9a7a',
  rimIntensity: 0.2,
});

const SUNSET = key({
  zenith: '#4e4c9e',
  mid: '#d47aa4',
  horizon: '#ff9458',
  below: '#e48a9c',
  cloud: '#ffb48c',
  cloudShade: '#b2709e',
  sun: '#ff8442',
  sunIntensity: 2.3,
  // Blue-violet fill from the sky against the orange sun.
  hemiSky: '#c8a8ea',
  hemiGround: '#ff9c70',
  hemiIntensity: 1.35,
  rim: '#ffb060',
  rimIntensity: 0.55,
});

const GOLDEN_EVENING = key({
  zenith: '#6a62b8',
  mid: '#e6a2c0',
  horizon: '#ffbc7c',
  below: '#f4aab4',
  cloud: '#ffdcb8',
  cloudShade: '#dc98b0',
  sun: '#ffae58',
  sunIntensity: 2.8,
  hemiSky: '#d6c0f0',
  hemiGround: '#ffb47c',
  hemiIntensity: 1.3,
  rim: '#ffc070',
  rimIntensity: 0.45,
});

const BLUE_MORNING = key({
  zenith: '#2c3274',
  mid: '#5e5aa8',
  horizon: '#d89cc0',
  below: '#7e6ab0',
  cloud: '#bcaee0',
  cloudShade: '#6c64a8',
  sun: '#9aa2f0',
  sunIntensity: 0.3,
  hemiSky: '#a2a6e0',
  hemiGround: '#6c5478',
  hemiIntensity: 0.9,
  rim: '#ffaab8',
  rimIntensity: 0.18,
});

const SUNRISE = key({
  zenith: '#5c5cb0',
  mid: '#e092c6',
  horizon: '#ffa490',
  below: '#eea2bc',
  cloud: '#ffc8c4',
  cloudShade: '#bc84b4',
  sun: '#ff9e94',
  sunIntensity: 2.3,
  hemiSky: '#c4b0f0',
  hemiGround: '#ffa4a8',
  hemiIntensity: 1.35,
  rim: '#ffb890',
  rimIntensity: 0.5,
});

const GOLDEN_MORNING = key({
  zenith: '#7468c0',
  mid: '#eaaed6',
  horizon: '#ffc4a0',
  below: '#f6b6c6',
  cloud: '#ffe2d6',
  cloudShade: '#e2a2be',
  sun: '#ffc6a2',
  sunIntensity: 2.8,
  hemiSky: '#dcc8f6',
  hemiGround: '#ffbc96',
  hemiIntensity: 1.3,
  rim: '#ffc8a0',
  rimIntensity: 0.4,
});

/** [elevation, key], from noon down to the night. */
const EVENING: [number, SkyKey][] = [
  [1, NOON],
  [0.6, HIGH],
  [0.3, GOLDEN_EVENING],
  [0.02, SUNSET],
  [-0.22, BLUE_EVENING],
  [-0.55, NIGHT],
];
const MORNING: [number, SkyKey][] = [
  [1, NOON],
  [0.6, HIGH],
  [0.3, GOLDEN_MORNING],
  [0.02, SUNRISE],
  [-0.22, BLUE_MORNING],
  [-0.55, NIGHT],
];

export interface SkyState extends SkyKey {
  /** Direction towards the light (sun by day, moon by night), normalised. */
  lightDir: Vector3;
  /** Direction towards the rim (back) light. */
  rimDir: Vector3;
  /** 0 at night, 1 in full day. */
  daylight: number;
  /** 1 deep in the night (lights, fireflies). */
  night: number;
}

const FIELDS = Object.keys(NOON) as (keyof SkyKey)[];

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
      rim: '#000',
      rimIntensity: 0,
    }),
    lightDir: new Vector3(),
    rimDir: new Vector3(0, 1, 0),
    daylight: 1,
    night: 0,
  };

  update(c: CalendarView): SkyState {
    const nightShare = CALENDAR.nightMs[c.season] / CALENDAR.dayMs;
    const dayShare = 1 - nightShare;
    const p = c.dayProgress;
    // Sun elevation: an arc over the day, negative during the night.
    const elevation =
      p < dayShare
        ? Math.sin((Math.PI * p) / dayShare)
        : -Math.sin((Math.PI * (p - dayShare)) / nightShare);
    const morning = p < dayShare / 2 || p >= dayShare + nightShare / 2;
    sample(this.out, morning ? MORNING : EVENING, elevation);
    this.out.daylight = smoothstep(-0.2, 0.15, elevation);
    this.out.night = 1 - smoothstep(-0.45, 0.05, elevation);

    // The sun's path goes on a little under the horizon (its light fading out) before the
    // moon takes over: the switch happens in the dim blue hour.
    const sunSide = p < dayShare || elevation > MOON_SWITCH;
    if (sunSide) {
      // East to west, low on the horizon at dawn and dusk (long shadows), high at noon.
      const t = p < dayShare ? p / dayShare : p > dayShare + nightShare / 2 ? 0 : 1;
      const a = Math.PI * t;
      const h = 0.34 + 0.92 * Math.max(0, elevation);
      this.out.lightDir.set(-Math.cos(a), h, 0.45 - Math.sin(a) * 0.25).normalize();
    } else {
      // A cold moon, lower than the noon sun, drifting slowly across the night.
      const a = (p - dayShare) / nightShare;
      this.out.lightDir.set(0.6 - 1.2 * a, 1.05, -0.45).normalize();
    }
    // The rim comes from across the sun, low: it outlines what faces away from the light.
    this.out.rimDir.set(-this.out.lightDir.x, 0.25, -this.out.lightDir.z).normalize();
    return this.out;
  }
}

/** Under this elevation (just after sunset, before sunrise) the moon carries the light. */
const MOON_SWITCH = -0.1;

/** Interpolates the keys around `elevation` (keys sorted from high to low), smoothly. */
function sample(out: SkyKey, keys: [number, SkyKey][], elevation: number): void {
  for (let i = 1; i < keys.length; i++) {
    const [lo, b] = keys[i]!;
    if (elevation >= lo || i === keys.length - 1) {
      const [hi, a] = keys[i - 1]!;
      const t = Math.min(1, Math.max(0, (hi - elevation) / (hi - lo)));
      blend(out, a, b, t * t * (3 - 2 * t));
      return;
    }
  }
}
