// 意見回饋 API — Cloudflare Pages Function
// POST /api/feedback
// Body: { name, usage[], type[], text, contact, ts, ua }
// 目前實作：寫入 console.log（CF Pages dashboard > Functions > Real-time logs 可看）
// 如需 email/Notion/Telegram 通知，可在這邊加 fetch 到對應 webhook

interface Env {
  // FEEDBACK_WEBHOOK_URL?: string;  // 之後想要時可在 CF 環境變數設定
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

    // 醒目印出，方便在 CF Pages 後台 Real-time logs 找到
    console.log('========== TOOLS-REYWAY FEEDBACK ==========');
    console.log(JSON.stringify(cleaned, null, 2));
    console.log('===========================================');

    // 之後如果要加自動轉發（email/Notion/Telegram/Slack），可加在這裡
    // 範例：
    // if (context.env.FEEDBACK_WEBHOOK_URL) {
    //   await fetch(context.env.FEEDBACK_WEBHOOK_URL, { method: 'POST', body: JSON.stringify(cleaned) });
    // }

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
