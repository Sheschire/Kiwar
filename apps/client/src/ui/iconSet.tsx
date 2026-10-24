import type { ComponentChildren } from 'preact';
import type { BuildingType, TechBranch } from '@kiwar/shared';
import {
  BookIcon,
  ClockIcon,
  EggIcon,
  FiberIcon,
  HammerIcon,
  JuiceIcon,
  KiwiIcon,
  PulpIcon,
  SeedsIcon,
  ShieldIcon,
  ShipIcon,
  StardustIcon,
  TargetIcon,
} from './icons';

/**
 * Chantier 11: one `<Icon name>` for buildings, effects and research branches, drawn inline
 * (no icon font). Same hand-drawn look as `icons.tsx`: 32×32, filled shapes, brown outlines.
 */

const WOOD = {
  fill: '#a7774a',
  stroke: '#5a3e26',
  'stroke-width': 1.8,
  'stroke-linejoin': 'round',
} as const;
const PAPER = {
  fill: '#f4e6c4',
  stroke: '#5a3e26',
  'stroke-width': 1.8,
  'stroke-linejoin': 'round',
} as const;
const STONE = {
  fill: '#b7bdc0',
  stroke: '#4e5559',
  'stroke-width': 1.8,
  'stroke-linejoin': 'round',
} as const;
const LEAF = {
  fill: '#8cc43c',
  stroke: '#4f7419',
  'stroke-width': 1.8,
  'stroke-linejoin': 'round',
} as const;
const GOLD = {
  fill: '#ffd95a',
  stroke: '#c99a1e',
  'stroke-width': 1.6,
  'stroke-linejoin': 'round',
} as const;
const LINE = {
  fill: 'none',
  stroke: '#5a3e26',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

const GLYPHS = {
  // Buildings
  nest: (
    <>
      <path d="M4 18c2 7 22 7 24 0z" {...WOOD} />
      <path d="M6 18c4-3 16-3 20 0" {...LINE} />
      <ellipse cx="12" cy="15" rx="3" ry="4" fill="#fff6e0" stroke="#a88360" stroke-width="1.5" />
      <ellipse cx="19" cy="14.5" rx="3" ry="4" fill="#fff6e0" stroke="#a88360" stroke-width="1.5" />
    </>
  ),
  pulpery: (
    <>
      <path d="M6 27V14l10-7 10 7v13z" {...WOOD} />
      <path d="M16 24c-3 0-5-2-5-5 0-3 5-7 5-7s5 4 5 7c0 3-2 5-5 5z" {...LEAF} />
    </>
  ),
  fiberWorkshop: (
    <>
      <path d="M5 27V15l11-8 11 8v12z" {...WOOD} />
      <circle cx="16" cy="20" r="5" fill="#e5cf9c" stroke="#8a6a3e" stroke-width="1.6" />
      <path d="M12 18h8M12 21h8" stroke="#b99760" stroke-width="1.3" />
    </>
  ),
  seedQuarry: (
    <>
      <path d="M3 27l7-13 6 6 4-8 9 15z" {...STONE} />
      <ellipse cx="20" cy="22" rx="2.4" ry="4" transform="rotate(20 20 22)" fill="#2a1f1a" />
      <ellipse cx="12" cy="23" rx="2.2" ry="3.6" transform="rotate(-20 12 23)" fill="#3a2b22" />
    </>
  ),
  juiceWell: (
    <>
      <path d="M8 6h16M10 6v8M22 6v8" {...LINE} />
      <path d="M7 15h18v10a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" {...STONE} />
      <ellipse cx="16" cy="16" rx="8" ry="2.4" fill="#c9dc2e" stroke="#7d8c10" stroke-width="1.4" />
    </>
  ),
  hut: (
    <>
      <path d="M4 26c0-9 5-15 12-15s12 6 12 15z" {...WOOD} />
      <path d="M8 16c3-3 13-3 16 0M6 21c4-2 16-2 20 0" stroke="#7a5233" stroke-width="1.4" />
      <path d="M13 26v-5a3 3 0 0 1 6 0v5z" fill="#3a2b22" />
    </>
  ),
  warehouse: (
    <>
      <rect x="5" y="13" width="22" height="14" rx="1.5" {...WOOD} />
      <path d="M3 14l13-8 13 8" {...LINE} />
      <path d="M5 20h22M12 13v14M20 13v14" stroke="#5a3e26" stroke-width="1.4" />
    </>
  ),
  launchpad: <ShipIcon size={32} />,
  school: (
    <>
      <path d="M3 13l13-6 13 6-13 6z" fill="#4a5a8a" stroke="#2a3150" stroke-width="1.8" />
      <path d="M8 16v6c3 3 13 3 16 0v-6" fill="#6a7ab0" stroke="#2a3150" stroke-width="1.8" />
      <path d="M26 14v8" stroke="#ffd95a" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  library: <BookIcon size={32} />,
  monument: (
    <>
      <path d="M4 27h24" {...LINE} />
      <rect x="6" y="11" width="5" height="16" rx="1" {...STONE} />
      <rect x="21" y="11" width="5" height="16" rx="1" {...STONE} />
      <rect x="4" y="7" width="24" height="4" rx="1" {...STONE} />
      <circle cx="16" cy="19" r="3" {...GOLD} />
    </>
  ),
  forge: (
    <>
      <path
        d="M5 11h17c0 3-2 5-5 5h-1l2 6h3v4H10v-4h3l2-6h-2C8 16 5 14 5 11z"
        fill="#50575d"
        stroke="#2f3336"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
      <path
        d="M22 11h4l-4 3z"
        fill="#50575d"
        stroke="#2f3336"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <path
        d="M20 4l3 3M24 3l-1 3M17 5l2 2"
        stroke="#ffb347"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </>
  ),
  // Chantier 43: the campfire (crossed logs and a flame).
  campfire: (
    <>
      <path d="M6 27l20-6M26 27L6 21" stroke="#7a5233" stroke-width="3" stroke-linecap="round" />
      <path
        d="M16 23c-5 0-7-4-5-8 1 2 2 2 3 1-1-4 1-8 4-10 0 4 5 6 5 11 0 4-3 6-7 6z"
        fill="#ff8a3d"
        stroke="#a8461f"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
      <path d="M16 22c-2 0-3-2-2-4 1 1 2 0 2-2 2 1 3 3 2 5-1 1-1 1-2 1z" fill="#ffd95a" />
    </>
  ),
  // Chantier 43: the Town Hall (a gabled hall with a balcony and a flag).
  townHall: (
    <>
      <path d="M16 3v6" stroke="#5a3e26" stroke-width="1.6" stroke-linecap="round" />
      <path d="M16 3h7l-2 2 2 2h-7z" fill="#c0504a" stroke="#7a2e2a" stroke-width="1.2" />
      <path d="M4 15l12-7 12 7z" fill="#b5653a" stroke="#5a3e26" stroke-width="1.6" />
      <rect
        x="6"
        y="15"
        width="20"
        height="12"
        fill="#f1dfb6"
        stroke="#5a3e26"
        stroke-width="1.6"
      />
      <path d="M13 27v-6a3 3 0 0 1 6 0v6" fill="#7a5233" stroke="#5a3e26" stroke-width="1.4" />
      <path d="M10 18v3M22 18v3" stroke="#5a3e26" stroke-width="1.6" stroke-linecap="round" />
      <path d="M3 27h26" stroke="#5a3e26" stroke-width="1.6" stroke-linecap="round" />
    </>
  ),
  trainingCamp: (
    <>
      <circle cx="16" cy="17" r="10" fill="#fbf6ea" stroke="#5a3e26" stroke-width="1.8" />
      <circle cx="16" cy="17" r="6" fill="#c0504a" />
      <circle cx="16" cy="17" r="2.4" fill="#ffd95a" />
      <path d="M5 5l22 22M27 5L5 27" stroke="#50575d" stroke-width="2.6" stroke-linecap="round" />
    </>
  ),
  lab: (
    <>
      <path d="M12 4h8M13 4v8l-7 13a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3l-7-13V4" {...PAPER} />
      <path d="M8.5 21h15l2 4a2 2 0 0 1-2 3H8.5a2 2 0 0 1-2-3z" fill="#7bd04a" />
      <circle cx="14" cy="16" r="1.4" fill="#7bd04a" />
    </>
  ),
  camp: (
    <>
      <path
        d="M4 27L16 6l12 21z"
        fill="#d9b36c"
        stroke="#5a3e26"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M16 27l-4-9h8z" fill="#5a3e26" />
    </>
  ),
  seedTurret: (
    <>
      <rect x="9" y="14" width="14" height="13" rx="1.5" {...WOOD} />
      <path d="M8 14h16v-4h-3v2h-3v-2h-4v2h-3v-2H8z" {...WOOD} />
      <path d="M16 18l9-6" stroke="#3a2b22" stroke-width="3.4" stroke-linecap="round" />
    </>
  ),
  skyTurret: (
    <>
      <path d="M10 27l2-12h8l2 12z" {...WOOD} />
      <path d="M16 15l6-11" stroke="#3a2b22" stroke-width="3.4" stroke-linecap="round" />
      <circle cx="23" cy="5" r="2" fill="#2a1f1a" />
      <circle cx="27" cy="9" r="1.5" fill="#2a1f1a" />
    </>
  ),

  // Effects
  workers: <KiwiIcon size={32} />,
  housing: (
    <>
      <rect
        x="4"
        y="15"
        width="24"
        height="7"
        rx="2"
        fill="#e8d6ad"
        stroke="#5a3e26"
        stroke-width="1.8"
      />
      <rect
        x="5"
        y="11"
        width="8"
        height="5"
        rx="2.5"
        fill="#fff8e6"
        stroke="#5a3e26"
        stroke-width="1.6"
      />
      <path d="M6 22v4M26 22v4" {...LINE} />
    </>
  ),
  storage: (
    <>
      <rect x="5" y="14" width="10" height="10" {...WOOD} />
      <rect x="17" y="14" width="10" height="10" {...WOOD} />
      <rect x="11" y="5" width="10" height="9" {...WOOD} />
      <path d="M5 14l10 10M17 14l10 10M11 5l10 9" stroke="#5a3e26" stroke-width="1.2" />
    </>
  ),
  defenseGround: <ShieldIcon size={32} />,
  defenseAir: (
    <>
      <path
        d="M16 12c-2-4-7-6-13-4 3 2 3 5 2 8 3-2 6-1 8 2 1-2 2-4 3-6 1 2 2 4 3 6 2-3 5-4 8-2-1-3-1-6 2-8-6-2-11 0-13 4z"
        fill="#5a4a6a"
        stroke="#2e2440"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M16 20v8M12 24l4 4 4-4"
        stroke="#b5475b"
        stroke-width="2.2"
        fill="none"
        stroke-linecap="round"
      />
    </>
  ),
  ammo: <SeedsIcon size={32} />,
  cargo: (
    <>
      <path
        d="M10 9h12l-2 3c5 3 7 7 7 10a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6c0-3 2-7 7-10z"
        fill="#d9b36c"
        stroke="#5a3e26"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M11 12h10" {...LINE} />
    </>
  ),
  speed: (
    <>
      <path d="M8 16a10 10 0 1 1 3 7" {...LINE} />
      <path d="M18 16l5-6" stroke="#b5475b" stroke-width="2.4" stroke-linecap="round" />
      <path d="M2 12h5M1 17h5M3 22h5" stroke="#8cc43c" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  training: (
    <>
      <path d="M3 13l13-6 13 6-13 6z" fill="#4a5a8a" stroke="#2a3150" stroke-width="1.8" />
      <path d="M8 16v6c3 3 13 3 16 0v-6" fill="#6a7ab0" stroke="#2a3150" stroke-width="1.8" />
    </>
  ),
  time: <ClockIcon size={32} />,
  research: <BookIcon size={32} />,
  limit: (
    <>
      <path d="M3 27v-9l6-5 6 5v9z" {...WOOD} />
      <path d="M17 27v-9l6-5 6 5v9z" {...WOOD} />
      <path d="M10 13v-4l6-5 6 5v4" {...WOOD} />
    </>
  ),
  queue: <HammerIcon size={32} />,
  morale: (
    <>
      <circle cx="16" cy="16" r="12" {...GOLD} />
      <circle cx="12" cy="13" r="1.6" fill="#5a3e26" />
      <circle cx="20" cy="13" r="1.6" fill="#5a3e26" />
      <path d="M10 18c3 4 9 4 12 0" {...LINE} />
    </>
  ),
  harvest: (
    <>
      <path d="M5 15h22l-3 11H8z" {...WOOD} />
      <path d="M8 19h16M9 23h14" stroke="#5a3e26" stroke-width="1.2" />
      <circle cx="12" cy="12" r="4" {...LEAF} />
      <circle cx="19" cy="11" r="4" fill="#c9dc2e" stroke="#7d8c10" stroke-width="1.6" />
    </>
  ),
  guard: (
    <>
      <path d="M8 28L22 6" stroke="#7a5233" stroke-width="2.6" stroke-linecap="round" />
      <path d="M19 4l7-1-1 7z" {...STONE} />
      <path d="M6 16l4-2 2 4-4 2z" {...WOOD} />
    </>
  ),
  rations: (
    <>
      <path d="M4 14h24a12 10 0 0 1-24 0z" {...WOOD} />
      <circle cx="12" cy="11" r="3.5" {...LEAF} />
      <circle cx="19" cy="10" r="3.5" fill="#c9dc2e" stroke="#7d8c10" stroke-width="1.6" />
    </>
  ),
  injuries: (
    <>
      <rect
        x="4"
        y="11"
        width="24"
        height="10"
        rx="5"
        transform="rotate(-35 16 16)"
        fill="#fff8e6"
        stroke="#5a3e26"
        stroke-width="1.8"
      />
      <path d="M13 13l6 6M19 13l-6 6" stroke="#b5475b" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  iron: (
    <>
      <path
        d="M6 20l4-9 7-4 8 4 2 8-6 6H11z"
        fill="#4c5560"
        stroke="#2c3238"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path d="M12 12l5-2 4 3-3 3z" fill="#9fb4c8" />
      <path
        d="M19 19l3-1 1 3"
        stroke="#c9d8e6"
        stroke-width="1.4"
        stroke-linecap="round"
        fill="none"
      />
    </>
  ),
  armor: (
    <>
      <path d="M16 4l10 3.5v7c0 6.5-4.4 11-10 13.5C10.4 25.5 6 21 6 14.5v-7z" {...STONE} />
      <path d="M11 13h10M11 18h10" stroke="#4e5559" stroke-width="1.6" />
    </>
  ),
  recon: (
    <>
      <path
        d="M3 16c4-7 22-7 26 0-4 7-22 7-26 0z"
        fill="#fff8e6"
        stroke="#5a3e26"
        stroke-width="1.8"
      />
      <circle cx="16" cy="16" r="5" {...LEAF} />
      <circle cx="16" cy="16" r="2" fill="#1d1410" />
    </>
  ),
  firearms: (
    <>
      <path
        d="M3 13h22v4H12l-2 9H5l2-9H3z"
        fill="#4e5559"
        stroke="#2a2f32"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path d="M26 15h4" stroke="#ffd95a" stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  terraform: (
    <>
      <path d="M2 27l9-15 5 7 4-5 10 13z" {...LEAF} />
      <path
        d="M16 3v6M13 6l3 3 3-3"
        stroke="#b5475b"
        stroke-width="2.2"
        fill="none"
        stroke-linecap="round"
      />
    </>
  ),
  titan: (
    <>
      <ellipse cx="15" cy="18" rx="11" ry="9" fill="#7bd04a" stroke="#3f7a1c" stroke-width="1.8" />
      <path d="M24 15l7 4" stroke="#d8b878" stroke-width="2.4" stroke-linecap="round" />
      <circle cx="21" cy="14" r="1.6" fill="#1d1410" />
      <path
        d="M9 9l2 3M15 7v3M21 8l-1 3"
        stroke="#3f7a1c"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </>
  ),
  risk: (
    <>
      <path d="M16 4l13 23H3z" {...GOLD} />
      <path d="M16 12v7" stroke="#5a3e26" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="16" cy="23" r="1.6" fill="#5a3e26" />
    </>
  ),
  age: (
    <>
      <path d="M4 27h24" {...LINE} />
      <path d="M7 27V12l3-3 3 3v15M19 27V8l3-3 3 3v19" {...STONE} />
      <circle cx="16" cy="9" r="3" {...GOLD} />
    </>
  ),
  target: <TargetIcon size={32} />,
  stardust: <StardustIcon size={32} />,
  night: (
    <>
      <path
        d="M20 5a11 11 0 1 0 7 19A12 12 0 0 1 20 5z"
        fill="#f4e3a6"
        stroke="#7a5233"
        stroke-width="2"
      />
      <path d="M8 8l.8 2 2 .8-2 .8L8 13.6l-.8-2-2-.8 2-.8z" fill="#ffd45e" />
    </>
  ),
  comet: (
    <>
      <path
        d="M4 6c8 4 13 8 17 12"
        stroke="#7fcaf5"
        stroke-width="3"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M9 4c6 4 10 7 13 11"
        stroke="#ffd45e"
        stroke-width="2"
        stroke-linecap="round"
        fill="none"
      />
      <circle cx="23" cy="21" r="5" fill="#ffd45e" stroke="#a8741c" stroke-width="2" />
    </>
  ),
  egg: <EggIcon size={32} />,
  pulp: <PulpIcon size={32} />,
  fiber: <FiberIcon size={32} />,
  seeds: <SeedsIcon size={32} />,
  juice: <JuiceIcon size={32} />,
  locked: (
    <>
      <rect x="7" y="14" width="18" height="14" rx="2" {...GOLD} />
      <path d="M11 14v-4a5 5 0 0 1 10 0v4" {...LINE} />
      <circle cx="16" cy="21" r="2" fill="#5a3e26" />
    </>
  ),
  levels: (
    <>
      <circle cx="16" cy="16" r="12" fill="#fbf3df" stroke="#7a5233" stroke-width="2.4" />
      <path
        d="M10 18l6-7 6 7"
        stroke="#4f9a1c"
        stroke-width="3"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 22h8" stroke="#7a5233" stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  logistics: (
    <>
      <path
        d="M7 24c4-1 4-8 9-8s5-7 9-8"
        stroke="#c9a46a"
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
      />
      <path
        d="M7 24c4-1 4-8 9-8s5-7 9-8"
        stroke="#7a5233"
        stroke-width="1.6"
        stroke-dasharray="2 3"
        fill="none"
        stroke-linecap="round"
      />
      <circle cx="7" cy="24" r="3.4" fill="#a8d65a" stroke="#4a3324" stroke-width="1.6" />
      <rect
        x="21.5"
        y="4.5"
        width="7"
        height="6"
        rx="1.4"
        fill="#e5cf9c"
        stroke="#4a3324"
        stroke-width="1.6"
      />
    </>
  ),
} satisfies Record<string, ComponentChildren>;

export type IconName = keyof typeof GLYPHS;

/** Research branches (the passage of the ages, nature reshaped…). */
export const BRANCH_ICONS: Record<TechBranch, IconName> = {
  economy: 'harvest',
  defense: 'defenseGround',
  exploration: 'recon',
  passage: 'age',
  unnatural: 'lab',
  stars: 'stardust',
};

export function buildingIcon(type: BuildingType): IconName {
  return type;
}

export function Icon({
  name,
  size = 18,
  class: cls,
}: {
  name: IconName;
  size?: number;
  class?: string;
}) {
  const glyph = GLYPHS[name];
  return (
    <svg
      class={`icon icon-${name} ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  );
}
