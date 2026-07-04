(() => {
    const extensionName = "nai-simple";

    // 酒馆 API 模块（运行时动态导入）
    let extension_settings = null;
    let getContext = null;
    let saveSettingsDebounced = null;
    let eventSource = null;
    let event_types = null;

    let settings = {
        apiUrl: "",
        apiKey: "",
        model: "nai-diffusion-4-5-full",
        autoInsert: true,
        autoGenerate: true,
        autoCleanTags: true
    };

    // 缓存的模型列表
    let cachedModels = [];
    const NAI_KEYWORDS = ["nai", "diffusion", "anime", "furry", "novelai"];

    // 图库数据（最新20张）
    let gallery = [];
    const MAX_GALLERY = 20;

    // 防重复请求锁
    let processingMessages = new Set();

    // ============ 正则表达式 ============
    const REGEX_IMAGE_TAG_FULL = /<image>image###([\s\S]+?)###<\/image>/g;
    const REGEX_IMAGE_TAG_SIMPLE = /<image>(?!image###)([\s\S]+?)<\/image>/g;

    // ============ 设置存取 ============
    function loadSettings() {
        if (extension_settings) {
            extension_settings[extensionName] = extension_settings[extensionName] || {};
            const saved = extension_settings[extensionName];
            settings = { ...settings, ...saved };
        }
        const local = localStorage.getItem(`${extensionName}_settings`);
        if (local) {
            settings = { ...settings, ...JSON.parse(local) };
        }
    }

    function saveSettings() {
        if (extension_settings) {
            extension_settings[extensionName] = { ...settings };
            if (saveSettingsDebounced) saveSettingsDebounced();
        }
        localStorage.setItem(`${extensionName}_settings`, JSON.stringify(settings));
    }

    // ============ 图库存取 ============
    function loadGallery() {
        const saved = localStorage.getItem(`${extensionName}_gallery`);
        if (saved) {
            try { gallery = JSON.parse(saved); } catch(e) { gallery = []; }
        }
    }

    function saveGallery() {
        localStorage.setItem(`${extensionName}_gallery`, JSON.stringify(gallery));
    }

    function addToGallery(url, prompt) {
        gallery.unshift({
            url: url,
            prompt: prompt,
            timestamp: Date.now()
        });
        if (gallery.length > MAX_GALLERY) {
            gallery = gallery.slice(0, MAX_GALLERY);
        }
        saveGallery();
        renderGallery();
    }

    function removeFromGallery(index) {
        gallery.splice(index, 1);
        saveGallery();
        renderGallery();
    }

    function updateGalleryUrl(index, newUrl) {
        if (gallery[index]) {
            gallery[index].url = newUrl;
            gallery[index].timestamp = Date.now();
            saveGallery();
            renderGallery();
        }
    }

    function updateGalleryPrompt(index, newPrompt) {
        if (gallery[index]) {
            gallery[index].prompt = newPrompt;
            saveGallery();
            renderGallery();
        }
    }

    // ============ 提示 ============
    function showError(msg) { if (typeof toastr !== "undefined") toastr.error(msg, "NAI 生图"); }
    function showSuccess(msg) { if (typeof toastr !== "undefined") toastr.success(msg, "NAI 生图"); }
    function showInfo(msg) { if (typeof toastr !== "undefined") toastr.info(msg, "NAI 生图"); }

    // ============ 进度显示 ============
    function showProgress(text, progress) {
        const c = document.getElementById("nai-progress-container");
        const t = document.getElementById("nai-progress-text");
        const b = document.getElementById("nai-progress-bar");
        if (c && t && b) {
            c.style.display = "block";
            t.textContent = text;
            b.style.width = `${progress}%`;
        }
    }

    function hideProgress() {
        const c = document.getElementById("nai-progress-container");
        if (c) c.style.display = "none";
    }

    // ============ 图片展示 ============
    function displayImage(imageUrl) {
        const c = document.getElementById("nai-image-container");
        const img = document.getElementById("nai-generated-image");
        if (c && img) {
            img.src = imageUrl;
            img.dataset.url = imageUrl;
            c.style.display = "block";
        }
    }

    // ============ 提取图片标签 ============
    function extractImageTags(text) {
        const tags = [];
        let match;

        const regex1 = new RegExp(REGEX_IMAGE_TAG_FULL);
        while ((match = regex1.exec(text)) !== null) {
            tags.push({ full: match[0], prompt: match[1].trim(), format: 1 });
        }

        const regex2 = new RegExp(REGEX_IMAGE_TAG_SIMPLE);
        while ((match = regex2.exec(text)) !== null) {
            tags.push({ full: match[0], prompt: match[1].trim(), format: 2 });
        }

        return tags;
    }

    // ============ 自动补全 API 地址 ============
    function normalizeApiUrl(url) {
        let u = (url || "").trim().replace(/\/+$/, "");
        if (!u) return "";
        if (/\/v1\/chat\/completions\/?$/i.test(u)) return u;
        if (/\/chat\/completions\/?$/i.test(u)) return u;
        if (/\/v1\/?$/i.test(u)) return u.replace(/\/+$/, "") + "/chat/completions";
        return u + "/v1/chat/completions";
    }

    function getModelsUrl() {
        const full = normalizeApiUrl(settings.apiUrl);
        return full.replace(/\/chat\/completions\/?$/i, "/models");
    }

    function isNaiModel(modelId) {
        const lower = modelId.toLowerCase();
        return NAI_KEYWORDS.some(kw => lower.includes(kw));
    }

    async function fetchModels() {
        const url = getModelsUrl();
        const key = settings.apiKey;

        if (!url || !key) {
            showError("请先填写 API 地址和密钥");
            return;
        }

        const btn = document.getElementById("nai-fetch-models-btn");
        if (btn) { btn.disabled = true; btn.classList.add("spinning"); }

        const hint = document.getElementById("nai-model-hint");
        if (hint) hint.textContent = "正在获取模型列表...";

        try {
            const resp = await fetch(url, {
                method: "GET",
                headers: { "Authorization": `Bearer ${key}` }
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

            const data = await resp.json();
            const allModels = (data.data || data.models || data || []).map(m => {
                if (typeof m === "string") return m;
                return m.id || m.name || m.model || "";
            }).filter(Boolean);

            const naiModels = allModels.filter(isNaiModel);
            const finalModels = naiModels.length > 0 ? naiModels : allModels;

            cachedModels = finalModels;
            renderModelSelect();

            if (hint) {
                if (naiModels.length > 0) {
                    hint.textContent = `找到 ${naiModels.length} 个 NAI 模型（共 ${allModels.length} 个）`;
                } else {
                    hint.textContent = `未找到 NAI 关键词模型，已列出全部 ${allModels.length} 个模型`;
                }
            }

            showSuccess(`获取到 ${finalModels.length} 个模型`);
            localStorage.setItem(`${extensionName}_models`, JSON.stringify(finalModels));
        } catch (e) {
            if (hint) hint.textContent = `获取失败: ${e.message}`;
            showError(`获取模型列表失败: ${e.message}`);
            console.error("NAI 获取模型失败:", e);
        } finally {
            if (btn) { btn.disabled = false; btn.classList.remove("spinning"); }
        }
    }

    function renderModelSelect() {
        const select = document.getElementById("nai-model");
        if (!select) return;

        if (cachedModels.length === 0) {
            select.innerHTML = '<option value="">请先获取模型列表</option>';
            return;
        }

        select.innerHTML = cachedModels.map(m => {
            const selected = m === settings.model ? "selected" : "";
            return `<option value="${m}" ${selected}>${m}</option>`;
        }).join("");

        if (!cachedModels.includes(settings.model) && settings.model) {
            select.insertAdjacentHTML("afterbegin", `<option value="${settings.model}" selected>${settings.model}（当前）</option>`);
        }
    }

    function getActiveModel() {
        const select = document.getElementById("nai-model");
        if (select && select.value) return select.value;
        return settings.model || "nai-diffusion-4-5-full";
    }

    // ============ 调用 API 生成图片（流式） ============
    async function generateImage(prompt) {
        if (!settings.apiUrl || !settings.apiKey) {
            showError("请先配置 API 地址和密钥");
            return null;
        }

        if (!prompt || !prompt.trim()) {
            showError("提示词为空");
            return null;
        }

        const model = getActiveModel();
        const fullUrl = normalizeApiUrl(settings.apiUrl);
        showProgress("🎨 正在生成图片...", 0);

        try {
            const response = await fetch(fullUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt.trim() }],
                    stream: true
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let imageUrl = null;
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "[DONE]") continue;
                    if (!trimmed.startsWith("data:")) continue;

                    const jsonStr = trimmed.substring(5).trim();
                    if (!jsonStr) continue;

                    try {
                        const data = JSON.parse(jsonStr);
                        const choice = data.choices?.[0];
                        if (!choice) continue;

                        const reasoning = choice.delta?.reasoning_content;
                        if (reasoning) {
                            const m = reasoning.match(/进度\s*(\d+)%/);
                            if (m) showProgress(reasoning, parseInt(m[1], 10));
                        }

                        const content = choice.delta?.content;
                        if (content) {
                            const urlMatch = content.match(/https?:\/\/[^\s"'\n]+\.(?:png|jpg|jpeg|webp)/i);
                            if (urlMatch) imageUrl = urlMatch[0];
                        }
                    } catch (e) {
                        console.warn("解析响应失败:", e);
                    }
                }
            }

            hideProgress();

            if (imageUrl) {
                showSuccess("图片生成完成！");
            } else {
                showError("未能提取到图片 URL");
            }

            return imageUrl;
        } catch (error) {
            hideProgress();
            showError(`生成失败: ${error.message}`);
            console.error("NAI 生图错误:", error);
            return null;
        }
    }

    // ============ 手动生成 ============
    async function manualGenerate() {
        const prompt = document.getElementById("nai-prompt")?.value || "";
        const btn = document.getElementById("nai-generate-btn");
        if (btn) btn.disabled = true;

        const imageUrl = await generateImage(prompt);

        if (imageUrl) {
            displayImage(imageUrl);
            addToGallery(imageUrl, prompt.trim());
            if (settings.autoInsert) {
                await insertImageToChat(imageUrl);
            }
        }

        if (btn) btn.disabled = false;
    }

    // ============ 自动检测标签并生成（带防重复锁） ============
    async function processImageTags(messageIndex) {
        // 防重复：如果该消息正在处理中，跳过
        const lockKey = String(messageIndex);
        if (processingMessages.has(lockKey)) {
            console.log(`NAI: 消息 ${messageIndex} 正在处理中，跳过重复请求`);
            return;
        }
        processingMessages.add(lockKey);

        try {
            const ctx = getContext ? getContext() : null;
            if (!ctx || !ctx.chat) return;

            const message = ctx.chat[messageIndex];
            if (!message || message.is_user) return;

            const text = message.mes || "";
            const tags = extractImageTags(text);

            if (tags.length === 0) return;

            showInfo(`检测到 ${tags.length} 个图片标签，开始生成...`);

            let updatedText = text;

            for (const tag of tags) {
                console.log(`NAI 自动生成: [格式${tag.format}] ${tag.prompt.substring(0, 50)}...`);

                const imageUrl = await generateImage(tag.prompt);

                if (imageUrl) {
                    addToGallery(imageUrl, tag.prompt);
                    const imgMarkdown = `![image](${imageUrl})`;

                    if (settings.autoCleanTags) {
                        updatedText = updatedText.replace(tag.full, imgMarkdown);
                    } else {
                        updatedText = updatedText.replace(tag.full, `${tag.full}\n${imgMarkdown}`);
                    }
                }
            }

            if (updatedText !== text) {
                message.mes = updatedText;
                if (ctx.saveChat) await ctx.saveChat();
                if (ctx.reloadCurrentChat) await ctx.reloadCurrentChat();
                showSuccess(`已完成 ${tags.length} 张图片生成并插入`);
            }
        } finally {
            // 延迟释放锁，防止短时间内重复触发
            setTimeout(() => processingMessages.delete(lockKey), 2000);
        }
    }

    // ============ 插入图片到聊天 ============
    async function insertImageToChat(imageUrl) {
        try {
            const ctx = getContext ? getContext() : null;
            if (!ctx || !ctx.chat) return;

            const lastMessage = ctx.chat[ctx.chat.length - 1];

            if (lastMessage && lastMessage.is_user === false) {
                if (!lastMessage.extra) lastMessage.extra = {};
                if (!lastMessage.extra.inline_image) {
                    lastMessage.extra.inline_image = imageUrl;
                }
                if (ctx.saveChat) await ctx.saveChat();
                if (ctx.reloadCurrentChat) await ctx.reloadCurrentChat();
                showSuccess("图片已插入到聊天");
            }
        } catch (error) {
            console.error("插入图片失败:", error);
            showError("插入图片到聊天失败");
        }
    }

    // ============ 下载 / 复制 / 插入 ============
    function downloadImageUrl(url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `nai_${Date.now()}.png`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showSuccess("开始下载图片");
    }

    function downloadImage() {
        const img = document.getElementById("nai-generated-image");
        if (!img?.dataset.url) { showError("没有可下载的图片"); return; }
        downloadImageUrl(img.dataset.url);
    }

    function copyImageUrl() {
        const img = document.getElementById("nai-generated-image");
        if (!img?.dataset.url) { showError("没有可复制的链接"); return; }
        navigator.clipboard.writeText(img.dataset.url)
            .then(() => showSuccess("图片链接已复制"))
            .catch(() => showError("复制链接失败"));
    }

    async function manualInsertImage() {
        const img = document.getElementById("nai-generated-image");
        if (!img?.dataset.url) { showError("没有可插入的图片"); return; }
        await insertImageToChat(img.dataset.url);
    }

    // ============ 测试标签检测 ============
    function testTagExtraction() {
        const testText = document.getElementById("nai-prompt")?.value || "";
        const tags = extractImageTags(testText);

        if (tags.length === 0) {
            showInfo("未检测到图片标签");
            return;
        }

        let msg = `检测到 ${tags.length} 个标签:\n`;
        tags.forEach((t, i) => {
            msg += `\n[${i + 1}] 格式${t.format}\n提示词: ${t.prompt.substring(0, 80)}...\n`;
        });

        alert(msg);
    }

    // ============ 图库渲染 ============
    function renderGallery() {
        const container = document.getElementById("nai-gallery-list");
        if (!container) return;

        const countEl = document.getElementById("nai-gallery-count");
        if (countEl) countEl.textContent = gallery.length;

        if (gallery.length === 0) {
            container.innerHTML = '<div class="nai-gallery-empty">暂无历史图片</div>';
            return;
        }

        container.innerHTML = gallery.map((item, index) => {
            const time = new Date(item.timestamp).toLocaleString('zh-CN', {
                month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
            const promptShort = (item.prompt || '').substring(0, 60) + (item.prompt.length > 60 ? '...' : '');

            return `
            <div class="nai-gallery-item" data-index="${index}">
                <div class="nai-gallery-thumb" data-index="${index}">
                    <img src="${item.url}" loading="lazy" alt="生成图片">
                </div>
                <div class="nai-gallery-info">
                    <div class="nai-gallery-prompt" title="${(item.prompt || '').replace(/"/g, '&quot;')}">${promptShort}</div>
                    <div class="nai-gallery-time">${time}</div>
                </div>
                <div class="nai-gallery-actions">
                    <button class="nai-btn-icon nai-gallery-edit" data-index="${index}" title="编辑提示词并重新生成">
                        <span class="fa-solid fa-pen"></span>
                    </button>
                    <button class="nai-btn-icon nai-gallery-download" data-index="${index}" title="下载图片">
                        <span class="fa-solid fa-download"></span>
                    </button>
                    <button class="nai-btn-icon nai-gallery-delete" data-index="${index}" title="删除">
                        <span class="fa-solid fa-trash"></span>
                    </button>
                </div>
            </div>
            `;
        }).join("");

        // 绑定图库事件
        container.querySelectorAll(".nai-gallery-edit").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openGalleryEditor(parseInt(btn.dataset.index));
            });
        });

        container.querySelectorAll(".nai-gallery-download").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (gallery[idx]) downloadImageUrl(gallery[idx].url);
            });
        });

        container.querySelectorAll(".nai-gallery-delete").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (confirm("确定删除这张图片记录吗？")) {
                    removeFromGallery(idx);
                    showSuccess("已从图库删除");
                }
            });
        });

        container.querySelectorAll(".nai-gallery-thumb").forEach(thumb => {
            thumb.addEventListener("click", () => {
                const idx = parseInt(thumb.dataset.index);
                if (gallery[idx]) {
                    displayImage(gallery[idx].url);
                }
            });
        });
    }

    // ============ 图库编辑器 ============
    function openGalleryEditor(index) {
        if (!gallery[index]) return;

        const item = gallery[index];
        const overlay = document.getElementById("nai-gallery-editor-overlay");
        const img = document.getElementById("nai-editor-image");
        const textarea = document.getElementById("nai-editor-prompt");

        if (overlay && img && textarea) {
            img.src = item.url;
            textarea.value = item.prompt || "";
            overlay.dataset.index = index;
            overlay.style.display = "flex";
        }
    }

    function closeGalleryEditor() {
        const overlay = document.getElementById("nai-gallery-editor-overlay");
        if (overlay) overlay.style.display = "none";
    }

    async function regenerateFromEditor() {
        const overlay = document.getElementById("nai-gallery-editor-overlay");
        if (!overlay) return;

        const index = parseInt(overlay.dataset.index);
        const textarea = document.getElementById("nai-editor-prompt");
        const newPrompt = textarea?.value?.trim();

        if (!newPrompt) {
            showError("提示词不能为空");
            return;
        }

        const oldUrl = gallery[index]?.url;
        const btn = document.getElementById("nai-editor-regenerate");
        if (btn) btn.disabled = true;

        const newUrl = await generateImage(newPrompt);

        if (newUrl) {
            // 更新图库
            updateGalleryUrl(index, newUrl);
            updateGalleryPrompt(index, newPrompt);

            // 如果旧图片在聊天中存在，替换它
            if (oldUrl) {
                await replaceImageInChat(oldUrl, newUrl);
            }

            // 更新编辑器预览
            const img = document.getElementById("nai-editor-image");
            if (img) img.src = newUrl;

            showSuccess("图片已重新生成并替换");
        }

        if (btn) btn.disabled = false;
    }

    // ============ 在聊天中替换图片 URL ============
    async function replaceImageInChat(oldUrl, newUrl) {
        try {
            const ctx = getContext ? getContext() : null;
            if (!ctx || !ctx.chat) return;

            let replaced = false;

            for (const message of ctx.chat) {
                if (!message || !message.mes) continue;

                if (message.mes.includes(oldUrl)) {
                    message.mes = message.mes.split(oldUrl).join(newUrl);
                    replaced = true;
                }

                if (message.extra?.inline_image === oldUrl) {
                    message.extra.inline_image = newUrl;
                    replaced = true;
                }
            }

            if (replaced) {
                if (ctx.saveChat) await ctx.saveChat();
                if (ctx.reloadCurrentChat) await ctx.reloadCurrentChat();
                console.log("NAI: 已在聊天中替换图片 URL");
            }
        } catch (error) {
            console.error("替换聊天图片失败:", error);
        }
    }

    // ============ UI 渲染 ============
    function renderUI() {
        const html = `
        <div id="nai-simple-extension" class="list-group-item">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b><span class="nai-header-icon fa-solid fa-palette"></span>NAI 图片生成</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="nai-body">

                        <div class="nai-section-title"><span class="nai-section-dot"></span>自动化设置</div>

                        <div class="nai-toggle-row">
                            <div class="nai-toggle-info">
                                <span class="nai-toggle-label">自动检测标签生成图片</span>
                                <span class="nai-toggle-desc">AI 回复后自动扫描 &lt;image&gt; 标签并生成图片</span>
                            </div>
                            <label class="nai-switch">
                                <input id="nai-auto-generate" type="checkbox" ${settings.autoGenerate ? "checked" : ""}>
                                <span class="nai-switch-slider"></span>
                            </label>
                        </div>

                        <div class="nai-toggle-row">
                            <div class="nai-toggle-info">
                                <span class="nai-toggle-label">生成后清理标签</span>
                                <span class="nai-toggle-desc">关闭则保留原标签，在标签后添加图片</span>
                            </div>
                            <label class="nai-switch">
                                <input id="nai-auto-clean" type="checkbox" ${settings.autoCleanTags ? "checked" : ""}>
                                <span class="nai-switch-slider"></span>
                            </label>
                        </div>

                        <div class="nai-toggle-row">
                            <div class="nai-toggle-info">
                                <span class="nai-toggle-label">手动生成时自动插入到聊天</span>
                                <span class="nai-toggle-desc">生成完成后自动将图片插入到最新消息</span>
                            </div>
                            <label class="nai-switch">
                                <input id="nai-auto-insert" type="checkbox" ${settings.autoInsert ? "checked" : ""}>
                                <span class="nai-switch-slider"></span>
                            </label>
                        </div>

                        <hr class="nai-divider">

                        <div class="nai-section-title"><span class="nai-section-dot"></span>接口配置</div>

                        <div class="nai-field">
                            <label for="nai-api-url" class="nai-label">API 地址</label>
                            <input id="nai-api-url" type="text" class="text_pole" value="${settings.apiUrl}"
                                   placeholder="https://api.example.com">
                            <small class="nai-hint">只需填基础地址，自动补全 /v1/chat/completions</small>
                        </div>

                        <div class="nai-field">
                            <label for="nai-api-key" class="nai-label">API 密钥</label>
                            <input id="nai-api-key" type="password" class="text_pole" value="${settings.apiKey}"
                                   placeholder="sk-...">
                        </div>

                        <div class="nai-field">
                            <label for="nai-model" class="nai-label">NAI 模型</label>
                            <div class="nai-model-row">
                                <select id="nai-model" class="text_pole">
                                    <option value="">请先获取模型列表</option>
                                </select>
                                <button id="nai-fetch-models-btn" class="nai-btn-icon" title="从 API 获取可用模型列表">
                                    <span class="fa-solid fa-rotate"></span>
                                    <span>获取</span>
                                </button>
                            </div>
                            <small id="nai-model-hint" class="nai-hint">输入密钥后点击「获取」拉取可用模型</small>
                        </div>

                        <hr class="nai-divider">

                        <div class="nai-section-title"><span class="nai-section-dot"></span>手动生成</div>

                        <div class="nai-field">
                            <label for="nai-prompt" class="nai-label">提示词</label>
                            <textarea id="nai-prompt" class="text_pole" rows="4"
                                      placeholder="输入提示词，或粘贴含 &lt;image&gt; 标签的文本测试检测..."></textarea>
                        </div>

                        <div class="nai-btn-group">
                            <button id="nai-generate-btn" class="nai-btn nai-btn-primary">
                                <span class="fa-solid fa-wand-magic-sparkles"></span>
                                <span>生成图片</span>
                            </button>
                            <button id="nai-test-tags-btn" class="nai-btn nai-btn-secondary" title="测试标签检测">
                                <span class="fa-solid fa-magnifying-glass"></span>
                                <span>测试标签</span>
                            </button>
                        </div>

                        <div id="nai-progress-container" style="display:none;">
                            <div id="nai-progress-text">准备中...</div>
                            <div class="nai-progress-track">
                                <div id="nai-progress-bar"></div>
                            </div>
                        </div>

                        <div id="nai-image-container" style="display:none;">
                            <img id="nai-generated-image" src="">
                            <div class="nai-image-actions">
                                <button id="nai-download-btn" class="nai-btn-icon">
                                    <span class="fa-solid fa-download"></span>
                                    <span>下载</span>
                                </button>
                                <button id="nai-copy-url-btn" class="nai-btn-icon">
                                    <span class="fa-solid fa-copy"></span>
                                    <span>复制链接</span>
                                </button>
                                <button id="nai-insert-btn" class="nai-btn-icon">
                                    <span class="fa-solid fa-paper-plane"></span>
                                    <span>插入聊天</span>
                                </button>
                            </div>
                        </div>

                        <hr class="nai-divider">

                        <div class="nai-section-title">
                            <span class="nai-section-dot"></span>
                            <span>图库</span>
                            <span class="nai-gallery-badge" id="nai-gallery-count">0</span>
                        </div>

                        <div id="nai-gallery-list" class="nai-gallery-list">
                            <div class="nai-gallery-empty">暂无历史图片</div>
                        </div>

                        <hr class="nai-divider">

                        <details>
                            <summary><span class="fa-solid fa-chevron-right"></span> 标签格式说明</summary>
                            <div class="nai-tag-guide">
                                <p>格式1（推荐）</p>
                                <code>&lt;image&gt;image###关键词内容###&lt;/image&gt;</code>
                                <p>示例</p>
                                <code class="nai-code-sm">&lt;image&gt;image###sfw,1girl,from side,close up###&lt;/image&gt;</code>
                                <p>格式2（简单）</p>
                                <code>&lt;image&gt;关键词内容&lt;/image&gt;</code>
                                <p>示例</p>
                                <code class="nai-code-sm">&lt;image&gt;sfw,1girl,from side&lt;/image&gt;</code>
                            </div>
                        </details>

                    </div>
                </div>
            </div>
        </div>

        <!-- 图库编辑器弹窗 -->
        <div id="nai-gallery-editor-overlay" class="nai-editor-overlay" style="display:none;">
            <div class="nai-editor-dialog">
                <div class="nai-editor-header">
                    <span class="nai-editor-title">编辑并重新生成</span>
                    <button id="nai-editor-close" class="nai-btn-icon" title="关闭">
                        <span class="fa-solid fa-xmark"></span>
                    </button>
                </div>
                <div class="nai-editor-body">
                    <img id="nai-editor-image" class="nai-editor-image" src="">
                    <div class="nai-editor-field">
                        <label class="nai-label">提示词</label>
                        <textarea id="nai-editor-prompt" class="text_pole" rows="5" placeholder="修改提示词后重新生成..."></textarea>
                    </div>
                </div>
                <div class="nai-editor-footer">
                    <button id="nai-editor-regenerate" class="nai-btn nai-btn-primary">
                        <span class="fa-solid fa-arrows-rotate"></span>
                        <span>重新生成</span>
                    </button>
                    <button id="nai-editor-download" class="nai-btn nai-btn-secondary">
                        <span class="fa-solid fa-download"></span>
                        <span>下载原图</span>
                    </button>
                </div>
            </div>
        </div>
        `;

        const container = document.getElementById("extensions_settings");
        if (container) {
            container.insertAdjacentHTML("beforeend", html);
            bindEvents();
            renderGallery();
        }
    }

    // ============ 事件绑定 ============
    function bindEvents() {
        document.getElementById("nai-api-url")?.addEventListener("input", e => {
            settings.apiUrl = e.target.value.trim();
            saveSettings();
        });

        document.getElementById("nai-api-key")?.addEventListener("input", e => {
            settings.apiKey = e.target.value.trim();
            saveSettings();
        });

        document.getElementById("nai-auto-insert")?.addEventListener("change", e => {
            settings.autoInsert = e.target.checked;
            saveSettings();
        });

        document.getElementById("nai-auto-generate")?.addEventListener("change", e => {
            settings.autoGenerate = e.target.checked;
            saveSettings();
        });

        document.getElementById("nai-auto-clean")?.addEventListener("change", e => {
            settings.autoCleanTags = e.target.checked;
            saveSettings();
        });

        document.getElementById("nai-model")?.addEventListener("change", e => {
            settings.model = e.target.value;
            saveSettings();
        });

        document.getElementById("nai-fetch-models-btn")?.addEventListener("click", fetchModels);

        document.getElementById("nai-generate-btn")?.addEventListener("click", manualGenerate);
        document.getElementById("nai-test-tags-btn")?.addEventListener("click", testTagExtraction);
        document.getElementById("nai-download-btn")?.addEventListener("click", downloadImage);
        document.getElementById("nai-copy-url-btn")?.addEventListener("click", copyImageUrl);
        document.getElementById("nai-insert-btn")?.addEventListener("click", manualInsertImage);

        // 图库编辑器事件
        document.getElementById("nai-editor-close")?.addEventListener("click", closeGalleryEditor);
        document.getElementById("nai-editor-regenerate")?.addEventListener("click", regenerateFromEditor);
        document.getElementById("nai-editor-download")?.addEventListener("click", () => {
            const overlay = document.getElementById("nai-gallery-editor-overlay");
            const idx = parseInt(overlay?.dataset.index);
            if (gallery[idx]) downloadImageUrl(gallery[idx].url);
        });

        // 点击遮罩关闭
        document.getElementById("nai-gallery-editor-overlay")?.addEventListener("click", (e) => {
            if (e.target.id === "nai-gallery-editor-overlay") closeGalleryEditor();
        });
    }

    // ============ 注册酒馆事件（只用 MESSAGE_RECEIVED，去掉 GENERATION_ENDED 避免重复） ============
    function registerEvents() {
        if (!eventSource || !event_types) {
            console.warn("NAI Simple: eventSource 未找到，自动生成功能不可用");
            return;
        }

        // 只监听 MESSAGE_RECEIVED，不再监听 GENERATION_ENDED
        if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
                if (!settings.autoGenerate) return;

                const ctx = getContext ? getContext() : null;
                if (!ctx || !ctx.chat) return;

                const idx = typeof messageIndex === "number" ? messageIndex : ctx.chat.length - 1;
                const message = ctx.chat[idx];
                if (!message || message.is_user) return;

                const text = message.mes || "";
                if (!extractImageTags(text).length) return;

                setTimeout(() => processImageTags(idx), 500);
            });
        }

        console.log("NAI Simple: 事件监听已注册");
    }

    // ============ 加载缓存模型 ============
    function loadCachedModels() {
        const savedModels = localStorage.getItem(`${extensionName}_models`);
        if (savedModels) {
            try { cachedModels = JSON.parse(savedModels); } catch(e) {}
        }
    }

    // ============ 初始化 ============
    jQuery(function () {
        (async () => {
            try {
                const extensionsModule = await import("../../../extensions.js");
                const scriptModule = await import("../../../../script.js");

                extension_settings = extensionsModule.extension_settings;
                getContext = extensionsModule.getContext;
                saveSettingsDebounced = scriptModule.saveSettingsDebounced;
                eventSource = scriptModule.eventSource;
                event_types = scriptModule.event_types;

                loadSettings();
                loadCachedModels();
                loadGallery();
                renderUI();
                renderModelSelect();
                registerEvents();

                console.log("NAI Simple 扩展已加载");
            } catch (e) {
                console.error("NAI Simple 扩展加载失败:", e);
                loadSettings();
                loadCachedModels();
                loadGallery();
                renderUI();
                renderModelSelect();
            }
        })();
    });
})();
