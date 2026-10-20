import type { ComponentChildren } from 'preact';
import type { ResourceId, Season } from '@kiwar/shared';

interface IconProps {
  size?: number;
  class?: string;
}

const svg = (size: number, cls: string | undefined, children: ComponentChildren) => (
  <svg
    class={`icon ${cls ?? ''}`}
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export function PulpIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M16 3c5 6 10 11 10 17a10 10 0 0 1-20 0c0-6 5-11 10-17z"
        fill="#8cc43c"
        stroke="#4f7419"
        stroke-width="2"
      />
      <ellipse cx="12.5" cy="18" rx="2.5" ry="4" fill="#d6ee9a" opacity=".8" />
    </>,
  );
}

export function FiberIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <rect
        x="7"
        y="5"
        width="18"
        height="4"
        rx="2"
        fill="#a0784c"
        stroke="#5e4128"
        stroke-width="1.6"
      />
      <rect
        x="7"
        y="23"
        width="18"
        height="4"
        rx="2"
        fill="#a0784c"
        stroke="#5e4128"
        stroke-width="1.6"
      />
      <rect x="9" y="9" width="14" height="14" fill="#e5cf9c" stroke="#8a6a3e" stroke-width="1.6" />
      <path d="M9 12h14M9 15h14M9 18h14M9 21h14" stroke="#b99760" stroke-width="1.3" />
    </>,
  );
}

export function SeedsIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <ellipse cx="11" cy="17" rx="4.2" ry="7.5" transform="rotate(-25 11 17)" fill="#2a1f1a" />
      <ellipse cx="21" cy="15" rx="4.2" ry="7.5" transform="rotate(20 21 15)" fill="#3a2b22" />
      <ellipse
        cx="9.6"
        cy="14"
        rx="1.1"
        ry="2.3"
        transform="rotate(-25 9.6 14)"
        fill="#fff"
        opacity=".7"
      />
      <ellipse
        cx="19.8"
        cy="12"
        rx="1.1"
        ry="2.3"
        transform="rotate(20 19.8 12)"
        fill="#fff"
        opacity=".7"
      />
    </>,
  );
}

export function JuiceIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M8 6h16l-2 21H10z"
        fill="#fff8e6"
        stroke="#7a5a40"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M9.2 13h13.6l-1.4 13H10.6z" fill="#c9dc2e" />
      <circle cx="14" cy="18" r="1.3" fill="#fffde0" />
      <circle cx="18" cy="21.5" r="1" fill="#fffde0" />
      <path d="M20 3l-3 9" stroke="#e46c5c" stroke-width="2" stroke-linecap="round" />
    </>,
  );
}

export function KiwiIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <ellipse
        cx="14"
        cy="17"
        rx="10"
        ry="8.5"
        fill="#8a6440"
        stroke="#5a3e26"
        stroke-width="1.8"
      />
      <path d="M22 14l8 5" stroke="#d8b878" stroke-width="2.2" stroke-linecap="round" />
      <circle cx="20" cy="13.5" r="1.4" fill="#1d1410" />
      <path d="M11 25v4M16 25v4" stroke="#d8a060" stroke-width="2" stroke-linecap="round" />
    </>,
  );
}

export function EggIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M16 3c6 0 10 9 10 15a10 10 0 0 1-20 0C6 12 10 3 16 3z"
        fill="#fff6e0"
        stroke="#a88360"
        stroke-width="2"
      />
      <circle cx="12" cy="15" r="1.6" fill="#c8b48a" />
      <circle cx="19" cy="20" r="2" fill="#c8b48a" />
      <circle cx="15" cy="24" r="1.2" fill="#c8b48a" />
    </>,
  );
}

export function GearIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M16 4l2.2 3.2 3.8-.9.7 3.8 3.5 1.7-1.6 3.5 1.6 3.5-3.5 1.7-.7 3.8-3.8-.9L16 28l-2.2-3.2-3.8.9-.7-3.8-3.5-1.7 1.6-3.5-1.6-3.5 3.5-1.7.7-3.8 3.8.9z"
        fill="#d8c29a"
        stroke="#7a5a40"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle cx="16" cy="16" r="4" fill="#f6ead0" stroke="#7a5a40" stroke-width="1.8" />
    </>,
  );
}

export function ScrollIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M8 6h15a3 3 0 0 1 3 3v15H11a3 3 0 0 1-3-3z"
        fill="#f6ead0"
        stroke="#7a5a40"
        stroke-width="1.8"
      />
      <path
        d="M12 11h10M12 15h10M12 19h7"
        stroke="#a88360"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <circle cx="8" cy="24" r="3" fill="#e8d6ad" stroke="#7a5a40" stroke-width="1.6" />
    </>,
  );
}

export function HammerIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M14 13l11 11-3 3-11-11z"
        fill="#c09060"
        stroke="#6a4a2e"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M5 9l6-6 8 8-6 6z"
        fill="#9aa3a8"
        stroke="#4e5559"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </>,
  );
}

export function TargetIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <circle cx="16" cy="16" r="10" fill="none" stroke="#7a5a40" stroke-width="2" />
      <circle cx="16" cy="16" r="4" fill="#8cc43c" stroke="#4f7419" stroke-width="1.6" />
      <path
        d="M16 2v6M16 24v6M2 16h6M24 16h6"
        stroke="#7a5a40"
        stroke-width="2"
        stroke-linecap="round"
      />
    </>,
  );
}

export function CloseIcon({ size = 18, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <path d="M8 8l16 16M24 8L8 24" stroke="#7a5a40" stroke-width="3" stroke-linecap="round" />,
  );
}

export function ClockIcon({ size = 16, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <circle cx="16" cy="16" r="12" fill="#fff8e6" stroke="#7a5a40" stroke-width="2.4" />
      <path
        d="M16 9v7l5 3"
        stroke="#7a5a40"
        stroke-width="2.4"
        stroke-linecap="round"
        fill="none"
      />
    </>,
  );
}

export function ShipIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path d="M5 17h22a11 8 0 0 1-22 0z" fill="#8a6440" stroke="#5a3e26" stroke-width="1.8" />
      <ellipse
        cx="16"
        cy="17"
        rx="11"
        ry="2.4"
        fill="#8cc43c"
        stroke="#4f7419"
        stroke-width="1.4"
      />
      <path d="M16 15V4" stroke="#7a5233" stroke-width="2" stroke-linecap="round" />
      <path d="M16 5c6 1 8 5 7 9-3-1-5-1-7 0z" fill="#6fae2c" stroke="#4f7f1c" stroke-width="1.4" />
      <circle cx="16" cy="17" r="1.6" fill="#fbf3d0" />
    </>,
  );
}

export function GlobeIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <circle cx="12" cy="18" r="8" fill="#8cc43c" stroke="#4f7419" stroke-width="1.8" />
      <circle cx="12" cy="18" r="3" fill="#fbf3d0" />
      <circle cx="23" cy="10" r="6" fill="#b2d95f" stroke="#4f7419" stroke-width="1.6" />
      <circle cx="23" cy="10" r="2" fill="#fbf3d0" />
      <path d="M18 14l1.5-1.2" stroke="#7a5a40" stroke-width="1.6" stroke-dasharray="2 2" />
    </>,
  );
}

export function ChatIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M5 7h22v14H14l-6 5v-5H5z"
        fill="#fff8e6"
        stroke="#7a5a40"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <circle cx="11" cy="14" r="1.6" fill="#7a5a40" />
      <circle cx="16" cy="14" r="1.6" fill="#7a5a40" />
      <circle cx="21" cy="14" r="1.6" fill="#7a5a40" />
    </>,
  );
}

export function PathIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M9 29c2-6 9-6 10-11s-6-7-4-13"
        fill="none"
        stroke="#d9b36c"
        stroke-width="6"
        stroke-linecap="round"
      />
      <ellipse cx="10" cy="26" rx="3" ry="2" fill="#f4e6c4" stroke="#7a5233" stroke-width="1.5" />
      <ellipse cx="17" cy="19" rx="3" ry="2" fill="#f4e6c4" stroke="#7a5233" stroke-width="1.5" />
      <ellipse cx="15" cy="11" rx="3" ry="2" fill="#f4e6c4" stroke="#7a5233" stroke-width="1.5" />
      <ellipse
        cx="17"
        cy="4.5"
        rx="2.5"
        ry="1.7"
        fill="#f4e6c4"
        stroke="#7a5233"
        stroke-width="1.5"
      />
    </>,
  );
}

export function ResourceIcon({ id, size }: { id: ResourceId; size?: number }) {
  switch (id) {
    case 'pulp':
      return <PulpIcon size={size} />;
    case 'fiber':
      return <FiberIcon size={size} />;
    case 'seeds':
      return <SeedsIcon size={size} />;
    case 'juice':
      return <JuiceIcon size={size} />;
  }
}

export function SpeakerIcon({ size = 22, class: cls, muted }: IconProps & { muted?: boolean }) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M5 12h5l7-6v20l-7-6H5z"
        fill="#d8c29a"
        stroke="#7a5a40"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      {muted ? (
        <path
          d="M21 12l7 8m0-8l-7 8"
          stroke="#b5475b"
          stroke-width="2.2"
          stroke-linecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M21 11.5a6 6 0 0 1 0 9M24 8a11 11 0 0 1 0 16"
          stroke="#7a5a40"
          stroke-width="2"
          stroke-linecap="round"
          fill="none"
        />
      )}
    </>,
  );
}

const SEASON_GLYPHS: Record<Season, ComponentChildren> = {
  spring: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="16"
          cy="9.5"
          rx="4"
          ry="6"
          fill="#ffc6dc"
          stroke="#c76b93"
          stroke-width="1.4"
          transform={`rotate(${a} 16 16)`}
        />
      ))}
      <circle cx="16" cy="16" r="3.4" fill="#ffd95a" stroke="#c99a1e" stroke-width="1.4" />
    </>
  ),
  summer: (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path
          key={a}
          d="M16 2.5v5"
          stroke="#e8a21c"
          stroke-width="2.6"
          stroke-linecap="round"
          transform={`rotate(${a} 16 16)`}
        />
      ))}
      <circle cx="16" cy="16" r="7" fill="#ffd95a" stroke="#d08a12" stroke-width="2" />
    </>
  ),
  autumn: (
    <>
      <path
        d="M16 3c6 4 10 9 9 15-1 5-5 8-9 9-4-1-8-4-9-9-1-6 3-11 9-15z"
        fill="#e58a3a"
        stroke="#9a4f17"
        stroke-width="2"
      />
      <path d="M16 8v21M16 15l-4-3M16 19l5-4" stroke="#9a4f17" stroke-width="1.6" fill="none" />
    </>
  ),
  winter: (
    <>
      {[0, 60, 120].map((a) => (
        <g
          key={a}
          transform={`rotate(${a} 16 16)`}
          stroke="#5a8fc0"
          stroke-width="2.4"
          stroke-linecap="round"
        >
          <path d="M16 3v26" />
          <path d="M12 6l4 4 4-4M12 26l4-4 4 4" fill="none" />
        </g>
      ))}
    </>
  ),
};

export function SeasonIcon({ season, size = 18, class: cls }: IconProps & { season: Season }) {
  return svg(size, cls, SEASON_GLYPHS[season]);
}

/**
 * Day dial: the pale arc is the day, the blue one the night; the hand shows the hour
 * (`progress` 0–1 since dawn, `nightShare` of the day).
 */
export function DayDial({
  progress,
  nightShare,
  size = 26,
}: {
  progress: number;
  nightShare: number;
  size?: number;
}) {
  const arc = (from: number, to: number) => {
    const p = (x: number) => {
      const a = x * Math.PI * 2 - Math.PI / 2;
      return `${16 + Math.cos(a) * 11} ${16 + Math.sin(a) * 11}`;
    };
    return `M16 16L${p(from)}A11 11 0 ${to - from > 0.5 ? 1 : 0} 1 ${p(to)}Z`;
  };
  const a = progress * Math.PI * 2 - Math.PI / 2;
  const night = progress >= 1 - nightShare;
  return svg(
    size,
    'day-dial',
    <>
      <circle cx="16" cy="16" r="13" fill="#fff8e6" stroke="#7a5a40" stroke-width="2.2" />
      <path d={arc(0, 1 - nightShare)} fill="#ffe7a6" />
      <path d={arc(1 - nightShare, 1)} fill="#6c72c4" />
      <path
        d={`M16 16L${16 + Math.cos(a) * 9.5} ${16 + Math.sin(a) * 9.5}`}
        stroke="#7a5a40"
        stroke-width="2.4"
        stroke-linecap="round"
      />
      <circle
        cx={16 + Math.cos(a) * 9.5}
        cy={16 + Math.sin(a) * 9.5}
        r="3.2"
        fill={night ? '#f2f4ff' : '#ffc53d'}
        stroke="#7a5a40"
        stroke-width="1.4"
      />
    </>,
  );
}

/** Chantier 06: the colony's defense (a wooden shield with a seed). */
export function ShieldIcon({ size = 22, class: cls }: IconProps) {
  return svg(
    size,
    cls,
    <>
      <path
        d="M16 4l10 3.5v7c0 6.5-4.4 11-10 13.5C10.4 25.5 6 21 6 14.5v-7z"
        fill="#a7774a"
        stroke="#5a3e26"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M16 7.5v17" stroke="#7a5233" stroke-width="1.4" />
      <ellipse cx="16" cy="15" rx="3" ry="4" fill="#1f1612" />
    </>,
  );
}
