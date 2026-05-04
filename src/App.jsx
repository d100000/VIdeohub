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
        {user && <Link to="/logs">错误日志</Link>}
      </nav>
      <div className="nav-actions">
        {user ? (
          <>
            <Link className="ghost-link" to="/app">
              专业画布
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
  const [debug, setDebug] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!me.user) return <Navigate to="/login" replace />;

  async function saveKey(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setDebug(null);
    try {
      await api("/api/me/api-key", { method: "PUT", body: JSON.stringify({ apiKey }) });
      await reload();
      setStatus("API key 已加密保存。");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    setBusy(true);
    setStatus("正在提交测试请求...");
    setDebug(null);
    try {
      const result = await api("/api/me/api-key/test", { method: "POST" });
      setStatus(result.upstreamTaskId ? `测试任务已提交：${result.upstreamTaskId}` : "接口连通。");
      setDebug(result.debug || result);
    } catch (error) {
      setStatus(error.message);
      setDebug(error.body || { message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function createAndEnter() {
    setBusy(true);
    try {
      const result = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName }),
      });
      navigate(nextPath || `/app/projects/${result.project.id}`);
    } catch (error) {
      setStatus(error.message);
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
          <span>{me.user.apiKey?.configured ? `已配置 ${me.user.apiKey.preview}` : "尚未配置"}</span>
        </div>
        <label className="project-name-field">
          项目名称
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
        <button className="hero-primary" type="button" disabled={!me.user.apiKey?.configured || busy} onClick={createAndEnter}>
          进入无限画布
          <ArrowRight size={18} />
        </button>
        {status && <div className="setup-status">{status}</div>}
        {debug && <pre className="debug-pre">{JSON.stringify(debug, null, 2)}</pre>}
      </section>
    </main>
  );
}

function RequireReady({ me, children }) {
  if (!me.user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (!me.user.apiKey?.configured) return <Navigate to={`/onboarding?next=${encodeURIComponent(window.location.pathname)}`} replace />;
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
          <Link className="secondary-button" to="/logs">
            错误日志
          </Link>
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
  const composerDisabled = busy || (!composerHasText && !planActionable);
  const composerLabel = busy ? "处理中" : composerHasText ? "解析创意" : planActionable ? "开始生成" : "解析创意";
  const composerPlaceholder = planActionable
    ? "可以继续补充要求；不输入内容时，点击右侧按钮会直接按当前解析生成。"
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
              errors={errorMessages}
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
                else if (planActionable) generate();
              }
            }} placeholder={composerPlaceholder} />
            <button className="hero-primary" type="button" disabled={composerDisabled} onClick={() => (composerHasText ? sendPlan() : generate())}>
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

function taskStatusLabel(status) {
  const map = {
    draft: "草稿",
    submitting: "提交中",
    submitted: "已提交",
    queued: "等待中",
    in_progress: "生成中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    expired: "已过期",
  };
  return map[status] || status || "未知";
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

function GenerationPipeline({ prompt, plan, tasks, busy, onContinue, onSelectTask, onOpenLogs, errors }) {
  return (
    <section className="generation-pipeline">
      <PipelineStep index={1} title="输入创意" status={prompt ? "done" : "active"}>
        {prompt ? (
          <UserPromptCard prompt={prompt} />
        ) : (
          <p className="pipeline-hint">在底部输入框描述视频，系统会先解析创意，再提交生成。</p>
        )}
      </PipelineStep>

      <PipelineStep index={2} title="AI 解析" status={busy ? "active" : plan ? "done" : "idle"}>
        {busy && <ParsingCard />}
        {!busy && plan && <PlanSummaryCard plan={plan} />}
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

function PlanSummaryCard({ plan }) {
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
        {submitted ? "参数已提交给生成任务，当前模块切换为只读摘要。" : "解析结果已准备好；请在底部操作栏开始生成或继续补充要求。"}
      </div>
    </section>
  );
}

function TaskChatCard({ task, index, onDebug, onContinue, onSelect }) {
  const done = task.status === "completed" && task.videoUrl;
  const failed = task.status === "failed";
  const running = ["queued", "in_progress", "submitted"].includes(task.status);
  return (
    <div className={cx("task-chat-card", task.status)} onClick={onSelect}>
      <div className="task-card-head">
        <div>
          <strong>Clip {index + 1}</strong>
          <small>{task.id}</small>
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
        {done && <button className="secondary-button" type="button" onClick={onContinue}>续写下一段</button>}
        <button className="secondary-button" type="button" onClick={() => onDebug(task.id)}>查看完整日志</button>
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
              </button>
            ))}
          </div>
          {task && (
            <div className="task-trace-panel">
              <InspectorKV label="本地任务" value={task.id} />
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
        <button className="node-primary nodrag" type="button" onClick={() => actions.generate?.(id)}>
          <WandSparkles size={15} />
          生成
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
        <button className="node-ghost nodrag" type="button" onClick={() => actions.showDebug?.(data.taskId, data.eventId)}>
          完整日志
        </button>
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
  const loadedRef = useRef(false);
  const saveTimerRef = useRef(null);

  const actionHandlers = useMemo(
    () => ({
      patchNode: (nodeId, patch) => {
        setNodes((current) =>
          current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)),
        );
      },
      generate: async (nodeId) => generateFromNode(nodeId),
      continueFrom: async (nodeId) => continueFromRender(nodeId),
      duplicate: (nodeId) => duplicateNode(nodeId),
      showDebug: async (taskId, eventId) => showDebug(taskId, eventId),
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
  const runningCount = nodes.filter((node) => node.type === "render" && ["queued", "in_progress"].includes(node.data?.status)).length;
  const completedClips = useMemo(
    () =>
      nodes
        .filter((node) => node.type === "render" && node.data?.status === "completed" && node.data?.videoUrl)
        .slice()
        .sort((a, b) => a.position.x - b.position.x),
    [nodes],
  );

  useEffect(() => {
    loadedRef.current = false;
    api(`/api/projects/${projectId}/canvas`)
      .then((result) => {
        setProject(result.project);
        setNodes(result.nodes || []);
        setEdges(result.edges || []);
        setViewport(result.viewport || { x: 0, y: 0, zoom: 1 });
        setTimeout(() => reactFlow.setViewport(result.viewport || { x: 0, y: 0, zoom: 1 }), 50);
      })
      .finally(() => {
        loadedRef.current = true;
      });
  }, [projectId, reactFlow]);

  useEffect(() => {
    if (!loadedRef.current) return;
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
    const timer = setInterval(async () => {
      const running = nodes.filter((node) => node.type === "render" && ["queued", "in_progress", "submitted"].includes(node.data?.status));
      for (const node of running) {
        if (!node.data?.taskId) continue;
        try {
          const result = await api(`/api/tasks/${node.data.taskId}`);
          setNodes((current) =>
            current.map((item) =>
              item.id === result.task.resultNodeId
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      status: result.task.status,
                      progress: result.task.progress,
                      videoUrl: result.task.videoUrl || item.data.videoUrl,
                      resultUrl: result.task.resultUrl || item.data.resultUrl,
                      lastFrameAssetId: result.task.lastFrameAssetId,
                      error: result.task.error?.message || "",
                    },
                  }
                : item,
            ),
          );
        } catch {
          // Keep polling resilient; the debug button still exposes the stored task state.
        }
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

  const onConnect = useCallback((connection) => {
    setEdges((current) =>
      addEdge({ ...connection, id: uid("edge"), type: "smoothstep", animated: true, data: { kind: "custom" } }, current),
    );
  }, []);

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
    const copy = {
      ...cleanNode(source),
      id: uid(source.type),
      position: { x: source.position.x + 36, y: source.position.y + 36 },
      data: { ...(source.data || {}), title: `${source.data?.title || "节点"} 副本` },
    };
    setNodes((current) => [...current, copy]);
    setSelectedNodeId(copy.id);
  }

  function deleteNode(nodeId) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(null);
  }

  async function generateFromNode(nodeId) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
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
      if (detail.node && detail.edge) {
        setNodes((current) => [
          ...current.map((item) => (item.id === nodeId ? { ...item, data: { ...item.data, status: "draft" } } : item)),
          detail.node,
        ]);
        setEdges((current) => [...current, detail.edge]);
      }
      setDebugModal(detail);
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

      <PropertyPanel node={selectedNode} onPatch={actionHandlers.patchNode} onGenerate={generateFromNode} onContinue={continueFromRender} />
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
          onGenerate={() => contextMenu.nodeId && generateFromNode(contextMenu.nodeId)}
          onContinue={() => contextMenu.nodeId && continueFromRender(contextMenu.nodeId)}
          onDebug={() => {
            const node = nodes.find((item) => item.id === contextMenu.nodeId);
            showDebug(node?.data?.taskId);
          }}
        />
      )}
      {debugModal && <DebugModal detail={debugModal} onClose={() => setDebugModal(null)} />}
    </main>
  );
}

function PropertyPanel({ node, onPatch, onGenerate, onContinue }) {
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
          <button className="full-primary" type="button" onClick={() => onGenerate(node.id)}>
            <WandSparkles size={16} />
            生成这个镜头
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
            复制
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

  return (
    <footer className="sequence-bar">
      <div className="sequence-player">
        <button className="tool-button" type="button" disabled={!clips.length} onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div>
          <strong>连续预览</strong>
          <span>{clips.length} 个片段</span>
        </div>
      </div>
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
      <button className="secondary-button" type="button" disabled={!clips.length} onClick={copyUrls}>
        复制 URL
      </button>
    </footer>
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
      <Route path="/onboarding" element={<Onboarding me={me} reload={me.reload} />} />
      <Route path="/make" element={<RequireReady me={me}><MakeHub me={me} /></RequireReady>} />
      <Route path="/make/chat" element={<RequireReady me={me}><ChatPage me={me} /></RequireReady>} />
      <Route path="/make/chat/:sessionId" element={<RequireReady me={me}><ChatPage me={me} /></RequireReady>} />
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
