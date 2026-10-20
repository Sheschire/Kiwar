import {
  DEFAULT_CONTEXT,
  resolvePlay,
  type PlayContext,
  type PlayState,
  type SoundBinding,
} from './binding';
import { BUSES, defaultBindings, eventMeta, type Bus, type SoundEventId } from './catalog';
import { loadSettings, saveSettings, sliderGain, type AudioSettings } from './settings';
import { renderPreset, SYNTH_PRESETS, type SynthPresetId } from './synth';
import { builtinExtension } from './builtin';

export interface SoundPosition {
  x: number;
  z: number;
}

export interface PlayOptions {
  /** World position (spatial bindings only). */
  pos?: SoundPosition;
  /** Extra pitch in semitones (e.g. a kiwi's own voice). */
  pitchOffset?: number;
}

/** Turns a world position into a gain and a stereo pan, from the camera's point of view. */
export type Spatializer = (pos: SoundPosition) => { gain: number; pan: number };

interface LoopVoice {
  source: string;
  node: AudioBufferSourceNode;
  gain: GainNode;
}

/** A file not loaded within this delay is skipped (one-shots must stay in sync). */
const MAX_LOAD_DELAY_MS = 400;

type Ctor = typeof AudioContext;

/**
 * Web Audio engine: buses (music, ambience, sfx, ui) under a master gain, event → binding
 * resolution, lazy buffer cache, loops. The context only starts on the first player gesture
 * (browser autoplay rules, iOS), and nothing here ever blocks the game.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private settings: AudioSettings = loadSettings();
  private bindings: Record<SoundEventId, SoundBinding> = defaultBindings();
  /** URLs of `builtin:` and `asset:` sources. */
  private urls = new Map<string, string>();
  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private playState = new Map<SoundEventId, PlayState>();
  private loops = new Map<SoundEventId, LoopVoice>();
  /** Loops the game wants, with their level (0..1). */
  private loopLevels = new Map<SoundEventId, number>();
  private listeners = new Set<(s: AudioSettings) => void>();
  private hidden = false;
  context: PlayContext = { ...DEFAULT_CONTEXT };
  spatializer: Spatializer | null = null;
  /** Number of plays per event (dev checks). */
  readonly stats: Partial<Record<SoundEventId, number>> = {};

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get state(): AudioContextState | 'locked' {
    return this.ctx?.state ?? 'locked';
  }

  /** Starts the audio context on the first gesture; pauses it while the page is hidden. */
  installUnlock(target: Window = window): void {
    const unlock = () => {
      this.unlock();
      if (this.ctx?.state === 'running') {
        for (const type of ['pointerdown', 'keydown', 'touchend'])
          target.removeEventListener(type, unlock, true);
      }
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'])
      target.addEventListener(type, unlock, true);
    target.document.addEventListener('visibilitychange', () => {
      this.hidden = target.document.visibilityState === 'hidden';
      this.applyRunning();
    });
  }

  unlock(): void {
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const bus of BUSES) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.buses.set(bus, g);
      }
      this.applyVolumes(true);
      // iOS: a silent buffer played inside the gesture unlocks the output.
      const silent = this.ctx.createBufferSource();
      silent.buffer = this.ctx.createBuffer(1, 1, 22050);
      silent.connect(this.ctx.destination);
      silent.start();
    }
    this.applyRunning();
    this.refreshLoops();
  }

  // ---- settings ----

  getSettings(): AudioSettings {
    return this.settings;
  }

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applyVolumes(false);
    this.applyRunning();
    for (const l of this.listeners) l(this.settings);
  }

  onSettings(listener: (s: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyVolumes(immediate: boolean): void {
    if (!this.ctx || !this.master) return;
    const set = (g: GainNode, v: number) =>
      immediate ? (g.gain.value = v) : g.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
    set(this.master, this.settings.muted ? 0 : sliderGain(this.settings.master));
    for (const bus of BUSES) set(this.buses.get(bus)!, sliderGain(this.settings[bus]));
  }

  /** Muted or hidden: suspend the context (saves battery); otherwise resume it. */
  private applyRunning(): void {
    if (!this.ctx) return;
    const shouldRun = !this.hidden && !this.settings.muted;
    if (shouldRun && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    if (!shouldRun && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  // ---- bindings ----

  getBinding(id: SoundEventId): SoundBinding {
    return this.bindings[id];
  }

  /** Replaces the bindings (defaults + overrides) and the URLs of file sources. */
  configure(
    overrides: Partial<Record<SoundEventId, SoundBinding>>,
    urls: Map<string, string>,
  ): void {
    this.bindings = { ...defaultBindings(), ...overrides };
    this.urls = urls;
    for (const [ref] of this.buffers) if (!ref.startsWith('synth:')) this.buffers.delete(ref);
    // Restart loops whose sound changed.
    for (const [id, voice] of this.loops)
      if (!this.bindings[id].sources.includes(voice.source)) this.stopLoop(id, 0);
    this.refreshLoops();
  }

  // ---- playback ----

  /** Fires a sound event. Silently does nothing when locked, muted or throttled. */
  play(id: SoundEventId, opts: PlayOptions = {}): void {
    if (!this.ctx || this.settings.muted || this.hidden) return;
    const binding = this.bindings[id];
    if (binding.loop) return;
    const now = performance.now();
    const state = this.playState.get(id) ?? { activeVoices: 0 };
    const decision = resolvePlay(binding, this.context, now, state, Math.random, opts.pitchOffset);
    if (!decision) return;
    state.lastPlayed = now;
    this.playState.set(id, state);
    this.stats[id] = (this.stats[id] ?? 0) + 1;
    let gain = decision.gain;
    let pan = 0;
    if (binding.spatial && opts.pos && this.spatializer) {
      const s = this.spatializer(opts.pos);
      gain *= s.gain;
      pan = s.pan;
    }
    if (gain <= 0.001) return;
    const bus = eventMeta(id).bus;
    void this.withBuffer(decision.source, id, now).then((buffer) => {
      if (!buffer) return;
      state.activeVoices++;
      this.startVoice(buffer, bus, decision.rate, gain, pan, binding, () => state.activeVoices--);
    });
  }

  /** Plays one source with a binding, ignoring cooldowns and conditions (admin preview). */
  preview(binding: SoundBinding, bus: Bus, source?: string): void {
    this.unlock();
    const ref = source ?? binding.sources[Math.floor(Math.random() * binding.sources.length)];
    if (!this.ctx || !ref) return;
    const semitones = binding.pitch + (Math.random() * 2 - 1) * binding.pitchVariation;
    void this.load(ref).then((buffer) => {
      if (!buffer) return;
      const fade = Math.min(binding.fadeOutMs, 1500);
      const voice = this.startVoice(buffer, bus, 2 ** (semitones / 12), binding.volume, 0, binding);
      // Loops are previewed for a few seconds only.
      if (binding.loop && voice) {
        const end = this.ctx!.currentTime + 4;
        voice.gain.gain.setTargetAtTime(0, end, Math.max(0.05, fade / 3000));
        voice.node.stop(end + Math.max(0.2, fade / 1000));
      }
    });
  }

  private startVoice(
    buffer: AudioBuffer,
    bus: Bus,
    rate: number,
    gain: number,
    pan: number,
    binding: SoundBinding,
    onEnded?: () => void,
  ): { node: AudioBufferSourceNode; gain: GainNode } | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = binding.loop;
    node.playbackRate.value = rate;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    if (binding.fadeInMs > 0) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + binding.fadeInMs / 1000);
    } else g.gain.value = gain;
    node.connect(g);
    let out: AudioNode = g;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      out = p;
    }
    out.connect(this.buses.get(bus)!);
    node.onended = () => {
      node.disconnect();
      out.disconnect();
      onEnded?.();
    };
    node.start();
    return { node, gain: g };
  }

  private async withBuffer(ref: string, id: SoundEventId, requested: number) {
    const buffer = await this.load(ref);
    if (buffer) return performance.now() - requested > MAX_LOAD_DELAY_MS ? null : buffer;
    // A broken or unsupported file falls back to the synthesized sound of the event.
    const fallback = eventMeta(id).synth;
    return fallback && `synth:${fallback}` !== ref ? this.load(`synth:${fallback}`) : null;
  }

  /** Decodes (or renders) a source once and caches it; null if it cannot be loaded. */
  load(ref: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(ref);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.loading.get(ref);
    if (pending) return pending;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const promise = (async () => {
      try {
        if (ref.startsWith('synth:')) {
          const preset = SYNTH_PRESETS[ref.slice(6) as SynthPresetId];
          if (!preset) return null;
          // Ambience textures are soft noise: a low rate is enough and renders much faster.
          const rate = 'loop' in preset && preset.loop ? 16000 : ctx.sampleRate;
          if (rate !== ctx.sampleRate) await new Promise((r) => window.setTimeout(r, 300));
          const samples = renderPreset(preset, rate);
          const buffer = ctx.createBuffer(1, samples.length, rate);
          buffer.copyToChannel(samples, 0);
          return buffer;
        }
        const url = this.urls.get(ref) ?? builtinUrl(ref);
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (error) {
        console.warn(`[audio] cannot load ${ref}`, error);
        return null;
      }
    })().then((buffer) => {
      this.buffers.set(ref, buffer);
      this.loading.delete(ref);
      return buffer;
    });
    this.loading.set(ref, promise);
    return promise;
  }

  // ---- loops (ambience, music) ----

  /** Sets how loud a looping event should be (0 stops it, with its fade-out). */
  setLoop(id: SoundEventId, level: number): void {
    const prev = this.loopLevels.get(id) ?? 0;
    if (Math.abs(prev - level) < 0.01 && level > 0 === this.loops.has(id)) return;
    if (level <= 0) this.loopLevels.delete(id);
    else this.loopLevels.set(id, level);
    this.refreshLoop(id);
  }

  private refreshLoops(): void {
    for (const id of new Set([...this.loopLevels.keys(), ...this.loops.keys()]))
      this.refreshLoop(id);
  }

  private refreshLoop(id: SoundEventId): void {
    if (!this.ctx) return;
    const binding = this.bindings[id];
    const level = this.loopLevels.get(id) ?? 0;
    const active = level > 0 && binding.enabled && binding.loop && binding.sources.length > 0;
    const voice = this.loops.get(id);
    if (!active) {
      if (voice) this.stopLoop(id, binding.fadeOutMs);
      return;
    }
    const target = binding.volume * level;
    if (voice) {
      // Still loading (placeholder without a gain node): it starts at the latest level.
      voice.gain?.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
      return;
    }
    const source = binding.sources[Math.floor(Math.random() * binding.sources.length)]!;
    // Reserve the slot so concurrent refreshes don't start it twice.
    const placeholder = { source, node: null, gain: null } as unknown as LoopVoice;
    this.loops.set(id, placeholder);
    void this.load(source).then((buffer) => {
      if (this.loops.get(id) !== placeholder) return;
      const lvl = this.loopLevels.get(id) ?? 0;
      if (!buffer || lvl <= 0) {
        this.loops.delete(id);
        return;
      }
      const v = this.startVoice(
        buffer,
        eventMeta(id).bus,
        2 ** (binding.pitch / 12),
        binding.volume * lvl,
        0,
        binding,
      );
      if (v) this.loops.set(id, { source, ...v });
      else this.loops.delete(id);
    });
  }

  private stopLoop(id: SoundEventId, fadeMs: number): void {
    const voice = this.loops.get(id);
    this.loops.delete(id);
    if (!voice?.node || !this.ctx) return;
    const t = this.ctx.currentTime;
    const fade = Math.max(0.05, fadeMs / 1000);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + fade);
    voice.node.stop(t + fade + 0.05);
  }
}

/** `builtin:ui/click1` → URL of the file shipped in `public/audio/`. */
export function builtinUrl(ref: string): string | null {
  if (!ref.startsWith('builtin:')) return null;
  return `${import.meta.env.BASE_URL}audio/${ref.slice(8)}.${builtinExtension()}`;
}

export const audio = new AudioEngine();
