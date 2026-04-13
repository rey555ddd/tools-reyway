// 海外購物助手 API — Cloudflare Pages Function
// POST /api/converter
// Body: { image, mimeType, sourceCurrency, targetCurrency, rate }
// Returns: { items: [{ name, originalPrice, unit, currency, convertedItems }], rate, sourceCurrency, targetCurrency }

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', KRW: '₩', CNY: '¥',
  THB: '฿', VND: '₫', SGD: 'S$', MYR: 'RM', AUD: 'A$', CAD: 'C$',
  HKD: 'HK$', PHP: '₱', IDR: 'Rp', TWD: 'NT$',
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', KRW: '🇰🇷', CNY: '🇨🇳',
  THB: '🇹🇭', VND: '🇻🇳', SGD: '🇸🇬', MYR: '🇲🇾', AUD: '🇦🇺', CAD: '🇨🇦',
  HKD: '🇭🇰', PHP: '🇵🇭', IDR: '🇮🇩', TWD: '🇹🇼',
};

// Default rates to TWD (approximate, user can override)
const DEFAULT_RATES_TO_TWD: Record<string, number> = {
  USD: 32.5, EUR: 35.5, GBP: 41.0, JPY: 0.215, KRW: 0.024, CNY: 4.5,
  THB: 0.95, VND: 0.0013, SGD: 24.5, MYR: 7.3, AUD: 21.0, CAD: 23.5,
  HKD: 4.15, PHP: 0.57, IDR: 0.002, TWD: 1,
};

function getDefaultRate(src: string, tgt: string): number {
  const srcToTWD = DEFAULT_RATES_TO_TWD[src] || 1;
  const tgtToTWD = DEFAULT_RATES_TO_TWD[tgt] || 1;
  return srcToTWD / tgtToTWD;
}

function fmtPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  if (amount > 1000) return `${sym} ${Math.round(amount).toLocaleString()}`;
  if (amount > 10) return `${sym} ${amount.toFixed(1)}`;
  return `${sym} ${amount.toFixed(2)}`;
}

function buildConvertedItems(
  raw: RecognizedItem,
  rate: number,
  sourceCurrency: string,
  targetCurrency: string
): { label: string; value: string; highlight: boolean }[] {
  const items: { label: string; value: string; highlight: boolean }[] = [];
  const price = raw.price;
  const unit = raw.unit || 'each';
  const srcFlag = CURRENCY_FLAGS[sourceCurrency] || '';
  const tgtFlag = CURRENCY_FLAGS[targetCurrency] || '';
  const srcSym = CURRENCY_SYMBOLS[sourceCurrency] || sourceCurrency;

  const converted = price * rate;

  // Original price
  const unitLabel = unit === 'each' ? '' : ` / ${unit.replace('per_', '')}`;
  items.push({
    label: `${srcFlag} 原始價格`,
    value: price > 1000 ? `${srcSym} ${Math.round(price).toLocaleString()}${unitLabel}` : `${srcSym} ${price.toFixed(2)}${unitLabel}`,
    highlight: false,
  });

  // Converted price
  items.push({
    label: `${tgtFlag} 換算價格`,
    value: fmtPrice(converted, targetCurrency),
    highlight: true,
  });

  // Weight/volume conversions (only if not "each")
  if (unit === 'each') {
    // No further conversion needed
  } else if (['per_gallon', 'per_qt', 'per_liter', 'per_floz'].includes(unit)) {
    const ml = CONVERSIONS[unit] || 1000;
    const tgtPerL = (converted / ml) * 1000;
    items.push({ label: '每公升', value: fmtPrice(tgtPerL, targetCurrency), highlight: false });
    items.push({ label: '每 100mL', value: fmtPrice(tgtPerL / 10, targetCurrency), highlight: false });
  } else {
    const grams = CONVERSIONS[unit] || 1;
    const tgtPerG = converted / grams;
    items.push({ label: '每台斤 (600g)', value: fmtPrice(tgtPerG * 600, targetCurrency), highlight: true });
    items.push({ label: '每 100g', value: fmtPrice(tgtPerG * 100, targetCurrency), highlight: false });
    items.push({ label: '每公斤', value: fmtPrice(tgtPerG * 1000, targetCurrency), highlight: false });
  }

  return items;
}

function buildSystemPrompt(sourceCurrency: string): string {
  return `你是一個海外購物價格辨識助手。請仔細辨識照片中的所有商品和價格。

使用者預期看到的幣別是 ${sourceCurrency}，但請根據照片中實際顯示的幣別來辨識。如果照片中看不出幣別，請預設為 ${sourceCurrency}。

對於每個辨識到的項目，回傳以下格式的 JSON：

{
  "items": [
    {
      "name": "商品名稱（保留原文，可加中文翻譯在括號中）",
      "price": 數字（不含貨幣符號）,
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
- "each" — 每個/每件/每包/每份/每杯/每盤

currency 允許的值：USD, EUR, GBP, JPY, KRW, CNY, THB, VND, SGD, MYR, AUD, CAD, HKD, PHP, IDR, TWD

如果是菜單（menu），每道菜或飲品都算一個項目。
如果是超市標價，每個商品標籤算一個項目。
如果無法確定計價單位，使用 "each"。
只回傳純 JSON，不要有任何額外文字或 markdown 標記。`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      image: string;
      mimeType: string;
      sourceCurrency?: string;
      targetCurrency?: string;
      rate?: number;
    };

    const { image, mimeType } = body;
    const sourceCurrency = body.sourceCurrency || 'USD';
    const targetCurrency = body.targetCurrency || 'TWD';
    const rate = body.rate || getDefaultRate(sourceCurrency, targetCurrency);

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

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: buildSystemPrompt(sourceCurrency) },
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

    const recognizedItems = (parsed.items || []).map((item) => ({
      name: item.name || 'Unknown Item',
      price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0,
      unit: item.unit || 'each',
      currency: item.currency || sourceCurrency,
    }));

    // Build response with per-item conversions
    const responseItems = recognizedItems.map((raw) => {
      // If the recognized currency differs from the user's selected source, recalculate rate
      let itemRate = rate;
      if (raw.currency !== sourceCurrency) {
        itemRate = getDefaultRate(raw.currency, targetCurrency);
      }

      return {
        name: raw.name,
        originalPrice: raw.price,
        unit: raw.unit,
        currency: raw.currency,
        convertedItems: buildConvertedItems(
          { ...raw },
          itemRate,
          raw.currency,
          targetCurrency
        ),
      };
    });

    return new Response(
      JSON.stringify({
        items: responseItems,
        rate,
        sourceCurrency,
        targetCurrency,
      }),
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
