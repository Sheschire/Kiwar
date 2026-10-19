// Kiwar `game` edge function (Deno): the authoritative game server.
// It authenticates the player (guest or permanent account), then delegates to the shared
// game service, which validates every command with the same rules as the client.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleGameRequest } from '../_shared/kiwar-shared.js';
import { createSupabaseRepository } from './repository.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function randomSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => SEED_ALPHABET[b % SEED_ALPHABET.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')
    return json({ ok: false, error: 'invalidRequest', serverTime: Date.now() }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, error: 'unauthorized', serverTime: Date.now() }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    return json({ ok: false, error: 'unauthorized', serverTime: Date.now() }, 401);
  const userId = data.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalidRequest', serverTime: Date.now() }, 400);
  }

  try {
    const { data: adminRow } = await admin
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    const response = await handleGameRequest(
      {
        repo: createSupabaseRepository(admin),
        userId,
        now: () => Date.now(),
        randomSeed,
        randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
        isAdmin: !!adminRow,
      },
      body,
    );
    return json(response);
  } catch (e) {
    console.error('game function error', e);
    return json({ ok: false, error: 'internal', serverTime: Date.now() }, 500);
  }
});
