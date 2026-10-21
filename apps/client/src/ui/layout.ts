import { useEffect, useState } from 'preact/hooks';

/**
 * Chantier 21: phones (portrait or landscape) and touch screens up to a small laptop get the
 * thumb bar and the named menu instead of the column of round buttons.
 */
export const THUMB_QUERY =
  '(max-width: 760px), (max-height: 520px), (pointer: coarse) and (max-width: 1500px)';

function matches(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(THUMB_QUERY).matches;
}

/** True while the thumb layout applies (follows rotations and resizes). */
export function useThumbLayout(): boolean {
  const [thumb, setThumb] = useState(matches);
  useEffect(() => {
    const mq = window.matchMedia?.(THUMB_QUERY);
    if (!mq) return;
    const update = () => setThumb(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return thumb;
}
