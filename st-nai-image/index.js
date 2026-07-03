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

    // ============ 正则表达式 ============
    // 格式1: <image>image###关键词###</image>
    const REGEX_IMAGE_TAG_FULL = /<image>image###([\s\S]+?)###<\/image>/g;
    // 格式2: <image>关键词</image>（排除 image### 格式）
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
        // 已包含 /v1/chat/completions 就不再补
        if (/\/v1\/chat\/completions\/?$/i.test(u)) return u;
        // 已包含 /chat/completions 就不再补
        if (/\/chat\/completions\/?$/i.test(u)) return u;
        // 已包含 /v1 就补 /chat/completions
        if (/\/v1\/?$/i.test(u)) return u.replace(/\/+$/, "") + "/chat/completions";
        // 否则补全 /v1/chat/completions
        return u + "/v1/chat/completions";
    }

    // ============ 从 API 获取模型列表 ============
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
        if (btn) btn.disabled = true;

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
            if (btn) btn.disabled = false;
        }
    }

    // ============ 渲染模型下拉框 ============
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

    // ============ 获取当前模型 ============
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

                        // 解析进度
                        const reasoning = choice.delta?.reasoning_content;
                        if (reasoning) {
                            const m = reasoning.match(/进度\s*(\d+)%/);
                            if (m) showProgress(reasoning, parseInt(m[1], 10));
                        }

                        // 提取图片 URL
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
            if (settings.autoInsert) {
                await insertImageToChat(imageUrl);
            }
        }

        if (btn) btn.disabled = false;
    }

    // ============ 自动检测标签并生成 ============
    async function processImageTags(messageIndex) {
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
    function downloadImage() {
        const img = document.getElementById("nai-generated-image");
        if (!img?.dataset.url) { showError("没有可下载的图片"); return; }
        const a = document.createElement("a");
        a.href = img.dataset.url;
        a.download = `nai_${Date.now()}.png`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showSuccess("开始下载图片");
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

    // ============ UI 渲染 ============
    function renderUI() {
        const html = `
        <div id="nai-simple-extension" class="list-group-item">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🎨 NAI 图片生成</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div style="padding: 12px;">

                        <div style="margin-bottom: 12px;">
                            <label class="checkbox_label">
                                <input id="nai-auto-generate" type="checkbox" ${settings.autoGenerate ? "checked" : ""}>
                                <span>自动检测标签生成图片</span>
                            </label>
                            <small style="display:block;margin-left:20px;opacity:0.6;font-size:11px;">
                                AI 回复后自动扫描 &lt;image&gt; 标签并生成图片
                            </small>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label class="checkbox_label">
                                <input id="nai-auto-clean" type="checkbox" ${settings.autoCleanTags ? "checked" : ""}>
                                <span>生成后清理标签</span>
                            </label>
                            <small style="display:block;margin-left:20px;opacity:0.6;font-size:11px;">
                                关闭则保留原标签，在标签后添加图片
                            </small>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label class="checkbox_label">
                                <input id="nai-auto-insert" type="checkbox" ${settings.autoInsert ? "checked" : ""}>
                                <span>手动生成时自动插入到聊天</span>
                            </label>
                        </div>

                        <hr style="border-color:#333;margin:12px 0;">

                        <div style="margin-bottom: 12px;">
                            <label for="nai-api-url" style="display:block;margin-bottom:4px;">API 地址</label>
                            <input id="nai-api-url" type="text" class="text_pole" value="${settings.apiUrl}"
                                   placeholder="https://api.example.com（自动补全 /v1/chat/completions）">
                            <small style="display:block;margin-top:4px;opacity:0.6;font-size:11px;">只需填基础地址，如 https://api.example.com 或 https://api.example.com/v1</small>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label for="nai-api-key" style="display:block;margin-bottom:4px;">API 密钥</label>
                            <input id="nai-api-key" type="password" class="text_pole" value="${settings.apiKey}"
                                   placeholder="sk-...">
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label for="nai-model" style="display:block;margin-bottom:4px;">NAI 模型</label>
                            <div style="display:flex;gap:6px;">
                                <select id="nai-model" class="text_pole" style="flex:1;">
                                    <option value="">请先获取模型列表</option>
                                </select>
                                <button id="nai-fetch-models-btn" class="menu_button" style="padding:6px 12px;white-space:nowrap;" title="从 API 获取可用模型列表">
                                    <span class="fa-solid fa-rotate"></span>
                                    <span>获取</span>
                                </button>
                            </div>
                            <small id="nai-model-hint" style="display:block;margin-top:4px;opacity:0.6;font-size:11px;">输入密钥后点击「获取」拉取可用模型</small>
                        </div>

                        <hr style="border-color:#333;margin:12px 0;">

                        <div style="margin-bottom: 12px;">
                            <label for="nai-prompt" style="display:block;margin-bottom:4px;">提示词</label>
                            <textarea id="nai-prompt" class="text_pole" rows="4"
                                      placeholder="输入提示词，或粘贴含 &lt;image&gt; 标签的文本测试检测..."></textarea>
                        </div>

                        <div style="display:flex;gap:8px;margin-bottom:12px;">
                            <button id="nai-generate-btn" class="menu_button" style="flex:1;">
                                <span class="fa-solid fa-wand-magic-sparkles"></span>
                                <span>生成图片</span>
                            </button>
                            <button id="nai-test-tags-btn" class="menu_button" style="flex:1;" title="测试标签检测">
                                <span class="fa-solid fa-magnifying-glass"></span>
                                <span>测试标签</span>
                            </button>
                        </div>

                        <div id="nai-progress-container" style="display:none;margin-top:12px;padding:12px;background:#0f1419;border-radius:6px;">
                            <div id="nai-progress-text" style="color:#e94560;font-size:14px;text-align:center;margin-bottom:8px;">准备中...</div>
                            <div style="width:100%;height:6px;background:#333;border-radius:3px;overflow:hidden;">
                                <div id="nai-progress-bar" style="height:100%;background:linear-gradient(90deg,#e94560,#ff6b81);width:0%;transition:width 0.3s;"></div>
                            </div>
                        </div>

                        <div id="nai-image-container" style="display:none;margin-top:12px;">
                            <img id="nai-generated-image" src="" style="width:100%;border-radius:6px;margin-bottom:8px;">
                            <div style="display:flex;gap:8px;">
                                <button id="nai-download-btn" class="menu_button" style="flex:1;">
                                    <span class="fa-solid fa-download"></span>
                                    <span>下载</span>
                                </button>
                                <button id="nai-copy-url-btn" class="menu_button" style="flex:1;">
                                    <span class="fa-solid fa-copy"></span>
                                    <span>复制链接</span>
                                </button>
                                <button id="nai-insert-btn" class="menu_button" style="flex:1;">
                                    <span class="fa-solid fa-paper-plane"></span>
                                    <span>插入聊天</span>
                                </button>
                            </div>
                        </div>

                        <hr style="border-color:#333;margin:12px 0;">

                        <details style="margin-top:8px;">
                            <summary style="cursor:pointer;color:#b0b0b0;font-size:12px;">📖 标签格式说明</summary>
                            <div style="padding:8px 0;font-size:11px;color:#888;line-height:1.6;">
                                <p><b>格式1（推荐）:</b></p>
                                <code style="display:block;padding:8px;background:#0f1419;border-radius:4px;margin:4px 0;">
                                    &lt;image&gt;image###关键词内容###&lt;/image&gt;
                                </code>
                                <p>示例:</p>
                                <code style="display:block;padding:8px;background:#0f1419;border-radius:4px;margin:4px 0;font-size:10px;">
                                    &lt;image&gt;image###sfw,1girl,from side,close up###&lt;/image&gt;
                                </code>
                                <br>
                                <p><b>格式2（简单）:</b></p>
                                <code style="display:block;padding:8px;background:#0f1419;border-radius:4px;margin:4px 0;">
                                    &lt;image&gt;关键词内容&lt;/image&gt;
                                </code>
                                <p>示例:</p>
                                <code style="display:block;padding:8px;background:#0f1419;border-radius:4px;margin:4px 0;font-size:10px;">
                                    &lt;image&gt;sfw,1girl,from side&lt;/image&gt;
                                </code>
                            </div>
                        </details>

                    </div>
                </div>
            </div>
        </div>
        `;

        const container = document.getElementById("extensions_settings");
        if (container) {
            container.insertAdjacentHTML("beforeend", html);
            bindEvents();
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
    }

    // ============ 注册酒馆事件 ============
    function registerEvents() {
        if (!eventSource || !event_types) {
            console.warn("NAI Simple: eventSource 未找到，自动生成功能不可用");
            return;
        }

        // 监听 AI 消息生成完成
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

        // 监听生成结束事件（备用）
        eventSource.on(event_types.GENERATION_ENDED, () => {
            if (!settings.autoGenerate) return;

            const ctx = getContext ? getContext() : null;
            if (!ctx || !ctx.chat) return;

            const lastIndex = ctx.chat.length - 1;
            const message = ctx.chat[lastIndex];
            if (!message || message.is_user) return;

            const text = message.mes || "";
            if (!extractImageTags(text).length) return;

            setTimeout(() => processImageTags(lastIndex), 500);
        });

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
                renderUI();
                renderModelSelect();
                registerEvents();

                console.log("NAI Simple 扩展已加载");
            } catch (e) {
                console.error("NAI Simple 扩展加载失败:", e);
                loadSettings();
                loadCachedModels();
                renderUI();
                renderModelSelect();
            }
        })();
    });
})();
