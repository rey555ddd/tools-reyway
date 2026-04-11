// /api/converter — Gemini Vision-powered price tag recognition & unit conversion
interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  image: string;      // base64 encoded image
  mimeType: string;   // e.g. 'image/jpeg'
}

interface PriceItem {
  product: string;
  price: number;
  unit: string;
  currency: string;
}

const USD_TO_TWD = 32.5; // Default rate, updated at runtime if possible
const GRAMS_PER_LB = 453.592;
const GRAMS_PER_OZ = 28.3495;
const GRAMS_PER_JIN = 600;
const ML_PER_GALLON = 3785.41;
const ML_PER_QT = 946.353;

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

  if (!body.image) {
    return Response.json({ error: 'Image is required' }, { status: 400 });
  }

  try {
    const parsed = await analyzeImage(apiKey, body.image, body.mimeType || 'image/jpeg');
    const result = buildConversions(parsed);
    return Response.json(result);
  } catch (e: any) {
    console.error('Converter error:', e);
    return Response.json({ error: 'Image analysis failed', detail: e.message }, { status: 502 });
  }
};

async function analyzeImage(apiKey: string, base64Image: string, mimeType: string): Promise<PriceItem> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `你是一個超市價格標籤辨識專家。請分析這張圖片中的價格標籤。

請用以下 JSON 格式回覆，不要加任何其他文字：
{
  "product": "商品名稱（英文或中文皆可）",
  "price": 數字（不含貨幣符號），
  "unit": "計價單位，只能是以下之一：per_lb / per_oz / per_kg / per_100g / each / per_gallon / per_qt",
  "currency": "貨幣，USD 或其他"
}

如果圖片中有多個價格，取最顯眼的主要價格。
如果無法辨識，回覆：{"product": "無法辨識", "price": 0, "unit": "each", "currency": "USD"}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error('Could not parse Gemini response as JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    product: parsed.product || 'Unknown',
    price: parseFloat(parsed.price) || 0,
    unit: parsed.unit || 'each',
    currency: parsed.currency || 'USD',
  };
}

function buildConversions(item: PriceItem) {
  const rate = USD_TO_TWD;
  const twdPrice = item.price * rate;
  const items: Array<{ label: string; value: string; highlight: boolean }> = [];

  // Original price
  const unitNames: Record<string, string> = {
    per_lb: '/ lb', per_oz: '/ oz', per_kg: '/ kg',
    per_100g: '/ 100g', each: '', per_gallon: '/ gal', per_qt: '/ qt',
  };
  items.push({
    label: '美元價格',
    value: `US$ ${item.price.toFixed(2)} ${unitNames[item.unit] || ''}`.trim(),
    highlight: false,
  });

  // TWD conversion
  items.push({
    label: '台幣價格',
    value: `NT$ ${twdPrice.toFixed(0)} ${unitNames[item.unit] || ''}`.trim(),
    highlight: true,
  });

  // Weight-based conversions
  if (['per_lb', 'per_oz', 'per_kg', 'per_100g'].includes(item.unit)) {
    const gramsMap: Record<string, number> = {
      per_lb: GRAMS_PER_LB,
      per_oz: GRAMS_PER_OZ,
      per_kg: 1000,
      per_100g: 100,
    };
    const grams = gramsMap[item.unit];
    const twdPerG = twdPrice / grams;

    items.push({
      label: '每台斤 (600g)',
      value: `NT$ ${(twdPerG * GRAMS_PER_JIN).toFixed(0)}`,
      highlight: true,
    });
    items.push({
      label: '每 100g',
      value: `NT$ ${(twdPerG * 100).toFixed(1)}`,
      highlight: false,
    });
    items.push({
      label: '每公斤',
      value: `NT$ ${(twdPerG * 1000).toFixed(0)}`,
      highlight: false,
    });
  }

  // Volume-based conversions
  if (['per_gallon', 'per_qt'].includes(item.unit)) {
    const mlMap: Record<string, number> = {
      per_gallon: ML_PER_GALLON,
      per_qt: ML_PER_QT,
    };
    const ml = mlMap[item.unit];
    const twdPerMl = twdPrice / ml;

    items.push({
      label: '每公升',
      value: `NT$ ${(twdPerMl * 1000).toFixed(0)}`,
      highlight: true,
    });
    items.push({
      label: '每 100mL',
      value: `NT$ ${(twdPerMl * 100).toFixed(1)}`,
      highlight: false,
    });
  }

  return {
    product: item.product,
    originalPrice: item.price,
    unit: item.unit,
    currency: item.currency,
    rate,
    items,
  };
}
