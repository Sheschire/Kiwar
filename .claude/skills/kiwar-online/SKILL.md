---
name: kiwar-online
description: Kiwar online mode — Supabase schema and RLS, the `game` edge function bundling the shared rules, universes/chat, the local mock server and DB tests. Use when touching server code, SQL, protocol or online client code.
---

# Kiwar online (Supabase)

- **Server-authoritative**: the edge function `supabase/functions/game` (Deno) runs
  `handleGameRequest` from `packages/shared/src/server/gameService.ts`. It owns the clock and
  randomness; clients only send commands (`server/protocol.ts` zod schemas). Requests: actions
  `listUniverses`, `createUniverse`, `joinUniverse`, `universeInfo`, `load`, `newWorld`,
  `import` (one-time local save import, checked by `isPlausible`), `command`.
- The function imports `supabase/functions/_shared/kiwar-shared.js`, an esbuild bundle of the
  shared package: **run `pnpm build:functions` after any shared change** (a test guards
  freshness). `supabase/functions/game/repository.ts` implements `GameRepository` with
  supabase-js; `createMemoryRepository()` is the in-memory version for tests and the mock.
- Stored games are migrated on read (`migrating(repo)` → `migrateState`).
- Rate limit: 40 commands / 10 s (`command_log`).
- **SQL**: `supabase/migrations/` — `games`, `command_log`, `admins`, `universes`,
  `universe_members`, `audio_assets` / `audio_bindings` + Storage bucket `audio` (see
  `kiwar-audio`; `public.is_admin()` helper for admin-only policies), `chat_messages`
  (+ trigger setting the author name from the membership, flood limit 5 msgs / 10 s), `chat_reports`, realtime publication. RLS everywhere; game rows are
  written by the function only (service role).
- **Tests**: `pnpm test:db` (local Postgres + `supabase/tests/supabase_stub.sql` auth stub +
  `rls_test.sql`). Start Postgres first: `pg_ctlcluster 16 main start`.
- **Mock**: `pnpm mock:supabase` (port 54321: anonymous auth, `game` function through the real
  shared service, minimal PostgREST for chat and audio tables, Storage for the `audio` bucket,
  `rpc/is_admin` always true, no realtime) + `pnpm dev:online` (client on 5174).
  `/__mock/delay?ms=` changes the latency.
- Universes: kiwis = ⌊players/2⌋ + 1 (always an alien face), twin faces filled first, invite code
  8 chars, ≤ 8 players, ≤ 5 universes per player; expedition targets are alien faces.
- Client side: `game/onlineBackend.ts` (auth: anonymous guest, link Google / magic link),
  `game/onlineConfig.ts` (env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), `game/chat.ts`.
- Owner setup guide: `docs/SUPABASE_SETUP.md` (keep it in sync with new migrations/env vars).
- **SQL delivery**: `supabase/setup.sql` = all migrations concatenated (`pnpm build:sql`, guarded
  by a test) for a fresh project. Every schema change = a new migration + its full SQL given to
  the owner, ready to paste, with the run order (the owner has no CLI workflow yet). Storage
  buckets and their policies are created in SQL too (`storage.buckets`, `storage.objects`
  policies), so the owner never has to click through the dashboard.
- **Deployment**: `.github/workflows/deploy-functions.yml` deploys the `game` function on every
  push to main touching `supabase/functions/**` (secrets `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF`; skipped when missing). The owner has no local clone: never ask them to
  run CLI commands; SQL goes through the SQL Editor, functions through this workflow.
