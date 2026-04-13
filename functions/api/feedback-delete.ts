// POST /api/feedback-delete
// Body: { id, token }
// 須帶正確 admin token 才能刪除

interface Env {
  FEEDBACK_KV?: KVNamespace;
  ADMIN_TOKEN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { id?: string; token?: string };
    const id = (body.id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
    const token = body.token || '';

    if (!context.env.ADMIN_TOKEN || token !== context.env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!context.env.FEEDBACK_KV || !id) {
      return new Response(JSON.stringify({ error: 'bad request' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    await context.env.FEEDBACK_KV.delete(`feedback:${id}`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'delete failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
