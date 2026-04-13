// 植物醫生 API — Cloudflare Pages Function
// POST /api/plant-doctor
// Body: { image, mimeType, mode: 'identify'|'diagnose'|'care', userNote?: string }
// Returns structured plant info based on mode

interface Env { GEMINI_API_KEY: string; }

function buildPrompt(mode: string, userNote: string): string {
  const noteSection = userNote && userNote.trim()
    ? `\n\n使用者補充說明：「${userNote.trim()}」\n請將此資訊納入判斷。\n`
    : '';

  if (mode === 'identify') {
    return `你是一位專精各類植物（特別擅長多肉植物與觀葉植物，也熟悉花卉、果樹、香草、蔬菜）的植物學家，正在幫使用者辨識他/她家裡的植物，對象可能是任何年齡性別。

請看這張照片，辨識植物品種，用親切、輕鬆、像朋友聊天的口吻（例如開頭可以說「嗨嗨～」而不是「您好」），回傳純 JSON（不要 markdown 標記）：

{
  "isPlant": true 或 false,
  "commonName": "中文俗名（最常用的，例如：龜背芋、玉露、虎皮蘭）",
  "scientificName": "學名（拉丁文）",
  "alternativeNames": ["其他俗稱（如有）"],
  "family": "科名（中文，例如：天南星科、景天科）",
  "category": "多肉植物 / 觀葉植物 / 開花植物 / 香草 / 果樹 / 蔬菜 / 其他",
  "confidence": "高 / 中 / 低（你對這個辨識的信心）",
  "alternatives": [
    {"name": "可能的另一種品種", "reason": "差異點"}
  ],
  "intro": "用 2-3 句白話介紹這是什麼植物、特點、原產地",
  "difficulty": "好養 / 中等 / 較難（給新手的難度評估）",
  "lifespan": "壽命/生長期描述（例如：多年生，照顧得好可以活 10 年以上）"
}

要求：
- 信心程度若是「低」，alternatives 至少給 2 個可能選項
- 若照片不是植物（isPlant=false），其他欄位填空，intro 寫「這張照片看起來不是植物喔」
- 用親切、白話的語氣，避免艱澀術語${noteSection}`;
  }

  if (mode === 'diagnose') {
    return `你是一位專精各類植物（特別擅長多肉植物與觀葉植物，也熟悉花卉、果樹、香草、蔬菜）病蟲害的植物醫生，正在幫使用者診斷家中植物的狀況，對象可能是任何年齡性別。

請仔細看這張照片（特別注意葉片顏色、形狀、有無斑點、蟲害痕跡），用親切、輕鬆、像朋友聊天的口吻（例如「嗨嗨～看起來...」而不是「您好」），給出診斷。回傳純 JSON：

{
  "isPlant": true 或 false,
  "commonName": "如果認得品種，寫中文俗名；不認得寫空字串",
  "healthStatus": "健康 / 輕微異常 / 需要處理 / 緊急（請選一個）",
  "mainDiagnosis": {
    "problem": "最可能的問題（例：澆水過多、曬傷、介殼蟲、根腐病等，用白話）",
    "confidence": "高 / 中 / 低",
    "evidence": "你從照片看到什麼徵兆得出這個結論（具體描述）"
  },
  "alternativeDiagnoses": [
    {"problem": "另一可能", "evidence": "判斷依據"}
  ],
  "immediateActions": [
    "立即要做的事第一步（具體動作，例如「停止澆水 7-10 天」而不是「減少澆水」）",
    "第二步",
    "（3-5 步）"
  ],
  "prevention": [
    "之後怎麼避免再發生（具體做法）"
  ],
  "whenToWorry": "什麼狀況代表惡化、要採取更激烈措施（例如：葉片繼續變黑、出現異味，就要脫盆檢查根部）",
  "encouragement": "一句鼓勵的話（例如：別擔心，這種狀況很常見，照著做通常一週內會改善）"
}

要求：
- 用「立即可執行的動作」描述，不要含糊
- evidence 要具體說「我看到葉片邊緣呈現XX顏色」這樣
- 若植物看起來健康，healthStatus 填「健康」，mainDiagnosis.problem 填「目前看起來沒問題」，immediateActions 給日常照護建議
- 若不是植物（isPlant=false），其他欄位填空，encouragement 寫「這張照片看起來不是植物喔」${noteSection}`;
  }

  // care mode
  return `你是一位專精各類植物（特別擅長多肉植物與觀葉植物，也熟悉花卉、果樹、香草、蔬菜）的養護專家，正在教使用者照顧家中植物，對象可能是任何年齡性別。

請看這張照片，先辨識品種，然後給出完整的養護指南，用親切、輕鬆、像朋友聊天的口吻（避免「您好」「阿姨」等稱謂）。回傳純 JSON：

{
  "isPlant": true 或 false,
  "commonName": "中文俗名",
  "scientificName": "學名",
  "category": "多肉植物 / 觀葉植物 / 開花植物 / 香草 / 果樹 / 蔬菜 / 其他",
  "difficulty": "好養 / 中等 / 較難",
  "watering": {
    "frequency": "澆水頻率（例如：夏天 5-7 天一次、冬天 14-21 天一次）",
    "method": "澆水方法（例如：土乾透再澆、澆到水從盆底流出）",
    "warning": "最常見的澆水錯誤"
  },
  "light": {
    "level": "光照需求（例如：明亮散光 / 半日照 / 全日照）",
    "placement": "建議擺放位置（例如：朝東窗邊、避開西曬）",
    "warning": "光照常見問題"
  },
  "temperature": "適宜溫度範圍（例如：15-28°C，低於 5°C 需移入室內）",
  "humidity": "濕度需求（例如：一般室內濕度即可 / 喜歡高濕度，可在旁邊放水盤）",
  "soil": "土壤建議（例如：多肉專用排水土 / 一般培養土加珍珠石）",
  "fertilizer": "施肥建議（例如：春秋兩季每月一次稀釋液肥）",
  "repotting": "換盆時機（例如：每 1-2 年春天換盆）",
  "propagation": "繁殖方式（例如：葉插、扦插，附簡易步驟）",
  "seasonalCare": {
    "spring": "春天注意",
    "summer": "夏天注意",
    "autumn": "秋天注意",
    "winter": "冬天注意"
  },
  "commonMistakes": [
    "新手最常犯的錯第一條",
    "第二條",
    "第三條"
  ],
  "tips": "一個能讓這株植物長得更好的小撇步"
}

要求：
- 所有建議都用「具體可做的動作」，避免「適度」「適量」這種模糊詞
- 季節照護針對台灣氣候（亞熱帶、夏熱冬涼）
- 若不是植物（isPlant=false），其他欄位填空，tips 寫「這張照片看起來不是植物喔」${noteSection}`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      image: string;
      mimeType?: string;
      mode?: string;
      userNote?: string;
    };

    const { image } = body;
    const mimeType = body.mimeType || 'image/jpeg';
    const mode = body.mode || 'identify';
    const userNote = body.userNote || '';

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
                { text: buildPrompt(mode, userNote) },
                { inlineData: { mimeType, data: base64Data } },
              ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
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
      const status = geminiResp.status;
      const errBody = await geminiResp.text();
      console.error('Gemini API error:', status, errBody.slice(0, 300));
      let userMsg: string;
      if (status === 429) userMsg = '使用人數較多，請稍候 30 秒再試';
      else if (status >= 500) userMsg = 'AI 服務暫時不穩，請稍候再試';
      else userMsg = `AI 服務回應異常 (${status})，請稍後重試`;
      return new Response(
        JSON.stringify({ error: userMsg }),
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
      console.error('Failed to parse Gemini response:', rawText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: '辨識結果解析失敗，請重拍一張更清楚的照片' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ...parsed, mode }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('plant-doctor error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器處理錯誤：' + (err.message || '未知錯誤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
