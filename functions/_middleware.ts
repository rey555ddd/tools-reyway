// CORS Middleware for MIX Tools domains
// Cloudflare Pages Functions
//
// 🔒 2026-04-26：併入敏感路徑攔截（資安 audit P2 #7）
// CF Pages 對「destination 不存在的路徑」會 ignore _redirects、
// 直接走預設 fallback；改用 middleware 提早攔下回 404，避免
// /.env、/.git/HEAD、/wrangler.toml 等檔案被探測。

const allowedOrigins = [
  'https://tools.reyway.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

interface Env { FEEDBACK_KV?: KVNamespace }

const FORMAL_HOST = 'tools.reyway.com';
const EXPENSIVE_API = /^\/api\/(?:bg-generator|converter|copywriter|plant-doctor|travel-planner)$/;

const SENSITIVE_PATHS = [
  /^\/\.env(\.|$)/,            // .env / .env.production / .env.local 等
  /^\/\.git(\/|$)/,            // .git/HEAD / .git/config 等
  /^\/\.dev\.vars$/,
  /^\/\.npmrc$/,
  /^\/\.prettierrc$/,
  /^\/wrangler\.toml$/,
  /^\/package(-lock)?\.json$/,
  /^\/pnpm-lock\.yaml$/,
  /^\/yarn\.lock$/,
  /^\/tsconfig(\..*)?\.json$/,
  /^\/vite\.config\.(ts|js)$/,
  /^\/Dockerfile$/i,
  /^\/docker-compose\..*$/i,
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  return false;
}

function plain(status: number, message: string) {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
}

async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function withinLimit(request: Request, limit: number) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return true;
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return true;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); return false; }
  }
}

async function rateAllowed(request: Request, env: Env, expensive: boolean) {
  if (!env.FEEDBACK_KV) return false;
  const id = await hash(request.headers.get('cf-connecting-ip') || 'unknown');
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const checks = expensive ? [
    [`security:ai:minute:${id}:${minute}`, 5, 70],
    [`security:ai:day:${id}:${day}`, 20, 86_500],
    [`security:ai:global:${day}`, 100, 86_500],
  ] as const : [
    [`security:write:minute:${id}:${minute}`, 12, 70],
    [`security:write:day:${id}:${day}`, 60, 86_500],
  ] as const;
  for (const [key, limit] of checks) {
    const count = Number.parseInt((await env.FEEDBACK_KV.get(key)) || '0', 10) || 0;
    if (count >= limit) return false;
  }
  await Promise.all(checks.map(async ([key, , ttl]) => {
    const count = Number.parseInt((await env.FEEDBACK_KV!.get(key)) || '0', 10) || 0;
    await env.FEEDBACK_KV!.put(key, String(count + 1), { expirationTtl: ttl });
  }));
  return true;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.hostname !== FORMAL_HOST && !local) return plain(404, 'Not Found');

  // ── 🔒 攔截敏感路徑：直接回 404，不走任何 fallback ──
  if (SENSITIVE_PATHS.some((re) => re.test(url.pathname))) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' },
    });
  }

  const origin = context.request.headers.get('Origin');

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (origin && !isAllowedOrigin(origin) && !local) return plain(403, 'Forbidden');
  if (context.request.method === 'POST') {
    const media = /^\/api\/(?:bg-generator|converter|plant-doctor)$/.test(url.pathname);
    if (!(await withinLimit(context.request, media ? 12 * 1024 * 1024 : 128 * 1024))) {
      return new Response(JSON.stringify({ error: '請求內容過大' }), { status: 413, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const expensive = EXPENSIVE_API.test(url.pathname);
    const publicWrite = expensive || url.pathname === '/api/feedback';
    if (publicWrite && !(await rateAllowed(context.request, context.env, expensive))) {
      return new Response(JSON.stringify({ error: '請求過於頻繁，請稍後再試' }), { status: 429, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' } });
    }
  }

  const response = await context.next();
  const newResponse = new Response(response.body, response);

  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    newResponse.headers.set(key, value);
  }

  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('Referrer-Policy', 'no-referrer');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (url.pathname.startsWith('/api/')) newResponse.headers.set('Cache-Control', 'no-store');

  return newResponse;
};
