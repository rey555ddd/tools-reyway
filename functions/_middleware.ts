// CORS middleware for all API routes
const ALLOWED_ORIGINS = [
  'https://tools.reyway.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

export const onRequest: PagesFunction = async (context) => {
  const origin = context.request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.tools-reyway.pages.dev');

  // Handle preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Process request
  const response = await context.next();

  // Clone response and add CORS headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  return newResponse;
};
