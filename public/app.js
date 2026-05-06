const HISTORY_KEY = "seedanceStudioHistory";
const IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_LABEL = "12MB";
const IMAGE_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function localDateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function showDailySiteNotice() {
  const today = localDateKey();
  try {
    if (localStorage.getItem("cvc-daily-site-notice") === today) return;
  } catch {
    // Continue and show the notice when localStorage is unavailable.
  }

  const backdrop = document.createElement("div");
  backdrop.className = "daily-notice-backdrop";
  backdrop.innerHTML = `
    <section class="daily-notice" role="dialog" aria-modal="true" aria-labelledby="dailyNoticeTitle">
      <div class="daily-notice-icon">!</div>
      <div>
        <strong id="dailyNoticeTitle">测试站点提醒</strong>
        <p>本站点只提供视频测试使用，图片和视频均会过期，请及时下载到本地。</p>
      </div>
      <button class="primary-button" type="button">我知道了</button>
    </section>
  `;
  const close = () => {
    try {
      localStorage.setItem("cvc-daily-site-notice", today);
    } catch {
      // Closing should still work for this page view.
    }
    backdrop.remove();
  };
  backdrop.querySelector("button").addEventListener("click", close);
  document.body.append(backdrop);
}

const templates = [
  {
    label: "产品广告",
    prompt:
      "A premium product on a reflective surface, soft studio light, slow push in, clean commercial look, crisp details",
    stylePreset: "clean commercial product shot",
    cameraMotion: "slow push in",
  },
  {
    label: "人像微动",
    prompt:
      "A close portrait, the subject gently turns toward camera, subtle hair movement, natural expression, soft editorial lighting",
    stylePreset: "soft editorial portrait film",
    cameraMotion: "locked tripod shot",
  },
  {
    label: "电影镜头",
    prompt:
      "A quiet cinematic scene at golden hour, atmospheric depth, realistic motion, the camera slowly tracks across the environment",
    stylePreset: "cinematic realistic lighting",
    cameraMotion: "smooth lateral tracking shot",
  },
  {
    label: "动态海报",
    prompt:
      "A refined poster-like composition coming alive, layered depth, subtle parallax, elegant animated motion",
    stylePreset: "animated poster with refined motion",
    cameraMotion: "subtle orbit around the subject",
  },
];

const ratioDimensions = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1024, 1024],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
  adaptive: [1280, 720],
};

const state = {
  mode: "text",
  imageAssetUrl: "",
  imageUrlTimer: null,
  pollTimer: null,
  lastErrorDetail: null,
  history: [],
};

const elements = {
  form: document.querySelector("#videoForm"),
  prompt: document.querySelector("#prompt"),
  promptMeter: document.querySelector("#promptMeter"),
  templateRow: document.querySelector("#templateRow"),
  imagePanel: document.querySelector("#imagePanel"),
  imageUrl: document.querySelector("#imageUrl"),
  imageFile: document.querySelector("#imageFile"),
  imagePreview: document.querySelector("#imagePreview"),
  duration: document.querySelector("#duration"),
  ratio: document.querySelector("#ratio"),
  resolution: document.querySelector("#resolution"),
  cameraMotion: document.querySelector("#cameraMotion"),
  stylePreset: document.querySelector("#stylePreset"),
  motionStrength: document.querySelector("#motionStrength"),
  negativePrompt: document.querySelector("#negativePrompt"),
  seed: document.querySelector("#seed"),
  watermark: document.querySelector("#watermark"),
  estimatePill: document.querySelector("#estimatePill"),
  submitButton: document.querySelector("#submitButton"),
  configToggle: document.querySelector("#configToggle"),
  configPanel: document.querySelector("#configPanel"),
  configForm: document.querySelector("#configForm"),
  baseUrlInput: document.querySelector("#baseUrlInput"),
  modelInput: document.querySelector("#modelInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  clearApiKey: document.querySelector("#clearApiKey"),
  configStatus: document.querySelector("#configStatus"),
  testApiButton: document.querySelector("#testApiButton"),
  runtimeMeta: document.querySelector("#runtimeMeta"),
  keyState: document.querySelector("#keyState"),
  taskBadge: document.querySelector("#taskBadge"),
  previewSubtitle: document.querySelector("#previewSubtitle"),
  statusStack: document.querySelector("#statusStack"),
  resultBody: document.querySelector("#resultBody"),
  historyList: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory"),
  debugBox: document.querySelector("#debugBox"),
  errorModal: document.querySelector("#errorModal"),
  errorDetail: document.querySelector("#errorDetail"),
  closeErrorModal: document.querySelector("#closeErrorModal"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
};

function setMode(mode) {
  state.mode = mode;
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  elements.imagePanel.hidden = mode !== "image";
}

function setBusy(isBusy) {
  elements.submitButton.disabled = isBusy;
  elements.submitButton.textContent = isBusy ? "生成中..." : "生成视频";
}

function showDebug(data) {
  elements.debugBox.textContent = data ? JSON.stringify(data, null, 2) : "";
}

function showResult(content) {
  elements.resultBody.innerHTML = "";
  elements.resultBody.append(content);
}

function updatePromptMeter() {
  elements.promptMeter.textContent = `${elements.prompt.value.trim().length} 字`;
}

function updateEstimate() {
  const [width, height] = ratioDimensions[elements.ratio.value] || ratioDimensions["16:9"];
  elements.estimatePill.textContent = `${width}×${height} · ${elements.duration.value}s`;
}

function updateTaskBadge(status, taskId) {
  elements.taskBadge.textContent = taskId ? `${status} · ${taskId}` : status;
  elements.taskBadge.dataset.status = status;
}

function updateStatusStack(status, progress = null) {
  const normalized = status || "queued";
  elements.statusStack.querySelectorAll(".status-step").forEach((step) => {
    const key = step.dataset.step;
    const active =
      key === normalized ||
      (normalized === "queued" && key === "queued") ||
      (normalized === "in_progress" && ["queued", "in_progress"].includes(key)) ||
      (normalized === "completed" && ["queued", "in_progress", "completed"].includes(key));
    step.classList.toggle("active", active);
  });
  elements.previewSubtitle.textContent = progress === null ? normalized : `${normalized} · ${progress}%`;
}

function showMessage(title, detail, tone = "neutral") {
  const box = document.createElement("div");
  box.className = `message ${tone}`;
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  box.append(strong, span);
  if (tone === "error" && state.lastErrorDetail) {
    const detailButton = document.createElement("button");
    detailButton.className = "secondary-button";
    detailButton.type = "button";
    detailButton.textContent = "查看错误详情";
    detailButton.addEventListener("click", openErrorModal);
    box.append(detailButton);
  }
  showResult(box);
}

function extractErrorDetail(error, fallback = {}) {
  return {
    message: error.message,
    request: fallback,
    error: error.body?.error || null,
    debug: error.body?.error?.debug || null,
  };
}

function openErrorModal() {
  elements.errorDetail.textContent = JSON.stringify(state.lastErrorDetail || {}, null, 2);
  elements.errorModal.showModal();
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const message = body?.error?.message || (response.status === 413 ? `图片太大，请压缩到 ${IMAGE_UPLOAD_MAX_LABEL} 以内后再上传。` : `HTTP ${response.status}`);
    const error = new Error(message);
    error.body = body;
    throw error;
  }
  return body;
}

function formatFileSize(bytes) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}

function imageMimeFromFileName(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "";
}

function validateImageFile(file) {
  const mime = file.type || imageMimeFromFileName(file.name);
  if (!IMAGE_UPLOAD_TYPES.has(mime)) {
    throw new Error("图片格式不支持，请上传 PNG、JPG 或 WebP 图片。");
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error(`图片太大：当前 ${formatFileSize(file.size)}，请压缩到 ${IMAGE_UPLOAD_MAX_LABEL} 以内。`);
  }
  return mime;
}

function renderImagePreview(url, label = "图片预览") {
  elements.imagePreview.innerHTML = "";
  const image = document.createElement("img");
  image.src = url;
  image.alt = label;
  elements.imagePreview.append(image);
}

async function uploadImageFile(file) {
  const mime = validateImageFile(file);
  const result = await readJson(
    await fetch("/api/assets/upload?type=reference_image", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": mime,
        "X-File-Name": encodeURIComponent(file.name || "upload"),
        "X-Asset-Type": "reference_image",
      },
      body: await file.arrayBuffer(),
    }),
  );
  return result.asset?.publicUrl || result.asset?.url || "";
}

async function validateImageUrlInput(value) {
  const result = await readJson(
    await fetch("/api/assets/validate-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    }),
  );
  return result.url || value;
}

async function loadConfig() {
  try {
    const config = await readJson(await fetch("/api/config"));
    elements.runtimeMeta.textContent = `${config.model} · ${config.baseUrl}`;
    elements.keyState.textContent = config.hasApiKey ? `API key 已配置 ${config.apiKeyPreview || ""}` : "缺少 API key";
    elements.keyState.dataset.ready = config.hasApiKey ? "true" : "false";
    elements.baseUrlInput.value = config.baseUrl || "";
    elements.modelInput.value = config.model || "";
    elements.apiKeyInput.value = "";
    elements.clearApiKey.checked = false;
  } catch {
    elements.runtimeMeta.textContent = "读取配置失败";
    elements.keyState.textContent = "异常";
  }
}

async function saveConfig(event) {
  event.preventDefault();
  elements.configStatus.textContent = "保存中...";

  const payload = {
    baseUrl: elements.baseUrlInput.value.trim(),
    model: elements.modelInput.value.trim(),
    clearApiKey: elements.clearApiKey.checked,
  };

  if (elements.apiKeyInput.value.trim() && !payload.clearApiKey) {
    payload.apiKey = elements.apiKeyInput.value.trim();
  }

  try {
    const config = await readJson(
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    elements.runtimeMeta.textContent = `${config.model} · ${config.baseUrl}`;
    elements.keyState.textContent = config.hasApiKey ? `API key 已配置 ${config.apiKeyPreview || ""}` : "缺少 API key";
    elements.keyState.dataset.ready = config.hasApiKey ? "true" : "false";
    elements.apiKeyInput.value = "";
    elements.clearApiKey.checked = false;
    elements.configStatus.textContent = "已保存，本次运行生效";
  } catch (error) {
    elements.configStatus.textContent = error.message;
  }
}

async function testConfiguredApi() {
  elements.configStatus.textContent = "测试中...";
  elements.testApiButton.disabled = true;
  state.lastErrorDetail = null;
  showDebug(null);
  updateTaskBadge("测试中", "");
  updateStatusStack("queued", 0);
  showMessage("正在测试接口", "提交一条 5 秒视频生成测试请求。");

  try {
    const result = await readJson(
      await fetch("/api/test-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    elements.configStatus.textContent = "接口测试已提交";
    updateTaskBadge(result.status || "queued", result.taskId);
    updateStatusStack(result.status || "queued", result.progress);
    showDebug(result.debug || result.raw || result);
    showMessage("接口连通", result.taskId ? `已创建测试任务：${result.taskId}` : "上游返回成功。");
    if (result.taskId) {
      startPolling(result.taskId, {
        mode: "text",
        prompt: "Connectivity test",
      });
    }
  } catch (error) {
    state.lastErrorDetail = extractErrorDetail(error, {
      method: "POST",
      url: "/api/test-video",
    });
    elements.configStatus.textContent = "接口测试失败";
    showDebug(error.body || { message: error.message });
    showMessage("接口测试失败", error.message, "error");
    updateTaskBadge("失败", "");
    openErrorModal();
  } finally {
    elements.testApiButton.disabled = false;
  }
}

function selectedImage() {
  return elements.imageUrl.value.trim() || state.imageAssetUrl;
}

function collectPayload() {
  const [width, height] = ratioDimensions[elements.ratio.value] || ratioDimensions["16:9"];
  return {
    mode: state.mode,
    prompt: elements.prompt.value.trim(),
    image: state.mode === "image" ? selectedImage() : "",
    duration: Number(elements.duration.value),
    width,
    height,
    ratio: elements.ratio.value,
    resolution: elements.resolution.value,
    cameraMotion: elements.cameraMotion.value,
    stylePreset: elements.stylePreset.value,
    motionStrength: Number(elements.motionStrength.value),
    negativePrompt: elements.negativePrompt.value.trim(),
    watermark: elements.watermark.checked,
    seed: elements.seed.value,
  };
}

async function createTask(payload) {
  return readJson(
    await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

async function getTask(taskId) {
  return readJson(await fetch(`/api/videos/${encodeURIComponent(taskId)}`));
}

function renderWorking(taskId) {
  const box = document.createElement("div");
  box.className = "working-card";
  box.innerHTML = `
    <div class="pulse-ring"></div>
    <strong>任务生成中</strong>
    <span>${taskId}</span>
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
  `;
  showResult(box);
}

function updateProgress(progress) {
  const progressFill = document.querySelector("#progressFill");
  if (progressFill && progress !== null && progress !== undefined) {
    progressFill.style.width = `${progress}%`;
  }
}

function renderVideo(task) {
  const wrapper = document.createElement("div");
  wrapper.className = "video-result";

  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.src = task.url;

  const actions = document.createElement("div");
  actions.className = "video-actions";

  const soundButton = document.createElement("button");
  soundButton.className = "secondary-button";
  soundButton.type = "button";
  soundButton.textContent = "开启声音";
  soundButton.addEventListener("click", async () => {
    video.muted = false;
    await video.play().catch(() => {});
    soundButton.textContent = "声音已开";
  });

  const copyButton = document.createElement("button");
  copyButton.className = "secondary-button";
  copyButton.type = "button";
  copyButton.textContent = "复制链接";
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(task.url).catch(() => {});
    copyButton.textContent = "已复制";
  });

  const openLink = document.createElement("a");
  openLink.className = "secondary-link";
  openLink.href = task.url;
  openLink.target = "_blank";
  openLink.rel = "noreferrer";
  openLink.textContent = "打开链接";

  const downloadLink = document.createElement("a");
  downloadLink.className = "secondary-link";
  downloadLink.href = task.url;
  downloadLink.download = `${task.taskId || "seedance-video"}.mp4`;
  downloadLink.textContent = "下载";

  actions.append(soundButton, copyButton, openLink, downloadLink);
  wrapper.append(video, actions);
  showResult(wrapper);
  video.play().catch(() => {});
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    state.history = [];
  }
  renderHistory();
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 10)));
}

function addHistory(task, payload) {
  if (!task.url) return;
  state.history = [
    {
      taskId: task.taskId,
      url: task.url,
      prompt: payload.prompt,
      mode: payload.mode,
      createdAt: new Date().toISOString(),
    },
    ...state.history.filter((item) => item.taskId !== task.taskId),
  ].slice(0, 10);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "暂无历史";
    elements.historyList.append(empty);
    return;
  }

  state.history.forEach((item) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.innerHTML = `
      <span>${item.mode === "image" ? "图生" : "文生"} · ${new Date(item.createdAt).toLocaleTimeString()}</span>
      <strong>${item.prompt || item.taskId}</strong>
    `;
    button.addEventListener("click", () => {
      updateTaskBadge("completed", item.taskId);
      updateStatusStack("completed", 100);
      renderVideo({ taskId: item.taskId, url: item.url });
    });
    elements.historyList.append(button);
  });
}

function startPolling(taskId, payload) {
  clearInterval(state.pollTimer);
  renderWorking(taskId);
  state.pollTimer = setInterval(async () => {
    try {
      const task = await getTask(taskId);
      updateTaskBadge(task.status, task.taskId || taskId);
      updateStatusStack(task.status, task.progress);
      updateProgress(task.progress);
      showDebug(task.raw || task);

      if (task.status === "completed" && task.url) {
        clearInterval(state.pollTimer);
        renderVideo(task);
        addHistory(task, payload);
      } else if (task.status === "completed") {
        clearInterval(state.pollTimer);
        state.lastErrorDetail = {
          message: "任务已完成，但响应里没有可播放的视频 URL。",
          task,
        };
        showMessage("缺少视频链接", "任务已完成，但没有解析到 video_url 或 result_url。", "error");
      } else if (["failed", "cancelled", "canceled", "expired"].includes(task.status)) {
        clearInterval(state.pollTimer);
        state.lastErrorDetail = { message: task.failReason || "任务没有完成", task };
        showMessage("任务没有完成", task.failReason || `当前状态：${task.status}`, "error");
      }
    } catch (error) {
      clearInterval(state.pollTimer);
      state.lastErrorDetail = extractErrorDetail(error, { method: "GET", url: `/api/videos/${taskId}` });
      showDebug(error.body || { message: error.message });
      showMessage("查询失败", error.message, "error");
      updateTaskBadge("查询失败", taskId);
    }
  }, 3000);
}

function renderTemplates() {
  templates.forEach((template) => {
    const button = document.createElement("button");
    button.className = "template-chip";
    button.type = "button";
    button.textContent = template.label;
    button.addEventListener("click", () => {
      elements.prompt.value = template.prompt;
      elements.stylePreset.value = template.stylePreset;
      elements.cameraMotion.value = template.cameraMotion;
      updatePromptMeter();
    });
    elements.templateRow.append(button);
  });
}

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.configToggle.addEventListener("click", () => {
  elements.configPanel.hidden = !elements.configPanel.hidden;
});

elements.clearApiKey.addEventListener("change", () => {
  elements.apiKeyInput.disabled = elements.clearApiKey.checked;
  if (elements.clearApiKey.checked) {
    elements.apiKeyInput.value = "";
  }
});

elements.configForm.addEventListener("submit", saveConfig);
elements.testApiButton.addEventListener("click", testConfiguredApi);

elements.closeErrorModal.addEventListener("click", () => {
  elements.errorModal.close();
});

elements.clearHistory.addEventListener("click", () => {
  state.history = [];
  saveHistory();
  renderHistory();
});

elements.prompt.addEventListener("input", updatePromptMeter);
elements.ratio.addEventListener("change", updateEstimate);
elements.duration.addEventListener("change", updateEstimate);

elements.imageFile.addEventListener("change", () => {
  const file = elements.imageFile.files?.[0];
  state.imageAssetUrl = "";
  if (!file) {
    elements.imagePreview.textContent = "未选择图片";
    return;
  }

  elements.imagePreview.textContent = "上传图片中...";
  uploadImageFile(file)
    .then((imageUrl) => {
      state.imageAssetUrl = imageUrl;
      elements.imageUrl.value = imageUrl;
      renderImagePreview(imageUrl);
    })
    .catch((error) => {
      elements.imagePreview.textContent = error.message;
    });
});

elements.imageUrl.addEventListener("input", () => {
  state.imageAssetUrl = "";
  clearTimeout(state.imageUrlTimer);
  const value = elements.imageUrl.value.trim();
  if (!value) {
    elements.imagePreview.textContent = "未选择图片";
    return;
  }
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
  } catch {
    elements.imagePreview.textContent = "请输入以 http:// 或 https:// 开头的图片 URL";
    return;
  }
  elements.imagePreview.textContent = "验证图片 URL...";
  state.imageUrlTimer = setTimeout(() => {
    validateImageUrlInput(value)
      .then((imageUrl) => {
        elements.imageUrl.value = imageUrl;
        renderImagePreview(imageUrl);
      })
      .catch((error) => {
        elements.imagePreview.textContent = error.message;
      });
  }, 450);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearInterval(state.pollTimer);
  state.lastErrorDetail = null;
  setBusy(true);
  updateTaskBadge("提交中", "");
  updateStatusStack("queued", 0);
  showMessage("正在提交", "等待上游响应。");
  showDebug(null);
  const payload = collectPayload();

  try {
    const task = await createTask(payload);
    updateTaskBadge(task.status || "queued", task.taskId);
    updateStatusStack(task.status || "queued", task.progress);
    showDebug(task.raw || task);
    startPolling(task.taskId, payload);
  } catch (error) {
    state.lastErrorDetail = extractErrorDetail(error, {
      method: "POST",
      url: "/api/videos",
      body: payload,
    });
    showDebug(error.body || { message: error.message });
    showMessage("提交失败", error.message, "error");
    updateTaskBadge("失败", "");
  } finally {
    setBusy(false);
  }
});

renderTemplates();
setMode("text");
updatePromptMeter();
updateEstimate();
loadHistory();
loadConfig();
showDailySiteNotice();
