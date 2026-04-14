/**
 * 工具頁面共用「留言 / 建議」浮動小工具
 *
 * 使用方式：在 HTML 某處加入這一行：
 *   <script src="/feedback-widget.js" data-tool="工具識別字串"></script>
 *
 * data-tool 可填：copywriter / converter / bg-generator / plant-doctor / travel-planner / 其他
 */
(function () {
  const currentScript = document.currentScript;
  const toolId = (currentScript && currentScript.getAttribute('data-tool')) || 'unknown';

  const TOOL_DISPLAY = {
    copywriter: '文案小幫手',
    converter: '海外購物助手',
    'bg-generator': '去背商品情境生成器',
    'plant-doctor': '植物醫生',
    'travel-planner': '旅遊規劃師',
  };
  const toolName = TOOL_DISPLAY[toolId] || toolId;

  // ============ Styles ============
  const style = document.createElement('style');
  style.textContent = `
    .rw-fb-fab {
      position: fixed; bottom: 20px; right: 20px; z-index: 9998;
      background: #0369a1; color: #fff; border: none;
      padding: 12px 18px; border-radius: 999px;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      font-size: 14px; font-weight: 600; cursor: pointer;
      box-shadow: 0 8px 24px rgba(14,165,233,0.28), 0 2px 6px rgba(0,0,0,0.08);
      transition: all 0.2s ease;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .rw-fb-fab:hover { background: #075985; transform: translateY(-2px); box-shadow: 0 12px 30px rgba(14,165,233,0.35); }
    @media (max-width: 480px) {
      .rw-fb-fab { bottom: 14px; right: 14px; padding: 10px 15px; font-size: 13px; }
      .rw-fb-fab .rw-fb-label { display: none; }
    }

    .rw-fb-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(20,24,40,0.5); backdrop-filter: blur(6px);
      display: none; align-items: center; justify-content: center; padding: 20px;
    }
    .rw-fb-overlay.rw-open { display: flex; }
    .rw-fb-modal {
      background: #fff; border-radius: 18px; max-width: 520px; width: 100%;
      max-height: 90vh; overflow-y: auto; padding: 24px 24px 20px;
      font-family: 'Noto Sans TC', -apple-system, sans-serif; color: #1f2937;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .rw-fb-modal h3 { font-size: 1.15rem; margin: 0 0 4px; font-weight: 700; }
    .rw-fb-sub { color: #6b7280; font-size: 0.82rem; margin-bottom: 16px; line-height: 1.6; }
    .rw-fb-section { margin-bottom: 14px; }
    .rw-fb-label {
      display: block; font-size: 0.83rem; font-weight: 600; margin-bottom: 8px;
      color: #1f2937;
    }
    .rw-fb-types { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    @media(max-width:420px){ .rw-fb-types { grid-template-columns: 1fr; } }
    .rw-fb-type {
      display: flex; align-items: center; gap: 6px; cursor: pointer;
      padding: 9px 10px; background: #f3f4f6; border: 1.5px solid transparent;
      border-radius: 10px; font-size: 0.8rem; color: #374151;
      transition: all 0.15s;
    }
    .rw-fb-type input { margin: 0; cursor: pointer; accent-color: #0369a1; }
    .rw-fb-type:hover { background: #e0f2fe; }
    .rw-fb-type:has(input:checked) {
      background: #e0f2fe; border-color: #0369a1; color: #0369a1; font-weight: 600;
    }
    .rw-fb-modal textarea, .rw-fb-modal input[type=text] {
      width: 100%; padding: 10px 12px; border: 1.5px solid #e5e7eb;
      border-radius: 10px; font-family: inherit; font-size: 0.9rem;
      background: #fff; box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .rw-fb-modal textarea { min-height: 90px; resize: vertical; }
    .rw-fb-modal textarea:focus, .rw-fb-modal input:focus { outline: none; border-color: #0369a1; }
    .rw-fb-actions { display: flex; gap: 10px; margin-top: 8px; }
    .rw-fb-actions button {
      flex: 1; padding: 11px; border-radius: 10px; border: none;
      font-family: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer;
      transition: all 0.15s;
    }
    .rw-fb-cancel { background: #fff; color: #6b7280; border: 1.5px solid #e5e7eb !important; }
    .rw-fb-cancel:hover { border-color: #9ca3af !important; }
    .rw-fb-submit { background: #0369a1; color: #fff; }
    .rw-fb-submit:hover { background: #075985; }
    .rw-fb-submit:disabled { background: #9ca3af; cursor: not-allowed; }
    .rw-fb-success {
      text-align: center; padding: 20px 10px 6px;
    }
    .rw-fb-success .rw-fb-big { font-size: 2.4rem; margin-bottom: 8px; }
    .rw-fb-success h3 { color: #059669; margin-bottom: 6px; }
    .rw-fb-success p { color: #6b7280; font-size: 0.88rem; line-height: 1.6; }
  `;
  document.head.appendChild(style);

  // ============ DOM ============
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'rw-fb-fab';
  fab.innerHTML = '<span>💬</span><span class="rw-fb-label">留言 / 建議</span>';
  document.body.appendChild(fab);

  const overlay = document.createElement('div');
  overlay.className = 'rw-fb-overlay';
  overlay.innerHTML = `
    <div class="rw-fb-modal" role="dialog" aria-label="留言建議">
      <div id="rw-fb-form">
        <h3>💬 留言給版主 · ${toolName}</h3>
        <p class="rw-fb-sub">這個工具哪裡可以更好？想改善或新增什麼功能？寫下來笙哥會看，儘量迭代。</p>

        <div class="rw-fb-section">
          <label class="rw-fb-label">留言類型<span style="color:#9ca3af;font-weight:400;margin-left:4px;">（可複選）</span></label>
          <div class="rw-fb-types">
            <label class="rw-fb-type"><input type="checkbox" name="fbtype" value="哪裡可以更好"><span>哪裡可以更好</span></label>
            <label class="rw-fb-type"><input type="checkbox" name="fbtype" value="要改善哪裡"><span>要改善哪裡</span></label>
            <label class="rw-fb-type"><input type="checkbox" name="fbtype" value="想要新增功能"><span>想要新增功能</span></label>
          </div>
        </div>

        <div class="rw-fb-section">
          <label class="rw-fb-label">具體內容</label>
          <textarea id="rw-fb-text" placeholder="例如：這個工具在手機上字太小 / 想要加上 XX 功能 / 某個地方不夠直覺..."></textarea>
        </div>

        <div class="rw-fb-section">
          <label class="rw-fb-label">你是誰？<span style="color:#9ca3af;font-weight:400;margin-left:4px;">（選填）</span></label>
          <input type="text" id="rw-fb-name" placeholder="例如：王媽媽">
        </div>

        <div class="rw-fb-section">
          <label class="rw-fb-label">聯絡方式<span style="color:#9ca3af;font-weight:400;margin-left:4px;">（選填，方便回覆）</span></label>
          <input type="text" id="rw-fb-contact" placeholder="line@xxxx 或 email">
        </div>

        <div class="rw-fb-actions">
          <button type="button" class="rw-fb-cancel" id="rw-fb-cancel">取消</button>
          <button type="button" class="rw-fb-submit" id="rw-fb-submit">送出</button>
        </div>
      </div>

      <div id="rw-fb-success" class="rw-fb-success" style="display:none;">
        <div class="rw-fb-big">🙏</div>
        <h3>感謝你的建議！</h3>
        <p>笙哥會親自看每一條留言，<br>有合適的點子會優先做進工具裡。</p>
        <div class="rw-fb-actions" style="margin-top:14px;">
          <button type="button" class="rw-fb-submit" id="rw-fb-close">關閉</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ============ Interactions ============
  const $ = (id) => overlay.querySelector('#' + id);
  const formView = $('rw-fb-form');
  const successView = $('rw-fb-success');
  const submitBtn = $('rw-fb-submit');

  fab.addEventListener('click', () => {
    overlay.classList.add('rw-open');
    formView.style.display = 'block';
    successView.style.display = 'none';
  });
  $('rw-fb-cancel').addEventListener('click', () => overlay.classList.remove('rw-open'));
  $('rw-fb-close').addEventListener('click', () => overlay.classList.remove('rw-open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('rw-open'); });

  submitBtn.addEventListener('click', async () => {
    const types = [...overlay.querySelectorAll('input[name="fbtype"]:checked')].map(el => el.value);
    const text = $('rw-fb-text').value.trim();
    const name = $('rw-fb-name').value.trim();
    const contact = $('rw-fb-contact').value.trim();

    if (!types.length && !text) { alert('請至少勾選一個類型或寫下留言內容'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '送出中…';
    try {
      const resp = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact,
          text,
          usage: [toolName],    // 記錄來自哪個工具頁
          type: types,          // 哪裡可以更好 / 要改善哪裡 / 想要新增功能
          ts: new Date().toISOString(),
          ua: navigator.userAgent,
        }),
      });
      if (!resp.ok) throw new Error('送出失敗');
      formView.style.display = 'none';
      successView.style.display = 'block';
    } catch (e) {
      alert('送出失敗，請稍後再試。如急著聯絡笙哥可直接傳 LINE。');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '送出';
    }
  });
})();
