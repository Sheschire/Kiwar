import { makeBinding, type BindingInput, type SoundBinding } from './binding';
import type { SynthPresetId } from './synth';

/** Mixer buses; each has its own volume in the settings. */
export const BUSES = ['music', 'ambience', 'sfx', 'ui'] as const;
export type Bus = (typeof BUSES)[number];

export type EventGroup = 'ui' | 'build' | 'colony' | 'expedition' | 'ambience' | 'music';

interface EventMeta {
  bus: Bus;
  group: EventGroup;
  /** Declared for a later chantier: never fired by the game yet. */
  reserved?: boolean;
  /** Synthesized fallback when a file cannot be loaded or decoded. */
  synth?: SynthPresetId;
  default: BindingInput;
}

/**
 * Every sound the game can make. The game code never plays a file: it emits one of these
 * events, and the binding (default here, overridable from the admin space) decides the sound.
 */
export const SOUND_EVENTS = {
  'ui.click': {
    bus: 'ui',
    group: 'ui',
    synth: 'click',
    default: {
      sources: ['builtin:ui/click1', 'builtin:ui/click2'],
      volume: 0.6,
      pitchVariation: 1,
    },
  },
  'ui.select': {
    bus: 'ui',
    group: 'ui',
    synth: 'tick',
    default: { sources: ['builtin:ui/tick'], volume: 0.6, pitchVariation: 1.5 },
  },
  'ui.open': { bus: 'ui', group: 'ui', synth: 'open', default: { sources: ['builtin:ui/open'] } },
  'ui.close': {
    bus: 'ui',
    group: 'ui',
    synth: 'close',
    default: { sources: ['builtin:ui/close'], volume: 0.8 },
  },
  'ui.error': {
    bus: 'ui',
    group: 'ui',
    synth: 'error',
    default: { sources: ['builtin:ui/error'], cooldownMs: 300, volume: 0.7 },
  },
  'ui.notify': {
    bus: 'ui',
    group: 'ui',
    synth: 'notify',
    default: { sources: ['builtin:ui/notify'], cooldownMs: 1500, volume: 0.7 },
  },
  'build.start': {
    bus: 'sfx',
    group: 'build',
    synth: 'place',
    default: {
      sources: ['builtin:build/wood1', 'builtin:build/wood2', 'builtin:build/wood3'],
      pitchVariation: 1,
      spatial: true,
    },
  },
  'build.complete': {
    bus: 'sfx',
    group: 'build',
    synth: 'complete',
    default: { sources: ['builtin:build/complete'], cooldownMs: 400, volume: 0.8, spatial: true },
  },
  'build.upgrade': {
    bus: 'sfx',
    group: 'build',
    synth: 'upgrade',
    default: { sources: ['builtin:build/upgrade'], cooldownMs: 400, volume: 0.8, spatial: true },
  },
  // Chantier 16: the land wakes up around a finished building (the wave over its tiles).
  'build.awaken': {
    bus: 'sfx',
    group: 'build',
    synth: 'awaken',
    default: { sources: ['synth:awaken'], cooldownMs: 600, volume: 0.7, spatial: true },
  },
  'build.remove': {
    bus: 'sfx',
    group: 'build',
    synth: 'remove',
    default: { sources: ['builtin:build/remove'], pitchVariation: 1, spatial: true },
  },
  'path.paint': {
    bus: 'sfx',
    group: 'build',
    synth: 'paint',
    default: {
      sources: ['builtin:paths/step1', 'builtin:paths/step2'],
      pitchVariation: 2,
      cooldownMs: 60,
    },
  },
  'harvest.gather': {
    bus: 'sfx',
    group: 'colony',
    synth: 'gather',
    default: {
      sources: ['builtin:colony/gather', 'synth:gather'],
      pitchVariation: 1,
      spatial: true,
    },
  },
  'egg.lay': { bus: 'sfx', group: 'colony', synth: 'egg', default: { sources: ['synth:egg'] } },
  'egg.hatch': {
    bus: 'sfx',
    group: 'colony',
    synth: 'hatch',
    default: { sources: ['synth:hatch'] },
  },
  'kiwi.levelUp': {
    bus: 'sfx',
    group: 'colony',
    synth: 'levelUp',
    default: { sources: ['synth:levelUp'], cooldownMs: 800, volume: 0.8 },
  },
  'kiwi.mastery': {
    bus: 'sfx',
    group: 'colony',
    synth: 'mastery',
    default: { sources: ['synth:mastery'], cooldownMs: 800, volume: 0.7 },
  },
  'research.done': {
    bus: 'sfx',
    group: 'colony',
    synth: 'discovery',
    default: { sources: ['synth:discovery'], cooldownMs: 1500, volume: 0.7 },
  },
  'forge.item': {
    bus: 'sfx',
    group: 'colony',
    synth: 'anvil',
    default: { sources: ['synth:anvil'], cooldownMs: 1200, volume: 0.7 },
  },
  'age.reached': {
    bus: 'sfx',
    group: 'colony',
    synth: 'fanfare',
    default: { sources: ['synth:fanfare'], cooldownMs: 3000, volume: 0.9 },
  },
  'kiwi.shiny': {
    bus: 'sfx',
    group: 'colony',
    synth: 'shiny',
    default: { sources: ['synth:shiny'] },
  },
  'kiwi.voice': {
    bus: 'sfx',
    group: 'colony',
    synth: 'voice1',
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
    synth: 'chirp',
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
  'warehouse.collect': {
    bus: 'sfx',
    group: 'colony',
    synth: 'collect',
    default: { sources: ['synth:collect'], cooldownMs: 150, spatial: true },
  },
  'storage.full': {
    bus: 'sfx',
    group: 'colony',
    synth: 'full',
    default: { sources: ['builtin:colony/full'], cooldownMs: 5000, volume: 0.7 },
  },
  // Chantier 43: the colony gathers at the Town Hall for the speech.
  'speech.crowd': {
    bus: 'sfx',
    group: 'colony',
    synth: 'crowd',
    default: { sources: ['synth:crowd'], cooldownMs: 4000 },
  },
  'colony.hunger': {
    bus: 'sfx',
    group: 'colony',
    synth: 'hunger',
    default: { sources: ['synth:hunger'], cooldownMs: 4000 },
  },
  'ship.launch': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'launch',
    default: { sources: ['synth:launch'] },
  },
  'ship.arrive': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'arrive',
    default: { sources: ['builtin:ship/arrive'], cooldownMs: 1000, volume: 0.8 },
  },
  'ship.return': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'return',
    default: { sources: ['builtin:ship/return'], cooldownMs: 1000, volume: 0.8 },
  },
  'intro.slice': {
    bus: 'sfx',
    group: 'ui',
    synth: 'slice',
    default: { sources: ['synth:slice'], volume: 0.9 },
  },
  'intro.juice': {
    bus: 'sfx',
    group: 'ui',
    synth: 'juice',
    default: { sources: ['synth:juice'], volume: 0.8 },
  },
  'threat.warning': {
    bus: 'sfx',
    group: 'colony',
    synth: 'warning',
    default: { sources: ['synth:warning'], cooldownMs: 3000 },
  },
  // Chantier 06: the wave strikes, then its outcome; turrets firing during the show.
  'threat.strike': {
    bus: 'sfx',
    group: 'colony',
    synth: 'strike',
    default: { sources: ['synth:strike'], cooldownMs: 3000 },
  },
  'threat.victory': {
    bus: 'sfx',
    group: 'colony',
    synth: 'victory',
    default: { sources: ['synth:victory'], cooldownMs: 3000 },
  },
  'threat.defeat': {
    bus: 'sfx',
    group: 'colony',
    synth: 'defeat',
    default: { sources: ['synth:defeat'], cooldownMs: 3000 },
  },
  // Chantier 19: the siege of the twin face.
  'siege.warning': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'warning',
    default: { sources: ['synth:warning'], cooldownMs: 3000, volume: 0.8 },
  },
  'siege.victory': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'victory',
    default: { sources: ['synth:victory'], cooldownMs: 3000 },
  },
  'siege.defeat': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'defeat',
    default: { sources: ['synth:defeat'], cooldownMs: 3000 },
  },
  // Chantier 40: how a landing ended.
  'landing.victory': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'fanfare',
    default: { sources: ['synth:fanfare'], cooldownMs: 3000 },
  },
  'landing.retreat': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'warning',
    default: { sources: ['synth:warning'], cooldownMs: 3000, volume: 0.7 },
  },
  'landing.defeat': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'defeat',
    default: { sources: ['synth:defeat'], cooldownMs: 3000 },
  },
  'siege.queen': {
    bus: 'sfx',
    group: 'expedition',
    synth: 'fanfare',
    default: { sources: ['synth:fanfare'], cooldownMs: 5000 },
  },
  'turret.fire': {
    bus: 'sfx',
    group: 'colony',
    synth: 'shot',
    default: {
      sources: ['synth:shot'],
      volume: 0.6,
      pitchVariation: 3,
      maxVoices: 3,
      spatial: true,
    },
  },
  // Chantier 44: each burst of a fireworks show.
  'fireworks.burst': {
    bus: 'sfx',
    group: 'colony',
    synth: 'burst',
    default: {
      sources: ['synth:burst'],
      volume: 0.7,
      pitchVariation: 4,
      maxVoices: 4,
      spatial: true,
    },
  },
  'meteor.fall': {
    bus: 'sfx',
    group: 'colony',
    synth: 'meteor',
    default: { sources: ['synth:meteor'], cooldownMs: 2000 },
  },
  'comet.seen': {
    bus: 'sfx',
    group: 'colony',
    synth: 'cometSeen',
    default: { sources: ['synth:cometSeen'], cooldownMs: 5000 },
  },
  'comet.pass': {
    bus: 'sfx',
    group: 'colony',
    synth: 'comet',
    default: { sources: ['synth:comet'], cooldownMs: 3000 },
  },
  'ambience.nature': {
    bus: 'ambience',
    group: 'ambience',
    synth: 'nature',
    default: {
      sources: ['builtin:ambience/birds'],
      loop: true,
      fadeInMs: 3000,
      fadeOutMs: 2000,
    },
  },
  'ambience.wind': {
    bus: 'ambience',
    group: 'ambience',
    synth: 'wind',
    default: { sources: ['builtin:ambience/wind'], loop: true, fadeInMs: 3000, fadeOutMs: 2000 },
  },
  // The birds of ambience.nature are the day ambience; this one stays free for the admin.
  'ambience.day': {
    bus: 'ambience',
    group: 'ambience',
    reserved: true,
    default: { loop: true, fadeInMs: 3000, fadeOutMs: 3000, conditions: { timeOfDay: 'day' } },
  },
  'ambience.night': {
    bus: 'ambience',
    group: 'ambience',
    synth: 'night',
    default: {
      sources: ['synth:night'],
      loop: true,
      fadeInMs: 3000,
      fadeOutMs: 3000,
      volume: 0.35,
      conditions: { timeOfDay: 'night' },
    },
  },
  // Chantier 44: the cabaret's galop, on the evenings it is open (louder close up).
  'cabaret.music': {
    bus: 'ambience',
    group: 'ambience',
    synth: 'cabaret',
    default: {
      sources: ['synth:cabaret'],
      loop: true,
      fadeInMs: 2500,
      fadeOutMs: 2500,
      volume: 0.4,
      conditions: { timeOfDay: 'night' },
    },
  },
  'music.main': {
    bus: 'music',
    group: 'music',
    default: {
      sources: ['builtin:music/small-fire'],
      loop: true,
      fadeInMs: 6000,
      fadeOutMs: 3000,
      volume: 0.7,
    },
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
