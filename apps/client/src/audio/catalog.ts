import { makeBinding, type BindingInput, type SoundBinding } from './binding';

/** Mixer buses; each has its own volume in the settings. */
export const BUSES = ['music', 'ambience', 'sfx', 'ui'] as const;
export type Bus = (typeof BUSES)[number];

export type EventGroup = 'ui' | 'build' | 'colony' | 'expedition' | 'ambience' | 'music';

interface EventMeta {
  bus: Bus;
  group: EventGroup;
  /** Declared for a later chantier: never fired by the game yet. */
  reserved?: boolean;
  default: BindingInput;
}

/**
 * Every sound the game can make. The game code never plays a file: it emits one of these
 * events, and the binding (default here, overridable from the admin space) decides the sound.
 */
export const SOUND_EVENTS = {
  'ui.click': { bus: 'ui', group: 'ui', default: { sources: ['synth:click'], pitchVariation: 1 } },
  'ui.select': {
    bus: 'ui',
    group: 'ui',
    default: { sources: ['synth:tick'], pitchVariation: 1.5, volume: 0.8 },
  },
  'ui.open': { bus: 'ui', group: 'ui', default: { sources: ['synth:open'] } },
  'ui.close': { bus: 'ui', group: 'ui', default: { sources: ['synth:close'] } },
  'ui.error': { bus: 'ui', group: 'ui', default: { sources: ['synth:error'], cooldownMs: 300 } },
  'ui.notify': { bus: 'ui', group: 'ui', default: { sources: ['synth:notify'], cooldownMs: 1500 } },
  'build.start': {
    bus: 'sfx',
    group: 'build',
    default: { sources: ['synth:place'], pitchVariation: 1, spatial: true },
  },
  'build.complete': {
    bus: 'sfx',
    group: 'build',
    default: { sources: ['synth:complete'], cooldownMs: 400, spatial: true },
  },
  'build.upgrade': {
    bus: 'sfx',
    group: 'build',
    default: { sources: ['synth:upgrade'], cooldownMs: 400, spatial: true },
  },
  'build.remove': {
    bus: 'sfx',
    group: 'build',
    default: { sources: ['synth:remove'], pitchVariation: 1, spatial: true },
  },
  'path.paint': {
    bus: 'sfx',
    group: 'build',
    default: { sources: ['synth:paint'], pitchVariation: 3, cooldownMs: 60 },
  },
  'harvest.gather': {
    bus: 'sfx',
    group: 'colony',
    default: { sources: ['synth:gather'], pitchVariation: 1, spatial: true },
  },
  'egg.lay': { bus: 'sfx', group: 'colony', default: { sources: ['synth:egg'] } },
  'egg.hatch': { bus: 'sfx', group: 'colony', default: { sources: ['synth:hatch'] } },
  'kiwi.voice': {
    bus: 'sfx',
    group: 'colony',
    default: {
      sources: ['synth:voice1', 'synth:voice2', 'synth:voice3'],
      pitchVariation: 0.7,
      cooldownMs: 250,
      maxVoices: 2,
      spatial: true,
    },
  },
  'kiwi.chirp': {
    bus: 'sfx',
    group: 'colony',
    default: {
      sources: ['synth:chirp'],
      pitchVariation: 2,
      cooldownMs: 6000,
      probability: 0.6,
      volume: 0.6,
      maxVoices: 1,
      spatial: true,
      conditions: { zoomMax: 0.45 },
    },
  },
  'storage.full': {
    bus: 'sfx',
    group: 'colony',
    default: { sources: ['synth:full'], cooldownMs: 5000 },
  },
  'ship.launch': { bus: 'sfx', group: 'expedition', default: { sources: ['synth:launch'] } },
  'ship.arrive': {
    bus: 'sfx',
    group: 'expedition',
    default: { sources: ['synth:arrive'], cooldownMs: 1000 },
  },
  'ship.return': {
    bus: 'sfx',
    group: 'expedition',
    default: { sources: ['synth:return'], cooldownMs: 1000 },
  },
  'threat.warning': {
    bus: 'sfx',
    group: 'colony',
    reserved: true,
    default: { sources: ['synth:warning'], cooldownMs: 3000 },
  },
  'ambience.nature': {
    bus: 'ambience',
    group: 'ambience',
    default: { sources: ['synth:nature'], loop: true, fadeInMs: 2000, fadeOutMs: 2000 },
  },
  'ambience.wind': {
    bus: 'ambience',
    group: 'ambience',
    default: { sources: ['synth:wind'], loop: true, fadeInMs: 2000, fadeOutMs: 2000 },
  },
  'ambience.day': {
    bus: 'ambience',
    group: 'ambience',
    reserved: true,
    default: { loop: true, fadeInMs: 3000, fadeOutMs: 3000, conditions: { timeOfDay: 'day' } },
  },
  'ambience.night': {
    bus: 'ambience',
    group: 'ambience',
    reserved: true,
    default: { loop: true, fadeInMs: 3000, fadeOutMs: 3000, conditions: { timeOfDay: 'night' } },
  },
  'music.main': {
    bus: 'music',
    group: 'music',
    default: { loop: true, fadeInMs: 4000, fadeOutMs: 3000, volume: 0.7 },
  },
} satisfies Record<string, EventMeta>;

export type SoundEventId = keyof typeof SOUND_EVENTS;
export const SOUND_EVENT_IDS = Object.keys(SOUND_EVENTS) as SoundEventId[];

export function eventMeta(id: SoundEventId): EventMeta {
  return SOUND_EVENTS[id];
}

export function isSoundEventId(id: string): id is SoundEventId {
  return Object.hasOwn(SOUND_EVENTS, id);
}

export function defaultBinding(id: SoundEventId): SoundBinding {
  return makeBinding(SOUND_EVENTS[id].default);
}

export function defaultBindings(): Record<SoundEventId, SoundBinding> {
  return Object.fromEntries(SOUND_EVENT_IDS.map((id) => [id, defaultBinding(id)])) as Record<
    SoundEventId,
    SoundBinding
  >;
}
