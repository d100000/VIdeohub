const runtime = document.querySelector("#guideRuntime");

async function loadRuntime() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    runtime.textContent = `${config.model} · ${config.baseUrl} · ${config.hasApiKey ? "key 已配置" : "缺少 key"}`;
  } catch {
    runtime.textContent = "本地配置读取失败";
  }
}

loadRuntime();
