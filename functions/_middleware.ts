// CORS Middleware for tools.reyway.com
// Cloudflare Pages Functions
//
// 🔒 2026-04-26：併入敏感路徑攔截（資安 audit P2 #7）
// CF Pages 對「destination 不存在的路徑」會 ignore _redirects、
// 直接走預設 fallback；改用 middleware 提早攔下回 404，避免
// /.env、/.git/HEAD、/wrangler.toml 等檔案被探測。

const allowedOrigins = [
  'https://tools.reyway.com',
  'https://tools-reyway.pages.dev',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

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
  if (origin.match(/^https:\/\/[a-z0-9]+\.tools-reyway\.pages\.dev$/)) return true;
  return false;
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

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

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

  const response = await context.next();
  const newResponse = new Response(response.body, response);

  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    newResponse.headers.set(key, value);
  }

  return newResponse;
};
