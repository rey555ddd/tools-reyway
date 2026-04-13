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

    const prompt = `你是一個專業的商品攝影後製專家。請將這張商品照片中的商品完整去背（移除原本的背景），然後將商品放置在以下情境背景中：

${bgDescription}

要求：
1. 商品本身必須完整保留，不可變形或改變顏色
2. 商品要自然地融入新背景中，包含合理的陰影和光影效果
3. 整體要看起來像專業的商品攝影作品
4. 輸出高品質的正方形構圖圖片`;

    // Call Gemini API with image generation capability
    // Updated to gemini-2.5-flash-image (GA model, replaces deprecated gemini-2.0-flash-exp)
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
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
            responseModalities: ['TEXT', 'IMAGE'],
            temperature: 0.4,
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
      return new Response(
        JSON.stringify({
          error: '無法生成情境圖，請嘗試不同的背景風格或重新上傳圖片',
          detail: resultText || '模型未回傳圖片',
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
