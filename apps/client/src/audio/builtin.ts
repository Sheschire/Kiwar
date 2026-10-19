/**
 * Sound files shipped in `public/audio/` (CC0, credits in docs/AUDIO_CREDITS.md). Each exists
 * as `.ogg` and `.mp3`: references omit the extension and the browser gets the one it plays.
 */
export const BUILTIN_FILES: readonly string[] = [
  'ui/click1',
  'ui/click2',
  'ui/tick',
  'ui/open',
  'ui/close',
  'ui/error',
  'ui/notify',
  'build/wood1',
  'build/wood2',
  'build/wood3',
  'build/remove',
  'build/complete',
  'build/upgrade',
  'paths/step1',
  'paths/step2',
  'colony/gather',
  'colony/full',
  'ship/arrive',
  'ship/return',
  'ambience/birds',
  'ambience/wind',
  'music/small-fire',
];

let ext: 'ogg' | 'mp3' | null = null;

/** Ogg Vorbis loops seamlessly; mp3 is the fallback (older Safari). */
export function builtinExtension(): 'ogg' | 'mp3' {
  if (!ext) {
    let ogg = false;
    try {
      ogg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
    } catch {
      // no media element (tests)
    }
    ext = ogg ? 'ogg' : 'mp3';
  }
  return ext;
}
