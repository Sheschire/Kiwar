import { z } from 'zod';

/**
 * A binding links a sound event to one or more sounds and their playback parameters.
 * Sources are references:
 * - `synth:<preset>` — generated in code (`synth.ts`), always available;
 * - `builtin:<file>` — a file shipped in `public/audio/` (CC0, see docs/AUDIO_CREDITS.md);
 * - `asset:<id>` — a file uploaded from the admin space (Supabase Storage or local sandbox).
 */
export const SOURCE_PATTERN = /^(synth|builtin|asset):[\w./-]+$/;

export const conditionsSchema = z
  .object({
    /** Camera zoom, 0 = closest, 1 = farthest. */
    zoomMin: z.number().min(0).max(1).default(0),
    zoomMax: z.number().min(0).max(1).default(1),
    /** Reserved for chantier 04 (day/night cycle). */
    timeOfDay: z.enum(['any', 'day', 'night']).default('any'),
    /** Reserved for chantier 04 (seasons); empty = every season. */
    seasons: z.array(z.string().max(32)).max(8).default([]),
  })
  .default({});

export const bindingSchema = z.object({
  enabled: z.boolean().default(true),
  sources: z.array(z.string().regex(SOURCE_PATTERN)).max(16).default([]),
  /** Linear gain multiplier on top of the bus volume. */
  volume: z.number().min(0).max(2).default(1),
  /** Base pitch shift in semitones. */
  pitch: z.number().min(-24).max(24).default(0),
  /** Random pitch variation, ± semitones. */
  pitchVariation: z.number().min(0).max(12).default(0),
  /** Chance to play when the event fires. */
  probability: z.number().min(0).max(1).default(1),
  /** Minimum delay between two plays of this event (anti-spam). */
  cooldownMs: z.number().int().min(0).max(600_000).default(80),
  /** Maximum simultaneous plays of this event. */
  maxVoices: z.number().int().min(1).max(16).default(4),
  loop: z.boolean().default(false),
  fadeInMs: z.number().int().min(0).max(20_000).default(0),
  fadeOutMs: z.number().int().min(0).max(20_000).default(0),
  /** Positioned on its tile: quieter far from the camera, panned left/right. */
  spatial: z.boolean().default(false),
  conditions: conditionsSchema,
});

export type SoundBinding = z.infer<typeof bindingSchema>;
export type BindingInput = z.input<typeof bindingSchema>;

export function makeBinding(input: BindingInput = {}): SoundBinding {
  return bindingSchema.parse(input);
}

/** What the game currently looks like, for binding conditions. */
export interface PlayContext {
  zoom: number;
  timeOfDay: 'day' | 'night';
  season: string;
}

export const DEFAULT_CONTEXT: PlayContext = { zoom: 0.5, timeOfDay: 'day', season: 'spring' };

export function conditionsMatch(binding: SoundBinding, ctx: PlayContext): boolean {
  const c = binding.conditions;
  if (ctx.zoom < c.zoomMin || ctx.zoom > c.zoomMax) return false;
  if (c.timeOfDay !== 'any' && c.timeOfDay !== ctx.timeOfDay) return false;
  if (c.seasons.length > 0 && !c.seasons.includes(ctx.season)) return false;
  return true;
}

export interface PlayDecision {
  source: string;
  /** Playback rate (pitch). */
  rate: number;
  gain: number;
}

export interface PlayState {
  /** Time of the last play of this event (ms), if any. */
  lastPlayed?: number;
  /** Plays of this event still sounding. */
  activeVoices: number;
}

/**
 * Decides whether an event plays and how (pure, so it can be tested without Web Audio).
 * `pitchOffset` lets a caller shift the pitch (e.g. a kiwi's own voice).
 */
export function resolvePlay(
  binding: SoundBinding,
  ctx: PlayContext,
  now: number,
  state: PlayState,
  random: () => number,
  pitchOffset = 0,
): PlayDecision | null {
  if (!binding.enabled || binding.sources.length === 0) return null;
  if (!conditionsMatch(binding, ctx)) return null;
  if (state.lastPlayed !== undefined && now - state.lastPlayed < binding.cooldownMs) return null;
  if (state.activeVoices >= binding.maxVoices) return null;
  if (binding.probability < 1 && random() >= binding.probability) return null;
  const source = binding.sources[Math.floor(random() * binding.sources.length)]!;
  const semitones = binding.pitch + pitchOffset + (random() * 2 - 1) * binding.pitchVariation;
  return { source, rate: 2 ** (semitones / 12), gain: binding.volume };
}
