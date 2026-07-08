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
        autoCleanTags: true,
        customKeywords: ["image"],
        guideEnabled: false,
        guidePrompt: "",
        customTemplates: []
    };

    // 预设提示词模板
    const PRESET_TEMPLATES = [
        {
            name: "✨ 高质量基础",
            prompt: "masterpiece, best quality, extremely detailed, ultra-detailed",
            negative: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, bad feet",
            desc: "必加的质量提升 tag"
        },
        {
            name: "🌸 日系二次元",
            prompt: "masterpiece, best quality, thin bang, cute, anime coloring, 1girl",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality, blurry",
            desc: "日系画风 + 薄刘海 + 可爱"
        },
        {
            name: "🎀 JK 制服",
            prompt: "masterpiece, best quality, 1girl, serafuku, white shirt, pleated skirt, school uniform, thin bang",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "水手服制服少女"
        },
        {
            name: "🏫 校园日常",
            prompt: "masterpiece, best quality, 1girl, school uniform, classroom, window, sunlight, cherry blossoms, standing, cowboy shot",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "教室 + 樱花 + 阳光"
        },
        {
            name: "🌙 夜景氛围",
            prompt: "masterpiece, best quality, 1girl, night, city lights, cinematic lighting, depth of field, backlighting",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "夜景 + 电影感光影"
        },
        {
            name: "⚔️ 战斗风格",
            prompt: "masterpiece, best quality, 1girl, fighting stance, weapon, dynamic pose, motion lines, action",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "动态战斗姿势"
        },
        {
            name: "🛏️ 室内日常",
            prompt: "masterpiece, best quality, 1girl, bedroom, hoodie, sitting, warm lighting, cozy",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "卧室 + 卫衣 + 温馨"
        },
        {
            name: "🎨 画师风格串",
            prompt: "masterpiece, best quality, artist:ciloranko, artist:ask, artist:wlop, 1girl",
            negative: "lowres, bad anatomy, bad hands, worst quality, low quality",
            desc: "三位热门画师风格"
        }
    ];

    // 默认引导提示词（imgthink 专业版）
    const DEFAULT_GUIDE_PROMPT = `# 图片生成规则（imgthink 系统）

当剧情需要展示图片时（角色登场、场景转换、情感高潮、亲密互动等精彩时刻），请使用以下格式在回复中插入图片标签。每条回复生成 3~4 张图片。

## 标签格式

\`\`\`
<image>
<imgthink>
什么类型: （特写/拥抱/牵手/性爱等）
主体: （人物名称，英文tag用翻译而非拼音）
精彩点: （高潮瞬间/拥抱/裸体/美好瞬间）
什么角度: （from above/from below/from side/from behind/from front）
角色类型: （1.特定角色 2.通用模板 3.原创 — 低于70%把握选原创）
上半身部位状态: （赤裸？乳房/乳头/精液/伤痕/被抓握等英文tag）
下半身部位状态: （赤裸？小穴/肉棒/精液/伤痕/被插入/性交等英文tag）
角色信息: （$角色名-角度-sfw/nsfw-upperBody-sfw/nsfw-lowerBody$ 或 原创tag）
衣物信息: （$服装名-upperBody-lowerBody$ 或 原创服装tag，全裸则无）
追加状态: （衣服破损/脏污/湿身等，英文tag，逗号分隔）
环境元素: （地点/物体/光影/时间）
男性部位: （全身/上半身/下半身/阴茎/手臂等，男性出框写 male out of frame）
交互动作: （face to face/back to back/missionary/sex 等关键词）
</imgthink>
image###nsfw/sfw,1girl/2girls/1boy,角度,人物数量,角色模板,服装模板,场景,表情,动作,环境###
</image>
\`\`\`

## 使用规范

1. **全部使用英文 danbooru 标签**，逗号分隔，禁止使用短句描述
2. **使用 {{tag}} 加重重要tag权重**，例如 {{1girl}}、{{school uniform}}
3. 角色模板和服装模板用 $ 包裹，例如 $xiao hong-from front-nsfw-upperBody$
4. 穿着内衣内裤算 sfw，赤裸才算 nsfw
5. 性爱/拥抱/面对面/牵手场景外，优先女性特写，男性出框（male out of frame）
6. 男性非同人角色名字替换为 faceless male
7. 每条回复 3~4 张图片，自然穿插在正文相关位置
8. imgthink 仅用于思考，实际生成以 image### 之间的 tag 为准

## 示例

角色推门走进教室，午后的阳光透过窗户洒在她的发梢。
<image>
<imgthink>
什么类型: 女性特写
主体: 小红
精彩点: 初次登场
什么角度: from side
角色类型: 特定角色
上半身部位状态: 非赤裸
下半身部位状态: 非赤裸
角色信息: $xiao hong-from side-sfw-upperBody-sfw-lowerBody$
衣物信息: $school uniform-upperBody-lowerBody$
追加状态: 无
环境元素: classroom, window, afternoon sunlight
男性部位: 无
交互动作: 无
</imgthink>
image###sfw,{{1girl}},from side,$xiao hong-from side-sfw-upperBody-sfw-lowerBody$,$school uniform-upperBody-lowerBody$,classroom,afternoon sunlight,window,soft smile,standing,cowboy shot###
</image>

## 角色与服装模板（如果存在）

### 特定角色列表
{{角色启用列表}}

### 通用角色模板
{{通用角色启用列表}}

### 通用服装模板
{{通用服装启用列表}}

**重要**：如果角色或服装不在列表中或把握不足70%，直接使用原创tag描述，不要强行调用模板！`;

    // 缓存的模型列表
    let cachedModels = [];
    const NAI_KEYWORDS = ["nai", "diffusion", "anime", "furry", "novelai"];

    // 图库数据（最新20张）
    let gallery = [];
    const MAX_GALLERY = 20;
    let galleryCurrentIndex = 0;

    const runtimeState = window.__naiSimpleRuntimeState || (window.__naiSimpleRuntimeState = {
        processingMessages: new Set(),
        processedTagKeys: new Set(),
        pendingTagKeys: new Set(),
        eventsRegistered: false
    });
    let processingMessages = runtimeState.processingMessages;
    let processedTagKeys = runtimeState.processedTagKeys;
    let pendingTagKeys = runtimeState.pendingTagKeys;

    // ============ 工具函数 ============
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? "";
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/`/g, '&#96;');
    }

    // ============ 设置存取 ============
    function loadSettings() {
        if (extension_settings) {
            extension_settings[extensionName] = extension_settings[extensionName] || {};
            const saved = extension_settings[extensionName];
            settings = { ...settings, ...saved };
        }
        const local = localStorage.getItem(`${extensionName}_settings`);
        if (local) {
            const parsed = JSON.parse(local);
            settings = { ...settings, ...parsed };
        }
        // 确保默认关键词存在
        if (!settings.customKeywords || !Array.isArray(settings.customKeywords) || settings.customKeywords.length === 0) {
            settings.customKeywords = ["image"];
        }
        // 初始化引导提示词
        if (!settings.guidePrompt) {
            settings.guidePrompt = DEFAULT_GUIDE_PROMPT;
        }
    }

    // ============ 引导提示词注入 ============
    function applyGuidePrompt() {
        // 使用酒馆的 setExtensionPrompt API 注入系统提示词
        if (typeof SillyTavern !== "undefined" && typeof SillyTavern.getContext === "function") {
            const ctx = SillyTavern.getContext();
            if (ctx && typeof ctx.setExtensionPrompt === "function") {
                if (settings.guideEnabled && settings.guidePrompt) {
                    // 注入到系统提示词，depth 4 表示在比较浅的位置注入
                    ctx.setExtensionPrompt("nai-simple-guide", settings.guidePrompt, 1, 4);
                    console.log("NAI Simple: 引导提示词已注入");
                } else {
                    // 移除注入
                    ctx.setExtensionPrompt("nai-simple-guide", "", 0, 4);
                    console.log("NAI Simple: 引导提示词已移除");
                }
            }
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
        gallery.unshift({ url, prompt, timestamp: Date.now() });
        if (gallery.length > MAX_GALLERY) gallery = gallery.slice(0, MAX_GALLERY);
        saveGallery();
        renderGalleryCarousel();
        updateGalleryBadge();
    }

    function removeFromGallery(index) {
        gallery.splice(index, 1);
        if (galleryCurrentIndex >= gallery.length) galleryCurrentIndex = Math.max(0, gallery.length - 1);
        saveGallery();
        renderGalleryCarousel();
        updateGalleryBadge();
    }

    function updateGalleryUrl(index, newUrl) {
        if (gallery[index]) {
            gallery[index].url = newUrl;
            gallery[index].timestamp = Date.now();
            saveGallery();
            renderGalleryCarousel();
        }
    }

    function updateGalleryPrompt(index, newPrompt) {
        if (gallery[index]) {
            gallery[index].prompt = newPrompt;
            saveGallery();
            renderGalleryCarousel();
        }
    }

    function updateGalleryBadge() {
        const badge = document.getElementById("nai-gallery-count");
        if (badge) badge.textContent = gallery.length;
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

    function extractImageUrlFromText(text) {
        const match = String(text || "").match(/https?:\/\/[^\s"'`<>]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"'`<>]*)?/i);
        return match ? match[0] : null;
    }

    function parseGenerationChunk(raw) {
        const text = String(raw || "").trim();
        if (!text || text === "[DONE]") return null;

        const jsonText = text.startsWith("data:") ? text.substring(5).trim() : text;
        if (!jsonText || jsonText === "[DONE]") return null;

        try {
            const data = JSON.parse(jsonText);
            const choice = data.choices?.[0];
            const reasoning = choice?.delta?.reasoning_content || choice?.message?.reasoning_content;
            const content = choice?.delta?.content || choice?.message?.content || choice?.text || "";
            return { reasoning, imageUrl: extractImageUrlFromText(content) || extractImageUrlFromText(jsonText) };
        } catch (e) {
            return { reasoning: null, imageUrl: extractImageUrlFromText(jsonText) };
        }
    }

    function getProcessedTagKey(messageIndex, tag) {
        return `${messageIndex}:${tag.index}:${tag.full.length}:${tag.prompt.slice(0, 120)}`;
    }

    // ============ 提取图片标签（支持自定义关键词 + imgthink格式） ============
    function extractImageTags(text) {
        const tags = [];
        const keywords = settings.customKeywords || ["image"];

        const seen = new Set();

        for (const kw of keywords) {
            const escapedKw = escapeRegex(kw);
            const blockRegex = new RegExp(`<${escapedKw}>([\\s\\S]*?)<\\/${escapedKw}>`, 'g');
            let match;

            while ((match = blockRegex.exec(text)) !== null) {
                const full = match[0];
                const inner = match[1];
                const key = `${match.index}:${full.length}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const markerRegex = new RegExp(`${escapedKw}###([\\s\\S]*?)###`);
                const markerMatch = inner.match(markerRegex);

                if (markerMatch) {
                    tags.push({ full, prompt: markerMatch[1].trim(), format: 1, keyword: kw, index: match.index });
                    continue;
                }

                const prompt = inner.trim();
                if (prompt) {
                    tags.push({ full, prompt, format: 2, keyword: kw, index: match.index });
                }
            }
        }

        return tags.sort((a, b) => a.index - b.index);
    }

    // ============ 自定义关键词管理 ============
    function addCustomKeyword() {
        const input = document.getElementById("nai-keyword-input");
        const kw = input?.value?.trim();
        if (!kw) return;

        if (settings.customKeywords.includes(kw)) {
            showError("该关键词已存在");
            return;
        }

        settings.customKeywords.push(kw);
        saveSettings();
        renderKeywordList();
        input.value = "";
        showSuccess(`已添加关键词: <${kw}>`);
    }

    function removeCustomKeyword(kw) {
        if (kw === "image") {
            showError("默认关键词 image 不可删除");
            return;
        }
        settings.customKeywords = settings.customKeywords.filter(k => k !== kw);
        saveSettings();
        renderKeywordList();
        showSuccess(`已移除关键词: <${kw}>`);
    }

    function renderKeywordList() {
        const list = document.getElementById("nai-keyword-list");
        if (!list) return;

        list.innerHTML = settings.customKeywords.map(kw => {
            const isDefault = kw === "image";
            const safeKw = escapeHtml(kw);
            const safeAttrKw = escapeAttr(kw);
            return `
            <div class="nai-keyword-item">
                <code>&lt;${safeKw}&gt;...&lt;/${safeKw}&gt;</code>
                ${isDefault
                    ? '<span class="nai-keyword-default">默认</span>'
                    : `<button class="nai-btn-icon nai-keyword-remove" data-kw="${safeAttrKw}" title="删除"><span class="fa-solid fa-xmark"></span></button>`
                }
            </div>`;
        }).join("");

        list.querySelectorAll(".nai-keyword-remove").forEach(btn => {
            btn.addEventListener("click", () => removeCustomKeyword(btn.dataset.kw));
        });
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
        return normalizeApiUrl(settings.apiUrl).replace(/\/chat\/completions\/?$/i, "/models");
    }

    function isNaiModel(modelId) {
        const lower = modelId.toLowerCase();
        return NAI_KEYWORDS.some(kw => lower.includes(kw));
    }

    async function fetchModels() {
        const url = getModelsUrl();
        const key = settings.apiKey;
        if (!url || !key) { showError("请先填写 API 地址和密钥"); return; }

        const btn = document.getElementById("nai-fetch-models-btn");
        if (btn) { btn.disabled = true; btn.classList.add("spinning"); }

        const hint = document.getElementById("nai-model-hint");
        if (hint) hint.textContent = "正在获取模型列表...";

        try {
            const resp = await fetch(url, { method: "GET", headers: { "Authorization": `Bearer ${key}` } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

            const data = await resp.json();
            const allModels = (data.data || data.models || data || []).map(m => {
                if (typeof m === "string") return m;
                return m.id || m.name || m.model || "";
            }).filter(Boolean);

            const naiModels = allModels.filter(isNaiModel);
            cachedModels = naiModels.length > 0 ? naiModels : allModels;
            renderModelSelect();

            if (hint) {
                hint.textContent = naiModels.length > 0
                    ? `找到 ${naiModels.length} 个 NAI 模型（共 ${allModels.length} 个）`
                    : `未找到 NAI 关键词模型，已列出全部 ${allModels.length} 个模型`;
            }
            showSuccess(`获取到 ${cachedModels.length} 个模型`);
            localStorage.setItem(`${extensionName}_models`, JSON.stringify(cachedModels));
        } catch (e) {
            if (hint) hint.textContent = `获取失败: ${e.message}`;
            showError(`获取模型列表失败: ${e.message}`);
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
        select.innerHTML = cachedModels.map(m => `<option value="${escapeAttr(m)}" ${m === settings.model ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");
        if (!cachedModels.includes(settings.model) && settings.model) {
            select.insertAdjacentHTML("afterbegin", `<option value="${escapeAttr(settings.model)}" selected>${escapeHtml(settings.model)}（当前）</option>`);
        }
    }

    function getActiveModel() {
        const select = document.getElementById("nai-model");
        return (select && select.value) ? select.value : (settings.model || "nai-diffusion-4-5-full");
    }

    // ============ 调用 API 生成图片（流式） ============
    async function generateImage(prompt) {
        if (!settings.apiUrl || !settings.apiKey) { showError("请先配置 API 地址和密钥"); return null; }
        if (!prompt || !prompt.trim()) { showError("提示词为空"); return null; }

        const model = getActiveModel();
        const fullUrl = normalizeApiUrl(settings.apiUrl);
        showProgress("🎨 正在生成图片...", 0);

        try {
            const response = await fetch(fullUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}` },
                body: JSON.stringify({ model, messages: [{ role: "user", content: prompt.trim() }], stream: true })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let imageUrl = null;
            let buffer = "";

            const handleLine = (line) => {
                const parsed = parseGenerationChunk(line);
                if (!parsed) return;

                if (parsed.reasoning) {
                    const m = parsed.reasoning.match(/进度\s*(\d+)%/);
                    if (m) showProgress(parsed.reasoning, parseInt(m[1], 10));
                }

                if (parsed.imageUrl) imageUrl = parsed.imageUrl;
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) handleLine(line);
            }

            if (buffer.trim()) handleLine(buffer);

            hideProgress();
            if (imageUrl) showSuccess("图片生成完成！");
            else showError("未能提取到图片 URL");
            return imageUrl;
        } catch (error) {
            hideProgress();
            showError(`生成失败: ${error.message}`);
            console.error("NAI 生图错误:", error);
            return null;
        }
    }

    // ============ 提示词模板 ============
    function insertTemplatePrompt(prompt) {
        const textarea = document.getElementById("nai-prompt");
        if (!textarea) return;
        const current = textarea.value.trim();
        if (current) {
            textarea.value = current + ", " + prompt;
        } else {
            textarea.value = prompt;
        }
    }

    function renderCustomTemplates() {
        const list = document.getElementById("nai-custom-template-list");
        if (!list) return;

        if (!settings.customTemplates || settings.customTemplates.length === 0) {
            document.getElementById("nai-custom-templates-wrap").style.display = "none";
            return;
        }

        document.getElementById("nai-custom-templates-wrap").style.display = "block";
        list.innerHTML = settings.customTemplates.map((t, i) => `
            <div class="nai-template-btn nai-template-custom" data-custom-index="${i}" title="点击插入">
                <span class="nai-template-name">${escapeHtml(t.name)}</span>
                <span class="nai-template-desc">${escapeHtml(t.desc || '自定义模板')}</span>
                <button class="nai-template-del" data-del-index="${i}" title="删除">
                    <span class="fa-solid fa-xmark"></span>
                </button>
            </div>
        `).join('');

        // 插入
        list.querySelectorAll(".nai-template-custom").forEach(el => {
            el.addEventListener("click", e => {
                if (e.target.closest(".nai-template-del")) return;
                const idx = parseInt(el.dataset.customIndex);
                const tpl = settings.customTemplates[idx];
                if (tpl) {
                    insertTemplatePrompt(tpl.prompt);
                    showSuccess(`已插入模板：${tpl.name}`);
                }
            });
        });

        // 删除
        list.querySelectorAll(".nai-template-del").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.delIndex);
                if (confirm(`确定删除模板「${settings.customTemplates[idx].name}」吗？`)) {
                    settings.customTemplates.splice(idx, 1);
                    saveSettings();
                    renderCustomTemplates();
                    showSuccess("模板已删除");
                }
            });
        });
    }

    function showAddTemplateDialog() {
        const name = window.prompt("模板名称（如：我的角色立绘）");
        if (!name) return;
        const templatePrompt = window.prompt("提示词内容（英文 tag，逗号分隔）");
        if (!templatePrompt) return;
        const desc = window.prompt("模板描述（可选，简短说明）") || "";

        settings.customTemplates = settings.customTemplates || [];
        settings.customTemplates.push({ name: name.trim(), prompt: templatePrompt.trim(), desc: desc.trim() });
        saveSettings();
        renderCustomTemplates();
        showSuccess("模板已添加");
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
            if (settings.autoInsert) await insertImageToChat(imageUrl);
        }
        if (btn) btn.disabled = false;
    }

    // ============ 自动检测标签并生成（直接替换 + 防重复锁） ============
    async function processImageTags(messageIndex) {
        const lockKey = String(messageIndex);
        if (processingMessages.has(lockKey)) return;
        processingMessages.add(lockKey);

        try {
            let ctx = getContext ? getContext() : null;
            if (!ctx || !ctx.chat) return;

            let message = ctx.chat[messageIndex];
            if (!message || message.is_user) return;

            let text = message.mes || "";
            const tags = extractImageTags(text).filter(tag => !processedTagKeys.has(getProcessedTagKey(messageIndex, tag)));
            if (tags.length === 0) return;

            showInfo(`检测到 ${tags.length} 个图片标签，开始生成...`);

            for (const tag of tags) {
                const tagKey = getProcessedTagKey(messageIndex, tag);
                if (processedTagKeys.has(tagKey) || pendingTagKeys.has(tagKey)) continue;
                pendingTagKeys.add(tagKey);

                try {
                    const imageUrl = await generateImage(tag.prompt);

                    ctx = getContext ? getContext() : null;
                    message = ctx?.chat?.[messageIndex];
                    if (!message) break;

                    const imgMarkdown = imageUrl
                        ? `![image](${imageUrl})`
                        : `❌ 图片生成失败`;

                    message.mes = message.mes.replace(tag.full, imgMarkdown);
                    processedTagKeys.add(tagKey);

                    if (imageUrl) {
                        addToGallery(imageUrl, tag.prompt);
                    }

                    if (ctx.saveChat) await ctx.saveChat();
                    if (ctx.reloadCurrentChat) await ctx.reloadCurrentChat();
                } finally {
                    pendingTagKeys.delete(tagKey);
                }
            }

            showSuccess(`已完成 ${tags.length} 张图片生成并插入`);
        } finally {
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
                if (!lastMessage.extra.inline_image) lastMessage.extra.inline_image = imageUrl;
                if (ctx.saveChat) await ctx.saveChat();
                if (ctx.reloadCurrentChat) await ctx.reloadCurrentChat();
                showSuccess("图片已插入到聊天");
            }
        } catch (error) {
            console.error("插入图片失败:", error);
            showError("插入图片到聊天失败");
        }
    }

    // ============ 下载 / 复制 ============
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
        if (tags.length === 0) { showInfo("未检测到图片标签"); return; }

        let msg = `检测到 ${tags.length} 个标签:\n`;
        tags.forEach((t, i) => {
            msg += `\n[${i + 1}] 关键词: <${t.keyword}> 格式${t.format}\n提示词: ${t.prompt.substring(0, 80)}...\n`;
        });
        alert(msg);
    }

    // ============ 图库轮播渲染 ============
    function renderGalleryCarousel() {
        const display = document.getElementById("nai-gallery-display");
        if (!display) return;

        if (gallery.length === 0) {
            display.innerHTML = '<div class="nai-gallery-empty">暂无历史图片</div>';
            const indexEl = document.getElementById("nai-gallery-index");
            if (indexEl) indexEl.textContent = "0 / 0";
            return;
        }

        if (galleryCurrentIndex >= gallery.length) galleryCurrentIndex = 0;
        if (galleryCurrentIndex < 0) galleryCurrentIndex = gallery.length - 1;

        const item = gallery[galleryCurrentIndex];
        const time = new Date(item.timestamp).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        const safeUrl = escapeAttr(item.url || "");
        const safePrompt = escapeHtml(item.prompt || '(无提示词)');
        const safePromptAttr = escapeAttr(item.prompt || '(无提示词)');

        display.innerHTML = `
            <div class="nai-gallery-main">
                <img src="${safeUrl}" alt="生成图片" id="nai-gallery-main-img">
            </div>
            <div class="nai-gallery-meta">
                <div class="nai-gallery-main-prompt" title="${safePromptAttr}">${safePrompt}</div>
                <div class="nai-gallery-main-time">${time}</div>
            </div>
            <div class="nai-gallery-main-actions">
                <button class="nai-btn-icon" id="nai-gallery-edit-btn" title="编辑提示词并重新生成">
                    <span class="fa-solid fa-pen"></span><span>编辑重生成</span>
                </button>
                <button class="nai-btn-icon" id="nai-gallery-download-btn" title="下载图片">
                    <span class="fa-solid fa-download"></span><span>下载</span>
                </button>
                <button class="nai-btn-icon" id="nai-gallery-delete-btn" title="删除">
                    <span class="fa-solid fa-trash"></span><span>删除</span>
                </button>
            </div>
        `;

        const indexEl = document.getElementById("nai-gallery-index");
        if (indexEl) indexEl.textContent = `${galleryCurrentIndex + 1} / ${gallery.length}`;

        // 绑定事件
        document.getElementById("nai-gallery-edit-btn")?.addEventListener("click", () => openGalleryEditor(galleryCurrentIndex));
        document.getElementById("nai-gallery-download-btn")?.addEventListener("click", () => downloadImageUrl(gallery[galleryCurrentIndex].url));
        document.getElementById("nai-gallery-delete-btn")?.addEventListener("click", () => {
            if (confirm("确定删除这张图片记录吗？")) {
                removeFromGallery(galleryCurrentIndex);
                showSuccess("已从图库删除");
            }
        });
    }

    function galleryPrev() {
        if (gallery.length === 0) return;
        galleryCurrentIndex = (galleryCurrentIndex - 1 + gallery.length) % gallery.length;
        renderGalleryCarousel();
    }

    function galleryNext() {
        if (gallery.length === 0) return;
        galleryCurrentIndex = (galleryCurrentIndex + 1) % gallery.length;
        renderGalleryCarousel();
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
        const newPrompt = document.getElementById("nai-editor-prompt")?.value?.trim();
        if (!newPrompt) { showError("提示词不能为空"); return; }

        const oldUrl = gallery[index]?.url;
        const btn = document.getElementById("nai-editor-regenerate");
        if (btn) btn.disabled = true;

        const newUrl = await generateImage(newPrompt);
        if (newUrl) {
            updateGalleryUrl(index, newUrl);
            updateGalleryPrompt(index, newPrompt);
            if (oldUrl) await replaceImageInChat(oldUrl, newUrl);
            const img = document.getElementById("nai-editor-image");
            if (img) img.src = newUrl;
            renderGalleryCarousel();
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
            }
        } catch (error) {
            console.error("替换聊天图片失败:", error);
        }
    }

    // ============ Tab 切换 ============
    function switchTab(tabName) {
        document.querySelectorAll(".nai-tab").forEach(t => t.classList.remove("nai-tab-active"));
        document.querySelectorAll(".nai-tab-content").forEach(c => c.classList.remove("nai-tab-content-active"));

        const tab = document.querySelector(`.nai-tab[data-tab="${tabName}"]`);
        const content = document.getElementById(`nai-tab-${tabName}`);
        if (tab) tab.classList.add("nai-tab-active");
        if (content) content.classList.add("nai-tab-content-active");

        if (tabName === "gallery") renderGalleryCarousel();
    }

    // ============ UI 渲染 ============
    function renderUI() {
        const guidePromptValue = escapeHtml(settings.guidePrompt || DEFAULT_GUIDE_PROMPT);
        const apiUrlValue = escapeAttr(settings.apiUrl || "");
        const apiKeyValue = escapeAttr(settings.apiKey || "");
        const html = `
        <div id="nai-simple-extension" class="list-group-item">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b><span class="nai-header-icon fa-solid fa-palette"></span>NAI 图片生成</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="nai-body">

                        <!-- Tab 导航 -->
                        <div class="nai-tabs">
                            <button class="nai-tab nai-tab-active" data-tab="settings">
                                <span class="fa-solid fa-sliders"></span> 设置
                            </button>
                            <button class="nai-tab" data-tab="gallery">
                                <span class="fa-solid fa-images"></span> 图库
                                <span class="nai-gallery-badge" id="nai-gallery-count">0</span>
                            </button>
                        </div>

                        <!-- ===== 设置 Tab ===== -->
                        <div class="nai-tab-content nai-tab-content-active" id="nai-tab-settings">

                            <div class="nai-section-title"><span class="nai-section-dot"></span>自动化设置</div>

                            <div class="nai-toggle-row">
                                <div class="nai-toggle-info">
                                    <span class="nai-toggle-label">自动检测标签生成图片</span>
                                    <span class="nai-toggle-desc">AI 回复后自动扫描标签并生成图片</span>
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

                            <div class="nai-section-title"><span class="nai-section-dot"></span>触发关键词</div>

                            <div class="nai-field">
                                <div class="nai-input-row">
                                    <input id="nai-keyword-input" type="text" class="text_pole" placeholder="输入关键词，如 画图、pic、插图">
                                    <button id="nai-add-keyword-btn" class="nai-btn-icon" title="添加关键词">
                                        <span class="fa-solid fa-plus"></span>
                                        <span>添加</span>
                                    </button>
                                </div>
                                <small class="nai-hint">添加后可用 &lt;关键词&gt;内容&lt;/关键词&gt; 触发生图</small>
                            </div>

                            <div id="nai-keyword-list" class="nai-keyword-list"></div>

                            <hr class="nai-divider">

                            <div class="nai-section-title"><span class="nai-section-dot"></span>AI 引导提示词</div>

                            <div class="nai-toggle-row">
                                <div class="nai-toggle-info">
                                    <span class="nai-toggle-label">注入引导提示词</span>
                                    <span class="nai-toggle-desc">开启后自动将图片生成规则注入 AI 系统提示词</span>
                                </div>
                                <label class="nai-switch">
                                    <input id="nai-guide-enabled" type="checkbox" ${settings.guideEnabled ? "checked" : ""}>
                                    <span class="nai-switch-slider"></span>
                                </label>
                            </div>

                            <div class="nai-field nai-guide-field">
                                <div class="nai-input-row">
                                    <textarea id="nai-guide-prompt" class="text_pole" rows="8" placeholder="引导提示词内容...">${guidePromptValue}</textarea>
                                </div>
                                <div class="nai-guide-actions">
                                    <button id="nai-guide-reset" class="nai-btn-icon" title="恢复默认">
                                        <span class="fa-solid fa-rotate-left"></span><span>恢复默认</span>
                                    </button>
                                    <button id="nai-guide-test" class="nai-btn-icon" title="查看效果说明">
                                        <span class="fa-solid fa-circle-info"></span><span>使用说明</span>
                                    </button>
                                </div>
                                <small class="nai-hint">引导 AI 在合适时机输出 &lt;image&gt; 标签，可自定义修改</small>
                            </div>

                            <hr class="nai-divider">

                            <div class="nai-section-title"><span class="nai-section-dot"></span>接口配置</div>

                            <div class="nai-field">
                                <label for="nai-api-url" class="nai-label">API 地址</label>
                                <input id="nai-api-url" type="text" class="text_pole" value="${apiUrlValue}" placeholder="https://api.example.com">
                                <small class="nai-hint">只需填基础地址，自动补全 /v1/chat/completions</small>
                            </div>

                            <div class="nai-field">
                                <label for="nai-api-key" class="nai-label">API 密钥</label>
                                <input id="nai-api-key" type="password" class="text_pole" value="${apiKeyValue}" placeholder="sk-...">
                            </div>

                            <div class="nai-field">
                                <label for="nai-model" class="nai-label">NAI 模型</label>
                                <div class="nai-model-row">
                                    <select id="nai-model" class="text_pole"><option value="">请先获取模型列表</option></select>
                                    <button id="nai-fetch-models-btn" class="nai-btn-icon" title="从 API 获取可用模型列表">
                                        <span class="fa-solid fa-rotate"></span><span>获取</span>
                                    </button>
                                </div>
                                <small id="nai-model-hint" class="nai-hint">输入密钥后点击「获取」拉取可用模型</small>
                            </div>

                            <hr class="nai-divider">

                            <div class="nai-section-title"><span class="nai-section-dot"></span>手动生成</div>

                            <div class="nai-field">
                                <label class="nai-label">快捷模板</label>
                                <div class="nai-template-grid">
                                    ${PRESET_TEMPLATES.map((t, i) => `
                                        <button class="nai-template-btn" data-index="${i}" title="${escapeAttr(t.desc)}">
                                            <span class="nai-template-name">${escapeHtml(t.name)}</span>
                                            <span class="nai-template-desc">${escapeHtml(t.desc)}</span>
                                        </button>
                                    `).join('')}
                                    <button id="nai-add-template-btn" class="nai-template-btn nai-template-add" title="添加自定义模板">
                                        <span class="fa-solid fa-plus" style="font-size:16px;"></span>
                                        <span style="font-size:11px;opacity:.7;">自定义</span>
                                    </button>
                                </div>
                                <div id="nai-custom-templates-wrap" style="display:none;">
                                    <div id="nai-custom-template-list" class="nai-template-grid" style="margin-top:8px;"></div>
                                </div>
                            </div>

                            <div class="nai-field">
                                <label for="nai-prompt" class="nai-label">提示词</label>
                                <textarea id="nai-prompt" class="text_pole" rows="4" placeholder="输入提示词，或粘贴含标签的文本测试检测..."></textarea>
                            </div>

                            <div class="nai-btn-group">
                                <button id="nai-generate-btn" class="nai-btn nai-btn-primary">
                                    <span class="fa-solid fa-wand-magic-sparkles"></span><span>生成图片</span>
                                </button>
                                <button id="nai-test-tags-btn" class="nai-btn nai-btn-secondary" title="测试标签检测">
                                    <span class="fa-solid fa-magnifying-glass"></span><span>测试标签</span>
                                </button>
                            </div>

                            <div id="nai-progress-container" style="display:none;">
                                <div id="nai-progress-text">准备中...</div>
                                <div class="nai-progress-track"><div id="nai-progress-bar"></div></div>
                            </div>

                            <div id="nai-image-container" style="display:none;">
                                <img id="nai-generated-image" src="">
                                <div class="nai-image-actions">
                                    <button id="nai-download-btn" class="nai-btn-icon"><span class="fa-solid fa-download"></span><span>下载</span></button>
                                    <button id="nai-copy-url-btn" class="nai-btn-icon"><span class="fa-solid fa-copy"></span><span>复制链接</span></button>
                                    <button id="nai-insert-btn" class="nai-btn-icon"><span class="fa-solid fa-paper-plane"></span><span>插入聊天</span></button>
                                </div>
                            </div>

                            <hr class="nai-divider">

                            <details>
                                <summary><span class="fa-solid fa-chevron-right"></span> 标签格式说明</summary>
                                <div class="nai-tag-guide">
                                    <p>格式1（推荐）</p>
                                    <code>&lt;关键词&gt;关键词###内容###&lt;/关键词&gt;</code>
                                    <p>示例</p>
                                    <code class="nai-code-sm">&lt;image&gt;image###sfw,1girl,from side###&lt;/image&gt;</code>
                                    <p>格式2（简单）</p>
                                    <code>&lt;关键词&gt;内容&lt;/关键词&gt;</code>
                                    <p>示例</p>
                                    <code class="nai-code-sm">&lt;image&gt;sfw,1girl,from side&lt;/image&gt;</code>
                                </div>
                            </details>

                        </div>

                        <!-- ===== 图库 Tab ===== -->
                        <div class="nai-tab-content" id="nai-tab-gallery">
                            <div class="nai-gallery-nav">
                                <button id="nai-gallery-prev" class="nai-gallery-nav-btn" title="上一张">
                                    <span class="fa-solid fa-chevron-left"></span>
                                </button>
                                <span id="nai-gallery-index" class="nai-gallery-index-text">0 / 0</span>
                                <button id="nai-gallery-next" class="nai-gallery-nav-btn" title="下一张">
                                    <span class="fa-solid fa-chevron-right"></span>
                                </button>
                            </div>
                            <div id="nai-gallery-display">
                                <div class="nai-gallery-empty">暂无历史图片</div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- 图库编辑器弹窗 -->
        <div id="nai-gallery-editor-overlay" class="nai-editor-overlay" style="display:none;">
            <div class="nai-editor-dialog">
                <div class="nai-editor-header">
                    <span class="nai-editor-title">编辑并重新生成</span>
                    <button id="nai-editor-close" class="nai-btn-icon" title="关闭"><span class="fa-solid fa-xmark"></span></button>
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
                        <span class="fa-solid fa-arrows-rotate"></span><span>重新生成</span>
                    </button>
                    <button id="nai-editor-download" class="nai-btn nai-btn-secondary">
                        <span class="fa-solid fa-download"></span><span>下载原图</span>
                    </button>
                </div>
            </div>
        </div>
        `;

        const container = document.getElementById("extensions_settings");
        if (container) {
            container.insertAdjacentHTML("beforeend", html);
            bindEvents();
            renderKeywordList();
            renderGalleryCarousel();
            updateGalleryBadge();
        }
    }

    // ============ 事件绑定 ============
    function bindEvents() {
        // Tab 切换
        document.querySelectorAll(".nai-tab").forEach(tab => {
            tab.addEventListener("click", () => switchTab(tab.dataset.tab));
        });

        // 图库导航
        document.getElementById("nai-gallery-prev")?.addEventListener("click", galleryPrev);
        document.getElementById("nai-gallery-next")?.addEventListener("click", galleryNext);

        // 设置项
        document.getElementById("nai-api-url")?.addEventListener("input", e => { settings.apiUrl = e.target.value.trim(); saveSettings(); });
        document.getElementById("nai-api-key")?.addEventListener("input", e => { settings.apiKey = e.target.value.trim(); saveSettings(); });
        document.getElementById("nai-auto-insert")?.addEventListener("change", e => { settings.autoInsert = e.target.checked; saveSettings(); });
        document.getElementById("nai-auto-generate")?.addEventListener("change", e => { settings.autoGenerate = e.target.checked; saveSettings(); });
        document.getElementById("nai-auto-clean")?.addEventListener("change", e => { settings.autoCleanTags = e.target.checked; saveSettings(); });
        document.getElementById("nai-model")?.addEventListener("change", e => { settings.model = e.target.value; saveSettings(); });

        // 关键词管理
        document.getElementById("nai-add-keyword-btn")?.addEventListener("click", addCustomKeyword);
        document.getElementById("nai-keyword-input")?.addEventListener("keydown", e => { if (e.key === "Enter") addCustomKeyword(); });

        // 模板功能
        // 预设模板点击插入
        document.querySelectorAll(".nai-template-btn[data-index]").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.index);
                const tpl = PRESET_TEMPLATES[idx];
                if (!tpl) return;
                insertTemplatePrompt(tpl.prompt);
                showSuccess(`已插入模板：${tpl.name}`);
            });
        });

        // 添加自定义模板
        document.getElementById("nai-add-template-btn")?.addEventListener("click", showAddTemplateDialog);

        // 渲染自定义模板
        renderCustomTemplates();

        // 模型获取
        document.getElementById("nai-fetch-models-btn")?.addEventListener("click", fetchModels);

        // 引导提示词
        document.getElementById("nai-guide-enabled")?.addEventListener("change", e => {
            settings.guideEnabled = e.target.checked;
            saveSettings();
            applyGuidePrompt();
            showSuccess(settings.guideEnabled ? "引导提示词已开启" : "引导提示词已关闭");
        });

        document.getElementById("nai-guide-prompt")?.addEventListener("input", e => {
            settings.guidePrompt = e.target.value;
            saveSettings();
            if (settings.guideEnabled) applyGuidePrompt();
        });

        document.getElementById("nai-guide-reset")?.addEventListener("click", () => {
            const textarea = document.getElementById("nai-guide-prompt");
            if (textarea) {
                textarea.value = DEFAULT_GUIDE_PROMPT;
                settings.guidePrompt = DEFAULT_GUIDE_PROMPT;
                saveSettings();
                if (settings.guideEnabled) applyGuidePrompt();
                showSuccess("已恢复默认引导提示词");
            }
        });

        document.getElementById("nai-guide-test")?.addEventListener("click", () => {
            alert(
                "引导提示词使用说明\n\n" +
                "1. 开启「注入引导提示词」开关\n" +
                "2. 扩展会自动将规则注入 AI 的系统提示词\n" +
                "3. AI 回复时会在合适时机输出 <image> 标签\n" +
                "4. 扩展检测到标签后自动调用 API 生成图片\n" +
                "5. 图片会自动插入到聊天消息中\n\n" +
                "可自定义提示词内容，修改后即时生效。\n" +
                "建议包含：标签格式、使用时机、关键词风格要求。"
            );
        });

        // 生成操作
        document.getElementById("nai-generate-btn")?.addEventListener("click", manualGenerate);
        document.getElementById("nai-test-tags-btn")?.addEventListener("click", testTagExtraction);
        document.getElementById("nai-download-btn")?.addEventListener("click", downloadImage);
        document.getElementById("nai-copy-url-btn")?.addEventListener("click", copyImageUrl);
        document.getElementById("nai-insert-btn")?.addEventListener("click", manualInsertImage);

        // 图库编辑器
        document.getElementById("nai-editor-close")?.addEventListener("click", closeGalleryEditor);
        document.getElementById("nai-editor-regenerate")?.addEventListener("click", regenerateFromEditor);
        document.getElementById("nai-editor-download")?.addEventListener("click", () => {
            const overlay = document.getElementById("nai-gallery-editor-overlay");
            const idx = parseInt(overlay?.dataset.index);
            if (gallery[idx]) downloadImageUrl(gallery[idx].url);
        });
        document.getElementById("nai-gallery-editor-overlay")?.addEventListener("click", e => {
            if (e.target.id === "nai-gallery-editor-overlay") closeGalleryEditor();
        });
    }

    // ============ 注册酒馆事件 ============
    function registerEvents() {
        if (runtimeState.eventsRegistered) return;
        if (!eventSource || !event_types) {
            console.warn("NAI Simple: eventSource 未找到，自动生成功能不可用");
            return;
        }

        if (event_types.MESSAGE_RECEIVED) {
            runtimeState.eventsRegistered = true;
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
        if (savedModels) { try { cachedModels = JSON.parse(savedModels); } catch(e) {} }
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
                applyGuidePrompt();

                console.log("NAI Simple 扩展已加载 v1.1.0");
            } catch (e) {
                console.error("NAI Simple 扩展加载失败:", e);
                loadSettings();
                loadCachedModels();
                loadGallery();
                renderUI();
                renderModelSelect();
                applyGuidePrompt();
            }
        })();
    });
})();
