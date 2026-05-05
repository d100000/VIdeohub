import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronsRight,
  Clapperboard,
  Copy,
  Download,
  Film,
  Frame,
  Image,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  Maximize2,
  MessageSquare,
  MousePointer2,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Video,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { taskRecoveryAdvice, taskSourceLabel, taskStatusLabel } from "./taskLogic.js";

const providerBaseUrl = "https://www.taijiai.online/";
const defaultModel = "seedance-2.0-720p";

const ratioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const durationOptions = [3, 5, 8, 10, 15];
const motionOptions = [
  ["locked", "固定镜头"],
  ["slow_push_in", "慢慢推进"],
  ["pull_back", "慢慢拉远"],
  ["orbit", "环绕主体"],
  ["truck_left", "横向移动"],
  ["handheld", "手持感"],
  ["dive", "俯冲镜头"],
];
const strengthOptions = [
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
];

const breadcrumbs = [];

function addBreadcrumb(action, context = {}) {
  breadcrumbs.push({
    action,
    context,
    route: window.location.pathname,
    at: new Date().toISOString(),
  });
  while (breadcrumbs.length > 20) breadcrumbs.shift();
}

async function reportClientError(error, context = {}) {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "frontend",
        code: context.code || "CLIENT_RUNTIME_ERROR",
        message: error?.message || String(error),
        stack: error?.stack || "",
        route: window.location.pathname,
        context,
        breadcrumbs,
      }),
    });
  } catch {
    // Error reporting should never break the primary UI path.
  }
}

async function api(path, options = {}) {
  addBreadcrumb("api.request", { path, method: options.method || "GET" });
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`);
    error.body = body;
    error.status = response.status;
    if (path !== "/api/client-errors") {
      reportClientError(error, {
        code: body?.error?.code || "CLIENT_NETWORK_ERROR",
        path,
        status: response.status,
        request: options.body ? safeJsonText(options.body) : null,
        response: body,
      });
    }
    throw error;
  }
  return body;
}

function safeJsonText(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(String(value));
}

function TaskIdPill({ value, className = "", label = "Task ID", compact = false }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      className={cx("task-id-pill", compact && "compact", copied && "copied", className)}
      type="button"
      title={copied ? "已复制" : "复制 Task ID"}
      onClick={(event) => {
        event.stopPropagation();
        copyText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span>{copied ? "已复制" : label}</span>
      <code>{value}</code>
      {copied ? <Check size={compact ? 13 : 15} /> : <Copy size={compact ? 13 : 15} />}
    </button>
  );
}

function ApiKeyHint() {
  return (
    <p className="api-key-hint">
      请通过 bobAPI 获取 API key，并选择包含 Seedance 模型的分组，例如：banana Pro 官转。
    </p>
  );
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function ProductLogo() {
  return (
    <span className="brand-mark logo-mark">
      <img src="/assets/continuous-video-logo.svg" alt="" aria-hidden="true" />
    </span>
  );
}

function cleanNode(node) {
  const data = { ...(node.data || {}) };
  delete data.actions;
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    data,
  };
}

function cleanEdge(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    animated: edge.animated,
    data: edge.data || {},
  };
}

function defaultShotData(overrides = {}) {
  return {
    title: "新镜头",
    prompt: "",
    negativePrompt: "",
    duration: 5,
    ratio: "16:9",
    resolution: "720p",
    model: defaultModel,
    referenceImageUrl: "",
    firstFrameUrl: "",
    lastFrameUrl: "",
    cameraMotion: "slow_push_in",
    motionStrength: "medium",
    seed: "",
    watermark: false,
    generateAudio: false,
    ...overrides,
  };
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function useMe() {
  const [state, setState] = useState({ loading: true, user: null, provider: null });
  const reload = useCallback(async () => {
    const result = await api("/api/me");
    setState({ loading: false, user: result.user, provider: result.provider });
    return result;
  }, []);

  useEffect(() => {
    reload().catch(() => setState({ loading: false, user: null, provider: null }));
  }, [reload]);

  return { ...state, reload };
}

function GlassNav({ user, onLogout }) {
  return (
    <header className="glass-nav">
      <Link className="brand" to="/">
        <ProductLogo />
        连续视频画布
      </Link>
      <nav>
        <a href="/#features">功能</a>
        <a href="/#workflow">流程</a>
        <a href="/#security">安全</a>
        {user && <Link to="/tasks">任务中心</Link>}
        {user && <Link to="/logs">错误日志</Link>}
        {user && <Link to="/profile">个人信息</Link>}
        {user?.isAdmin && <Link to="/admin/requests">管理后台</Link>}
      </nav>
      <div className="nav-actions">
        {user ? (
          <>
            {user.isAdmin && (
              <Link className="ghost-link" to="/admin/requests">
                管理后台
              </Link>
            )}
            <Link className="ghost-link" to="/app">
              专业画布
            </Link>
            <Link className="ghost-link" to="/profile">
              个人信息
            </Link>
            <Link className="ghost-link" to="/tasks">
              任务中心
            </Link>
            <Link className="primary-link" to="/make">
              立即制作
            </Link>
            <button className="icon-text ghost" type="button" onClick={onLogout}>
              <LogOut size={16} />
              退出
            </button>
          </>
        ) : (
          <>
            <Link className="ghost-link" to="/login">
              登录
            </Link>
            <Link className="primary-link" to="/make">
              立即制作
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

function HomePage({ me, reload }) {
  const navigate = useNavigate();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    await reload();
    navigate("/");
  }

  function enter() {
    if (!me.user) {
      navigate("/login?next=/make");
      return;
    }
    navigate(me.user.apiKey?.configured ? "/make" : "/onboarding?next=/make");
  }

  function enterCanvas() {
    if (!me.user) {
      navigate("/login?next=/app");
      return;
    }
    navigate(me.user.apiKey?.configured ? "/app" : "/onboarding?next=/app");
  }

  return (
    <main className="home-page">
      <GlassNav user={me.user} onLogout={logout} />
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">AI Continuous Video Studio</p>
          <h1>一句话开始，画布里精修</h1>
          <p>
            先像聊天一样生成视频，再把镜头、首尾帧和连续片段放进专业画布管理。
          </p>
          <div className="hero-actions">
            <button className="hero-primary" type="button" onClick={enter}>
              立即制作
              <ArrowRight size={18} />
            </button>
            <button className="hero-secondary" type="button" onClick={enterCanvas}>
              专业画布模式
            </button>
          </div>
        </div>
        <div className="hero-device">
          <img src="/assets/hero-canvas-workflow.png" alt="连续视频无限画布工作台预览" />
        </div>
      </section>

      <section className="mode-band">
        <div className="mode-entry-card chat">
          <span className="mode-badge">推荐</span>
          <MessageSquare size={30} />
          <h3>对话式生成</h3>
          <p>像即梦 Agent 一样输入一句话，系统帮你解析意图、补全参数、生成视频和续写下一段。</p>
          <button className="secondary-button" type="button" onClick={enter}>
            开始对话制作
          </button>
        </div>
        <div className="mode-entry-card canvas">
          <span className="mode-badge advanced">专业</span>
          <Network size={30} />
          <h3>专业画布模式</h3>
          <p>在无限画布里管理镜头、节点、参考图、首尾帧、结果视频和完整错误日志。</p>
          <button className="secondary-button" type="button" onClick={enterCanvas}>
            进入专业画布
          </button>
        </div>
      </section>

      <section id="features" className="feature-band">
        <div className="section-heading">
          <p className="eyebrow">Canvas First</p>
          <h2>把每一次生成都变成可追溯的镜头链</h2>
        </div>
        <div className="feature-grid">
          <Feature icon={<ChevronsRight />} title="连续续写" text="从已完成视频继续创建下一段，自动继承比例、模型、风格和上一段末帧。" />
          <Feature icon={<Frame />} title="首尾帧控制" text="用参考图、首帧、尾帧约束镜头起点和终点，让片段之间更连贯。" />
          <Feature icon={<Network />} title="无限画布" text="右键创建卡片、拖拽排列、多选整理、连线表达镜头关系。" />
          <Feature icon={<Lock />} title="后端保存" text="项目、参数、任务、错误和视频 URL 全部保存到 SQLite；API key 加密存储。" />
        </div>
      </section>

      <section id="workflow" className="workflow-band">
        <div className="workflow-card">
          {["注册登录", "配置 API key", "创建镜头卡", "生成视频", "续写下一段", "播放整条链"].map((item, index) => (
            <div className="workflow-step" key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="security-band">
        <div>
          <p className="eyebrow">Private by Design</p>
          <h2>只保存链接，不保存视频本体</h2>
          <p>
            站点固定调用 {providerBaseUrl}。用户的 API key 只在后端加密保存，视频结果只保存远端 URL，方便播放和追溯，也避免本地堆积大文件。
          </p>
        </div>
        <button className="hero-primary" type="button" onClick={enter}>
          开始创建
          <Sparkles size={18} />
        </button>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }) {
  return (
    <article className="feature-card">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function AuthShell({ mode, reload }) {
  const navigate = useNavigate();
  const nextPath = new URLSearchParams(window.location.search).get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      await reload();
      if (result.user?.isAdmin && result.user?.passwordResetRequired) {
        navigate("/admin/reset-password");
        return;
      }
      navigate(result.user?.apiKey?.configured ? nextPath || "/make" : `/onboarding${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" to="/">
        <ProductLogo />
        连续视频画布
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">{isRegister ? "Create account" : "Welcome back"}</p>
        <h1>{isRegister ? "注册新账号" : "登录工作台"}</h1>
        <label>
          邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
        </label>
        {isRegister && (
          <label>
            确认密码
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="full-primary" type="submit" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" />}
          {isRegister ? "注册并进入" : "登录"}
        </button>
        <p className="auth-switch">
          {isRegister ? "已有账号？" : "还没有账号？"}
          <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "去登录" : "去注册"}</Link>
        </p>
      </form>
    </main>
  );
}

function Onboarding({ me, reload }) {
  const navigate = useNavigate();
  const nextPath = new URLSearchParams(window.location.search).get("next");
  const [apiKey, setApiKey] = useState("");
  const [projectName, setProjectName] = useState("我的第一条连续视频");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [debug, setDebug] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!me.user) return <Navigate to="/login" replace />;

  async function saveKey(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setStatusTone("info");
    setDebug(null);
    try {
      await api("/api/me/api-key", { method: "PUT", body: JSON.stringify({ apiKey }) });
      await reload();
      setStatus("API key 已加密保存。");
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    setBusy(true);
    setStatus("正在提交测试请求...");
    setStatusTone("info");
    setDebug(null);
    try {
      const result = await api("/api/me/api-key/test", { method: "POST" });
      setStatus(result.upstreamTaskId ? `测试任务已提交：${result.upstreamTaskId}` : "接口连通。");
      setStatusTone("success");
      setDebug(result.debug || result);
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
      setDebug(error.body || { message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function createAndEnter() {
    setBusy(true);
    setStatus("正在创建本地画布...");
    setStatusTone("info");
    setDebug(null);
    try {
      const result = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName }),
      });
      const targetPath = nextPath && nextPath !== "/app" ? nextPath : `/app/projects/${result.project.id}`;
      navigate(targetPath);
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <p className="eyebrow">Setup</p>
        <h1>开始之前，先配置你的 API key</h1>
        <p className="muted">
          上游站点已固定为 {providerBaseUrl}。API key 会加密保存在后端，页面不会回显完整内容。
        </p>
        <ApiKeyHint />
        <form className="key-form" onSubmit={saveKey}>
          <label>
            API key
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              placeholder="sk-..."
              required
            />
          </label>
          <button className="full-primary" type="submit" disabled={busy}>
            保存 API key
          </button>
        </form>
        <div className="setup-row">
          <button className="secondary-button" type="button" disabled={!me.user.apiKey?.configured || busy} onClick={testKey}>
            测试接口
          </button>
          <span>{me.user.apiKey?.configured ? `已配置 ${me.user.apiKey.preview} · 测试会创建一个 Seedance 任务` : "尚未配置"}</span>
        </div>
        <label className="project-name-field">
          项目名称
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
        <button className="hero-primary" type="button" disabled={!me.user.apiKey?.configured || busy} onClick={createAndEnter}>
          进入无限画布
          <ArrowRight size={18} />
        </button>
        {status && <div className={cx("setup-status", statusTone)}>{status}</div>}
        {debug && <pre className="debug-pre">{JSON.stringify(debug, null, 2)}</pre>}
      </section>
    </main>
  );
}

function ProfilePage({ me, reload }) {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(true);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    const params = new URLSearchParams();
    if (taskQuery.trim()) params.set("q", taskQuery.trim());
    if (taskStatus) params.set("status", taskStatus);
    const result = await api(`/api/me/tasks?${params.toString()}`);
    setTasks(result.tasks || []);
    setLoadingTasks(false);
  }, [taskQuery, taskStatus]);

  useEffect(() => {
    loadTasks().catch((error) => {
      setStatus(error.message);
      setStatusTone("error");
      setLoadingTasks(false);
    });
  }, [loadTasks]);

  async function saveKey(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("正在保存新的 API key...");
    setStatusTone("info");
    try {
      await api("/api/me/api-key", { method: "PUT", body: JSON.stringify({ apiKey }) });
      setApiKey("");
      await reload();
      setStatus("API key 已更新。之后的新任务会使用新 key。");
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey() {
    setBusy(true);
    setStatus("正在删除 API key...");
    setStatusTone("info");
    try {
      await api("/api/me/api-key", { method: "DELETE" });
      await reload();
      setStatus("API key 已删除。生成前需要重新配置。");
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    setBusy(true);
    setStatus("正在提交测试请求...");
    setStatusTone("info");
    try {
      const result = await api("/api/me/api-key/test", { method: "POST" });
      setStatus(result.upstreamTaskId ? `测试任务已提交：${result.upstreamTaskId}` : "接口连通。");
      setStatusTone("success");
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    } finally {
      await loadTasks().catch(() => null);
      setBusy(false);
    }
  }

  async function refreshTask(taskId) {
    try {
      await api(`/api/tasks/${taskId}?force=1`);
      await loadTasks();
    } catch (error) {
      setStatus(error.message);
      setStatusTone("error");
    }
  }

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const runningCount = tasks.filter((task) => ["queued", "submitted", "in_progress"].includes(task.status)).length;

  return (
    <main className="profile-page">
      <header className="profile-topbar">
        <Link className="brand" to="/make">
          <ProductLogo />
          个人信息
        </Link>
        <div className="profile-actions">
          <button className="secondary-button" type="button" onClick={() => navigate("/make")}>
            返回制作
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/task-query")}>
            Task 查询
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/tasks")}>
            任务中心
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/app")}>
            专业画布
          </button>
        </div>
      </header>

      <section className="profile-hero">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{me.user.email}</h1>
          <p>管理 API key，查看历史生成记录和结果。这里是排查任务、复制结果和回到画布的入口。</p>
        </div>
        <div className="profile-stats">
          <span><strong>{tasks.length}</strong>历史任务</span>
          <span><strong>{completedCount}</strong>已完成</span>
          <span><strong>{runningCount}</strong>运行中</span>
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-panel">
          <div className="profile-panel-head">
            <div>
              <h2>API Key</h2>
              <p>当前状态：{me.user.apiKey?.configured ? `${me.user.apiKey.preview} · ${me.user.apiKey.updatedAt || "已保存"}` : "尚未配置"}</p>
            </div>
            <KeyRound size={22} />
          </div>
          <form className="profile-key-form" onSubmit={saveKey}>
            <label>
              新 API key
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="sk-..." />
            </label>
            <ApiKeyHint />
            <button className="full-primary" type="submit" disabled={busy || !apiKey.trim()}>
              保存 / 替换 API key
            </button>
          </form>
          <div className="profile-button-row">
            <button className="secondary-button" type="button" disabled={busy || !me.user.apiKey?.configured} onClick={testKey}>
              测试当前 key
            </button>
            <button className="secondary-button danger-lite" type="button" disabled={busy || !me.user.apiKey?.configured} onClick={deleteKey}>
              删除 key
            </button>
          </div>
          {status && <div className={cx("setup-status", statusTone)}>{status}</div>}
        </article>

        <article className="profile-panel history-panel">
          <div className="profile-panel-head">
            <div>
              <h2>历史生成记录</h2>
              <p>所有对话和画布生成任务都会汇总在这里。</p>
            </div>
            <Film size={22} />
          </div>
          <div className="history-filters">
            <div className="sidebar-search light">
              <Search size={15} />
              <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="搜索 task / 上游 task / URL" />
            </div>
            <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="queued">等待中</option>
              <option value="in_progress">生成中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
            <button className="secondary-button" type="button" onClick={loadTasks}>
              <RotateCcw size={15} />
              刷新
            </button>
          </div>
          <div className="profile-task-list">
            {loadingTasks && <p className="muted">加载中...</p>}
            {!loadingTasks && !tasks.length && <p className="muted">暂无生成任务。</p>}
            {tasks.map((task) => (
              <ProfileTaskCard key={task.id} task={task} onRefresh={refreshTask} />
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function ProfileTaskCard({ task, onRefresh }) {
  const done = task.status === "completed" && task.videoUrl;
  const running = ["queued", "submitted", "in_progress"].includes(task.status);
  return (
    <article className={cx("profile-task-card", task.status)}>
      <div className="profile-task-preview">
        {done ? (
          <video src={task.videoUrl} muted loop controls playsInline />
        ) : (
          <div>
            {running ? <Loader2 className="spin" size={24} /> : <Film size={24} />}
            <span>{taskStatusLabel(task.status)}</span>
          </div>
        )}
      </div>
      <div className="profile-task-body">
        <div className="profile-task-title">
          <strong>{task.projectName || "未命名项目"}</strong>
          <span>{taskStatusLabel(task.status)} · {task.progress ?? 0}%</span>
        </div>
        <TaskIdPill value={task.id} compact />
        <TaskIdPill value={task.upstreamTaskId} label="上游 Task" compact />
        <div className="profile-task-meta">
          <span>{task.createdAt}</span>
          {task.videoUrl && <button type="button" onClick={() => copyText(task.videoUrl)}>复制视频 URL</button>}
          <Link to={`/task-query?taskId=${encodeURIComponent(task.id)}`}>查看结果</Link>
          {running || task.status === "failed" ? <button type="button" onClick={() => onRefresh(task.id)}>重新拉取</button> : null}
        </div>
        {task.error?.message && <div className="profile-task-error">{task.error.message}</div>}
      </div>
    </article>
  );
}

const defaultTaskFilters = {
  q: "",
  status: "",
  source: "",
  projectId: "",
  createdFrom: "",
  createdTo: "",
  hasVideo: "",
  failedOnly: "",
};

function TaskCenterPage({ me }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState(defaultTaskFilters);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set("limit", "200");
    return params.toString();
  }, [filters]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const result = await api(`/api/tasks?${queryString}`);
    setTasks(result.tasks || []);
    setProjects(result.projects || []);
    setLoading(false);
    setSelectedIds((current) => {
      const visibleIds = new Set((result.tasks || []).map((task) => task.id));
      return new Set([...current].filter((idValue) => visibleIds.has(idValue)));
    });
  }, [queryString]);

  useEffect(() => {
    loadTasks().catch((error) => {
      setStatus(error.message);
      setLoading(false);
    });
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api(`/api/task-query/${encodeURIComponent(selectedTaskId)}`)
      .then((result) => setDetail(result))
      .catch((error) => setDetail({ error: error.body || { message: error.message } }))
      .finally(() => setDetailLoading(false));
  }, [selectedTaskId]);

  function patchFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function toggleSelected(taskId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (current.size === tasks.length) return new Set();
      return new Set(tasks.map((task) => task.id));
    });
  }

  async function refreshSelected(mode = "") {
    setBusy(true);
    setStatus("正在重新拉取任务状态...");
    try {
      const taskIds = [...selectedIds];
      const result = await api("/api/tasks/batch-refresh", {
        method: "POST",
        body: JSON.stringify(taskIds.length ? { taskIds } : { mode }),
      });
      setStatus(`已刷新 ${result.count || 0} 个任务。`);
      await loadTasks();
      if (selectedTaskId) {
        const detailResult = await api(`/api/task-query/${encodeURIComponent(selectedTaskId)}`);
        setDetail(detailResult);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshOne(taskId) {
    setBusy(true);
    setStatus("正在重新拉取任务状态...");
    try {
      const result = await api(`/api/tasks/${encodeURIComponent(taskId)}?force=1`);
      setTasks((current) => current.map((task) => (task.id === result.task.id ? { ...task, ...result.task } : task)));
      const detailResult = await api(`/api/task-query/${encodeURIComponent(result.task.id)}`);
      setDetail(detailResult);
      setStatus("任务状态已刷新。");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function copyCompletedUrls() {
    const ids = selectedIds.size ? selectedIds : new Set(tasks.map((task) => task.id));
    const urls = tasks
      .filter((task) => ids.has(task.id) && task.videoUrl)
      .map((task) => task.videoUrl);
    copyText(urls.join("\n"));
    setStatus(urls.length ? `已复制 ${urls.length} 个视频 URL。` : "当前选择里没有可复制的视频 URL。");
  }

  function exportCsv() {
    const params = new URLSearchParams(queryString);
    const link = document.createElement("a");
    link.href = `/api/tasks/export.csv?${params.toString()}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const selectedTask = detail?.task || tasks.find((task) => task.id === selectedTaskId);
  const hasSelection = selectedIds.size > 0;

  return (
    <main className="task-center-page">
      <header className="task-center-topbar">
        <Link className="brand" to="/make">
          <ProductLogo />
          任务中心
        </Link>
        <div className="task-center-actions">
          <span className="status-pill success">{me.user.email}</span>
          <button className="secondary-button" type="button" onClick={() => navigate("/task-query")}>
            <Search size={15} />
            单 Task 查询
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/make")}>
            返回制作
          </button>
        </div>
      </header>

      <section className="task-center-hero">
        <div>
          <p className="eyebrow">Task Center</p>
          <h1>所有生成任务和结果</h1>
          <p>用列表追踪每一次提交、上游 Task、失败原因和恢复动作。点击任意任务，右侧抽屉会显示完整结果。</p>
        </div>
        <div className="task-center-kpis">
          <span><strong>{tasks.length}</strong>当前列表</span>
          <span><strong>{tasks.filter((task) => task.status === "completed").length}</strong>已完成</span>
          <span><strong>{tasks.filter((task) => task.status === "failed").length}</strong>失败</span>
        </div>
      </section>

      <section className="task-center-layout">
        <div className="task-center-main">
          <div className="task-center-filters">
            <div className="sidebar-search light">
              <Search size={15} />
              <input value={filters.q} onChange={(event) => patchFilter("q", event.target.value)} placeholder="搜索 Task ID / 上游 Task / URL / 项目" />
            </div>
            <select value={filters.status} onChange={(event) => patchFilter("status", event.target.value)}>
              <option value="">全部状态</option>
              <option value="queued">等待中</option>
              <option value="submitted">已提交</option>
              <option value="in_progress">生成中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
              <option value="expired">已过期</option>
            </select>
            <select value={filters.source} onChange={(event) => patchFilter("source", event.target.value)}>
              <option value="">全部来源</option>
              <option value="chat">对话</option>
              <option value="canvas">画布</option>
              <option value="test">测试任务</option>
            </select>
            <select value={filters.projectId} onChange={(event) => patchFilter("projectId", event.target.value)}>
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <input type="date" value={filters.createdFrom} onChange={(event) => patchFilter("createdFrom", event.target.value)} />
            <input type="date" value={filters.createdTo} onChange={(event) => patchFilter("createdTo", event.target.value)} />
            <select value={filters.hasVideo} onChange={(event) => patchFilter("hasVideo", event.target.value)}>
              <option value="">视频结果不限</option>
              <option value="true">有视频结果</option>
              <option value="false">无视频结果</option>
            </select>
            <select value={filters.failedOnly} onChange={(event) => patchFilter("failedOnly", event.target.value)}>
              <option value="">失败不限</option>
              <option value="true">只看失败</option>
            </select>
          </div>

          <div className="task-center-toolbar">
            <button className="secondary-button" type="button" onClick={loadTasks} disabled={busy}>
              <RotateCcw size={15} />
              刷新列表
            </button>
            <button className="secondary-button" type="button" onClick={() => refreshSelected("recoverable")} disabled={busy}>
              批量重新拉取{hasSelection ? ` ${selectedIds.size}` : ""}
            </button>
            <button className="secondary-button" type="button" onClick={copyCompletedUrls}>
              <Copy size={15} />
              复制视频 URL
            </button>
            <button className="secondary-button" type="button" onClick={exportCsv}>
              <Download size={15} />
              导出 CSV
            </button>
            <button className="secondary-button" type="button" onClick={() => setFilters(defaultTaskFilters)}>
              重置筛选
            </button>
            {status && <span className="task-center-status">{status}</span>}
          </div>

          <div className="task-center-table">
            <div className="task-center-row head">
              <button type="button" onClick={toggleAllVisible}>{selectedIds.size === tasks.length && tasks.length ? "取消" : "全选"}</button>
              <span>任务</span>
              <span>来源 / 项目</span>
              <span>状态</span>
              <span>时间</span>
              <span>结果</span>
              <span>操作</span>
            </div>
            {loading && <p className="muted task-center-empty">加载中...</p>}
            {!loading && !tasks.length && <p className="muted task-center-empty">没有符合条件的任务。</p>}
            {tasks.map((task) => (
              <TaskCenterRow
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                checked={selectedIds.has(task.id)}
                onCheck={() => toggleSelected(task.id)}
                onOpen={() => setSelectedTaskId(task.id)}
                onRefresh={() => refreshOne(task.id)}
              />
            ))}
          </div>
        </div>

        <TaskCenterDrawer
          task={selectedTask}
          detail={detail}
          loading={detailLoading}
          busy={busy}
          onClose={() => setSelectedTaskId("")}
          onRefresh={refreshOne}
          onNavigate={navigate}
        />
      </section>
    </main>
  );
}

function TaskCenterRow({ task, selected, checked, onCheck, onOpen, onRefresh }) {
  const failed = task.status === "failed";
  const hasVideo = Boolean(task.videoUrl || task.resultUrl);
  return (
    <article
      className={cx("task-center-row", selected && "active", failed && "failed")}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="task-select" onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onCheck} />
      </span>
      <span className="task-cell ids">
        <TaskIdPill value={task.id} compact />
        <TaskIdPill value={task.upstreamTaskId} label="上游 Task" compact />
      </span>
      <span className="task-cell">
        <strong>{taskSourceLabel(task.source)}</strong>
        <small>{task.projectName || task.projectId}</small>
      </span>
      <span className="task-cell status">
        <i className={cx("dot", task.status)} />
        <strong>{taskStatusLabel(task.status)}</strong>
        <small>{task.progress ?? 0}%</small>
      </span>
      <span className="task-cell">
        <strong>{task.updatedAt || task.createdAt}</strong>
        <small>创建 {task.createdAt}</small>
      </span>
      <span className="task-cell result">
        {hasVideo ? (
          <strong>有结果</strong>
        ) : failed ? (
          <strong className="error-text">{task.error?.message || "失败"}</strong>
        ) : (
          <strong>等待结果</strong>
        )}
        <small>{task.videoUrl || task.resultUrl || "暂无 URL"}</small>
      </span>
      <span className="task-row-actions" onClick={(event) => event.stopPropagation()}>
        {hasVideo && <button type="button" onClick={() => copyText(task.videoUrl || task.resultUrl)}>复制 URL</button>}
        {["queued", "submitted", "in_progress", "failed"].includes(task.status) && <button type="button" onClick={onRefresh}>重新拉取</button>}
      </span>
    </article>
  );
}

function TaskCenterDrawer({ task, detail, loading, busy, onClose, onRefresh, onNavigate }) {
  if (!task) {
    return (
      <aside className="task-center-drawer empty">
        <Search size={24} />
        <strong>选择一个任务</strong>
        <span>右侧会展示视频、失败原因、上游 Task、请求日志和恢复动作。</span>
      </aside>
    );
  }
  const currentTask = detail?.task || task;
  const advice = taskRecoveryAdvice(currentTask);
  const hasVideo = Boolean(currentTask.videoUrl || currentTask.resultUrl);
  return (
    <aside className="task-center-drawer">
      <div className="drawer-title">
        <div>
          <strong>{taskStatusLabel(currentTask.status)}</strong>
          <span>{taskSourceLabel(currentTask.source)} · {currentTask.projectName || currentTask.projectId}</span>
        </div>
        <button className="tool-button" type="button" onClick={onClose}>
          <Check size={17} />
        </button>
      </div>
      {loading && <p className="muted">正在加载详情...</p>}
      {!loading && (
        <>
          <div className="drawer-video">
            {currentTask.videoUrl ? (
              <video src={currentTask.videoUrl} controls playsInline />
            ) : (
              <div>
                <Video size={26} />
                <span>{hasVideo ? "结果 URL 可复制，但暂无可播放视频" : "暂未拿到视频结果"}</span>
              </div>
            )}
          </div>
          <div className="drawer-id-stack">
            <TaskIdPill value={currentTask.id} />
            <TaskIdPill value={currentTask.upstreamTaskId} label="上游 Task" />
          </div>
          <div className={cx("recovery-card", advice.tone)}>
            <strong>{advice.title}</strong>
            <span>{advice.body}</span>
            <div>
              {advice.refresh && (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => onRefresh(currentTask.id)}>
                  <RotateCcw size={15} />
                  {advice.action}
                </button>
              )}
              {advice.href && (
                <button className="secondary-button" type="button" onClick={() => onNavigate(advice.href)}>
                  {advice.action}
                </button>
              )}
            </div>
          </div>
          <div className="drawer-actions-grid">
            <button className="secondary-button" type="button" onClick={() => onRefresh(currentTask.id)} disabled={busy}>
              <RotateCcw size={15} />
              重新拉取
            </button>
            <button className="secondary-button" type="button" disabled={!hasVideo} onClick={() => copyText(currentTask.videoUrl || currentTask.resultUrl || "")}>
              <Copy size={15} />
              复制结果 URL
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate(`/task-query?taskId=${encodeURIComponent(currentTask.id)}`)}>
              打开完整查询
            </button>
            <button className="secondary-button" type="button" disabled={!currentTask.projectId} onClick={() => onNavigate(`/app/projects/${currentTask.projectId}${currentTask.resultNodeId ? `?focus=${currentTask.resultNodeId}` : ""}`)}>
              打开关联画布
            </button>
          </div>
          <div className="drawer-meta-grid">
            <InspectorKV label="Project ID" value={currentTask.projectId} />
            <InspectorKV label="Source Node" value={currentTask.sourceNodeId} />
            <InspectorKV label="Result Node" value={currentTask.resultNodeId} />
            <InspectorKV label="创建时间" value={currentTask.createdAt} />
            <InspectorKV label="更新时间" value={currentTask.updatedAt} />
            <InspectorKV label="完成时间" value={currentTask.completedAt || "未完成"} />
          </div>
          {currentTask.error?.message && <div className="drawer-error"><AlertCircle size={18} />{currentTask.error.message}</div>}
          <div className="drawer-log-list">
            <h3>错误事件</h3>
            {(detail?.events || []).map((event) => (
              <div className="task-event-row error" key={event.eventId}>
                <strong>{event.code}</strong>
                <span>{event.message}</span>
                <small>{event.createdAt} · {event.requestId}</small>
              </div>
            ))}
            {!detail?.events?.length && <p className="muted">暂无错误事件。</p>}
          </div>
        </>
      )}
    </aside>
  );
}

function RequireReady({ me, children }) {
  if (!me.user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (me.user.passwordResetRequired) return <Navigate to="/admin/reset-password" replace />;
  if (!me.user.apiKey?.configured) return <Navigate to={`/onboarding?next=${encodeURIComponent(window.location.pathname)}`} replace />;
  return children;
}

function RequireUser({ me, children }) {
  if (!me.user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (me.user.passwordResetRequired) return <Navigate to="/admin/reset-password" replace />;
  return children;
}

function RequireAdmin({ me, children }) {
  if (!me.user) return <Navigate to="/admin/login" replace />;
  if (!me.user.isAdmin) return <Navigate to="/" replace />;
  if (me.user.passwordResetRequired) return <Navigate to="/admin/reset-password" replace />;
  return children;
}

function MakeHub({ me }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [recentErrors, setRecentErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/creation-sessions")
      .then((result) => {
        setSessions(result.sessions || []);
        setRecentErrors(result.recentErrors || []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function startChat() {
    addBreadcrumb("make.startChat");
    const result = await api("/api/creation-sessions", {
      method: "POST",
      body: JSON.stringify({ title: "新的对话制作" }),
    });
    navigate(`/make/chat/${result.session.id}`);
  }

  return (
    <main className="make-page">
      <header className="make-topbar">
        <Link className="brand" to="/">
          <ProductLogo />
          连续视频画布
        </Link>
        <div className="make-actions">
          <span className="status-pill success">API key {me.user.apiKey.preview}</span>
          <Link className="secondary-button" to="/profile">
            个人信息
          </Link>
          <Link className="secondary-button" to="/tasks">
            任务中心
          </Link>
          <Link className="secondary-button" to="/logs">
            错误日志
          </Link>
          {me.user.isAdmin && (
            <Link className="secondary-button" to="/admin/requests">
              管理后台
            </Link>
          )}
        </div>
      </header>
      <section className="make-hero">
        <p className="eyebrow">Make</p>
        <h1>今天想怎么制作？</h1>
        <p>快速出片用对话式，复杂镜头链用专业画布。</p>
      </section>
      <section className="make-mode-grid">
        <article className="make-mode-card recommended">
          <span className="mode-badge">推荐</span>
          <MessageSquare size={34} />
          <h2>对话式生成</h2>
          <p>输入一句自然语言，系统解析意图、补全比例/秒数/镜头运动，并生成视频。</p>
          <div className="fake-composer">做一个 5 秒的香水广告，黑色背景，镜头慢慢推进。</div>
          <button className="hero-primary" type="button" onClick={startChat}>
            开始对话制作
            <ArrowRight size={18} />
          </button>
        </article>
        <article className="make-mode-card professional">
          <span className="mode-badge advanced">专业</span>
          <Network size={34} />
          <h2>专业画布模式</h2>
          <p>使用无限画布管理镜头、首尾帧、参考图、连续视频链和完整任务日志。</p>
          <div className="node-preview">
            <span>Shot</span>
            <i />
            <span>Video</span>
            <i />
            <span>Next</span>
          </div>
          <button className="hero-primary" type="button" onClick={() => navigate("/app")}>
            进入专业画布
            <ArrowRight size={18} />
          </button>
        </article>
      </section>
      <section className="make-history-grid">
        <div className="make-panel">
          <h3>最近对话</h3>
          {loading && <p className="muted">加载中...</p>}
          {!loading && !sessions.length && <p className="muted">还没有对话，先从一个想法开始。</p>}
          {sessions.slice(0, 6).map((session) => (
            <button className="history-row" key={session.id} type="button" onClick={() => navigate(`/make/chat/${session.id}`)}>
              <span>{session.title}</span>
              <small>{session.taskCount || 0} 个任务</small>
            </button>
          ))}
        </div>
        <div className="make-panel">
          <h3>最近错误</h3>
          {!recentErrors.length && <p className="muted">暂无错误。所有失败都会在这里留下完整日志。</p>}
          {recentErrors.map((error) => (
            <button className="history-row error" key={error.eventId} type="button" onClick={() => navigate(`/logs?eventId=${error.eventId}`)}>
              <span>{error.code}</span>
              <small>{error.message}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ChatPage({ me }) {
  const navigate = useNavigate();
  const params = useParams();
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [plan, setPlan] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [inspectorTab, setInspectorTab] = useState("preview");
  const [debugModal, setDebugModal] = useState(null);

  useEffect(() => {
    api("/api/creation-sessions").then((result) => setSessions(result.sessions || []));
  }, []);

  useEffect(() => {
    async function ensureSession() {
      if (!params.sessionId) {
        const created = await api("/api/creation-sessions", {
          method: "POST",
          body: JSON.stringify({ title: "新的对话制作" }),
        });
        navigate(`/make/chat/${created.session.id}`, { replace: true });
        return;
      }
      const result = await api(`/api/creation-sessions/${params.sessionId}`);
      setSession(result.session);
      setMessages(result.messages || []);
      setPlan(planFromEnvelope(result.plan));
      setTasks(result.tasks || []);
      setSelectedTaskId(result.tasks?.slice().reverse().find((task) => task.videoUrl)?.id || result.tasks?.[result.tasks.length - 1]?.id || "");
    }
    ensureSession().catch((error) => setDebugModal(error.body || { message: error.message }));
  }, [params.sessionId, navigate]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const running = tasks.filter((task) => ["queued", "in_progress", "submitted"].includes(task.status));
      for (const task of running) {
        try {
          const result = await api(`/api/tasks/${task.id}`);
          setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, ...result.task } : item)));
        } catch (error) {
          reportClientError(error, { code: "TASK_POLL_FAILED", taskId: task.id, sessionId: session?.id });
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [tasks, session?.id]);

  async function sendPlan(promptText = text) {
    if (!promptText.trim()) return;
    setBusy(true);
    addBreadcrumb("chat.plan", { sessionId: session?.id });
    try {
      const result = await api(`/api/creation-sessions/${params.sessionId}/plan`, {
        method: "POST",
        body: JSON.stringify({ text: promptText }),
      });
      setText("");
      setPlan(planFromEnvelope({ id: result.planId, status: result.plan?.needsClarification ? "needs_clarification" : "ready", plan: result.plan }));
      const refreshed = await api(`/api/creation-sessions/${params.sessionId}`);
      setMessages(refreshed.messages || []);
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!plan) return;
    setBusy(true);
    addBreadcrumb("chat.generate", { sessionId: session?.id });
    try {
      const result = await api(`/api/creation-sessions/${params.sessionId}/generate`, {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      setTasks((current) => [...current, result.task]);
      setSelectedTaskId(result.task.id);
      setPlan((current) => (current ? { ...current, status: "submitted", submittedTaskId: result.task.id } : current));
      const refreshed = await api(`/api/creation-sessions/${params.sessionId}`);
      setMessages(refreshed.messages || []);
      setPlan(planFromEnvelope(refreshed.plan));
      setTasks(refreshed.tasks || []);
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    } finally {
      setBusy(false);
    }
  }

  function patchPlan(field, value) {
    setPlan((current) => (current ? { ...current, [field]: value } : current));
  }

  async function continueNext() {
    setBusy(true);
    try {
      const result = await api(`/api/creation-sessions/${params.sessionId}/continue`, {
        method: "POST",
        body: JSON.stringify({ text: "延续上一镜头，继续描述下一段动作..." }),
      });
      setPlan(planFromEnvelope({ id: result.planId, status: "ready", plan: result.plan }));
      const refreshed = await api(`/api/creation-sessions/${params.sessionId}`);
      setMessages(refreshed.messages || []);
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendToCanvas() {
    try {
      const result = await api(`/api/creation-sessions/${params.sessionId}/send-to-canvas`, { method: "POST" });
      navigate(result.url || "/app");
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    }
  }

  async function openTaskLogs(taskId) {
    if (!taskId) return;
    const result = await api(`/api/tasks/${taskId}/logs`);
    if (result.events?.[0]) {
      setDebugModal(result.events[0]);
      return;
    }
    setDebugModal(result);
  }

  async function refreshChatTask(taskId) {
    if (!taskId) return;
    try {
      const result = await api(`/api/tasks/${taskId}?force=1`);
      setTasks((current) => current.map((item) => (item.id === taskId ? { ...item, ...result.task } : item)));
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    }
  }

  const userMessages = messages.filter((message) => message.role === "user" && message.type === "text");
  const lastPrompt = userMessages[userMessages.length - 1]?.content?.text || "";
  const errorMessages = messages.filter((message) => message.type === "error");
  const filteredSessions = sessions.filter((item) => {
    const query = sessionQuery.trim().toLowerCase();
    return !query || item.title?.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
  });
  const filteredTasks = tasks.filter((task, index) => {
    const query = taskQuery.trim().toLowerCase();
    return (
      !query ||
      task.id?.toLowerCase().includes(query) ||
      task.upstreamTaskId?.toLowerCase().includes(query) ||
      task.videoUrl?.toLowerCase().includes(query) ||
      `clip ${index + 1}`.includes(query)
    );
  });
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks.slice().reverse().find((task) => task.videoUrl) || tasks[tasks.length - 1];
  const currentVideo = selectedTask?.videoUrl ? selectedTask : tasks.slice().reverse().find((task) => task.videoUrl);
  const pipelineStatus = busy ? "parsing" : tasks.some((task) => ["queued", "in_progress", "submitted"].includes(task.status)) ? "running" : tasks.some((task) => task.status === "completed") ? "completed" : plan ? "ready" : lastPrompt ? "planned" : "idle";
  const planActionable = plan && !["submitted", "locked", "running", "completed"].includes(plan.status) && !plan.submittedTaskId;
  const composerHasText = Boolean(text.trim());
  const composerDisabled = busy || !composerHasText;
  const composerLabel = busy ? "处理中" : "解析创意";
  const composerPlaceholder = planActionable
    ? "可以继续补充要求并重新解析；生成按钮已放在上方创意解析卡片里。"
    : "例如：做一个 5 秒香水广告，黑色背景，镜头慢慢推进，不要文字。";

  return (
    <main className="chat-shell">
      <aside className="chat-sidebar">
        <Link className="brand" to="/make">
          <ProductLogo />
          对话式生成
        </Link>
        <button className="full-primary" type="button" onClick={() => navigate("/make/chat")}>
          新建制作
        </button>
        <div className="sidebar-search">
          <Search size={15} />
          <input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="搜索会话 / task / prompt" />
        </div>
        <div className="session-list">
          {filteredSessions.map((item) => (
            <button className={cx("session-item", item.id === params.sessionId && "active")} key={item.id} type="button" onClick={() => navigate(`/make/chat/${item.id}`)}>
              <span>{item.title}</span>
              <small>{item.taskCount || 0} 个任务 · {item.messageCount || 0} 条记录</small>
            </button>
          ))}
        </div>
        <Link className="secondary-button" to="/logs">
          查看错误日志
        </Link>
      </aside>
      <section className="chat-main">
        <header className="chat-topbar">
          <div>
            <strong>{session?.title || "新的对话制作"}</strong>
            <span>{statusCopy(pipelineStatus)} · 自然语言生成，随时发送到专业画布</span>
          </div>
          <div className="chat-top-actions">
            <Link className="secondary-button" to="/task-query">
              <Search size={15} />
              Task 查询
            </Link>
            <Link className="secondary-button" to="/profile">
              个人信息
            </Link>
            <Link className="secondary-button" to="/tasks">
              任务中心
            </Link>
            <button className="secondary-button" type="button" onClick={sendToCanvas}>
              发送到画布
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate("/app")}>
              专业模式
            </button>
          </div>
        </header>
        <div className="chat-workspace">
          {!messages.length && !plan && !tasks.length ? (
            <ChatWelcome setText={setText} />
          ) : (
            <GenerationPipeline
              prompt={lastPrompt}
              plan={plan}
              tasks={tasks}
              busy={busy}
              onContinue={continueNext}
              onSelectTask={(taskId) => {
                setSelectedTaskId(taskId);
                setInspectorTab("preview");
              }}
              onOpenLogs={openTaskLogs}
              onRefreshTask={refreshChatTask}
              errors={errorMessages}
              onGenerate={generate}
              onPlanChange={patchPlan}
              canGenerate={Boolean(planActionable)}
              generating={busy && Boolean(planActionable)}
            />
          )}
        </div>
        <div className="chat-composer">
          <div className="chip-row">
            {["5秒", "16:9", "9:16", "慢慢推进", "固定镜头", "电影感", "不要文字"].map((chip) => (
              <button key={chip} type="button" onClick={() => setText((value) => `${value}${value ? "，" : ""}${chip}`)}>
                {chip}
              </button>
            ))}
          </div>
          <div className="composer-row">
            <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (text.trim()) sendPlan();
              }
            }} placeholder={composerPlaceholder} />
            <button className="hero-primary" type="button" disabled={composerDisabled} onClick={() => sendPlan()}>
              {composerLabel}
            </button>
          </div>
        </div>
      </section>
      <ResultInspector
        tab={inspectorTab}
        setTab={setInspectorTab}
        task={selectedTask}
        currentVideo={currentVideo}
        plan={plan}
        tasks={filteredTasks}
        taskQuery={taskQuery}
        setTaskQuery={setTaskQuery}
        onSelectTask={setSelectedTaskId}
        onContinue={continueNext}
        onOpenLogs={openTaskLogs}
      />
      {debugModal && (debugModal.eventId ? <ErrorLogModal event={debugModal} onClose={() => setDebugModal(null)} /> : <DebugModal detail={debugModal} onClose={() => setDebugModal(null)} />)}
    </main>
  );
}

function statusCopy(status) {
  const map = {
    idle: "等待输入",
    parsing: "正在解析创意",
    planned: "创意已记录",
    ready: "参数待确认",
    running: "任务运行中",
    completed: "已有完成视频",
  };
  return map[status] || status;
}

function planFromEnvelope(envelope) {
  if (!envelope) return null;
  const body = envelope.plan ? envelope.plan : envelope;
  return {
    ...body,
    id: envelope.id || envelope.planId || body.id || "",
    status: envelope.status || body.status || "ready",
    intent: envelope.intent || body.intent || "single_clip",
  };
}

function ChatWelcome({ setText }) {
  return (
    <div className="chat-empty pipeline-empty">
      <p className="eyebrow">Dream Agent</p>
      <h1>告诉我你想做什么视频</h1>
      <p>不用写专业提示词，我会帮你补全镜头、比例、时长和运动方式。</p>
      <div className="template-grid">
        {[
          ["产品广告", "帮我做一个香水产品广告，5秒，黑色背景，镜头慢慢推进，不要文字。"],
          ["角色短片", "做一个角色短片，女孩站在雨夜霓虹街道，电影感，5秒。"],
          ["风景空镜", "生成一个梦幻雪山日出空镜，镜头缓慢拉远，16:9。"],
          ["动态海报", "做一张动态海报视频，玻璃质感标题空间，不要真实文字。"],
          ["故事分镜", "做一个 15 秒三镜头故事，机器人在废墟中发现发光种子。"],
          ["口播背景", "生成一个干净高级的科技口播背景，轻微运动，9:16。"],
        ].map(([label, prompt]) => (
          <button key={label} type="button" onClick={() => setText(prompt)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerationPipeline({ prompt, plan, tasks, busy, onContinue, onSelectTask, onOpenLogs, onRefreshTask, errors, onGenerate, onPlanChange, canGenerate, generating }) {
  const submitted = ["submitted", "locked", "running", "completed"].includes(plan?.status) || Boolean(plan?.submittedTaskId);
  return (
    <section className="generation-pipeline">
      <PipelineStep index={1} title="输入创意" status={prompt ? "done" : "active"}>
        {prompt ? (
          <UserPromptCard prompt={prompt} />
        ) : (
          <p className="pipeline-hint">在底部输入框描述视频，系统会先解析创意，再提交生成。</p>
        )}
      </PipelineStep>

      <PipelineStep index={2} title="AI 解析" status={busy && !plan ? "active" : plan ? "done" : "idle"}>
        {busy && !plan && <ParsingCard />}
        {plan && (
          <GenerationConfirmCard
            value={plan}
            onChange={onPlanChange}
            onSubmit={onGenerate}
            canSubmit={canGenerate}
            submitting={generating}
            submitted={submitted}
            title="生成前参数确认"
            submitLabel="确认参数并生成"
          />
        )}
        {!busy && !plan && <p className="pipeline-hint">等待解析提示词。</p>}
      </PipelineStep>

      <PipelineStep index={3} title="制作进度" status={tasks.length ? "active" : "idle"}>
        {!tasks.length && <p className="pipeline-hint">确认参数后，任务会在这里展示从提交到完成的全过程。</p>}
        {tasks.map((task, index) => (
          <TaskChatCard
            key={task.id}
            task={task}
            index={index}
            onDebug={onOpenLogs}
            onRefresh={onRefreshTask}
            onContinue={onContinue}
            onSelect={() => onSelectTask(task.id)}
          />
        ))}
        {errors.map((message) => (
          <ErrorPipelineCard key={message.id} content={message.content || {}} onOpenLogs={onOpenLogs} />
        ))}
      </PipelineStep>

      {!!tasks.length && (
        <ContinuationStrip tasks={tasks} onSelect={onSelectTask} />
      )}
    </section>
  );
}

function PipelineStep({ index, title, status, children }) {
  return (
    <article className={cx("pipeline-step", status)}>
      <div className="pipeline-step-marker">
        <span>{index}</span>
        <i />
      </div>
      <div className="pipeline-step-body">
        <div className="pipeline-step-title">
          <strong>{title}</strong>
          <em>{status === "done" ? "已完成" : status === "active" ? "进行中" : "等待中"}</em>
        </div>
        {children}
      </div>
    </article>
  );
}

function UserPromptCard({ prompt }) {
  return (
    <section className="user-prompt-card">
      <span>用户提示词</span>
      <p>{prompt}</p>
    </section>
  );
}

function ParsingCard() {
  return (
    <section className="parsing-card">
      <Loader2 className="spin" size={22} />
      <div>
        <strong>正在理解你的创意...</strong>
        <ul>
          <li>提取主体和场景</li>
          <li>判断比例、时长和镜头运动</li>
          <li>补全模型友好的视频提示词</li>
        </ul>
      </div>
    </section>
  );
}

function GenerationConfirmCard({ value, onChange, onSubmit, canSubmit = true, submitting = false, submitted = false, title = "参数确认", submitLabel = "确认并提交生成" }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  if (!value) return null;
  const promptField = Object.prototype.hasOwnProperty.call(value, "modelPrompt") || value.displayPrompt ? "modelPrompt" : "prompt";
  const prompt = value[promptField] || value.prompt || value.displayPrompt || "";
  const patch = (field, nextValue) => onChange?.(field, nextValue);
  const readonly = submitted;
  function saveTemplate() {
    localStorage.setItem("last_generation_template", JSON.stringify(value));
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 1400);
  }

  return (
    <section className={cx("generation-confirm-card", readonly && "readonly")}>
      <div className="confirm-header">
        <div>
          <strong>{title}</strong>
          <span>{readonly ? "已提交，上游任务会继续追踪" : "确认这次会生成什么，再提交给上游"}</span>
        </div>
        <span className="status-pill">{value.model || defaultModel}</span>
      </div>
      <label>
        Prompt
        <textarea value={prompt} readOnly={readonly} onChange={(event) => patch(promptField, event.target.value)} />
      </label>
      <label>
        Negative Prompt
        <input value={value.negativePrompt || ""} readOnly={readonly} onChange={(event) => patch("negativePrompt", event.target.value)} placeholder="不想出现的元素" />
      </label>
      <div className="confirm-grid">
        <label>
          模型
          <input value={value.model || defaultModel} readOnly={readonly} onChange={(event) => patch("model", event.target.value)} />
        </label>
        <label>
          时长
          <select value={value.duration || 5} disabled={readonly} onChange={(event) => patch("duration", Number(event.target.value))}>
            {durationOptions.map((item) => <option key={item} value={item}>{item}s</option>)}
          </select>
        </label>
        <label>
          比例
          <select value={value.ratio || "16:9"} disabled={readonly} onChange={(event) => patch("ratio", event.target.value)}>
            {ratioOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          分辨率
          <select value={value.resolution || "720p"} disabled={readonly} onChange={(event) => patch("resolution", event.target.value)}>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </label>
        <label>
          镜头运动
          <select value={value.cameraMotion || "slow_push_in"} disabled={readonly} onChange={(event) => patch("cameraMotion", event.target.value)}>
            {motionOptions.map(([motionValue, label]) => <option key={motionValue} value={motionValue}>{label}</option>)}
          </select>
        </label>
        <label>
          运动强度
          <select value={value.motionStrength || "medium"} disabled={readonly} onChange={(event) => patch("motionStrength", event.target.value)}>
            {strengthOptions.map(([strengthValue, label]) => <option key={strengthValue} value={strengthValue}>{label}</option>)}
          </select>
        </label>
      </div>
      <button className="confirm-advanced-toggle" type="button" onClick={() => setAdvancedOpen((open) => !open)}>
        {advancedOpen ? "收起高级参数" : "展开高级参数"}
      </button>
      {advancedOpen && (
        <div className="confirm-advanced">
          <label>
            参考图 URL
            <input value={value.referenceImageUrl || ""} readOnly={readonly} onChange={(event) => patch("referenceImageUrl", event.target.value)} placeholder="https://..." />
          </label>
          <label>
            首帧 URL
            <input value={value.firstFrameUrl || ""} readOnly={readonly} onChange={(event) => patch("firstFrameUrl", event.target.value)} placeholder="https://..." />
          </label>
          <label>
            尾帧 URL
            <input value={value.lastFrameUrl || ""} readOnly={readonly} onChange={(event) => patch("lastFrameUrl", event.target.value)} placeholder="https://..." />
          </label>
          <label>
            Seed
            <input value={value.seed || ""} readOnly={readonly} onChange={(event) => patch("seed", event.target.value)} placeholder="可留空" />
          </label>
          <div className="confirm-toggles">
            <label>
              <input type="checkbox" checked={Boolean(value.generateAudio)} disabled={readonly} onChange={(event) => patch("generateAudio", event.target.checked)} />
              生成音频
            </label>
            <label>
              <input type="checkbox" checked={Boolean(value.watermark)} disabled={readonly} onChange={(event) => patch("watermark", event.target.checked)} />
              水印
            </label>
          </div>
        </div>
      )}
      <div className="confirm-actions">
        {readonly ? (
          <div className="readonly-status">
            <Lock size={15} />
            参数已提交，结果会在任务卡和任务中心持续更新。
          </div>
        ) : (
          <>
            <button className="secondary-button" type="button" onClick={saveTemplate}>
              {templateSaved ? "模板已保存" : "保存为模板"}
            </button>
            <button className="hero-primary glow-action" type="button" disabled={!canSubmit || submitting} onClick={onSubmit}>
              {submitting ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
              {submitting ? "正在提交生成" : submitLabel}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function PlanSummaryCard({ plan, onGenerate, canGenerate, generating }) {
  if (!plan) return null;
  const submitted = ["submitted", "locked", "running", "completed"].includes(plan.status) || Boolean(plan.submittedTaskId);
  return (
    <section className="plan-card plan-readonly">
      <div className="plan-header">
        <strong>创意解析</strong>
        <span>{submitted ? "已提交" : "待生成"} · {Math.round((plan.confidence || 0.8) * 100)}%</span>
      </div>
      <p>{plan.displayPrompt || plan.modelPrompt}</p>
      <div className="intent-summary-grid">
        <span>方式 <strong>{plan.mode || "text_to_video"}</strong></span>
        <span>秒数 <strong>{plan.duration || 5}s</strong></span>
        <span>比例 <strong>{plan.ratio || "16:9"}</strong></span>
        <span>模型 <strong>{plan.model || defaultModel}</strong></span>
      </div>
      <div className="readonly-status">
        {submitted ? <Lock size={15} /> : <WandSparkles size={15} />}
        {submitted ? "参数已提交给生成任务，当前模块切换为只读摘要。" : "解析结果已准备好，可以直接生成，也可以在底部继续补充要求重新解析。"}
      </div>
      {!submitted && (
        <div className="plan-actions">
          <button className="hero-primary glow-action" type="button" disabled={!canGenerate || generating} onClick={onGenerate}>
            {generating ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            {generating ? "正在提交生成" : "按这个解析生成"}
          </button>
        </div>
      )}
    </section>
  );
}

function TaskChatCard({ task, index, onDebug, onRefresh, onContinue, onSelect }) {
  const done = task.status === "completed" && task.videoUrl;
  const failed = task.status === "failed";
  const running = ["queued", "in_progress", "submitted"].includes(task.status);
  return (
    <div className={cx("task-chat-card", task.status)} onClick={onSelect}>
      <div className="task-card-head">
        <div>
          <strong>Clip {index + 1}</strong>
          <TaskIdPill value={task.id} compact />
          <TaskIdPill value={task.upstreamTaskId} label="上游 Task" compact />
        </div>
        <span>{taskStatusLabel(task.status)} · {task.progress ?? 0}%</span>
      </div>
      {done && <video src={task.videoUrl} autoPlay muted loop controls playsInline />}
      {!done && !failed && (
        <div className="task-waiting-box">
          <div className={cx("video-skeleton", running && "running")}>
            <Film size={28} />
          </div>
          <div className="progress-track"><span style={{ width: `${task.progress ?? 8}%` }} /></div>
          <p>{task.status === "queued" ? "上游已接收任务，正在等待制作资源。" : "正在渲染画面运动、镜头变化和视觉细节。"}</p>
        </div>
      )}
      {failed && (
        <div className="pipeline-error-card">
          <AlertCircle size={18} />
          <div>
            <strong>生成失败</strong>
            <span>{task.error?.message || "任务失败，完整信息可在日志中查看。"}</span>
          </div>
        </div>
      )}
      <div className="task-actions">
        {done && <button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); onContinue(); }}>续写下一段</button>}
        {failed && (
          <button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); onRefresh?.(task.id); }}>
            <RotateCcw size={15} />
            重新拉取
          </button>
        )}
        <button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); onDebug(task.id); }}>查看完整日志</button>
      </div>
    </div>
  );
}

function ErrorPipelineCard({ content, onOpenLogs }) {
  return (
    <section className="pipeline-error-card standalone">
      <AlertCircle size={20} />
      <div>
        <strong>{content.code || "生成失败"}</strong>
        <span>{content.message || "任务失败，完整错误已记录。"}</span>
        <small>requestId: {content.requestId || "无"} · eventId: {content.eventId || "无"}</small>
      </div>
      {content.taskId && (
        <button className="secondary-button" type="button" onClick={() => onOpenLogs(content.taskId)}>
          查看完整日志
        </button>
      )}
    </section>
  );
}

function ContinuationStrip({ tasks, onSelect }) {
  return (
    <footer className="continuation-strip">
      <div>
        <strong>连续视频链</strong>
        <span>{tasks.length} 个片段</span>
      </div>
      <div className="clip-flow">
        {tasks.map((task, index) => (
          <button className={cx("clip-node", task.status)} key={task.id} type="button" onClick={() => onSelect(task.id)}>
            Clip {index + 1}
          </button>
        ))}
      </div>
    </footer>
  );
}

function ResultInspector({ tab, setTab, task, currentVideo, plan, tasks, taskQuery, setTaskQuery, onSelectTask, onContinue, onOpenLogs }) {
  const tabs = [
    ["preview", "预览"],
    ["params", "参数"],
    ["logs", "日志"],
  ];
  return (
    <aside className="chat-inspector upgraded">
      <div className="inspector-tabs">
        {tabs.map(([value, label]) => (
          <button key={value} className={cx(tab === value && "active")} type="button" onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "preview" && (
        <section className="inspector-section">
          <h3>当前结果</h3>
          {currentVideo ? (
            <>
              <video src={currentVideo.videoUrl} autoPlay muted loop controls playsInline />
              <div className="task-trace">
                <span>{taskStatusLabel(currentVideo.status)}</span>
                <strong>{currentVideo.progress ?? 100}%</strong>
              </div>
              <input value={currentVideo.videoUrl || ""} readOnly />
              <button className="full-primary" type="button" onClick={onContinue}>
                续写下一段
              </button>
            </>
          ) : (
            <div className="empty-preview">
              <Film size={28} />
              <p>生成完成后，视频会在这里自动播放。</p>
            </div>
          )}
        </section>
      )}

      {tab === "params" && (
        <section className="inspector-section">
          <h3>参数摘要</h3>
          <InspectorKV label="提示词" value={plan?.displayPrompt || plan?.modelPrompt || "尚未解析"} />
          <InspectorKV label="秒数" value={`${plan?.duration || 5}s`} />
          <InspectorKV label="比例" value={plan?.ratio || "16:9"} />
          <InspectorKV label="模型" value={plan?.model || defaultModel} />
          <InspectorKV label="镜头" value={motionOptions.find(([value]) => value === plan?.cameraMotion)?.[1] || plan?.cameraMotion || "慢慢推进"} />
          <InspectorKV label="负向" value={plan?.negativePrompt || "无"} />
        </section>
      )}

      {tab === "logs" && (
        <section className="inspector-section">
          <h3>任务查询</h3>
          <div className="sidebar-search task-search">
            <Search size={15} />
            <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="搜索 taskId / URL / Clip" />
          </div>
          <div className="task-list">
            {tasks.map((item, index) => (
              <button className={cx("task-row", item.id === task?.id && "active")} key={item.id} type="button" onClick={() => onSelectTask(item.id)}>
                <span>Clip {index + 1}</span>
                <small>{taskStatusLabel(item.status)} · {item.progress ?? 0}%</small>
                <code>{item.id}</code>
              </button>
            ))}
          </div>
          {task && (
            <div className="task-trace-panel">
              <TaskIdPill value={task.id} />
              <InspectorKV label="上游任务" value={task.upstreamTaskId || "等待提交"} />
              <InspectorKV label="状态" value={taskStatusLabel(task.status)} />
              <button className="secondary-button" type="button" onClick={() => onOpenLogs(task.id)}>
                打开完整日志
              </button>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

function InspectorKV({ label, value }) {
  return (
    <div className="inspector-kv">
      <span>{label}</span>
      <strong>{value || "null"}</strong>
    </div>
  );
}

function LogsPage({ me }) {
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState({ severity: "", source: "", code: "" });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const result = await api(`/api/error-events?${params.toString()}`);
    setEvents(result.events || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load().catch((error) => setSelected(error.body || { message: error.message }));
  }, [load]);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("eventId");
    if (eventId) openEvent(eventId);
  }, []);

  async function openEvent(eventId) {
    const result = await api(`/api/error-events/${eventId}`);
    setSelected(result.event);
  }

  return (
    <main className="logs-page">
      <header className="logs-header">
        <div>
          <p className="eyebrow">Error Center</p>
          <h1>完整错误日志</h1>
          <p>列表只显示摘要；详情和下载保留完整请求、响应、rawText、stack 和上下文。</p>
        </div>
        <div className="logs-actions">
          <button className="secondary-button" type="button" onClick={() => navigate("/make")}>
            返回制作
          </button>
          <button className="secondary-button" type="button" onClick={load}>
            刷新
          </button>
        </div>
      </header>
      <section className="log-filters">
        <input placeholder="错误码" value={filters.code} onChange={(event) => setFilters({ ...filters, code: event.target.value })} />
        <select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}>
          <option value="">全部级别</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
          <option value="fatal">fatal</option>
        </select>
        <select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
          <option value="">全部来源</option>
          <option value="frontend">frontend</option>
          <option value="backend">backend</option>
          <option value="provider">provider</option>
          <option value="planner">planner</option>
          <option value="task_polling">task_polling</option>
        </select>
      </section>
      <section className="logs-table">
        <div className="logs-row head">
          <span>时间</span>
          <span>级别</span>
          <span>错误码</span>
          <span>信息</span>
          <span>路由</span>
          <span>Request</span>
        </div>
        {loading && <p className="muted">加载中...</p>}
        {!loading && !events.length && <p className="muted">暂无错误日志。</p>}
        {events.map((event) => (
          <button className="logs-row" key={event.eventId} type="button" onClick={() => openEvent(event.eventId)}>
            <span>{event.createdAt}</span>
            <span className={cx("severity", event.severity)}>{event.severity}</span>
            <span>{event.code}</span>
            <span>{event.message}</span>
            <span>{event.route}</span>
            <span>{event.requestId}</span>
          </button>
        ))}
      </section>
      {selected && <ErrorLogModal event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function TaskQueryPage({ me }) {
  const navigate = useNavigate();
  const initialTaskId = new URLSearchParams(window.location.search).get("taskId") || "";
  const [taskId, setTaskId] = useState(initialTaskId);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  const query = useCallback(async (event, explicitTaskId = taskId) => {
    event?.preventDefault?.();
    const value = String(explicitTaskId || "").trim();
    if (!value) return;
    setBusy(true);
    setLastQuery(value);
    try {
      const result = await api(`/api/task-query/${encodeURIComponent(value)}`);
      setDetail(result);
      window.history.replaceState(null, "", `/task-query?taskId=${encodeURIComponent(value)}`);
    } catch (error) {
      setDetail({ error: error.body || { message: error.message } });
    } finally {
      setBusy(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (initialTaskId) query(null, initialTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="task-query-page">
      <header className="task-query-topbar">
        <Link className="brand" to="/make">
          <ProductLogo />
          Task 查询
        </Link>
        <div className="task-query-actions">
          <span className="status-pill success">{me.user.email}</span>
          <button className="secondary-button" type="button" onClick={() => navigate("/make")}>
            返回制作
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/tasks")}>
            任务中心
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/app")}>
            专业画布
          </button>
        </div>
      </header>

      <section className="task-query-hero">
        <div>
          <p className="eyebrow">Task Lookup</p>
          <h1>用 Task ID 查询生成结果</h1>
          <p>输入本地 Task ID 或上游 Task ID。查询会刷新一次上游状态，并把视频、进度、错误和请求轨迹集中展示。</p>
        </div>
        <form className="task-query-form" onSubmit={query}>
          <label>
            Task ID
            <input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="task_... 或上游 task id" autoFocus />
          </label>
          <button className="hero-primary" type="submit" disabled={busy || !taskId.trim()}>
            {busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
            {busy ? "正在查询" : "查询生成结果"}
          </button>
        </form>
      </section>

      {!detail && (
        <section className="task-query-empty">
          <Search size={28} />
          <strong>等待输入 Task ID</strong>
          <span>查询后会在这里显示视频结果、任务状态、错误事件和轻量请求日志。</span>
        </section>
      )}

      {detail?.error && (
        <section className="task-query-error">
          <AlertCircle size={22} />
          <div>
            <strong>没有查到这个任务</strong>
            <span>{detail.error?.error?.message || detail.error?.message || "请确认 Task ID 是否属于当前账号。"}</span>
            {lastQuery && <code>{lastQuery}</code>}
          </div>
        </section>
      )}

      {detail?.task && <TaskQueryResult detail={detail} onRefresh={(id) => query(null, id)} />}
    </main>
  );
}

function TaskQueryResult({ detail, onRefresh }) {
  const task = detail.task;
  const hasResultUrl = Boolean(task.videoUrl || task.resultUrl);
  return (
    <section className="task-query-result">
      <div className="task-result-main">
        <div className="task-result-video">
          {task.videoUrl ? (
            <video src={task.videoUrl} controls playsInline />
          ) : (
            <div className="task-result-placeholder">
              <Video size={30} />
              <span>{task.status === "completed" ? "任务完成但没有返回视频 URL" : "暂未拿到视频结果"}</span>
            </div>
          )}
        </div>
        <div className="task-result-summary">
          <div className="task-result-status">
            <span className={cx("dot", task.status)} />
            <div>
              <strong>{taskStatusLabel(task.status)}</strong>
              <small>{task.progress ?? 0}% · 更新于 {task.updatedAt || "未知"}</small>
            </div>
          </div>
          <div className="progress-track task-result-progress">
            <span style={{ width: `${task.progress ?? 0}%` }} />
          </div>
          <div className="task-result-id-grid">
            <TaskIdPill value={task.id} />
            <TaskIdPill value={task.upstreamTaskId} label="上游 Task" />
          </div>
          <div className="task-result-buttons">
            <button className="secondary-button" type="button" onClick={() => onRefresh?.(task.id)}>
              <RotateCcw size={15} />
              重新刷新
            </button>
            <button className="secondary-button" type="button" disabled={!hasResultUrl} onClick={() => copyText(task.videoUrl || task.resultUrl || "")}>
              <Copy size={15} />
              复制结果 URL
            </button>
          </div>
          {task.error?.message && (
            <div className="task-query-error inline">
              <AlertCircle size={18} />
              <span>{task.error.message}</span>
            </div>
          )}
        </div>
      </div>

      <div className="task-result-details">
        <section>
          <h2>任务信息</h2>
          <div className="task-info-grid">
            <InspectorKV label="Project ID" value={task.projectId} />
            <InspectorKV label="Source Node" value={task.sourceNodeId} />
            <InspectorKV label="Result Node" value={task.resultNodeId} />
            <InspectorKV label="Last Frame Asset" value={task.lastFrameAssetId || "无"} />
            <InspectorKV label="创建时间" value={task.createdAt} />
            <InspectorKV label="完成时间" value={task.completedAt || "未完成"} />
          </div>
        </section>

        <section>
          <h2>结果 URL</h2>
          <div className="url-copy-list">
            <button type="button" disabled={!task.videoUrl} onClick={() => copyText(task.videoUrl)}>
              <span>Video URL</span>
              <code>{task.videoUrl || "暂无"}</code>
              <Copy size={15} />
            </button>
            <button type="button" disabled={!task.resultUrl} onClick={() => copyText(task.resultUrl)}>
              <span>Result URL</span>
              <code>{task.resultUrl || "暂无"}</code>
              <Copy size={15} />
            </button>
          </div>
        </section>

        <section>
          <h2>错误事件</h2>
          <div className="task-event-list">
            {(detail.events || []).map((event) => (
              <div className="task-event-row error" key={event.eventId}>
                <strong>{event.code}</strong>
                <span>{event.message}</span>
                <small>{event.createdAt} · {event.requestId}</small>
              </div>
            ))}
            {!detail.events?.length && <p className="muted">暂无错误事件。</p>}
          </div>
        </section>

        <section>
          <h2>请求轨迹</h2>
          <div className="task-event-list">
            {(detail.logs || []).map((log) => (
              <div className={cx("task-event-row", log.hasError && "error")} key={log.id}>
                <strong>{log.action}</strong>
                <span>{log.message || taskStatusLabel(log.status)}</span>
                <small>{log.createdAt} · {log.requestId}</small>
              </div>
            ))}
            {!detail.logs?.length && <p className="muted">暂无轻量请求日志。</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function AdminLogin({ reload }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await reload();
      navigate(result.resetRequired ? "/admin/reset-password" : "/admin/requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page admin-auth-page">
      <Link className="brand auth-brand" to="/">
        <ProductLogo />
        连续视频画布
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">Admin</p>
        <h1>管理员登录</h1>
        <label>
          管理员邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="full-primary" type="submit" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" />}
          进入管理后台
        </button>
        <p className="auth-switch">
          普通账号
          <Link to="/login">去工作台登录</Link>
        </p>
      </form>
    </main>
  );
}

function AdminPasswordReset({ me, reload }) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me.user) return <Navigate to="/admin/login" replace />;
  if (!me.user.isAdmin) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      await reload();
      navigate("/admin/requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page admin-auth-page">
      <Link className="brand auth-brand" to="/">
        <ProductLogo />
        连续视频画布
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">First Login</p>
        <h1>重置管理员密码</h1>
        <label>
          当前密码
          <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required />
        </label>
        <label>
          新密码
          <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={10} required />
        </label>
        <label>
          确认新密码
          <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={10} required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="full-primary" type="submit" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" />}
          保存新密码
        </button>
      </form>
    </main>
  );
}

function AdminShell({ me, title, subtitle, children }) {
  const navigate = useNavigate();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    navigate("/admin/login");
  }
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="admin-actions">
          <span className="status-pill success">{me.user.email}</span>
          <Link className="secondary-button" to="/admin/requests">
            请求日志
          </Link>
          <Link className="secondary-button" to="/admin/task-query">
            Task 查询
          </Link>
          <button className="secondary-button" type="button" onClick={logout}>
            <LogOut size={15} />
            退出
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

function AdminRequestsPage({ me }) {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ taskId: "", requestId: "", nodeId: "", hasError: "" });
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null);
  const [queryingTaskId, setQueryingTaskId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""));
    const result = await api(`/api/admin/request-logs?${params.toString()}`);
    setLogs(result.logs || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load().catch((error) => setDrawer({ error: error.body || { message: error.message } }));
  }, [load]);

  async function queryTask(taskId) {
    if (!taskId) return;
    setQueryingTaskId(taskId);
    try {
      const result = await api(`/api/admin/tasks/${encodeURIComponent(taskId)}?refresh=1`);
      setDrawer(result);
    } catch (error) {
      setDrawer({ error: error.body || { message: error.message } });
    } finally {
      setQueryingTaskId("");
    }
  }

  return (
    <AdminShell me={me} title="所有请求日志" subtitle="只展示 ID、状态和错误摘要；Task 查询结果在右侧抽屉打开。">
      <section className="admin-filters">
        <label>
          Task ID
          <input value={filters.taskId} onChange={(event) => setFilters({ ...filters, taskId: event.target.value })} placeholder="task_ 或上游 task id" />
        </label>
        <label>
          Request ID
          <input value={filters.requestId} onChange={(event) => setFilters({ ...filters, requestId: event.target.value })} placeholder="req_" />
        </label>
        <label>
          Node ID
          <input value={filters.nodeId} onChange={(event) => setFilters({ ...filters, nodeId: event.target.value })} placeholder="render_ / shot_" />
        </label>
        <label>
          错误
          <select value={filters.hasError} onChange={(event) => setFilters({ ...filters, hasError: event.target.value })}>
            <option value="">全部</option>
            <option value="1">只看错误</option>
            <option value="0">只看正常</option>
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={load}>
          <RotateCcw size={15} />
          刷新
        </button>
      </section>
      <section className="admin-table">
        <div className="admin-row head">
          <span>时间</span>
          <span>用户</span>
          <span>Action</span>
          <span>Task ID</span>
          <span>Provider Task</span>
          <span>状态</span>
          <span>Message</span>
          <span>查询</span>
        </div>
        {loading && <p className="muted admin-empty">加载中...</p>}
        {!loading && !logs.length && <p className="muted admin-empty">暂无请求日志。</p>}
        {logs.map((log) => (
          <div className={cx("admin-row", log.hasError && "error")} key={log.id}>
            <span>{log.createdAt}</span>
            <span>{log.userEmail || log.userId || "unknown"}</span>
            <span>{log.action}</span>
            <button className="text-copy" type="button" onClick={() => copyText(log.taskId)}>
              {log.taskId || "-"}
            </button>
            <button className="text-copy" type="button" onClick={() => copyText(log.providerTaskId)}>
              {log.providerTaskId || "-"}
            </button>
            <span>{taskStatusLabel(log.taskStatus || log.status)}</span>
            <span>{log.message || (log.hasError ? "error" : "ok")}</span>
            <button className="secondary-button compact" type="button" disabled={!log.taskId || queryingTaskId === log.taskId} onClick={() => queryTask(log.taskId)}>
              {queryingTaskId === log.taskId ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
              结果
            </button>
          </div>
        ))}
      </section>
      {drawer && <TaskResultDrawer detail={drawer} onClose={() => setDrawer(null)} onRefresh={(taskId) => queryTask(taskId)} />}
    </AdminShell>
  );
}

function AdminTaskQueryPage({ me }) {
  const [taskId, setTaskId] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [busy, setBusy] = useState(false);

  async function query(event) {
    if (event?.preventDefault) event.preventDefault();
    if (!taskId.trim()) return;
    setBusy(true);
    try {
      const result = await api(`/api/admin/tasks/${encodeURIComponent(taskId.trim())}?refresh=1`);
      setDrawer(result);
    } catch (error) {
      setDrawer({ error: error.body || { message: error.message } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell me={me} title="Task ID 结果查询" subtitle="输入本地 Task ID 或上游 Task ID，后台会调用接口刷新一次生成结果。">
      <form className="admin-query-card" onSubmit={query}>
        <label>
          Task ID
          <input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="task_..." />
        </label>
        <button className="hero-primary" type="submit" disabled={busy || !taskId.trim()}>
          {busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          查询生成结果
        </button>
      </form>
      {drawer && <TaskResultDrawer detail={drawer} onClose={() => setDrawer(null)} onRefresh={() => query()} />}
    </AdminShell>
  );
}

function TaskResultDrawer({ detail, onClose, onRefresh }) {
  const task = detail?.task;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="task-result-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <strong>{task ? taskStatusLabel(task.status) : "查询结果"}</strong>
            <span>{task?.id || detail?.error?.error?.requestId || "无 Task"}</span>
          </div>
          <button className="tool-button" type="button" onClick={onClose}>
            <Check size={17} />
          </button>
        </div>
        {detail?.error ? (
          <div className="drawer-error">{detail.error?.error?.message || detail.error?.message || "查询失败"}</div>
        ) : (
          <>
            {task?.videoUrl && <video className="drawer-video" src={task.videoUrl} controls playsInline />}
            <div className="drawer-grid">
              <TaskIdPill value={task?.id} className="drawer-task-id" />
              <TaskIdPill value={task?.upstreamTaskId} label="上游 Task" className="drawer-task-id" />
              <InspectorKV label="用户" value={task?.userEmail || task?.userId} />
              <InspectorKV label="项目" value={task?.projectId} />
              <InspectorKV label="结果节点" value={task?.resultNodeId} />
              <InspectorKV label="进度" value={`${task?.progress ?? 0}%`} />
            </div>
            <div className="drawer-actions">
              <button className="secondary-button" type="button" onClick={() => copyText(task?.id)}>
                <Copy size={15} />
                复制 Task ID
              </button>
              <button className="secondary-button" type="button" onClick={() => copyText(task?.videoUrl || task?.resultUrl || "")} disabled={!task?.videoUrl && !task?.resultUrl}>
                <Copy size={15} />
                复制结果 URL
              </button>
              <button className="secondary-button" type="button" onClick={() => onRefresh?.(task?.id)} disabled={!task?.id}>
                <RotateCcw size={15} />
                重新查询
              </button>
            </div>
            <section className="drawer-section">
              <h3>请求日志</h3>
              {(detail.logs || []).map((log) => (
                <div className="drawer-log-row" key={log.id}>
                  <span>{log.createdAt}</span>
                  <strong>{log.action}</strong>
                  <small>{log.message || log.status}</small>
                </div>
              ))}
              {!detail.logs?.length && <p className="muted">暂无轻量请求日志。</p>}
            </section>
            <section className="drawer-section">
              <h3>错误事件</h3>
              {(detail.events || []).map((event) => (
                <div className="drawer-log-row error" key={event.eventId}>
                  <span>{event.createdAt}</span>
                  <strong>{event.code}</strong>
                  <small>{event.message}</small>
                </div>
              ))}
              {!detail.events?.length && <p className="muted">暂无错误事件。</p>}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function ErrorLogModal({ event, onClose }) {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const tabs = [
    ["overview", "概览"],
    ["request", "本地请求"],
    ["response", "本地响应"],
    ["providerRequest", "上游请求"],
    ["providerResponse", "上游响应"],
    ["providerRawText", "rawText"],
    ["stack", "Stack"],
    ["breadcrumbs", "Breadcrumbs"],
    ["context", "上下文 JSON"],
  ];
  const payload = tab === "overview" ? event : event?.[tab] ?? null;
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const filtered = search ? rendered.split("\n").filter((line) => line.toLowerCase().includes(search.toLowerCase())).join("\n") || "未找到匹配内容" : rendered;
  const fullText = JSON.stringify(event, null, 2);

  function copy(value) {
    navigator.clipboard?.writeText(value);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="error-log-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <strong>{event.code || "完整错误日志"}</strong>
            <span>{event.eventId} · {event.requestId}</span>
          </div>
          <button className="tool-button" type="button" onClick={onClose}>
            <Check size={17} />
          </button>
        </div>
        <div className="log-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索完整内容" />
          <button className="secondary-button" type="button" onClick={() => copy(fullText)}>复制完整日志</button>
          <a className="secondary-button" href={`/api/error-events/${event.eventId}/download`} target="_blank" rel="noreferrer">
            <Download size={15} />
            下载完整 JSON
          </a>
          <button className="secondary-button" type="button" onClick={() => copy(event.requestId || "")}>复制 requestId</button>
          <button className="secondary-button" type="button" onClick={() => copy(event.eventId || "")}>复制 eventId</button>
        </div>
        <div className="log-tabs">
          {tabs.map(([value, label]) => (
            <button className={cx(tab === value && "active")} key={value} type="button" onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </div>
        <pre className="full-log-content">{filtered || "null"}</pre>
      </section>
    </div>
  );
}

function StudioGate({ me }) {
  const params = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me.user) return;
    api("/api/projects")
      .then((result) => {
        setProjects(result.projects || []);
        if (!params.projectId && result.projects?.[0]) {
          navigate(`/app/projects/${result.projects[0].id}`, { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [me.user, navigate, params.projectId]);

  if (!me.user) return <Navigate to="/login" replace />;
  if (me.user.passwordResetRequired) return <Navigate to="/admin/reset-password" replace />;
  if (!me.user.apiKey?.configured) return <Navigate to="/onboarding" replace />;
  if (loading || !params.projectId) return <LoadingScreen />;
  return <Studio me={me} projects={projects} projectId={params.projectId} />;
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Loader2 className="spin" />
      <span>正在进入画布...</span>
    </main>
  );
}

function ShotNode({ id, data, selected }) {
  const actions = data.actions || {};
  const patch = (field, value) => actions.patchNode?.(id, { [field]: value });
  const submitting = data.status === "submitting";
  return (
    <article className={cx("canvas-node shot-node", selected && "selected")}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header">
        <span className="node-icon">
          <Clapperboard size={16} />
        </span>
        <input className="node-title nodrag" value={data.title || ""} onChange={(event) => patch("title", event.target.value)} />
      </div>
      {data.frameLockNotice && <div className="node-warning">{data.frameLockNotice}</div>}
      <textarea
        className="prompt-box nodrag"
        value={data.prompt || ""}
        onChange={(event) => patch("prompt", event.target.value)}
        placeholder="描述这个镜头里发生什么..."
      />
      <div className="compact-grid">
        <label className="nodrag">
          秒数
          <select value={data.duration || 5} onChange={(event) => patch("duration", Number(event.target.value))}>
            {durationOptions.map((item) => (
              <option key={item} value={item}>
                {item}s
              </option>
            ))}
          </select>
        </label>
        <label className="nodrag">
          比例
          <select value={data.ratio || "16:9"} onChange={(event) => patch("ratio", event.target.value)}>
            {ratioOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mini-field nodrag">
        首帧 / 参考图 URL
        <input
          value={data.firstFrameUrl || data.referenceImageUrl || ""}
          onChange={(event) => patch("firstFrameUrl", event.target.value)}
          placeholder="https://..."
        />
      </label>
      <div className="node-actions">
        <button className="node-primary nodrag" type="button" disabled={submitting} onClick={() => actions.generate?.(id)}>
          {submitting ? <Loader2 className="spin" size={15} /> : <WandSparkles size={15} />}
          {submitting ? "提交中" : "生成"}
        </button>
        <button className="node-ghost nodrag" type="button" onClick={() => actions.duplicate?.(id)}>
          <Copy size={15} />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

function RenderNode({ id, data, selected }) {
  const actions = data.actions || {};
  const status = data.status || "queued";
  const done = status === "completed" && data.videoUrl;
  const failed = status === "failed";
  return (
    <article className={cx("canvas-node render-node", selected && "selected", `status-${status}`)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header">
        <span className="node-icon">
          <Video size={16} />
        </span>
        <strong>{data.title || "视频结果"}</strong>
      </div>
      <TaskIdPill value={data.taskId} compact className="node-task-id nodrag" />
      <TaskIdPill value={data.upstreamTaskId} label="上游 Task" compact className="node-task-id nodrag" />
      {!done && !failed && (
        <div className="render-progress">
          <div className="shimmer-frame">
            <Loader2 className="spin" />
          </div>
          <div className="progress-meta">
            <span>{status === "queued" ? "等待中" : "生成中"}</span>
            <span>{data.progress ?? 0}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${data.progress ?? 8}%` }} />
          </div>
        </div>
      )}
      {done && (
        <video className="node-video nodrag" src={data.videoUrl} muted autoPlay loop playsInline controls />
      )}
      {failed && (
        <div className="node-error">
          <AlertCircle size={18} />
          <span>{data.errorCode ? `${data.errorCode} · ` : ""}{data.error || "生成失败"}</span>
        </div>
      )}
      <div className="render-actions">
        {done && (
          <button className="node-primary nodrag" type="button" onClick={() => actions.continueFrom?.(id)}>
            <ChevronsRight size={15} />
            续写下一段
          </button>
        )}
        {failed && data.taskId && (
          <button className="node-ghost nodrag" type="button" onClick={() => actions.refreshTask?.(data.taskId)}>
            <RotateCcw size={15} />
            重新拉取
          </button>
        )}
        <button className="node-ghost nodrag" type="button" onClick={() => actions.showDebug?.(data.taskId, data.eventId)}>
          完整日志
        </button>
        {data.taskId && (
          <button className="node-ghost nodrag" type="button" onClick={() => { window.location.href = `/task-query?taskId=${encodeURIComponent(data.taskId)}`; }}>
            Task 查询
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

function NoteNode({ id, data, selected }) {
  const patch = (field, value) => data.actions?.patchNode?.(id, { [field]: value });
  return (
    <article className={cx("canvas-node note-node", selected && "selected")}>
      <textarea className="note-title nodrag" value={data.title || ""} onChange={(event) => patch("title", event.target.value)} />
      <textarea className="note-body nodrag" value={data.body || ""} onChange={(event) => patch("body", event.target.value)} />
    </article>
  );
}

function AssetNode({ id, data, selected }) {
  const patch = (field, value) => data.actions?.patchNode?.(id, { [field]: value });
  return (
    <article className={cx("canvas-node asset-node", selected && "selected")}>
      <Handle type="source" position={Position.Right} />
      <div className="node-header">
        <span className="node-icon">
          <Image size={16} />
        </span>
        <strong>{data.title || "参考图"}</strong>
      </div>
      <input className="nodrag" value={data.url || ""} onChange={(event) => patch("url", event.target.value)} placeholder="图片 URL" />
      {data.url && <img src={data.url} alt="" />}
    </article>
  );
}

const nodeTypes = {
  shot: ShotNode,
  render: RenderNode,
  note: NoteNode,
  asset: AssetNode,
};

const renderRuntimeFields = new Set([
  "status",
  "progress",
  "taskId",
  "sourceNodeId",
  "upstreamTaskId",
  "videoUrl",
  "resultUrl",
  "lastFrameAssetId",
  "error",
  "errorCode",
  "requestId",
  "eventId",
]);

function positionSort(a, b) {
  return (a.position?.x ?? 0) - (b.position?.x ?? 0) || (a.position?.y ?? 0) - (b.position?.y ?? 0);
}

function orderSequenceClips(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Set();
  for (const edge of edges) {
    if (!edge?.source || !edge?.target) continue;
    incoming.add(edge.target);
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  }
  for (const edgeList of outgoing.values()) {
    edgeList.sort((a, b) => {
      const aNode = nodeById.get(a.target);
      const bNode = nodeById.get(b.target);
      return positionSort(aNode || {}, bNode || {});
    });
  }

  const clips = [];
  const visited = new Set();
  const isCompletedClip = (node) => node?.type === "render" && node.data?.status === "completed" && node.data?.videoUrl;

  function visit(nodeId) {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return;
    if (isCompletedClip(node)) clips.push(node);
    for (const edge of outgoing.get(nodeId) || []) {
      visit(edge.target);
    }
  }

  nodes
    .filter((node) => !incoming.has(node.id))
    .slice()
    .sort(positionSort)
    .forEach((node) => visit(node.id));

  nodes
    .slice()
    .sort(positionSort)
    .forEach((node) => visit(node.id));

  return clips;
}

function cleanDuplicatedNodeData(node) {
  const data = { ...(node.data || {}) };
  delete data.actions;
  if (node.type === "render") {
    for (const field of renderRuntimeFields) delete data[field];
    return {
      ...data,
      title: `${node.data?.title || "视频结果"} 副本`,
      status: "draft",
      progress: 0,
      videoUrl: "",
      resultUrl: "",
      error: "",
    };
  }
  if (node.type === "shot") {
    return {
      ...data,
      title: `${node.data?.title || "镜头"} 副本`,
      status: "draft",
    };
  }
  return {
    ...data,
    title: `${node.data?.title || "节点"} 副本`,
  };
}

function createsConnectionCycle(edges, connection) {
  const nextEdges = [...edges, connection];
  const outgoing = new Map();
  for (const edge of nextEdges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  }
  const seen = new Set();
  function visit(nodeId) {
    if (nodeId === connection.source) return true;
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    return (outgoing.get(nodeId) || []).some(visit);
  }
  return visit(connection.target);
}

function Studio({ me, projects, projectId }) {
  const navigate = useNavigate();
  const reactFlow = useReactFlow();
  const [project, setProject] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [saveState, setSaveState] = useState("已保存");
  const [query, setQuery] = useState("");
  const [debugModal, setDebugModal] = useState(null);
  const [sequenceClip, setSequenceClip] = useState(0);
  const [confirmNodeId, setConfirmNodeId] = useState("");
  const loadedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const skipNextAutosaveRef = useRef(false);
  const submittingNodeIdsRef = useRef(new Set());
  const pollingTasksRef = useRef(false);

  const actionHandlers = useMemo(
    () => ({
      patchNode: (nodeId, patch) => {
        setNodes((current) =>
          current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)),
        );
      },
      generate: (nodeId) => requestGenerateFromNode(nodeId),
      continueFrom: async (nodeId) => continueFromRender(nodeId),
      duplicate: (nodeId) => duplicateNode(nodeId),
      showDebug: async (taskId, eventId) => showDebug(taskId, eventId),
      refreshTask: async (taskId) => refreshTaskResult(taskId),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, projectId],
  );

  const hydratedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...(node.data || {}), actions: actionHandlers },
      })),
    [nodes, actionHandlers],
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const confirmNode = nodes.find((node) => node.id === confirmNodeId);
  const runningCount = nodes.filter((node) => node.type === "render" && ["queued", "in_progress"].includes(node.data?.status)).length;
  const completedClips = useMemo(
    () => orderSequenceClips(nodes, edges),
    [nodes, edges],
  );

  useEffect(() => {
    loadedRef.current = false;
    api(`/api/projects/${projectId}/canvas`)
      .then((result) => {
        setProject(result.project);
        setNodes(result.nodes || []);
        setEdges(result.edges || []);
        setViewport(result.viewport || { x: 0, y: 0, zoom: 1 });
        const focusNodeId = new URLSearchParams(window.location.search).get("focus");
        if (focusNodeId && (result.nodes || []).some((node) => node.id === focusNodeId)) {
          setSelectedNodeId(focusNodeId);
          setTimeout(() => reactFlow.fitView({ nodes: [{ id: focusNodeId }], padding: 0.45, duration: 500 }), 90);
        }
        setTimeout(() => reactFlow.setViewport(result.viewport || { x: 0, y: 0, zoom: 1 }), 50);
      })
      .finally(() => {
        loadedRef.current = true;
      });
  }, [projectId, reactFlow]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      setSaveState("已保存");
      return;
    }
    setSaveState("保存中...");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api(`/api/projects/${projectId}/canvas`, {
          method: "PUT",
          body: JSON.stringify({
            nodes: nodes.map(cleanNode),
            edges: edges.map(cleanEdge),
            viewport,
          }),
        });
        setSaveState("已保存");
      } catch (error) {
        setSaveState(error.message);
      }
    }, 700);
    return () => clearTimeout(saveTimerRef.current);
  }, [nodes, edges, viewport, projectId]);

  useEffect(() => {
    if (sequenceClip > 0 && sequenceClip >= completedClips.length) {
      setSequenceClip(Math.max(completedClips.length - 1, 0));
    }
  }, [completedClips.length, sequenceClip]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (pollingTasksRef.current) return;
      const running = nodes.filter((node) => node.type === "render" && ["queued", "in_progress", "submitted"].includes(node.data?.status));
      const taskNodes = running.filter((node) => node.data?.taskId);
      if (!taskNodes.length) return;
      pollingTasksRef.current = true;
      try {
        const results = await Promise.allSettled(taskNodes.map((node) => api(`/api/tasks/${node.data.taskId}`)));
        const taskUpdates = results
          .filter((result) => result.status === "fulfilled" && result.value?.task?.resultNodeId)
          .map((result) => result.value.task);
        if (!taskUpdates.length) return;
        skipNextAutosaveRef.current = true;
        setNodes((current) => {
          const updatesByNodeId = new Map(taskUpdates.map((task) => [task.resultNodeId, task]));
          return current.map((item) => {
            const task = updatesByNodeId.get(item.id);
            if (!task) return item;
            return {
              ...item,
              data: {
                ...item.data,
                status: task.status,
                progress: task.progress,
                videoUrl: task.videoUrl || item.data.videoUrl,
                resultUrl: task.resultUrl || item.data.resultUrl,
                lastFrameAssetId: task.lastFrameAssetId,
                error: task.error?.message || "",
              },
            };
          });
        });
      } finally {
        pollingTasksRef.current = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [nodes]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setViewport(reactFlow.getViewport());
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (selectedNodeId) duplicateNode(selectedNodeId);
      }
      if (event.key === "Delete" && selectedNodeId) {
        deleteNode(selectedNodeId);
      }
      if (event.key.toLowerCase() === "n") {
        addShotAt({ x: 80, y: 80 });
      }
      if (event.key.toLowerCase() === "f") {
        reactFlow.fitView({ padding: 0.24, duration: 500 });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onNodesChange = useCallback((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const isValidConnection = useCallback(
    (connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return false;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      const semanticPair =
        (sourceNode.type === "shot" && targetNode.type === "render") ||
        (sourceNode.type === "render" && targetNode.type === "shot") ||
        (sourceNode.type === "asset" && targetNode.type === "shot");
      return semanticPair && !createsConnectionCycle(edges, connection);
    },
    [nodes, edges],
  );

  const onConnect = useCallback(
    (connection) => {
      if (!isValidConnection(connection)) return;
      setEdges((current) =>
        addEdge({ ...connection, id: uid("edge"), type: "smoothstep", animated: true, data: { kind: "custom" } }, current),
      );
    },
    [isValidConnection],
  );

  function addShotAt(position, overrides = {}) {
    const node = {
      id: uid("shot"),
      type: "shot",
      position,
      data: defaultShotData({ title: `Clip ${nodes.filter((item) => item.type === "shot").length + 1}`, ...overrides }),
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setContextMenu(null);
  }

  function addNoteAt(position) {
    const node = {
      id: uid("note"),
      type: "note",
      position,
      data: { title: "备注", body: "写下这个镜头的意图、角色状态或剪辑提示。" },
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setContextMenu(null);
  }

  function addAssetAt(position) {
    const node = {
      id: uid("asset"),
      type: "asset",
      position,
      data: { title: "参考图", url: "" },
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setContextMenu(null);
  }

  function duplicateNode(nodeId) {
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    const sourceForCopy = source.type === "render"
      ? nodes.find((node) => node.id === source.data?.sourceNodeId) || source
      : source;
    const copy = {
      ...cleanNode(sourceForCopy),
      id: uid(sourceForCopy.type),
      position: { x: source.position.x + 36, y: source.position.y + 36 },
      data: cleanDuplicatedNodeData(sourceForCopy),
    };
    setNodes((current) => [...current, copy]);
    setSelectedNodeId(copy.id);
  }

  function deleteNode(nodeId) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(null);
  }

  function requestGenerateFromNode(nodeId) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (node.type === "shot") {
      setConfirmNodeId(nodeId);
      setSelectedNodeId(nodeId);
      return;
    }
    generateFromNode(nodeId);
  }

  function patchConfirmNode(field, value) {
    if (!confirmNodeId) return;
    setNodes((current) =>
      current.map((node) => (node.id === confirmNodeId ? { ...node, data: { ...node.data, [field]: value } } : node)),
    );
  }

  async function generateFromNode(nodeId) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (node.data?.status === "submitting" || submittingNodeIdsRef.current.has(nodeId)) return;
    submittingNodeIdsRef.current.add(nodeId);
    setConfirmNodeId("");
    setNodes((current) =>
      current.map((item) => (item.id === nodeId ? { ...item, data: { ...item.data, status: "submitting" } } : item)),
    );
    try {
      const result = await api(`/api/projects/${projectId}/nodes/${nodeId}/generate`, {
        method: "POST",
        body: JSON.stringify({ data: cleanNode(node).data }),
      });
      setNodes((current) => [
        ...current.map((item) => (item.id === nodeId ? { ...item, data: { ...item.data, status: "draft" } } : item)),
        result.node,
      ]);
      setEdges((current) => [...current, result.edge]);
      setSelectedNodeId(result.node.id);
    } catch (error) {
      const detail = error.body?.error || { message: error.message };
      setNodes((current) => {
        const reset = current.map((item) => (item.id === nodeId ? { ...item, data: { ...item.data, status: "draft" } } : item));
        return detail.node && !reset.some((item) => item.id === detail.node.id) ? [...reset, detail.node] : reset;
      });
      if (detail.edge) {
        setEdges((current) => (current.some((edge) => edge.id === detail.edge.id) ? current : [...current, detail.edge]));
      }
      setDebugModal(detail);
    } finally {
      submittingNodeIdsRef.current.delete(nodeId);
    }
  }

  async function continueFromRender(nodeId) {
    try {
      const result = await api(`/api/projects/${projectId}/render-nodes/${nodeId}/continue`, {
        method: "POST",
      });
      setNodes((current) => [...current, result.node]);
      setEdges((current) => [...current, result.edge]);
      setSelectedNodeId(result.node.id);
      setTimeout(() => reactFlow.fitView({ nodes: [{ id: result.node.id }], padding: 0.4, duration: 500 }), 80);
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    }
  }

  async function refreshTaskResult(taskId) {
    if (!taskId) return;
    try {
      const result = await api(`/api/tasks/${taskId}?force=1`);
      const task = result.task;
      const matched = nodes.some((item) => item.data?.taskId === task.id || item.id === task.resultNodeId);
      setNodes((current) =>
        current.map((item) => {
          if (item.data?.taskId !== task.id && item.id !== task.resultNodeId) return item;
          return {
            ...item,
            data: {
              ...item.data,
              status: task.status,
              progress: task.progress,
              upstreamTaskId: task.upstreamTaskId || item.data.upstreamTaskId,
              videoUrl: task.videoUrl || item.data.videoUrl,
              resultUrl: task.resultUrl || item.data.resultUrl,
              lastFrameAssetId: task.lastFrameAssetId,
              error: task.error?.message || "",
            },
          };
        }),
      );
      if (!matched) {
        const canvas = await api(`/api/projects/${projectId}/canvas`);
        setNodes(canvas.nodes || []);
        setEdges(canvas.edges || []);
      }
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    }
  }

  async function showDebug(taskId, eventId) {
    if (!taskId && !eventId) return;
    try {
      const result = eventId ? await api(`/api/error-events/${eventId}`) : await api(`/api/tasks/${taskId}/logs`);
      setDebugModal(result);
    } catch (error) {
      setDebugModal(error.body || { message: error.message });
    }
  }

  function autoLayout() {
    const selected = nodes.filter((node) => node.selected);
    const targetNodes = selected.length ? selected : nodes;
    const targetIds = new Set(targetNodes.map((node) => node.id));
    setNodes((current) => {
      let index = 0;
      return current.map((node) => {
        if (!targetIds.has(node.id)) return node;
        const next = { ...node, position: { x: 80 + index * 420, y: node.type === "note" ? -100 : 120 } };
        index += 1;
        return next;
      });
    });
  }

  function onPaneContextMenu(event) {
    event.preventDefault();
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({ screen: { x: event.clientX, y: event.clientY }, position, nodeId: null });
  }

  function onNodeContextMenu(event, node) {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setContextMenu({ screen: { x: event.clientX, y: event.clientY }, position: node.position, nodeId: node.id });
  }

  const filteredNodeIds = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return new Set(
      nodes
        .filter((node) => JSON.stringify(node.data || {}).toLowerCase().includes(q) || node.id.toLowerCase().includes(q))
        .map((node) => node.id),
    );
  }, [nodes, query]);

  const visibleNodes = filteredNodeIds
    ? hydratedNodes.map((node) => ({ ...node, className: filteredNodeIds.has(node.id) ? "" : "dimmed-node" }))
    : hydratedNodes;

  return (
    <main className="studio-shell" onClick={() => setContextMenu(null)}>
      <header className="studio-topbar">
        <div className="topbar-left">
          <button className="tool-button" type="button" onClick={() => navigate("/")}>
            <Film size={18} />
          </button>
          <div>
            <strong>{project?.name || "视频画布"}</strong>
            <span>{saveState}</span>
          </div>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 prompt / task / URL" />
        </div>
        <div className="topbar-right">
          <button className="secondary-button" type="button" onClick={() => navigate("/task-query")}>
            <Search size={15} />
            Task 查询
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/profile")}>
            个人信息
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/tasks")}>
            任务中心
          </button>
          <span className="status-pill">{runningCount} 个运行中</span>
          <button className="secondary-button" type="button" onClick={() => navigate("/make")}>
            立即制作
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/logs")}>
            错误日志
          </button>
          <span className="status-pill success">API key {me.user.apiKey.preview}</span>
          <button className="tool-button" type="button" onClick={() => api("/api/auth/logout", { method: "POST" }).then(() => navigate("/"))}>
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <aside className="left-toolbar">
        <button className="tool-button active" title="选择" type="button">
          <MousePointer2 size={18} />
        </button>
        <button className="tool-button" title="新建视频卡片" type="button" onClick={() => addShotAt(reactFlow.screenToFlowPosition({ x: 260, y: 220 }))}>
          <Plus size={18} />
        </button>
        <button className="tool-button" title="备注" type="button" onClick={() => addNoteAt(reactFlow.screenToFlowPosition({ x: 280, y: 140 }))}>
          <Frame size={18} />
        </button>
        <button className="tool-button" title="整理画布" type="button" onClick={autoLayout}>
          <LayoutGrid size={18} />
        </button>
        <button className="tool-button" title="适配屏幕" type="button" onClick={() => reactFlow.fitView({ padding: 0.2, duration: 500 })}>
          <Maximize2 size={18} />
        </button>
      </aside>

      <section className="flow-wrap">
        <ReactFlow
          nodes={visibleNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
          fitView
          minZoom={0.18}
          maxZoom={1.7}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} size={1} color="rgba(255,255,255,.08)" />
          <Controls />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
        </ReactFlow>
      </section>

      <PropertyPanel node={selectedNode} onPatch={actionHandlers.patchNode} onGenerate={requestGenerateFromNode} onContinue={continueFromRender} onRefreshTask={refreshTaskResult} />
      <SequenceBar clips={completedClips} activeIndex={sequenceClip} setActiveIndex={setSequenceClip} />

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          node={nodes.find((node) => node.id === contextMenu.nodeId)}
          onAddShot={() => addShotAt(contextMenu.position)}
          onAddNote={() => addNoteAt(contextMenu.position)}
          onAddAsset={() => addAssetAt(contextMenu.position)}
          onDuplicate={() => contextMenu.nodeId && duplicateNode(contextMenu.nodeId)}
          onDelete={() => contextMenu.nodeId && deleteNode(contextMenu.nodeId)}
          onGenerate={() => contextMenu.nodeId && requestGenerateFromNode(contextMenu.nodeId)}
          onContinue={() => contextMenu.nodeId && continueFromRender(contextMenu.nodeId)}
          onDebug={() => {
            const node = nodes.find((item) => item.id === contextMenu.nodeId);
            showDebug(node?.data?.taskId);
          }}
        />
      )}
      {confirmNode && (
        <GenerationConfirmModal
          node={confirmNode}
          onChange={patchConfirmNode}
          onClose={() => setConfirmNodeId("")}
          onSubmit={() => generateFromNode(confirmNode.id)}
        />
      )}
      {debugModal && <DebugModal detail={debugModal} onClose={() => setDebugModal(null)} />}
    </main>
  );
}

function PropertyPanel({ node, onPatch, onGenerate, onContinue, onRefreshTask }) {
  if (!node) {
    return (
      <aside className="property-panel empty">
        <Settings2 size={18} />
        <h3>选择一个卡片</h3>
        <p>在这里编辑完整参数、查看任务状态和视频 URL。</p>
      </aside>
    );
  }
  const data = node.data || {};
  const patch = (field, value) => onPatch(node.id, { [field]: value });
  const submitting = data.status === "submitting";
  return (
    <aside className="property-panel">
      <div className="panel-heading">
        <span>{node.type === "render" ? "视频结果" : node.type === "shot" ? "镜头参数" : "节点属性"}</span>
        <strong>{data.title || node.id}</strong>
      </div>
      {node.type === "shot" && (
        <>
          <label>
            提示词
            <textarea value={data.prompt || ""} onChange={(event) => patch("prompt", event.target.value)} />
          </label>
          <label>
            反向提示词
            <input value={data.negativePrompt || ""} onChange={(event) => patch("negativePrompt", event.target.value)} />
          </label>
          <div className="panel-grid">
            <label>
              秒数
              <select value={data.duration || 5} onChange={(event) => patch("duration", Number(event.target.value))}>
                {durationOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}s
                  </option>
                ))}
              </select>
            </label>
            <label>
              比例
              <select value={data.ratio || "16:9"} onChange={(event) => patch("ratio", event.target.value)}>
                {ratioOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            模型
            <input value={data.model || defaultModel} onChange={(event) => patch("model", event.target.value)} />
          </label>
          <label>
            参考图 URL
            <input value={data.referenceImageUrl || ""} onChange={(event) => patch("referenceImageUrl", event.target.value)} />
          </label>
          <label>
            首帧 URL
            <input value={data.firstFrameUrl || ""} onChange={(event) => patch("firstFrameUrl", event.target.value)} />
          </label>
          <label>
            尾帧 URL
            <input value={data.lastFrameUrl || ""} onChange={(event) => patch("lastFrameUrl", event.target.value)} />
          </label>
          <div className="panel-grid">
            <label>
              镜头运动
              <select value={data.cameraMotion || "slow_push_in"} onChange={(event) => patch("cameraMotion", event.target.value)}>
                {motionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              运动强度
              <select value={data.motionStrength || "medium"} onChange={(event) => patch("motionStrength", event.target.value)}>
                {strengthOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Seed
            <input value={data.seed || ""} onChange={(event) => patch("seed", event.target.value)} />
          </label>
          <div className="toggle-row">
            <label>
              <input type="checkbox" checked={Boolean(data.watermark)} onChange={(event) => patch("watermark", event.target.checked)} />
              水印
            </label>
            <label>
              <input type="checkbox" checked={Boolean(data.generateAudio)} onChange={(event) => patch("generateAudio", event.target.checked)} />
              生成音频
            </label>
          </div>
          <button className="full-primary" type="button" disabled={submitting} onClick={() => onGenerate(node.id)}>
            {submitting ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
            {submitting ? "正在提交" : "生成这个镜头"}
          </button>
        </>
      )}
      {node.type === "render" && (
        <>
          <div className="task-summary">
            <span className={cx("dot", data.status)} />
            <strong>{data.status}</strong>
            <span>{data.progress ?? 0}%</span>
          </div>
          {data.taskId && (
            <div className="task-trace-panel compact-panel">
              <TaskIdPill value={data.taskId} />
              <TaskIdPill value={data.upstreamTaskId} label="上游 Task" />
              {["failed", "queued", "submitted", "in_progress"].includes(data.status) && (
                <button className="secondary-button" type="button" onClick={() => onRefreshTask?.(data.taskId)}>
                  <RotateCcw size={15} />
                  重新拉取结果
                </button>
              )}
              <button className="secondary-button" type="button" onClick={() => { window.location.href = `/task-query?taskId=${encodeURIComponent(data.taskId)}`; }}>
                打开 Task 查询
              </button>
            </div>
          )}
          {data.videoUrl && (
            <>
              <video className="panel-video" src={data.videoUrl} muted autoPlay loop controls playsInline />
              <label>
                视频 URL
                <input value={data.videoUrl} readOnly />
              </label>
              <button className="full-primary" type="button" onClick={() => onContinue(node.id)}>
                <ChevronsRight size={16} />
                续写下一段
              </button>
            </>
          )}
          {data.error && <div className="form-error">{data.error}</div>}
        </>
      )}
    </aside>
  );
}

function ContextMenu({ menu, node, onAddShot, onAddNote, onAddAsset, onDuplicate, onDelete, onGenerate, onContinue, onDebug }) {
  return (
    <div className="context-menu" style={{ left: menu.screen.x, top: menu.screen.y }}>
      {!node && (
        <>
          <button type="button" onClick={onAddShot}>
            <Clapperboard size={15} />
            新建视频生成卡片
          </button>
          <button type="button" onClick={onAddAsset}>
            <Image size={15} />
            新建参考图卡片
          </button>
          <button type="button" onClick={onAddNote}>
            <Frame size={15} />
            新建备注
          </button>
        </>
      )}
      {node && (
        <>
          {node.type === "shot" && (
            <button type="button" onClick={onGenerate}>
              <WandSparkles size={15} />
              生成
            </button>
          )}
          {node.type === "render" && node.data?.status === "completed" && (
            <button type="button" onClick={onContinue}>
              <ChevronsRight size={15} />
              续写下一段
            </button>
          )}
          {node.type === "render" && (
            <button type="button" onClick={onDebug}>
              <AlertCircle size={15} />
              查看请求详情
            </button>
          )}
          <button type="button" onClick={onDuplicate}>
            <Copy size={15} />
            {node.type === "render" ? "复制源镜头" : "复制"}
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <Trash2 size={15} />
            删除
          </button>
        </>
      )}
    </div>
  );
}

function SequenceBar({ clips, activeIndex, setActiveIndex }) {
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const videoRef = useRef(null);
  const activeClip = clips[activeIndex];

  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.play().catch(() => null);
    }
  }, [activeClip, playing]);

  function nextClip() {
    if (activeIndex < clips.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else {
      setPlaying(false);
      setActiveIndex(0);
    }
  }

  function copyUrls() {
    navigator.clipboard?.writeText(clips.map((clip) => clip.data.videoUrl).join("\n"));
  }

  if (!clips.length) return null;

  return (
    <footer className={cx("sequence-bar", collapsed && "collapsed")}>
      <div className="sequence-player">
        <button className="tool-button" type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div>
          <strong>连续预览</strong>
          <span>{clips.length} 个片段</span>
        </div>
      </div>
      {!collapsed && (
        <>
          {activeClip && (
            <video
              ref={videoRef}
              src={activeClip.data.videoUrl}
              muted
              playsInline
              onEnded={nextClip}
              className="sequence-video"
              controls
            />
          )}
          <div className="clip-strip">
            {clips.map((clip, index) => (
              <button
                key={clip.id}
                className={cx("clip-chip", index === activeIndex && "active")}
                type="button"
                onClick={() => setActiveIndex(index)}
              >
                Clip {index + 1}
              </button>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={copyUrls}>
            复制 URL
          </button>
        </>
      )}
      <button className="secondary-button sequence-toggle" type="button" onClick={() => setCollapsed((value) => !value)}>
        {collapsed ? "展开" : "收起"}
      </button>
    </footer>
  );
}

function GenerationConfirmModal({ node, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="generation-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <strong>生成前参数确认</strong>
            <span>{node.data?.title || node.id}</span>
          </div>
          <button className="tool-button" type="button" onClick={onClose}>
            <Check size={17} />
          </button>
        </div>
        <GenerationConfirmCard
          value={node.data || {}}
          onChange={onChange}
          onSubmit={onSubmit}
          submitLabel="确认并生成这个镜头"
        />
      </section>
    </div>
  );
}

function DebugModal({ detail, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="debug-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <strong>完整请求 / 返回信息</strong>
          <button className="tool-button" type="button" onClick={onClose}>
            <Check size={17} />
          </button>
        </div>
        <pre>{JSON.stringify(detail, null, 2)}</pre>
      </section>
    </div>
  );
}

function AppRoutes() {
  const me = useMe();
  useEffect(() => {
    const onError = (event) => {
      reportClientError(event.error || new Error(event.message), { code: "CLIENT_RUNTIME_ERROR", source: "window.onerror" });
    };
    const onRejection = (event) => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      reportClientError(reason, { code: "CLIENT_RUNTIME_ERROR", source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  if (me.loading) return <LoadingScreen />;
  return (
    <Routes>
      <Route path="/" element={<HomePage me={me} reload={me.reload} />} />
      <Route path="/login" element={<AuthShell mode="login" reload={me.reload} />} />
      <Route path="/register" element={<AuthShell mode="register" reload={me.reload} />} />
      <Route path="/admin/login" element={<AdminLogin reload={me.reload} />} />
      <Route path="/admin/reset-password" element={<AdminPasswordReset me={me} reload={me.reload} />} />
      <Route path="/admin/requests" element={<RequireAdmin me={me}><AdminRequestsPage me={me} /></RequireAdmin>} />
      <Route path="/admin/task-query" element={<RequireAdmin me={me}><AdminTaskQueryPage me={me} /></RequireAdmin>} />
      <Route path="/onboarding" element={<Onboarding me={me} reload={me.reload} />} />
      <Route path="/profile" element={<RequireUser me={me}><ProfilePage me={me} reload={me.reload} /></RequireUser>} />
      <Route path="/tasks" element={<RequireReady me={me}><TaskCenterPage me={me} /></RequireReady>} />
      <Route path="/make" element={<RequireReady me={me}><MakeHub me={me} /></RequireReady>} />
      <Route path="/make/chat" element={<RequireReady me={me}><ChatPage me={me} /></RequireReady>} />
      <Route path="/make/chat/:sessionId" element={<RequireReady me={me}><ChatPage me={me} /></RequireReady>} />
      <Route path="/task-query" element={<RequireReady me={me}><TaskQueryPage me={me} /></RequireReady>} />
      <Route path="/logs" element={<RequireReady me={me}><LogsPage me={me} /></RequireReady>} />
      <Route path="/app" element={<StudioGate me={me} />} />
      <Route path="/app/projects/:projectId" element={<StudioGate me={me} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
