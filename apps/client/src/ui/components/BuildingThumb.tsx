import { useEffect, useState } from 'preact/hooks';
import { ageOf, type BuildingType } from '@kiwar/shared';
import { onThumbnail, thumbnailReady, thumbnailUrl, type ThumbKey } from '../../render/thumbnails';
import { buildingIcon, Icon } from '../iconSet';
import { useUi } from '../store';

/**
 * Chantier 33: the real building as a small picture (see `render/thumbnails.ts`), a black
 * silhouette when locked; its SVG icon while the picture is being drawn.
 */
export function BuildingThumb({
  type,
  level = 1,
  locked = false,
  size = 30,
}: {
  type: BuildingType;
  level?: number;
  locked?: boolean;
  size?: number;
}) {
  const colonyAge = useUi((s) => (s.game ? ageOf(s.game) : 0));
  const key: ThumbKey = { type, level, locked, colonyAge };
  const url = thumbnailUrl(key);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (url) return;
    return onThumbnail(() => {
      if (thumbnailReady(key)) redraw((n) => n + 1);
    });
  }, [url, type, level, locked, colonyAge]);
  if (!url)
    return (
      <span
        class={`building-thumb is-icon ${locked ? 'is-locked' : ''}`}
        style={{ width: `${size}px`, height: `${size}px` }}
        aria-hidden="true"
      >
        <Icon name={buildingIcon(type)} size={Math.round(size * 0.72)} />
      </span>
    );
  return (
    <img
      class="building-thumb"
      src={url}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
