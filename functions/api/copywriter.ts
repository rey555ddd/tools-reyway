// 文案小幫手 API — Cloudflare Pages Function
// POST /api/copywriter
// Body: { mode, text, tone, systemPrompt }

interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { mode, text, tone, systemPrompt } = await context.request.json() as {
      mode: string;
      text: string;
      tone?: string;
      systemPrompt: string;
    };

    if (!text || !systemPrompt) {
      return new Response(
        JSON.stringify({ error: '缺少必要欄位：text, systemPrompt' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key 未設定' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
	}

    // Call Gemini API
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${systemPrompt}\n\n${text}` }],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text();
      console.error('Gemini API error:', geminiResp.status, errBody);
      return new Response(
        JSON.stringify({ error: `Gemini API 回應錯誤 (${geminiResp.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp.json() as any;

    // Extract text from response
    const resultText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      '無法取得回覆，請稍後再試。';

    return new Response(
      JSON.stringify({ result: resultText, mode, tone }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('copywriter error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器處理錯誤：' + (err.message || '未知錯誤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

