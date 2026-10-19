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
let delayMs = Number(process.env.MOCK_DELAY_MS ?? 150);

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
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
    if (!user) return send(res, 401, { ok: false, error: 'unauthorized', serverTime: Date.now() });
    const body = await readBody(req);
    const response = await handleGameRequest(
      {
        repo,
        userId: user.id,
        now: () => Date.now(),
        randomSeed: () => randomUUID().slice(0, 8),
        randomBytes: (n) => randomBytes(n),
        isAdmin: true,
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

  // Test hook: change the artificial latency.
  if (url.pathname === '/__mock/delay') {
    delayMs = Number(url.searchParams.get('ms') ?? delayMs);
    return send(res, 200, { delayMs });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Mock Supabase listening on http://localhost:${PORT}`));
