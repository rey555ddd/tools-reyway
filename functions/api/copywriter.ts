// ææ¡å°å¹«æ API â Cloudflare Pages Function
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
        JSON.stringify({ error: 'ç¼ºå°å¿è¦æ¬ä½ï¼text, systemPrompt' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key æªè¨­å®' }),
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
        JSON.stringify({ error: `Gemini API åå³é¯èª¤ (${geminiResp.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp.json() as any;

    // Extract text from response
    const resultText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'ç¡æ³åå¾åè¦ï¼è«ç¨å¾åè©¦ã';

    return new Response(
      JSON.stringify({ result: resultText, mode, tone }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('copywriter error:', err);
    return new Response(
      JSON.stringify({ error: 'ä¼ºæå¨èçé¯èª¤ï¼' + (err.message || 'æªç¥é¯èª¤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
// /api/copywriter — Gemini-powered copywriting assistant
interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  mode: 'gen' | 'deai' | 'tone' | 'slim';
  text: string;
  tone?: string;
  systemPrompt?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'API key not configured' }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { mode, text, tone, systemPrompt } = body;
  if (!text || !text.trim()) {
    return Response.json({ error: 'Text is required' }, { status: 400 });
  }

  // Build prompt
  let prompt: string;
  if (systemPrompt) {
    prompt = `${systemPrompt}\n\n${text}`;
  } else {
    prompt = buildPrompt(mode, text, tone);
  }

  try {
    const geminiResponse = await callGemini(apiKey, prompt);
    return Response.json({ result: geminiResponse });
  } catch (e: any) {
    console.error('Gemini API error:', e);
    return Response.json({ error: 'AI processing failed', detail: e.message }, { status: 502 });
  }
};

function buildPrompt(mode: string, text: string, tone?: string): string {
  const toneInstructions: Record<string, string> = {
    warm: '語氣溫暖、親切、像跟好朋友說話。',
    formal: '語氣正式、專業、有條理。',
    humor: '語氣輕鬆幽默，帶趣味。',
    literary: '語氣有質感、有畫面感，用字精煉。',
  };

  switch (mode) {
    case 'deai':
      return `你是一位資深文案編輯。請將以下文字去除「AI 味」，讓它讀起來更像真人寫的。
規則：
1. 移除過於工整的排比句和對仗
2. 減少「此外」「總之」「值得一提的是」等 AI 常用連接詞
3. 加入口語化的轉折和節奏感
4. 保留原文的核心意思，不要加油添醋
5. 不要使用 emoji
6. 語氣自然就好
只輸出修改後的文案，不要加任何說明。

${text}`;

    case 'tone':
      return `你是一位資深文案編輯。請將以下文字改寫成指定語氣。
目標語氣：${toneInstructions[tone || 'warm']}
規則：保留核心意思，不加油添醋，不用 emoji。
只輸出修改後的文案。

${text}`;

    case 'slim':
      return `你是一位資深文案編輯。請將以下文字精簡濃縮，字數減少 30-50%，保留核心資訊，不用 emoji。
只輸出精簡後的文案。

${text}`;

    case 'gen':
      return `你是一位資深文案寫手。請根據以下描述撰寫一段完整文案。文案要有溫度有節奏，不用 AI 味排比句，口語化但有質感，不用 emoji。
只輸出文案本身。

${text}`;

    default:
      return text;
  }
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}
