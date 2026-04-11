// æµ·å¤è³¼ç©æç®å¨ API â Cloudflare Pages Function
// POST /api/converter
// Body: { image: base64String, mimeType: 'image/jpeg' | 'image/png' }
// Returns: { items: [{ name, price, unit, currency }], rate }

interface Env {
  GEMINI_API_KEY: string;
}

interface RecognizedItem {
  name: string;
  price: number;
  unit: string;
  currency: string;
}

const SYSTEM_PROMPT = `ä½ æ¯ä¸åæµ·å¤è³¼ç©å¹æ ¼è¾¨è­å©æãè«ä»ç´°è¾¨è­ç§çä¸­çææåååé åå¹æ ¼ã

å°æ¼æ¯åè¾¨è­å°çåé ï¼åå³ä»¥ä¸æ ¼å¼ç JSONï¼
{
  "items": [
    {
      "name": "ååè±æåç¨±ï¼ä¿çåæï¼",
      "price": æ¸å­ï¼ä¸å«è²¨å¹£ç¬¦èï¼ï¼
      "unit": "è¨å¹å®ä½",
      "currency": "å¹£å¥ä»£ç¢¼"
    }
  ]
}

unit åè¨±çå¼ï¼
- "per_lb" â æ¯ç£
- "per_oz" â æ¯ç®å¸
- "per_kg" â æ¯å¬æ¤
- "per_100g" â æ¯100å¬å
- "per_gallon" â æ¯å ä¾
- "per_liter" â æ¯å¬å
- "per_floz" â æ¯æ¶²é«çå¸
- "each" â æ¯å/æ¯ä»¶/æ¯å

å¦æç¡æ³ç¢ºå®è¨å¹å®ä½ï¼ä½¿ç¨ "each"ã
å¦æç¡æ³ç¢ºå®å¹£å¥ï¼é è¨­ "USD"ã
åªåå³ç´ JSONï¼ä¸è¦æä»»ä½å¤é¤æå­æ markdown æ¨è¨ã`;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { image, mimeType } = await context.request.json() as {
      image: string;
      mimeType: string;
    };

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'ç¼ºå°åçè³æ' }),
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

    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const mime = mimeType || 'image/jpeg';

    // Call Gemini Vision API
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: SYSTEM_PROMPT },
                {
                  inlineData: {
                    mimeType: mime,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text();
      console.error('Gemini Vision API error:', geminiResp.status, errBody);
      return new Response(
        JSON.stringify({ error: `Gemini API åå³é¯å (${geminiResp.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp.json() as any;
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from Gemini response (may include ```json wrapper)
    let parsed: { items: RecognizedItem[] };
    try {
      const jsonStr = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Gemini response:', rawText);
      return new Response(
        JSON.stringify({
          error: 'è¾¨è­çµæè§£æå¤±æï¼è«éæ°æææ´æ¸æ°çç§ç',
          raw: rawText,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate items structure
    const items = (parsed.items || []).map((item) => ({
      name: item.name || 'Unknown Item',
      price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
      unit: item.unit || 'each',
      currency: item.currency || 'USD',
    }));

    return new Response(
      JSON.stringify({ items, rate: 32.5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('converter error:', err);
    return new Response(
      JSON.stringify({ error: 'ä¼ºæå¨èçé¯èª¤ï¼' + (err.message || 'æªç¥é¯èª¤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
