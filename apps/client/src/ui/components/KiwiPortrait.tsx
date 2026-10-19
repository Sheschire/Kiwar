import type { ClassId, ShinyColor } from '@kiwar/shared';

const SHINY_FILL: Record<ShinyColor, { body: string; head: string }> = {
  red: { body: '#e0503c', head: '#c5402f' },
  yellow: { body: '#f4c430', head: '#dcab1f' },
  green: { body: '#4cb04a', head: '#3c963b' },
  blue: { body: '#3f7fe0', head: '#3168c4' },
};

/** A kiwi drawn in SVG for lists and sheets (shiny colour, later class outfits). */
export function KiwiPortrait(props: {
  shiny: ShinyColor | null;
  size?: number;
  seed?: string;
  classId?: ClassId | null;
}) {
  const cls = props.classId ?? null;
  const size = props.size ?? 40;
  const fill = props.shiny ? SHINY_FILL[props.shiny] : { body: '#8a6440', head: '#7d5a39' };
  // A stable little head tilt per kiwi, for character.
  const tilt = props.seed ? (hash(props.seed) % 13) - 6 : 0;
  return (
    <svg
      class={`kiwi-portrait ${props.shiny ? 'is-shiny' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      {props.shiny && <circle cx="32" cy="32" r="30" class="kiwi-portrait-glow" />}
      <ellipse cx="32" cy="58" rx="18" ry="3.5" fill="#2b1a24" opacity="0.18" />
      <path
        d="M26 50 l-3 7 M26 50 l0 7 M38 50 l-1 7 M38 50 l2 7"
        stroke="#d9a35f"
        stroke-width="2.4"
        stroke-linecap="round"
      />
      {cls === 'scout' && (
        <path
          d="M22 30 L6 18 L12 32 L4 30 L18 38 Z"
          fill="#c9c0ae"
          stroke="#7a5233"
          stroke-width="1.2"
        />
      )}
      <ellipse cx="30" cy="38" rx="20" ry="15" fill={fill.body} />
      {cls === 'mayor' && (
        <path d="M18 27 L40 50" stroke="#c0504a" stroke-width="5" stroke-linecap="round" />
      )}
      {cls === 'warrior' && (
        <g>
          <path d="M14 48 L22 30" stroke="#d6d6d6" stroke-width="3" stroke-linecap="round" />
          <path d="M11 44 L19 48" stroke="#7a5233" stroke-width="3" stroke-linecap="round" />
        </g>
      )}
      {cls === 'builder' && <rect x="16" y="40" width="14" height="5" rx="1" fill="#7a5233" />}
      <g transform={`rotate(${tilt} 44 26)`}>
        <circle cx="44" cy="26" r="10" fill={fill.head} />
        <path
          d="M52 27 Q63 33 62 44"
          stroke="#e3c07a"
          stroke-width="3"
          fill="none"
          stroke-linecap="round"
        />
        <circle cx="47" cy="23.5" r="2" fill="#1a120e" />
        <circle cx="47.6" cy="22.9" r="0.6" fill="#fff" />
        {cls === 'builder' && (
          <path d="M33 21 Q44 8 55 21 L57 23 L31 23 Z" fill="#f2c14e" stroke="#b08a48" />
        )}
        {cls === 'warrior' && (
          <path
            d="M34 22 Q44 9 54 22 Z M43 10 L45 4"
            fill="#9c9382"
            stroke="#6b665c"
            stroke-width="1.5"
          />
        )}
        {cls === 'mage' && (
          <g>
            <path d="M32 21 L47 0 L56 21 Z" fill="#6a4fb3" />
            <path d="M30 21 L58 21" stroke="#4a3590" stroke-width="3" stroke-linecap="round" />
            <circle cx="46" cy="11" r="1.6" fill="#f2c14e" />
          </g>
        )}
        {cls === 'scout' && (
          <g>
            <path d="M36 21 L54 21" stroke="#4a3324" stroke-width="2" />
            <circle cx="47" cy="23" r="3.6" fill="#bfe3ff" stroke="#7a5233" stroke-width="1.6" />
          </g>
        )}
        {cls === 'mayor' && (
          <g>
            <rect x="36" y="4" width="15" height="14" rx="1" fill="#2b2522" />
            <rect x="32" y="16" width="23" height="3.5" rx="1.5" fill="#2b2522" />
            <rect x="36" y="13" width="15" height="2.5" fill="#c0504a" />
          </g>
        )}
      </g>
      <path
        d="M14 36 q6 -6 14 -2"
        stroke="#000"
        stroke-opacity="0.12"
        stroke-width="2"
        fill="none"
      />
      {props.shiny && (
        <g class="kiwi-portrait-sparkles" fill="#fffbe0">
          <path d="M12 12 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
          <path d="M54 8 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1z" />
        </g>
      )}
    </svg>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
