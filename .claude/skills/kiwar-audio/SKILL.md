---
name: kiwar-audio
description: Kiwar audio — Web Audio engine, sound event catalogue, bindings, synthesized and CC0 sounds, ambience/music, the /admin sound space (Supabase or local sandbox) and its SQL. Use when adding a sound, wiring a game event to audio, touching the admin space, or changing audio tables/storage.
---

# Kiwar audio (`apps/client/src/audio`, `apps/client/src/admin`)

## Principle

The game never plays a file. It fires a **sound event** (`audio.play('build.complete', { pos })`);
the event's **binding** decides what plays. Defaults live in code, overrides come from the admin
space (owner) through a **manifest**.

## Files

- `audio/catalog.ts` — `SOUND_EVENTS`: every `SoundEventId` with its bus (`music`, `ambience`,
  `sfx`, `ui`), admin group, `synth` fallback preset, `reserved` flag (declared for a later
  chantier, not fired yet) and default binding.
- `audio/binding.ts` — zod `bindingSchema` (sources, volume 0–2, pitch ±24, pitchVariation,
  probability, cooldownMs, maxVoices, loop, fadeInMs/fadeOutMs, spatial, conditions
  {zoomMin, zoomMax, timeOfDay, seasons}) and the pure `resolvePlay` (unit-tested).
- Source refs: `synth:<preset>` (`synth.ts`, rendered in code), `builtin:<path-without-ext>`
  (`public/audio/<path>.ogg|.mp3`, listed in `audio/builtin.ts`), `asset:<uuid>` (uploaded).
- `audio/engine.ts` — `audio` singleton: context created on the first gesture, suspended when
  hidden or muted; buses under a master gain; buffer cache; `play`, `setLoop(id, level)` for
  loops, `preview` (admin), `configure(overrides, urls)`; falls back to the event's synth preset
  when a file fails; skips one-shots that take > 400 ms to load. Dev: `window.__kiwar.audio`
  (`stats` counts plays per event, `state`).
- `audio/sounds.ts` — game → sound mapping: `playGameEventSounds` (shared `GameEvent`s, called
  from `game/events.ts`), `playCommandSound` (accepted commands, from `ui/actions.ts`),
  `kiwiSpeaks` / `kiwiVoicePitch` (per-kiwi voice).
- `audio/gameAudio.ts` — startup wiring: unlock, button clicks (`data-silent` opts out), modal /
  selection / chat sounds, music loop, spatializer, ambience levels from the zoom every 250 ms,
  ambient chirps.
- `audio/manifest.ts` — `AudioManifest` (also the export/import JSON), `parseManifest` (drops
  invalid entries), `fetchRemoteManifest` (PostgREST, no supabase-js), cache
  `kiwar.audio.manifest`. `audio/sandbox.ts` — local sandbox (localStorage
  `kiwar.audio.sandbox` + IndexedDB `kiwar-audio`), wins over the server when enabled.
- `audio/settings.ts` — volumes + mute in `kiwar.audio.settings`, mirrored in `uiStore.audio`;
  UI in `ui/components/SoundSection.tsx` and the top-bar mute button.
- Renderer helpers (`render/GameRenderer.ts`): `audioZoom()` (0 close → 1 far),
  `spatialize(pos)`, `kiwiAt(x, y)` (tap → `onKiwiTap`), `randomVisibleKiwi()`.

## Add a sound event

1. Add the id to `SOUND_EVENTS` (bus, group, `synth` fallback, default binding).
2. Add its label in `admin/strings.ts` (`events`, FR + EN — TypeScript enforces both).
3. Fire it: from `audio/sounds.ts` for a `GameEvent` or a command, or `audio.play(id, { pos })`
   elsewhere (positions are world x/z: `hexToPixel` x → x, y → z).
4. If it needs a new synth preset, add it to `SYNTH_PRESETS` (the test renders every preset).
5. A new shipped file: put `.ogg` + `.mp3` in `public/audio/`, add it to `BUILTIN_FILES`, credit
   it in `docs/AUDIO_CREDITS.md` (the test checks both formats exist). Convert with ffmpeg to
   mono; loops: crossfade the tail into the head before encoding.

## Admin space (`/admin` or `?admin`)

- `main.tsx` routes: admin → `admin/startAdmin.tsx` (own chunk, no Three.js), else
  `startGame.tsx`. Vercel rewrites `/admin` to `index.html`.
- `admin/AdminApp.tsx` — access (`resolveAccess`: offline / signed out / not admin / admin via
  `rpc('is_admin')`), mode switch server / sandbox, export / import, tabs (Sons, Événements;
  Équilibrage and Ciel greyed for later chantiers — add new tabs here).
- `admin/repo.ts` — `AudioRepo` with `ServerRepo` (supabase-js: tables + Storage, uploads send
  raw bytes) and `SandboxRepo`. `admin/BindingsTab.tsx` (editor, 500 ms autosave, preview through
  the real engine) and `admin/SoundsTab.tsx` (upload ≤ 2 MB, decoded offline to check and
  measure).
- Mock: `pnpm mock:supabase` serves `rpc/is_admin` (always true), audio table reads/writes and
  Storage upload / public GET / delete. Test: open `http://localhost:5174/` (anonymous session)
  then `/admin`.

## Database

Migration `20261022000000_audio.sql`: `public.is_admin()` (security definer), `audio_assets`,
`audio_bindings` (public read, admin write), bucket `audio` (public, 2 MB, audio MIME types) with
`storage.objects` policies. The DB test stub (`supabase/tests/supabase_stub.sql`) has a minimal
`storage` schema; RLS checks in `rls_test.sql`. Add an admin:
`insert into public.admins (user_id) values ('<uuid>');` (the admin page shows the uuid).

## Pitfalls

- Never play before a gesture (nothing happens until `audio.unlocked`). Never `await` audio in
  game code.
- Loops must be `loop: true` bindings driven by `setLoop`; `play()` ignores loop bindings.
- Keep `synth` fallbacks for events with file sources (test enforced, music excepted).
- Day/night and season conditions exist but the client always reports day / spring until
  chantier 04 sets `audio.context.timeOfDay` / `season`.
