// 去背商品情境生成器 API — Cloudflare Pages Function
// POST /api/bg-generator
// Body: { image: base64String, mimeType: string, backgroundStyle: string, customPrompt: string }
// Returns: { image: base64String, mimeType: "image/png" }

interface Env { GEMINI_API_KEY: string; }

const STYLE_PROMPTS: Record<string, string> = {
  marble: '高級白色大理石桌面，帶有灰色紋理，柔和的自然光從左側照射，背景是模糊的奶白色牆面',
  velvet: '深紅色絲絨布幔作為背景，帶有優雅的褶皺，柔和的聚光燈照射在商品上，營造奢華感',
  metallic: '拋光不銹鋼金屬表面，帶有微妙的反射，冷色調的工業風格燈光，背景是深灰色漸層',
  crystal: '透明水晶折射出彩虹光影，商品周圍散落著小水晶碎片，背景是純白色帶有彩色光斑',
  minimal: '純淨的白色背景，極簡風格，均勻的柔和照明，沒有陰影，乾淨俐落的商品攝影風格',
  wood: '溫暖的淺色原木桌面，帶有天然木紋，柔和的自然光，背景是淺米色牆面',
  leaves: '新鮮的綠色植物葉片環繞商品，桌面是白色的，帶有自然光線和淺綠色的色調',
  petals: '粉色和白色的花瓣自然散落在商品周圍，淺色木質表面，柔和的粉色調光線',
  linen: '天然棉麻布料作為底布，帶有自然的皺摺紋理，溫暖的米色調，柔和的側光',
  window: '清晨的陽光透過白色紗簾灑入，窗台場景，光影交錯，溫暖而明亮的氛圍',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { image, mimeType, backgroundStyle, customPrompt } = await context.request.json() as {
      image: string;
      mimeType: string;
      backgroundStyle: string;
      customPrompt: string;
    };

    if (!image) {
      return new Response(
        JSON.stringify({ error: '缺少商品圖片' }),
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

    // Build the background description
    let bgDescription: string;
    if (customPrompt && customPrompt.trim()) {
      bgDescription = customPrompt.trim();
    } else if (backgroundStyle && STYLE_PROMPTS[backgroundStyle]) {
      bgDescription = STYLE_PROMPTS[backgroundStyle];
    } else {
      bgDescription = '純淨的白色背景，專業商品攝影風格';
    }

    // Strip data URL prefix if present
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const mime = mimeType || 'image/jpeg';

    // Direct image-editing prompt. Gemini 2.5 Flash Image responds best to
    // imperative "Edit this image to..." phrasing rather than descriptive instructions.
    const prompt = `Edit this image: keep the main product/subject exactly as it is (preserve its shape, color, and details), but completely replace the background with the following scene:

${bgDescription}

Add natural shadows and lighting so the product sits realistically in the new scene. The result should look like a professional product photograph. Output the edited image directly.`;

    // Call Gemini once. Image generation is slow (30-60s); retrying within the same
    // request risks blowing past Cloudflare's wall-clock limit (causing a raw 502).
    // If it fails, return a clear message and let the user retry manually.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 70_000);

    let geminiResp: Response;
    try {
      geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mime, data: base64Data } },
              ],
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              temperature: 0.4,
            },
          }),
          signal: controller.signal,
        }
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: '模型回應逾時，請稍候再試或換一張較單純的圖片（背景乾淨、主體明確）' }),
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
      if (status === 400) {
        userMsg = '這張圖片無法處理（可能含人物、隱私或敏感內容），請改用單純的商品照（背景乾淨、無人臉）';
      } else if (status === 429) {
        userMsg = '使用人數較多或請求過於頻繁，請稍候 30 秒再試';
      } else if (status >= 500) {
        userMsg = 'AI 服務暫時不穩，請稍候 10-20 秒後再點一次「生成」';
      } else {
        userMsg = `AI 服務回應異常 (${status})，請稍後重試`;
      }
      return new Response(
        JSON.stringify({ error: userMsg }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiResp!.json() as any;
    const parts = data?.candidates?.[0]?.content?.parts || [];

    // Find the image part in the response
    let resultImage = '';
    let resultMimeType = 'image/png';
    let resultText = '';

    for (const part of parts) {
      if (part.inlineData) {
        resultImage = part.inlineData.data;
        resultMimeType = part.inlineData.mimeType || 'image/png';
      } else if (part.text) {
        resultText = part.text;
      }
    }

    if (!resultImage) {
      // If no image was generated, return text explanation
      const detail = resultText ? `模型回應：${resultText.slice(0, 200)}` : '模型未回傳圖片';
      return new Response(
        JSON.stringify({
          error: `無法生成情境圖（${detail}）。請換另一張商品照或不同的背景風格再試`,
          detail,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        image: resultImage,
        mimeType: resultMimeType,
        description: resultText,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('bg-generator error:', err);
    return new Response(
      JSON.stringify({ error: '伺服器處理錯誤：' + (err.message || '未知錯誤') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
