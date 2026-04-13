// 包裝拍照解讀 API — Cloudflare Pages Function
// POST /api/package-reader
// Body: { image: base64String, mimeType: string, category?: 'medicine' | 'supplement' | 'food' | 'cosmetic' | 'other' }
// Returns: { productName, category, summary, usage, ingredients, warnings, expiry, raw }

interface Env { GEMINI_API_KEY: string; }

const CATEGORY_LABEL: Record<string, string> = {
  medicine: '藥品',
  supplement: '保健品',
  food: '食品',
  cosmetic: '化妝品/保養品',
  other: '一般商品',
};

function buildPrompt(category: string): string {
  const label = CATEGORY_LABEL[category] || '一般商品';
  return `你是一個專門為「不擅長閱讀小字、看不懂專業術語」的長輩使用者解讀商品包裝的 AI 助理。

請仔細看這張${label}的包裝照片（可能是中文、英文或其他語言），用「白話、親切、像對長輩講話」的語氣解讀，並回傳以下純 JSON 格式（不要 markdown 標記）：

{
  "productName": "產品名稱（中文，若原文是外語請翻譯）",
  "productNameOriginal": "原文名稱（如果與中文不同，否則留空字串）",
  "category": "${category}",
  "summary": "一句話告訴長輩這是什麼東西、有什麼用（30 字內，超親切口吻）",
  "usage": [
    "用法步驟一（白話完整句子）",
    "用法步驟二",
    "（建議 3-5 點）"
  ],
  "dosage": "服用劑量/使用份量（針對藥品和保健品；不適用則填空字串）",
  "ingredients": [
    "主要成分一（白話說明，如：維他命C 500毫克 — 幫助補充營養）",
    "主要成分二"
  ],
  "warnings": [
    "重要警語/禁忌（例如：孕婦不可使用、開車前不要服用、過敏體質須注意）",
    "（最重要的放第一條）"
  ],
  "expiry": "保存期限或有效日期（如果照片看得到，否則寫『請查看包裝上日期』）",
  "storage": "保存方式（如：常溫、冷藏、避光，看不出來就寫『請依包裝指示保存』）",
  "doctorAdvice": "${category === 'medicine' || category === 'supplement' ? '是否建議諮詢醫師/藥師（給一句話建議，例如「初次使用建議先問藥師」）' : ''}"
}

要求：
1. ⚠️ 永遠用「親切、易懂、像兒女在跟父母解釋」的語氣
2. 看不清楚的部分請誠實寫「包裝上看不清楚」，不要編造
3. 警語務必完整，特別是藥品的禁忌與副作用
4. 用詞避免艱澀醫學術語，必要時用「（也就是俗稱的XX）」括號補充
5. 若不是${label}（看起來是別類），請在 summary 裡先說明「這看起來不像是${label}，比較像是XX」
6. 只回純 JSON，不要 \`\`\`json 標記`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      image: string;
      mimeType: string;
      category?: string;
    };

    const { image, mimeType } = body;
    const category = body.category || 'other';

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let geminiResp: Response;
    try {
      geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: buildPrompt(category) },
                { inlineData: { mimeType: mime, data: base64Data } },
              ],
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          }),
          signal: controller.signal,
        }
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: '辨識逾時，請稍後重試或重拍一張更清楚的照片' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text();
      console.error('Gemini API error:', geminiResp.status, errBody);
      return new Response(
        JSON.stringify({ error: `辨識服務暫時無法使用 (${geminiResp.status})，請稍後重試` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp.json() as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any;
    try {
      const jsonStr = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Gemini response:', rawText);
      return new Response(
        JSON.stringify({ error: '解讀結果解析失敗，請重拍一張更清楚的照片' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ...parsed, categoryLabel: CATEGORY_LABEL[category] || '一般商品' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('package-reader error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器處理錯誤：' + (err.message || '未知錯誤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
