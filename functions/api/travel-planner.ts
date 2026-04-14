// 旅遊規劃師 API — Cloudflare Pages Function
// POST /api/travel-planner
// Body: { destination, days?, style?, category? }
// category='overview' 時回傳 4 大分類概覽；其他 category 回傳該分類的詳細清單

interface Env { GEMINI_API_KEY: string }

const GEN_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const CATEGORY_LABELS: Record<string, string> = {
  food: '吃的（餐廳、小吃、咖啡）',
  stay: '住的（飯店、民宿、溫泉旅館）',
  shop: '逛的（商店、市場、文青小店、特色街區）',
  play: '玩的（景點、體驗、活動、博物館）',
};

function buildOverviewPrompt(destination: string, days: string, style: string): string {
  const styleNote = style ? `\n旅遊風格偏好：${style}` : '';
  const daysNote = days ? `\n預計停留：${days} 天` : '';
  return `你是一位熟悉台灣與海外旅遊的在地嚮導，正在幫一位 60 歲左右、常跟姐妹出遊的阿姨規劃旅遊。

目的地：${destination}${daysNote}${styleNote}

請針對這個目的地，回傳 4 大分類概覽（吃／住／逛／玩），用親切、推薦朋友的口吻，回傳純 JSON（不要 markdown 標記）：

{
  "destination": "地點完整名稱（含國家/縣市）",
  "summary": "用 2-3 句話介紹這個地方的特色與亮點",
  "bestSeason": "建議前往季節（例：春天櫻花季 3-4 月最美）",
  "tips": [
    "旅遊小提醒一（例：交通建議、注意事項）",
    "提醒二",
    "（3-5 則）"
  ],
  "categories": {
    "food": { "highlight": "一句話說這裡最值得吃什麼（例：必吃拉麵老店、在地夜市）", "sampleCount": 5 },
    "stay": { "highlight": "一句話說這裡住宿特色（例：溫泉老字號、市中心商務）", "sampleCount": 4 },
    "shop": { "highlight": "一句話說這裡逛什麼最有趣", "sampleCount": 5 },
    "play": { "highlight": "一句話說這裡玩什麼最經典", "sampleCount": 6 }
  }
}

要求：
- 語氣像朋友推薦，不要用「您好」「敬請」等生硬詞
- tips 要具體可行（例：「搭 JR 從京都車站 30 分鐘可到」比「交通方便」好）
- 只回純 JSON`;
}

function buildCategoryPrompt(destination: string, category: string, style: string): string {
  const styleNote = style ? `（風格偏好：${style}）` : '';
  const catLabel = CATEGORY_LABELS[category] || category;
  return `你是熟悉當地的旅遊嚮導，正在推薦 ${destination} 附近的「${catLabel}」給一位 60 歲左右的阿姨和她的姐妹們${styleNote}。

請推薦 5-8 個具體地點（盡可能是真實存在、知名或口碑好的），回傳純 JSON：

{
  "items": [
    {
      "name": "店名/地點名（中文/原文並呈更佳）",
      "type": "類型（例：拉麵店、溫泉旅館、文具雜貨、博物館）",
      "area": "所在街區或捷運/車站（例：祇園、京都車站旁）",
      "highlight": "一句話亮點（為什麼推薦，20-35 字）",
      "recommendation": "具體建議（例：「推薦點什麼」「最佳拜訪時段」「訂房提醒」；30-60 字）",
      "priceLevel": "💰 / 💰💰 / 💰💰💰 / 💰💰💰💰",
      "tags": ["2-4 個標籤，例：必吃、親子友善、人少清靜、IG 打卡"],
      "mapQuery": "給 Google Maps 搜尋用的關鍵字（店名+地點，例：「一蘭拉麵 京都四条店」）"
    }
  ]
}

要求：
- 以真實、口碑好的地點為主，不要編造
- highlight 要具體（例：「湯頭是 24 小時豚骨白湯」比「好吃」好）
- recommendation 給可執行的建議
- 只回純 JSON`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      destination?: string;
      days?: string;
      style?: string;
      category?: string;
    };
    const destination = (body.destination || '').trim().slice(0, 100);
    const days = (body.days || '').trim().slice(0, 20);
    const style = (body.style || '').trim().slice(0, 60);
    const category = body.category || 'overview';

    if (!destination) {
      return new Response(
        JSON.stringify({ error: '請輸入目的地' }),
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

    const prompt = category === 'overview'
      ? buildOverviewPrompt(destination, days, style)
      : buildCategoryPrompt(destination, category, style);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55_000);

    let res: Response;
    try {
      res = await fetch(
        `${GEN_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 4096, responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        }
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: '規劃逾時，請稍候再試或縮短目的地範圍' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Gemini API error:', res.status, errBody.slice(0, 300));
      return new Response(
        JSON.stringify({ error: `AI 服務回應異常 (${res.status})，請稍後重試` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json() as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse:', raw.slice(0, 500));
      return new Response(
        JSON.stringify({ error: '規劃結果解析失敗，請重試' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('travel-planner error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器錯誤：' + (err.message || '未知') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
