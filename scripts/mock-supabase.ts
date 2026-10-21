// A tiny stand-in for Supabase (anonymous auth + the `game` edge function), to try the online
// mode locally without a Supabase project:
//   pnpm mock:supabase          (listens on http://localhost:54321)
//   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=mock pnpm dev
// Games are kept in memory and run through the real shared game service.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createMemoryRepository, handleGameRequest } from '../packages/shared/src/index';

const PORT = Number(process.env.PORT ?? 54321);
const repo = createMemoryRepository();
const users = new Map<string, { id: string; is_anonymous: boolean }>();
const chat: {
  id: number;
  universe_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}[] = [];
type Row = Record<string, unknown>;
const audioFiles = new Map<string, { type: string; data: Buffer }>();
const audioBindings: { event_id: string; binding: unknown }[] = [];
const audioAssets: {
  id: string;
  name: string;
  path: string;
  mime: string;
  duration_ms: number;
  size_bytes: number;
}[] = [];
let delayMs = Number(process.env.MOCK_DELAY_MS ?? 150);
/** Test hook: how far the server clock runs ahead of the real one. */
let clockSkew = 0;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function tokenFor(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, role: 'authenticated', exp, is_anonymous: true })}.mock`;
}
function userFromToken(header: string | undefined) {
  const token = header?.replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString()) as {
      sub: string;
    };
    return users.get(payload.sub) ?? null;
  } catch {
    return null;
  }
}
function session(user: { id: string; is_anonymous: boolean }) {
  return {
    access_token: tokenFor(user.id),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      ...user,
      aud: 'authenticated',
      role: 'authenticated',
      identities: [],
      app_metadata: {},
      user_metadata: {},
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const text = (await readRaw(req)).toString();
  return text ? JSON.parse(text) : {};
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  await new Promise((r) => setTimeout(r, delayMs));

  if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
    const user = { id: randomUUID(), is_anonymous: true };
    users.set(user.id, user);
    return send(res, 200, session(user));
  }
  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const body = (await readBody(req)) as { refresh_token?: string };
    const user = users.get(body.refresh_token?.replace('refresh-', '') ?? '');
    return user ? send(res, 200, session(user)) : send(res, 400, { error: 'invalid_grant' });
  }
  if (url.pathname === '/auth/v1/user') {
    const user = userFromToken(req.headers.authorization);
    return user ? send(res, 200, session(user).user) : send(res, 401, { msg: 'unauthorized' });
  }
  if (url.pathname === '/functions/v1/game' && req.method === 'POST') {
    const user = userFromToken(req.headers.authorization);
    if (!user)
      return send(res, 401, {
        ok: false,
        error: 'unauthorized',
        serverTime: Date.now() + clockSkew,
      });
    const body = await readBody(req);
    const response = await handleGameRequest(
      {
        repo,
        userId: user.id,
        now: () => Date.now() + clockSkew,
        randomSeed: () => randomUUID().slice(0, 8),
        randomBytes: (n) => randomBytes(n),
        isAdmin: true,
        guestUserOf: async (token) => {
          const guest = userFromToken(`Bearer ${token}`);
          return guest?.is_anonymous ? guest.id : null;
        },
      },
      body,
    );
    return send(res, 200, response);
  }
  // Minimal PostgREST stand-in for the team chat (no realtime: the client polls).
  if (url.pathname === '/rest/v1/chat_messages') {
    const user = userFromToken(req.headers.authorization);
    if (!user) return send(res, 401, { message: 'unauthorized' });
    if (req.method === 'GET') {
      const universe = (url.searchParams.get('universe_id') ?? '').replace(/^eq\./, '');
      const members = await repo.listMembers(universe);
      if (!members.some((m) => m.userId === user.id)) return send(res, 200, []);
      const limit = Number(url.searchParams.get('limit') ?? 60);
      return send(
        res,
        200,
        chat
          .filter((m) => m.universe_id === universe)
          .slice(-limit)
          .reverse(),
      );
    }
    if (req.method === 'POST') {
      const body = (await readBody(req)) as { universe_id: string; body: string };
      const me = (await repo.listMembers(body.universe_id)).find((m) => m.userId === user.id);
      if (!me) return send(res, 403, { message: 'not a member', code: '42501' });
      const msg = {
        id: chat.length + 1,
        universe_id: body.universe_id,
        user_id: user.id,
        display_name: me.displayName,
        body: String(body.body).slice(0, 280),
        created_at: new Date().toISOString(),
      };
      chat.push(msg);
      const single = String(req.headers.accept ?? '').includes('object');
      return send(res, 201, single ? msg : [msg]);
    }
  }
  if (url.pathname === '/rest/v1/chat_reports' && req.method === 'POST') return send(res, 201, {});
  // Sounds (chantier 02): public read, writes for signed-in users (every mock user is admin).
  if (url.pathname === '/rest/v1/rpc/is_admin') return send(res, 200, true);
  const audioTable =
    url.pathname === '/rest/v1/audio_bindings'
      ? { rows: audioBindings as Row[], key: 'event_id' }
      : url.pathname === '/rest/v1/audio_assets'
        ? { rows: audioAssets as Row[], key: 'id' }
        : null;
  if (audioTable) {
    const { rows, key } = audioTable;
    if (req.method === 'GET') return send(res, 200, rows);
    if (!userFromToken(req.headers.authorization))
      return send(res, 401, { message: 'unauthorized' });
    const match = (row: Row) =>
      [...url.searchParams].every(
        ([k, v]) => !v.startsWith('eq.') || String(row[k]) === v.slice(3),
      );
    if (req.method === 'POST') {
      const body = (await readBody(req)) as Row | Row[];
      for (const item of Array.isArray(body) ? body : [body]) {
        const row = { created_at: new Date().toISOString(), ...item };
        const i = rows.findIndex((r) => r[key] === row[key]);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push(row);
      }
      return send(res, 201, body);
    }
    if (req.method === 'PATCH') {
      const patch = (await readBody(req)) as Row;
      for (const r of rows) if (match(r)) Object.assign(r, patch);
      return send(res, 200, []);
    }
    if (req.method === 'DELETE') {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i]!)) rows.splice(i, 1);
      return send(res, 200, []);
    }
  }
  if (url.pathname.startsWith('/storage/v1/object/public/audio/') && req.method === 'GET') {
    const file = audioFiles.get(decodeURIComponent(url.pathname.slice(32)));
    if (!file) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': file.type, 'Access-Control-Allow-Origin': '*' });
    return res.end(file.data);
  }
  if (url.pathname.startsWith('/storage/v1/object/audio/') && req.method === 'POST') {
    if (!userFromToken(req.headers.authorization))
      return send(res, 401, { message: 'unauthorized' });
    const path = decodeURIComponent(url.pathname.slice(25));
    const type = String(req.headers['content-type'] ?? 'application/octet-stream');
    audioFiles.set(path, { type, data: await readRaw(req) });
    return send(res, 200, { Key: `audio/${path}` });
  }
  if (url.pathname === '/storage/v1/object/audio' && req.method === 'DELETE') {
    const body = (await readBody(req)) as { prefixes?: string[] };
    for (const p of body.prefixes ?? []) audioFiles.delete(p);
    return send(res, 200, []);
  }

  // Test hook: move the server clock forward (`?ms=`), e.g. to land a ship right away.
  if (url.pathname === '/__mock/clock') {
    clockSkew += Number(url.searchParams.get('ms') ?? 0);
    return send(res, 200, { clockSkew });
  }
  // Test hook: change the artificial latency.
  if (url.pathname === '/__mock/delay') {
    delayMs = Number(url.searchParams.get('ms') ?? delayMs);
    return send(res, 200, { delayMs });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Mock Supabase listening on http://localhost:${PORT}`));
