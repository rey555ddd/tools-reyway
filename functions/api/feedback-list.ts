// GET /api/feedback-list
// 列出許願池內容，預設遮蔽聯絡資訊（除非帶 admin token）
// Header: Authorization: Bearer TOKEN 顯示完整內容，否則遮蔽 contact / ipHash / ua 欄位

interface Env {
  FEEDBACK_KV?: KVNamespace;
  ADMIN_TOKEN?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const adminToken = context.request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const isAdmin = !!context.env.ADMIN_TOKEN && adminToken === context.env.ADMIN_TOKEN;

  if (!context.env.FEEDBACK_KV) {
    return new Response(JSON.stringify({ items: [], note: 'KV not bound' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const list = await context.env.FEEDBACK_KV.list({ prefix: 'feedback:', limit: 200 });
    const items: any[] = [];
    for (const key of list.keys) {
      const raw = await context.env.FEEDBACK_KV.get(key.name);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (!isAdmin) {
          delete data.contact;
          delete data.ipHash;
          delete data.ip;
          delete data.ua;
        }
        items.push(data);
      } catch {}
    }
    items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    return new Response(JSON.stringify({ items, isAdmin }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'list failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
