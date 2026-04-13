// 海外購物換算器 API — Cloudflare Pages Function
// POST /api/converter
// Body: { image: base64String, mimeType: 'image/jpeg' | 'image/png' }
// Returns: { product, items: [{ label, value, highlight }], rate }

interface Env { GEMINI_API_KEY: string; }

interface RecognizedItem {
  name: string;
  price: number;
  unit: string;
  currency: string;
}

const CONVERSIONS: Record<string, number> = {
  per_lb: 453.592, per_oz: 28.3495, per_kg: 1000, per_100g: 100,
  per_gallon: 3785.41, per_qt: 946.353, per_liter: 1000, per_floz: 29.5735,
};

const UNIT_NAMES: Record<string, string> = {
  per_lb: '每磅 (lb)', per_oz: '每盎司 (oz)', per_kg: '每公斤',
  per_100g: '每 100g', each: '每個', per_gallon: '每加侖',
  per_qt: '每夸脫', per_liter: '每公升', per_floz: '每液體盎司',
};

function formatItems(raw: RecognizedItem, rate: number): { label: string; value: string; highlight: boolean }[] {
  const items: { label: string; value: string; highlight: boolean }[] = [];
  const price = raw.price;
  const unit = raw.unit || 'each';
  const twdPrice = price * rate;

  items.push({ label: '美元價格', value: `US$ ${price.toFixed(2)} / ${UNIT_NAMES[unit] || unit}`, highlight: false });
  items.push({ label: '台幣價格', value: `NT$ ${twdPrice.toFixed(1)}`, highlight: true });

  if (unit === 'each') {
    // No weight conversion needed
  } else if (unit === 'per_gallon' || unit === 'per_qt' || unit === 'per_liter' || unit === 'per_floz') {
    const ml = CONVERSIONS[unit] || 1000;
    const twdPerL = (twdPrice / ml) * 1000;
    items.push({ label: '每公升', value: `NT$ ${twdPerL.toFixed(1)}`, highlight: false });
    items.push({ label: '每 100mL', value: `NT$ ${(twdPerL / 10).toFixed(1)}`, highlight: false });
  } else {
    const grams = CONVERSIONS[unit] || 1;
    const twdPerG = twdPrice / grams;
    items.push({ label: '每台斤 (600g)', value: `NT$ ${(twdPerG * 600).toFixed(1)}`, highlight: true });
    items.push({ label: '每 100g', value: `NT$ ${(twdPerG * 100).toFixed(1)}`, highlight: false });
    items.push({ label: '每公斤', value: `NT$ ${(twdPerG * 1000).toFixed(1)}`, highlight: false });
  }

  return items;
}

const SYSTEM_PROMPT = `你是一個海外購物e��格辨識助手。請仔細辨識照片中的所有商品和價格。

對於每個辨識到的項目，回傳以下格式的 JSON：

{
  "items": [
    {
      "name": "商品英文名稱（保留原文）",
      "price": 數字（不含貨幣符號），
      "unit": "計價單位",
      "currency": "幣別代碼"
    }
  ]
}

unit 允許的值：
- "per_lb" — 每磅
- "per_oz" — 每盎司
- "per_kg" — 每公斤
- "per_100g" — 每100公克
- "per_gallon" — 每加侖
- "per_liter" — 每公升
- "per_floz" — 每液體盎司
- "each" — 每個/每件/每包

如果無法確定計價單位，使用 "each"。
如果無法確定幣別，預設 "USD"。
只回傳純 JSON，不要有任何額外文字或 markdown 標記。`;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { image, mimeType } = await context.request.json() as {
      image: string;
      mimeType: string;
    };

    if (!image) {
      return new Response(
        JSON.stringify({ error: '缺少照片資料' }),
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

    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const mime = mimeType || 'image/jpeg';
    const rate = 32.5;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: SYSTEM_PROMPT },
              { inlineData: { mimeType: mime, data: base64Data } },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text();
      console.error('Gemini Vision API error:', geminiResp.status, errBody);
      return new Response(
        JSON.stringify({ error: `Gemini API 回應錯誤 (${geminiResp.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp.json() as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
        JSON.stringify({ error: '辨識結果解析失敗，請重新拍攝更清晰的照片', raw: rawText }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rawItems = (parsed.items || []).map((item) => ({
      name: item.name || 'Unknown Item',
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0,
      unit: item.unit || 'each',
      currency: item.currency || 'USD',
    }));

    // Build response in the format the frontend expects
    // Use the first item as the main product, format all items' conversions
    const product = rawItems.length > 0 ? rawItems[0].name : '';
    const allItems: { label: string; value: string; highlight: boolean }[] = [];

    for (const raw of rawItems) {
      if (rawItems.length > 1) {
        // Multiple items: add a separator-like header
        allItems.push({ label: raw.name, value: `US$ ${raw.price.toFixed(2)}`, highlight: false });
      }
      allItems.push(...formatItems(raw, rate));
    }

    return new Response(
      JSON.stringify({ product, items: allItems, rate }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('converter error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器處理錯誤：' + (err.message || '未知錯誤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
