# 笙闆的 AI 工具箱 — tools.reyway.com

> 笙哥（陳睿笙）的個人 AI 工具站，歡迎親朋好友自由取用。
> 
> **GitHub Repo**: `rey555ddd/tools-reyway`  
> **網址**: https://tools.reyway.com  
> **Cloudflare Pages**: `tools-reyway` 專案（帳號 reysionchen@gmail.com）

---

## 專案架構

**架構類型**：純 HTML + Cloudflare Pages Functions（無建構步驟）

```
tools-reyway/
├── index.html              # 首頁工具列表
├── copywriter.html         # 文案小幫手
├── converter.html          # 海外購物助手（幣值換算 + 拍照辨識）
├── bg-generator.html       # 去背商品情境生成器
└── functions/
    ├── _middleware.ts      # CORS 中介軟體（允許 tools.reyway.com）
    └── api/
        ├── copywriter.ts   # 文案 API（接 Gemini 2.5 Flash）
        ├── converter.ts    # 換算 API（Gemini Vision 辨識價格）
        └── bg-generator.ts # 去背圖生成 API（Gemini 2.5 Flash Image）
```

---

## 工具說明

### 1. 文案小幫手（`/copywriter.html`）
- **功能**：文案生成、語氣改寫、文案精簡、去 AI 味
- **API**：`POST /api/copywriter`
- **Body**：`{ mode, text, tone, systemPrompt }`
- **後端**：`functions/api/copywriter.ts`

### 2. 海外購物助手（`/converter.html`）
- **功能**：拍照辨識海外菜單/價格，自動換算多幣別（支援 16 種貨幣）
- **API**：`POST /api/converter`
- **Body**：`{ image (base64), mimeType, sourceCurrency, targetCurrency, rate }`
- **後端**：`functions/api/converter.ts`

### 3. 去背商品情境生成器（`/bg-generator.html`）
- **功能**：上傳商品照，AI 去背並合成 10 種精品情境背景
- **API**：`POST /api/bg-generator`
- **Body**：`{ image (base64), mimeType, backgroundStyle, customPrompt }`
- **後端**：`functions/api/bg-generator.ts`
- **模型**：`gemini-2.5-flash-image`（GA 版，替代已棄用的 gemini-2.0-flash-exp）

---

## 技術規格

| 項目 | 規格 |
|:---|:---|
| 前端 | 純 HTML / CSS / Vanilla JS（無框架、無建構） |
| 後端 | Cloudflare Pages Functions（TypeScript） |
| AI 模型 | Gemini 2.5 Flash（文字）/ Gemini 2.5 Flash Image（圖片） |
| CORS | 僅允許 `tools.reyway.com` + `tools-reyway.pages.dev` |
| 部署 | Git Push → Cloudflare Pages 自動部署（無需手動觸發） |

---

## 環境變數（Cloudflare Pages）

| 變數名 | 說明 |
|:---|:---|
| `GEMINI_API_KEY` | Google Gemini API Key（所有 API 共用） |

**設定方式**：Cloudflare Dashboard → Pages → tools-reyway → Settings → Environment Variables

---

## 部署流程

```bash
# 只需 git push，Cloudflare Pages 自動偵測並部署
git add .
git commit -m "feat: 你的修改說明"
git push origin main
```

部署完成後約 30 秒內生效，可至 Cloudflare Dashboard 查看部署狀態。

---

## CORS 設定（`functions/_middleware.ts`）

允許的 Origin：
- `https://tools.reyway.com`
- `https://tools-reyway.pages.dev`
- `http://localhost:3000`
- `http://localhost:5500`
- `http://127.0.0.1:5500`
- `https://*.tools-reyway.pages.dev`（Preview deployments）

---

## 本機開發

```bash
# 1. Clone repo
git clone https://github.com/rey555ddd/tools-reyway.git
cd tools-reyway

# 2. 安裝 Wrangler（Cloudflare CLI）
npm install -g wrangler

# 3. 設定本機環境變數
echo "GEMINI_API_KEY=你的金鑰" > .dev.vars

# 4. 本機啟動（含 Functions）
wrangler pages dev . --port 5500

# 5. 直接開 index.html（不含 API，Demo 模式）
open index.html
```

> **Demo 模式**：非 `tools.reyway.com` 環境開啟時，前端自動偵測並使用假資料回傳，方便本機預覽 UI。

---

## 給 AI Agent 的接手指南

> 這個 repo 由笙哥設計，Claude（Cowork）和 Manus AI 都可以接手維護。

### 新增工具頁面的步驟：
1. 在根目錄新增 `新工具.html`（參考 `copywriter.html` 結構）
2. 在 `functions/api/` 新增對應的 `新工具.ts`（參考 `copywriter.ts` 結構）
3. 在 `index.html` 的 `.tool-grid` 加入新的 `.tool-card`
4. Push 到 main 分支即可部署

### 修改 API 時注意：
- API Key 從 `context.env.GEMINI_API_KEY` 取得
- 錯誤一律回傳 JSON：`{ error: '說明' }`
- 成功回傳 JSON：`{ result: '...' }`
- 不要在程式碼中硬寫 API Key

### Gemini 模型選擇：
- 文字任務：`gemini-2.5-flash`
- 圖片生成/分析：`gemini-2.5-flash-image`
- 視覺辨識（無生成）：`gemini-2.5-flash`（傳 inlineData）

---

## Cloudflare 帳戶資訊

- **Account ID**: `30d8a999f7a527bd58029eb7ae545b97`
- **Cloudflare 帳號**: reysionchen@gmail.com
- **GitHub 帳號**: rey555ddd

---

*最後更新：2026-04-13 | 由 Claude（Cowork）整理*
