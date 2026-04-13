// 意見回饋 API — Cloudflare Pages Function
// POST /api/feedback
// Body: { name, usage[], type[], text, contact, ts, ua }
// 接收後同時 console.log + 透過 LINE Messaging API push 通知

interface Env {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_USER_ID?: string;
  FEEDBACK_KV?: KVNamespace;
}

async function pushToLine(env: Env, text: string): Promise<void> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = env.LINE_USER_ID;
  if (!token || !to) {
    console.warn('LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID not set, skipping LINE push');
    return;
  }
  try {
    const resp = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text: text.slice(0, 4990) }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('LINE push failed:', resp.status, errBody.slice(0, 300));
    }
  } catch (err: any) {
    console.error('LINE push exception:', err.message || err);
  }
}

function formatLineMessage(d: {
  name: string; usage: string[]; type: string[];
  text: string; contact: string; ts: string;
}): string {
  const lines: string[] = [];
  lines.push('🎁 [tools.reyway] 新許願！');
  lines.push('');
  if (d.name) lines.push(`👤 ${d.name}`);
  if (d.usage.length) lines.push(`🔧 常做：${d.usage.join('、')}`);
  if (d.type.length) lines.push(`💡 想要：${d.type.join('、')}`);
  if (d.text) {
    lines.push('');
    lines.push(`💬 ${d.text}`);
  }
  if (d.contact) {
    lines.push('');
    lines.push(`📞 聯絡：${d.contact}`);
  }
  lines.push('');
  const ts = new Date(d.ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  lines.push(`⏰ ${ts}`);
  return lines.join('\n');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      name?: string;
      usage?: string[];
      type?: string[];
      text?: string;
      contact?: string;
      ts?: string;
      ua?: string;
    };

    const cleaned = {
      name: (body.name || '').slice(0, 80),
      usage: Array.isArray(body.usage) ? body.usage.slice(0, 20) : [],
      type: Array.isArray(body.type) ? body.type.slice(0, 20) : [],
      text: (body.text || '').slice(0, 1500),
      contact: (body.contact || '').slice(0, 200),
      ts: body.ts || new Date().toISOString(),
      ua: (body.ua || '').slice(0, 200),
      ip: context.request.headers.get('cf-connecting-ip') || 'unknown',
    };

    // 印 log 備援（萬一 LINE/KV 失敗也有紀錄）
    console.log('========== TOOLS-REYWAY FEEDBACK ==========');
    console.log(JSON.stringify(cleaned, null, 2));
    console.log('===========================================');

    // 寫進 KV（首頁許願池讀這裡）
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (context.env.FEEDBACK_KV) {
      try {
        await context.env.FEEDBACK_KV.put(
          `feedback:${id}`,
          JSON.stringify({ id, ...cleaned }),
          { expirationTtl: 60 * 60 * 24 * 180 } // 180 天自動過期
        );
      } catch (e) { console.error('KV write failed:', e); }
    }

    // Push 到 LINE
    const lineText = formatLineMessage(cleaned);
    await pushToLine(context.env, lineText);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('feedback error:', err);
    return new Response(
      JSON.stringify({ error: '送出失敗，請稍後再試' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
