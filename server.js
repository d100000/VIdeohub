import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.PORT || 1234);
const providerBaseUrl = "https://www.taijiai.online";
const defaultModel = process.env.SEEDANCE_MODEL || "seedance-2.0-720p";
const appSecret = process.env.APP_SECRET || process.env.SESSION_SECRET || "local-dev-secret-change-me";
const cookieName = "cvc_sid";
const dataDir = path.join(__dirname, "data");
const assetDir = path.join(dataDir, "assets");
const logDir = path.join(dataDir, "logs");
const fullLogDir = path.join(logDir, "full");
const distDir = path.join(__dirname, "dist");
const publicDir = path.join(__dirname, "public");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });
fs.mkdirSync(fullLogDir, { recursive: true });

const db = new Database(path.join(dataDir, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

app.use(express.json({ limit: "18mb" }));
app.use(cookieParser(appSecret));
app.use((req, res, next) => {
  req.requestId = String(req.get("X-Request-Id") || id("req"));
  req.startedAt = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'taijiai',
      base_url TEXT NOT NULL DEFAULT '${providerBaseUrl}',
      api_key_encrypted TEXT NOT NULL,
      api_key_last4 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL,
      height REAL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS canvas_edges (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'render',
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_node_id TEXT NOT NULL,
      result_node_id TEXT NOT NULL,
      upstream_task_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER,
      request_json TEXT NOT NULL DEFAULT '{}',
      response_json TEXT,
      error_json TEXT,
      debug_json TEXT,
      video_url TEXT,
      result_url TEXT,
      last_frame_asset_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequence_clips (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
      clip_order INTEGER NOT NULL,
      video_url TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creation_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      linked_project_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creation_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES creation_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      content_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creation_plans (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES creation_sessions(id) ON DELETE CASCADE,
      source_message_id TEXT,
      intent TEXT NOT NULL,
      plan_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creation_session_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES creation_sessions(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
      message_id TEXT,
      clip_order INTEGER NOT NULL DEFAULT 1,
      variant_group_id TEXT,
      is_selected INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS error_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      user_id INTEGER,
      session_id TEXT,
      project_id TEXT,
      task_id TEXT,
      node_id TEXT,
      source TEXT NOT NULL,
      severity TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      route TEXT,
      method TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      provider_status INTEGER,
      provider_task_id TEXT,
      retry_count INTEGER DEFAULT 0,
      request_json TEXT,
      response_json TEXT,
      provider_request_json TEXT,
      provider_response_json TEXT,
      provider_raw_text TEXT,
      context_json TEXT,
      breadcrumbs_json TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      full_log_path TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_error_events_user_created ON error_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_error_events_task ON error_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_error_events_request ON error_events(request_id);
  `);
}

migrate();

const statements = {
  userByEmail: db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)"),
  userById: db.prepare("SELECT id, email, created_at FROM users WHERE id = ?"),
  createUser: db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)"),
  createSession: db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"),
  sessionById: db.prepare(`
    SELECT sessions.*, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > CURRENT_TIMESTAMP
  `),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
  cleanupSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
  apiKeyForUser: db.prepare("SELECT * FROM user_api_keys WHERE user_id = ?"),
  upsertApiKey: db.prepare(`
    INSERT INTO user_api_keys (user_id, api_key_encrypted, api_key_last4, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      api_key_encrypted = excluded.api_key_encrypted,
      api_key_last4 = excluded.api_key_last4,
      updated_at = CURRENT_TIMESTAMP
  `),
  deleteApiKey: db.prepare("DELETE FROM user_api_keys WHERE user_id = ?"),
  projectsForUser: db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC"),
  projectById: db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?"),
  createProject: db.prepare("INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)"),
  updateProjectViewport: db.prepare("UPDATE projects SET viewport_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
  nodesForProject: db.prepare("SELECT * FROM canvas_nodes WHERE project_id = ?"),
  edgesForProject: db.prepare("SELECT * FROM canvas_edges WHERE project_id = ?"),
  nodeById: db.prepare("SELECT * FROM canvas_nodes WHERE id = ? AND project_id = ?"),
  upsertNode: db.prepare(`
    INSERT INTO canvas_nodes (id, project_id, type, x, y, width, height, data_json, updated_at)
    VALUES (@id, @projectId, @type, @x, @y, @width, @height, @dataJson, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      x = excluded.x,
      y = excluded.y,
      width = excluded.width,
      height = excluded.height,
      data_json = excluded.data_json,
      updated_at = CURRENT_TIMESTAMP
  `),
  deleteNode: db.prepare("DELETE FROM canvas_nodes WHERE id = ? AND project_id = ?"),
  deleteNodeEdges: db.prepare("DELETE FROM canvas_edges WHERE project_id = ? AND (source_node_id = ? OR target_node_id = ?)"),
  upsertEdge: db.prepare(`
    INSERT INTO canvas_edges (id, project_id, source_node_id, target_node_id, kind, data_json)
    VALUES (@id, @projectId, @source, @target, @kind, @dataJson)
    ON CONFLICT(id) DO UPDATE SET
      source_node_id = excluded.source_node_id,
      target_node_id = excluded.target_node_id,
      kind = excluded.kind,
      data_json = excluded.data_json
  `),
  deleteEdgesForProject: db.prepare("DELETE FROM canvas_edges WHERE project_id = ?"),
  deleteNodesForProject: db.prepare("DELETE FROM canvas_nodes WHERE project_id = ?"),
  createTask: db.prepare(`
    INSERT INTO generation_tasks (
      id, project_id, user_id, source_node_id, result_node_id, status, progress,
      request_json, debug_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  taskById: db.prepare("SELECT * FROM generation_tasks WHERE id = ?"),
  taskForUser: db.prepare("SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?"),
  updateTaskSubmitted: db.prepare(`
    UPDATE generation_tasks
    SET upstream_task_id = ?, status = ?, progress = ?, response_json = ?, debug_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateTaskState: db.prepare(`
    UPDATE generation_tasks
    SET status = ?, progress = ?, response_json = ?, debug_json = ?, error_json = ?,
      video_url = ?, result_url = ?, last_frame_asset_id = ?, updated_at = CURRENT_TIMESTAMP,
      completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ?
  `),
  updateTaskError: db.prepare(`
    UPDATE generation_tasks
    SET status = 'failed', error_json = ?, debug_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  createAsset: db.prepare(`
    INSERT INTO assets (id, project_id, user_id, type, source, url, file_path, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  assetForUser: db.prepare("SELECT * FROM assets WHERE id = ? AND user_id = ?"),
  completedTasksForProject: db.prepare(`
    SELECT generation_tasks.*, canvas_nodes.x, canvas_nodes.y
    FROM generation_tasks
    LEFT JOIN canvas_nodes ON canvas_nodes.id = generation_tasks.result_node_id
    WHERE generation_tasks.project_id = ? AND generation_tasks.status = 'completed' AND generation_tasks.video_url IS NOT NULL
    ORDER BY canvas_nodes.x ASC, generation_tasks.created_at ASC
  `),
  createCreationSession: db.prepare(`
    INSERT INTO creation_sessions (id, user_id, title, linked_project_id)
    VALUES (?, ?, ?, ?)
  `),
  creationSessionsForUser: db.prepare(`
    SELECT creation_sessions.*,
      (SELECT COUNT(*) FROM creation_messages WHERE creation_messages.session_id = creation_sessions.id) AS message_count,
      (SELECT COUNT(*) FROM creation_session_tasks WHERE creation_session_tasks.session_id = creation_sessions.id) AS task_count
    FROM creation_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `),
  creationSessionForUser: db.prepare("SELECT * FROM creation_sessions WHERE id = ? AND user_id = ?"),
  updateCreationSession: db.prepare(`
    UPDATE creation_sessions
    SET title = COALESCE(?, title), status = COALESCE(?, status), linked_project_id = COALESCE(?, linked_project_id), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `),
  deleteCreationSession: db.prepare("DELETE FROM creation_sessions WHERE id = ? AND user_id = ?"),
  createCreationMessage: db.prepare(`
    INSERT INTO creation_messages (id, session_id, role, type, content_json)
    VALUES (?, ?, ?, ?, ?)
  `),
  creationMessages: db.prepare("SELECT * FROM creation_messages WHERE session_id = ? ORDER BY created_at ASC"),
  createCreationPlan: db.prepare(`
    INSERT INTO creation_plans (id, session_id, source_message_id, intent, plan_json, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  latestCreationPlan: db.prepare("SELECT * FROM creation_plans WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"),
  updateCreationPlanStatus: db.prepare("UPDATE creation_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND session_id = ?"),
  linkSessionTask: db.prepare(`
    INSERT INTO creation_session_tasks (id, session_id, task_id, message_id, clip_order, variant_group_id, is_selected)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  sessionTasks: db.prepare(`
    SELECT creation_session_tasks.*, generation_tasks.status, generation_tasks.video_url, generation_tasks.progress,
      generation_tasks.result_node_id, generation_tasks.source_node_id, generation_tasks.upstream_task_id
    FROM creation_session_tasks
    JOIN generation_tasks ON generation_tasks.id = creation_session_tasks.task_id
    WHERE creation_session_tasks.session_id = ?
    ORDER BY creation_session_tasks.clip_order ASC, creation_session_tasks.created_at ASC
  `),
  insertErrorEvent: db.prepare(`
    INSERT INTO error_events (
      id, request_id, user_id, session_id, project_id, task_id, node_id, source, severity, code,
      message, stack, route, method, status_code, duration_ms, provider_status, provider_task_id,
      retry_count, request_json, response_json, provider_request_json, provider_response_json,
      provider_raw_text, context_json, breadcrumbs_json, user_agent, ip_hash, full_log_path
    )
    VALUES (
      @id, @requestId, @userId, @sessionId, @projectId, @taskId, @nodeId, @source, @severity, @code,
      @message, @stack, @route, @method, @statusCode, @durationMs, @providerStatus, @providerTaskId,
      @retryCount, @requestJson, @responseJson, @providerRequestJson, @providerResponseJson,
      @providerRawText, @contextJson, @breadcrumbsJson, @userAgent, @ipHash, @fullLogPath
    )
  `),
  errorEventsForUser: db.prepare(`
    SELECT id, request_id, user_id, session_id, project_id, task_id, node_id, source, severity, code,
      message, route, method, status_code, duration_ms, provider_status, provider_task_id,
      retry_count, user_agent, resolved_at, created_at
    FROM error_events
    WHERE user_id = ?
      AND (? = '' OR severity = ?)
      AND (? = '' OR source = ?)
      AND (? = '' OR code = ?)
      AND (? = '' OR task_id = ?)
      AND (? = '' OR project_id = ?)
      AND (? = '' OR session_id = ?)
      AND (? = '' OR node_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `),
  errorEventForUser: db.prepare("SELECT * FROM error_events WHERE id = ? AND user_id = ?"),
  patchErrorEvent: db.prepare("UPDATE error_events SET resolved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ? AND user_id = ?"),
  errorEventsForTask: db.prepare("SELECT * FROM error_events WHERE task_id = ? AND user_id = ? ORDER BY created_at DESC"),
  recentErrorsForUser: db.prepare(`
    SELECT id, request_id, source, severity, code, message, route, task_id, created_at
    FROM error_events
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 3
  `),
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function jsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonStringify(value) {
  return JSON.stringify(value ?? null);
}

function todayLogFile() {
  return path.join(logDir, `app-${new Date().toISOString().slice(0, 10)}.ndjson`);
}

function ipHash(req) {
  const raw = req?.ip || req?.socket?.remoteAddress || "";
  return raw ? crypto.createHash("sha256").update(raw).digest("hex").slice(0, 18) : "";
}

function redactString(value) {
  return String(value ?? "")
    .replace(/Bearer\s+sk-[A-Za-z0-9._-]+/gi, "Bearer sk-<redacted>")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-<redacted>")
    .replace(/("?(?:password|confirmPassword|cookie|authorization|session|sessionId)"?\s*:\s*)"[^"]*"/gi, '$1"<redacted>"');
}

function redactDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, seen));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      ["authorization", "cookie", "set-cookie", "password", "confirmpassword", "apikey", "api_key", "session", "sessionid"].includes(lower) ||
      lower.includes("token")
    ) {
      output[key] = lower === "authorization" ? "Bearer sk-<redacted>" : "<redacted>";
    } else {
      output[key] = redactDeep(item, seen);
    }
  }
  return output;
}

function inferErrorCode(error, fallback = "UNKNOWN_ERROR") {
  if (error?.code) return error.code;
  const status = Number(error?.statusCode || error?.status || error?.debug?.upstreamResponse?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("api key") || message.includes("缺少")) return "API_KEY_MISSING";
  if (message.includes("invalid token") || message.includes("unauthorized")) return "PROVIDER_AUTH_INVALID";
  if (message.includes("permission") || message.includes("无权")) return "API_KEY_PERMISSION_DENIED";
  if (message.includes("quota") || message.includes("额度")) return "PROVIDER_QUOTA_EXCEEDED";
  if (message.includes("timeout")) return "PROVIDER_TIMEOUT";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_INVALID";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status >= 500) return "PROVIDER_HTTP_ERROR";
  if (status >= 400) return "VALIDATION_ERROR";
  return fallback;
}

function fullErrorPayload(event) {
  return redactDeep({
    eventId: event.id,
    requestId: event.requestId,
    createdAt: new Date().toISOString(),
    userId: event.userId,
    sessionId: event.sessionId,
    projectId: event.projectId,
    taskId: event.taskId,
    nodeId: event.nodeId,
    source: event.source,
    severity: event.severity,
    code: event.code,
    message: event.message,
    stack: event.stack,
    route: event.route,
    method: event.method,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    providerStatus: event.providerStatus,
    providerTaskId: event.providerTaskId,
    retryCount: event.retryCount,
    request: event.request,
    response: event.response,
    providerRequest: event.providerRequest,
    providerResponse: event.providerResponse,
    providerRawText: event.providerRawText,
    context: event.context,
    breadcrumbs: event.breadcrumbs,
    userAgent: event.userAgent,
    ipHash: event.ipHash,
  });
}

function createErrorEvent(req, error, options = {}) {
  const eventId = options.eventId || id("err");
  const debug = options.debug || error?.debug || {};
  const providerResponse = options.providerResponse ?? debug.upstreamResponse ?? error?.upstream ?? null;
  const providerRequest = options.providerRequest ?? debug.upstreamRequest ?? null;
  const providerRawText = options.providerRawText ?? providerResponse?.rawText ?? null;
  const statusCode = Number(options.statusCode || error?.statusCode || error?.status || providerResponse?.status || 500);
  const event = {
    id: eventId,
    requestId: options.requestId || req?.requestId || id("req"),
    userId: options.userId ?? req?.user?.id ?? null,
    sessionId: options.sessionId ?? req?.params?.sessionId ?? null,
    projectId: options.projectId ?? req?.params?.projectId ?? null,
    taskId: options.taskId ?? req?.params?.taskId ?? null,
    nodeId: options.nodeId ?? req?.params?.nodeId ?? null,
    source: options.source || "backend",
    severity: options.severity || (statusCode >= 500 ? "error" : "warning"),
    code: options.code || inferErrorCode(error),
    message: String(options.message || error?.message || "Unknown error"),
    stack: options.stack || error?.stack || null,
    route: options.route || req?.originalUrl || req?.url || "",
    method: options.method || req?.method || "",
    statusCode,
    durationMs: options.durationMs ?? (req?.startedAt ? Date.now() - req.startedAt : null),
    providerStatus: options.providerStatus ?? providerResponse?.status ?? null,
    providerTaskId: options.providerTaskId ?? options.upstreamTaskId ?? null,
    retryCount: options.retryCount ?? 0,
    request: options.request ?? { body: req?.body ?? null, query: req?.query ?? null, params: req?.params ?? null },
    response: options.response ?? error?.body ?? null,
    providerRequest,
    providerResponse,
    providerRawText,
    context: options.context ?? {},
    breadcrumbs: options.breadcrumbs ?? [],
    userAgent: options.userAgent || req?.get?.("user-agent") || "",
    ipHash: options.ipHash || ipHash(req),
  };
  const full = fullErrorPayload(event);
  const fullPath = path.join(fullLogDir, `${event.id}.json`);
  fs.writeFileSync(fullPath, `${JSON.stringify(full, null, 2)}\n`);
  statements.insertErrorEvent.run({
    id: event.id,
    requestId: event.requestId,
    userId: event.userId,
    sessionId: event.sessionId,
    projectId: event.projectId,
    taskId: event.taskId,
    nodeId: event.nodeId,
    source: event.source,
    severity: event.severity,
    code: event.code,
    message: redactString(event.message),
    stack: event.stack ? redactString(event.stack) : null,
    route: event.route,
    method: event.method,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    providerStatus: event.providerStatus,
    providerTaskId: event.providerTaskId,
    retryCount: event.retryCount,
    requestJson: jsonStringify(full.request),
    responseJson: jsonStringify(full.response),
    providerRequestJson: jsonStringify(full.providerRequest),
    providerResponseJson: jsonStringify(full.providerResponse),
    providerRawText: full.providerRawText === null || full.providerRawText === undefined ? null : String(full.providerRawText),
    contextJson: jsonStringify(full.context),
    breadcrumbsJson: jsonStringify(full.breadcrumbs),
    userAgent: full.userAgent,
    ipHash: full.ipHash,
    fullLogPath: fullPath,
  });
  const summary = redactDeep({
    id: event.id,
    requestId: event.requestId,
    userId: event.userId,
    source: event.source,
    severity: event.severity,
    code: event.code,
    message: event.message,
    route: event.route,
    method: event.method,
    statusCode: event.statusCode,
    taskId: event.taskId,
    projectId: event.projectId,
    sessionId: event.sessionId,
    createdAt: full.createdAt,
    fullLogPath: fullPath,
  });
  fs.appendFileSync(todayLogFile(), `${JSON.stringify(summary)}\n`);
  return { eventId: event.id, requestId: event.requestId, code: event.code };
}

function sendLoggedError(req, res, error, options = {}) {
  const statusCode = Number(options.statusCode || error?.statusCode || error?.status || 500);
  const logged = createErrorEvent(req, error, { ...options, statusCode });
  res.status(statusCode).json({
    error: {
      message: redactString(options.publicMessage || error?.message || "请求失败。"),
      code: logged.code,
      requestId: logged.requestId,
      eventId: logged.eventId,
      ...(options.extra || {}),
    },
  });
}

function deriveKey() {
  return crypto.createHash("sha256").update(appSecret).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(value) {
  const [ivRaw, tagRaw, encryptedRaw] = String(value || "").split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function redact(value) {
  return String(value || "").replace(/sk-[A-Za-z0-9._-]+/g, "sk-<redacted>");
}

function safeJson(value) {
  return JSON.parse(redact(JSON.stringify(value ?? null)));
}

function maskKey(value) {
  return value ? `•••• ${String(value).slice(-4)}` : "";
}

function setSessionCookie(res, sessionId, expiresAt) {
  res.cookie(cookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    expires: new Date(expiresAt),
  });
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName);
}

function publicUser(userId) {
  const user = statements.userById.get(userId);
  if (!user) return null;
  const key = statements.apiKeyForUser.get(userId);
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    apiKey: key
      ? {
          configured: true,
          preview: maskKey(key.api_key_last4),
          updatedAt: key.updated_at,
          baseUrl: providerBaseUrl,
        }
      : {
          configured: false,
          preview: "",
          updatedAt: null,
          baseUrl: providerBaseUrl,
        },
  };
}

function requireAuth(req, res, next) {
  const sessionId = req.signedCookies?.[cookieName];
  if (!sessionId) {
    const error = new Error("请先登录。");
    error.statusCode = 401;
    error.code = "AUTH_REQUIRED";
    sendLoggedError(req, res, error, { source: "auth", statusCode: 401 });
    return;
  }

  const session = statements.sessionById.get(sessionId);
  if (!session) {
    clearSessionCookie(res);
    const error = new Error("登录已过期，请重新登录。");
    error.statusCode = 401;
    error.code = "AUTH_SESSION_EXPIRED";
    sendLoggedError(req, res, error, { source: "auth", statusCode: 401 });
    return;
  }

  req.user = { id: session.user_id, email: session.email };
  next();
}

function requireProject(req, res, next) {
  const project = statements.projectById.get(req.params.projectId, req.user.id);
  if (!project) {
    const error = new Error("项目不存在或无权访问。");
    error.statusCode = 404;
    error.code = "VALIDATION_ERROR";
    sendLoggedError(req, res, error, { source: "backend", statusCode: 404, projectId: req.params.projectId });
    return;
  }
  req.project = project;
  next();
}

function toFlowNode(row) {
  return {
    id: row.id,
    type: row.type,
    position: { x: row.x, y: row.y },
    width: row.width || undefined,
    height: row.height || undefined,
    data: jsonParse(row.data_json, {}),
  };
}

function toFlowEdge(row) {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    type: "smoothstep",
    animated: ["render", "continuation"].includes(row.kind),
    data: { ...jsonParse(row.data_json, {}), kind: row.kind },
  };
}

function saveNode(projectId, node) {
  statements.upsertNode.run({
    id: node.id || id("node"),
    projectId,
    type: node.type || "shot",
    x: Number(node.position?.x ?? node.x ?? 0),
    y: Number(node.position?.y ?? node.y ?? 0),
    width: node.width ?? null,
    height: node.height ?? null,
    dataJson: jsonStringify(node.data || {}),
  });
}

function saveEdge(projectId, edge) {
  statements.upsertEdge.run({
    id: edge.id || id("edge"),
    projectId,
    source: edge.source,
    target: edge.target,
    kind: edge.data?.kind || edge.kind || "render",
    dataJson: jsonStringify(edge.data || {}),
  });
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
    status: "draft",
    ...overrides,
  };
}

function createSampleCanvas(projectId) {
  const shotId = id("shot");
  const noteId = id("note");
  saveNode(projectId, {
    id: shotId,
    type: "shot",
    position: { x: 80, y: 120 },
    data: defaultShotData({
      title: "Clip 1",
      prompt: "A cinematic opening shot of a glass studio desk at sunrise, soft light moving across the surface, elegant and quiet.",
    }),
  });
  saveNode(projectId, {
    id: noteId,
    type: "note",
    position: { x: 80, y: -80 },
    data: {
      title: "开始",
      body: "右键画布创建镜头卡片。生成完成后，点击视频卡片上的“续写下一段”。",
    },
  });
}

function makeProject(userId, name = "我的连续视频") {
  const projectId = id("project");
  statements.createProject.run(projectId, userId, name);
  createSampleCanvas(projectId);
  return statements.projectById.get(projectId, userId);
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["completed", "succeeded", "success"].includes(value)) return "completed";
  if (["queued", "pending", "submitted", "created", "not_start"].includes(value)) return "queued";
  if (["in_progress", "processing", "running"].includes(value)) return "in_progress";
  if (["failed", "failure", "error"].includes(value)) return "failed";
  if (["cancelled", "canceled", "expired"].includes(value)) return value;
  return value || "unknown";
}

function normalizeProgress(progress) {
  if (progress === undefined || progress === null || progress === "") return null;
  const value = typeof progress === "string" ? progress.replace("%", "") : progress;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(Math.round(number), 0), 100);
}

function pick(object, paths) {
  for (const pathExpression of paths) {
    let cursor = object;
    for (const part of pathExpression.split(".")) {
      if (!cursor || typeof cursor !== "object" || !(part in cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") {
      return cursor;
    }
  }
  return undefined;
}

function normalizeTask(body) {
  const upstreamTaskId = pick(body, ["task_id", "id", "data.task_id", "data.id"]);
  const status = normalizeStatus(pick(body, ["status", "data.data.status", "data.status"]));
  const videoUrl = pick(body, [
    "data.data.video_url",
    "video_url",
    "url",
    "content.video_url",
    "data.data.url",
    "data.output.video_url",
    "data.output.url",
    "data.url",
    "data.video_url",
    "data.content.video_url",
  ]);
  const resultUrl = pick(body, ["data.result_url", "result_url"]);
  const progress = normalizeProgress(pick(body, ["progress", "data.data.progress", "data.progress"]));
  const failReason = pick(body, ["fail_reason", "data.fail_reason", "data.data.error", "error.message", "message"]);
  return { upstreamTaskId, status, videoUrl, resultUrl, progress, failReason, raw: body };
}

function ratioToSize(ratio) {
  const sizes = {
    "16:9": [1280, 720],
    "9:16": [720, 1280],
    "1:1": [1024, 1024],
    "4:3": [1152, 864],
    "3:4": [864, 1152],
  };
  return sizes[ratio] || sizes["16:9"];
}

function motionLabel(value) {
  const labels = {
    locked: "locked-off camera",
    slow_push_in: "slow push in",
    pull_back: "slow pull back",
    orbit: "subtle orbit around the subject",
    truck_left: "smooth lateral tracking shot",
    handheld: "natural handheld camera movement",
    dive: "gentle crane dive",
  };
  return labels[value] || value;
}

function buildPrompt(data) {
  const parts = [String(data.prompt || "").trim()];
  if (data.cameraMotion && data.cameraMotion !== "none") {
    parts.push(`Camera motion: ${motionLabel(data.cameraMotion)}.`);
  }
  if (data.motionStrength) {
    parts.push(`Motion strength: ${data.motionStrength}.`);
  }
  if (data.negativePrompt) {
    parts.push(`Avoid: ${data.negativePrompt}.`);
  }
  return parts.filter(Boolean).join(" ");
}

function buildGenerationPayload(data) {
  const prompt = buildPrompt(data);
  if (!prompt) {
    const error = new Error("请输入提示词。");
    error.statusCode = 400;
    throw error;
  }

  const duration = Math.min(Math.max(Number(data.duration || 5), 3), 15);
  const [width, height] = ratioToSize(data.ratio);
  const seed = data.seed === "" || data.seed === undefined ? undefined : Number(data.seed);
  const referenceImage = String(data.firstFrameUrl || data.referenceImageUrl || "").trim();

  const metadata = {
    ratio: data.ratio || "16:9",
    resolution: data.resolution || "720p",
    watermark: Boolean(data.watermark),
    generate_audio: Boolean(data.generateAudio),
    camera_motion: data.cameraMotion || "slow_push_in",
    motion_strength: data.motionStrength || "medium",
  };

  if (Number.isFinite(seed)) metadata.seed = seed;
  if (data.firstFrameUrl) metadata.first_frame_url = data.firstFrameUrl;
  if (data.lastFrameUrl) metadata.last_frame_url = data.lastFrameUrl;
  if (data.referenceImageUrl) metadata.reference_image_url = data.referenceImageUrl;

  const payload = {
    model: data.model || defaultModel,
    prompt,
    duration,
    width,
    height,
    n: 1,
    metadata,
  };

  if (referenceImage) {
    payload.image = referenceImage;
  }

  return payload;
}

function resolveProviderImageInput(userId, value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/api/assets/")) return raw;

  const assetId = raw.split("/api/assets/")[1]?.split(/[?#]/)[0];
  if (!assetId) return raw;
  const asset = statements.assetForUser.get(assetId, userId);
  if (!asset?.file_path || !fs.existsSync(asset.file_path)) return raw;

  const ext = path.extname(asset.file_path).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const base64 = fs.readFileSync(asset.file_path).toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function callProvider(userId, method, pathname, payload) {
  const keyRecord = statements.apiKeyForUser.get(userId);
  if (!keyRecord) {
    const error = new Error("请先配置 API key。");
    error.statusCode = 400;
    error.code = "API_KEY_MISSING";
    throw error;
  }

  const apiKey = decryptSecret(keyRecord.api_key_encrypted);
  const upstreamUrl = `${providerBaseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };
  const debug = {
    upstreamRequest: {
      method,
      url: upstreamUrl,
      headers: safeJson(headers),
      body: safeJson(payload ?? null),
    },
  };

  const response = await fetch(upstreamUrl, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const rawText = await response.text();
  let body;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { raw: rawText };
  }
  debug.upstreamResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: safeJson(body),
    rawText: redact(rawText),
  };

  if (!response.ok || body.error) {
    const message = body?.error?.message || body?.message || rawText || `HTTP ${response.status}`;
    const error = new Error(redact(message));
    error.statusCode = response.status || 500;
    error.code = inferErrorCode({ message, statusCode: response.status }, "PROVIDER_HTTP_ERROR");
    error.upstream = safeJson(body);
    error.debug = debug;
    throw error;
  }

  return { body, debug };
}

async function extractLastFrame({ userId, projectId, taskId, videoUrl }) {
  if (!videoUrl) return null;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cvc-frame-"));
  const tempVideo = path.join(tempRoot, "source.mp4");
  const tempFrame = path.join(tempRoot, "last-frame.jpg");
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`下载视频失败：HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempVideo, buffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-sseof",
      "-0.1",
      "-i",
      tempVideo,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      tempFrame,
    ]);

    if (!fs.existsSync(tempFrame)) return null;
    const assetId = id("asset");
    const assetPath = path.join(assetDir, `${assetId}.jpg`);
    fs.copyFileSync(tempFrame, assetPath);
    statements.createAsset.run(
      assetId,
      projectId,
      userId,
      "last_frame",
      "extracted",
      `/api/assets/${assetId}`,
      assetPath,
      jsonStringify({ taskId, videoUrl }),
    );
    return assetId;
  } catch (error) {
    return null;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function updateRenderNode(projectId, nodeId, patch) {
  const row = statements.nodeById.get(nodeId, projectId);
  if (!row) return;
  const data = { ...jsonParse(row.data_json, {}), ...patch };
  saveNode(projectId, {
    id: row.id,
    type: row.type,
    position: { x: row.x, y: row.y },
    width: row.width,
    height: row.height,
    data,
  });
}

async function refreshTask(task, userId, req = null) {
  if (!task.upstream_task_id || ["completed", "failed", "cancelled", "expired"].includes(task.status)) {
    return task;
  }

  try {
    const { body, debug } = await callProvider(
      userId,
      "GET",
      `/v1/video/generations/${encodeURIComponent(task.upstream_task_id)}`,
    );
    const normalized = normalizeTask(body);
    const nextStatus = normalized.status || task.status;
    let lastFrameAssetId = task.last_frame_asset_id;

    if (nextStatus === "completed" && normalized.videoUrl && !lastFrameAssetId) {
      lastFrameAssetId = await extractLastFrame({
        userId,
        projectId: task.project_id,
        taskId: task.id,
        videoUrl: normalized.videoUrl,
      });
    }

    statements.updateTaskState.run(
      nextStatus,
      normalized.progress ?? task.progress,
      jsonStringify(safeJson(body)),
      jsonStringify(debug),
      normalized.failReason && nextStatus === "failed" ? jsonStringify({ message: normalized.failReason }) : task.error_json,
      normalized.videoUrl || task.video_url,
      normalized.resultUrl || task.result_url,
      lastFrameAssetId,
      nextStatus,
      task.id,
    );

    updateRenderNode(task.project_id, task.result_node_id, {
      status: nextStatus,
      progress: normalized.progress ?? task.progress,
      videoUrl: normalized.videoUrl || task.video_url,
      resultUrl: normalized.resultUrl || task.result_url,
      lastFrameAssetId,
      error: nextStatus === "failed" ? normalized.failReason : "",
    });

    return statements.taskById.get(task.id);
  } catch (error) {
    statements.updateTaskError.run(
      jsonStringify({ message: error.message, upstream: error.upstream }),
      jsonStringify(error.debug || {}),
      task.id,
    );
    if (req) {
      const logged = createErrorEvent(req, error, {
        source: "task_polling",
        code: error.code || "TASK_POLL_FAILED",
        projectId: task.project_id,
        taskId: task.id,
        nodeId: task.result_node_id,
        request: { taskId: task.id, upstreamTaskId: task.upstream_task_id },
        response: { message: error.message, upstream: error.upstream },
        debug: error.debug,
        statusCode: error.statusCode || 500,
      });
      updateRenderNode(task.project_id, task.result_node_id, {
        errorCode: logged.code,
        requestId: logged.requestId,
        eventId: logged.eventId,
      });
    }
    updateRenderNode(task.project_id, task.result_node_id, {
      status: "failed",
      error: error.message,
    });
    return statements.taskById.get(task.id);
  }
}

function taskResponse(task) {
  return {
    id: task.id,
    projectId: task.project_id,
    sourceNodeId: task.source_node_id,
    resultNodeId: task.result_node_id,
    upstreamTaskId: task.upstream_task_id,
    status: task.status,
    progress: task.progress,
    videoUrl: task.video_url,
    resultUrl: task.result_url,
    lastFrameAssetId: task.last_frame_asset_id,
    error: jsonParse(task.error_json, null),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  };
}

statements.cleanupSessions.run();

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: { message: "请输入有效邮箱。" } });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: { message: "密码至少需要 8 位。" } });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: { message: "两次密码不一致。" } });
      return;
    }
    if (statements.userByEmail.get(email)) {
      res.status(409).json({ error: { message: "该邮箱已注册。" } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = statements.createUser.run(email, passwordHash);
    makeProject(result.lastInsertRowid, "我的第一条视频链");
    const sessionId = id("session");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    statements.createSession.run(sessionId, result.lastInsertRowid, expiresAt);
    setSessionCookie(res, sessionId, expiresAt);
    res.status(201).json({ user: publicUser(result.lastInsertRowid) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = statements.userByEmail.get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: { message: "邮箱或密码不正确。" } });
      return;
    }
    const projects = statements.projectsForUser.all(user.id);
    if (!projects.length) makeProject(user.id, "我的第一条视频链");
    const sessionId = id("session");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    statements.createSession.run(sessionId, user.id, expiresAt);
    setSessionCookie(res, sessionId, expiresAt);
    res.json({ user: publicUser(user.id) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const sessionId = req.signedCookies?.[cookieName];
  if (sessionId) statements.deleteSession.run(sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const sessionId = req.signedCookies?.[cookieName];
  if (!sessionId) {
    res.json({ user: null, provider: { baseUrl: providerBaseUrl, model: defaultModel } });
    return;
  }
  const session = statements.sessionById.get(sessionId);
  if (!session) {
    clearSessionCookie(res);
    res.json({ user: null, provider: { baseUrl: providerBaseUrl, model: defaultModel } });
    return;
  }
  res.json({ user: publicUser(session.user_id), provider: { baseUrl: providerBaseUrl, model: defaultModel } });
});

function errorRowToDetail(row) {
  if (!row) return null;
  return {
    eventId: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    sessionId: row.session_id,
    projectId: row.project_id,
    taskId: row.task_id,
    nodeId: row.node_id,
    source: row.source,
    severity: row.severity,
    code: row.code,
    message: row.message,
    stack: row.stack,
    route: row.route,
    method: row.method,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    providerStatus: row.provider_status,
    providerTaskId: row.provider_task_id,
    retryCount: row.retry_count,
    request: jsonParse(row.request_json, null),
    response: jsonParse(row.response_json, null),
    providerRequest: jsonParse(row.provider_request_json, null),
    providerResponse: jsonParse(row.provider_response_json, null),
    providerRawText: row.provider_raw_text,
    context: jsonParse(row.context_json, null),
    breadcrumbs: jsonParse(row.breadcrumbs_json, []),
    userAgent: row.user_agent,
    ipHash: row.ip_hash,
    fullLogPath: row.full_log_path,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

app.post("/api/client-errors", requireAuth, (req, res) => {
  const error = new Error(String(req.body.message || "前端错误"));
  error.stack = req.body.stack || "";
  error.code = req.body.code || "CLIENT_RUNTIME_ERROR";
  const logged = createErrorEvent(req, error, {
    source: "frontend",
    severity: req.body.severity || "error",
    code: error.code,
    route: req.body.route || req.originalUrl,
    request: req.body.request || null,
    response: req.body.response || null,
    context: req.body.context || {},
    breadcrumbs: req.body.breadcrumbs || [],
    statusCode: 500,
  });
  res.status(201).json({ ok: true, ...logged });
});

app.get("/api/error-events", requireAuth, (req, res) => {
  const filters = {
    severity: String(req.query.severity || ""),
    source: String(req.query.source || ""),
    code: String(req.query.code || ""),
    taskId: String(req.query.taskId || ""),
    projectId: String(req.query.projectId || ""),
    sessionId: String(req.query.sessionId || ""),
    nodeId: String(req.query.nodeId || ""),
    limit: Math.min(Math.max(Number(req.query.limit || 100), 1), 500),
  };
  const events = statements.errorEventsForUser.all(
    req.user.id,
    filters.severity,
    filters.severity,
    filters.source,
    filters.source,
    filters.code,
    filters.code,
    filters.taskId,
    filters.taskId,
    filters.projectId,
    filters.projectId,
    filters.sessionId,
    filters.sessionId,
    filters.nodeId,
    filters.nodeId,
    filters.limit,
  ).map((row) => ({
    eventId: row.id,
    requestId: row.request_id,
    source: row.source,
    severity: row.severity,
    code: row.code,
    message: row.message,
    route: row.route,
    method: row.method,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    taskId: row.task_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    nodeId: row.node_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
  res.json({ events });
});

app.get("/api/error-events/:eventId", requireAuth, (req, res) => {
  const row = statements.errorEventForUser.get(req.params.eventId, req.user.id);
  if (!row) {
    res.status(404).json({ error: { message: "错误日志不存在。", code: "VALIDATION_ERROR", requestId: req.requestId } });
    return;
  }
  if (row.full_log_path && fs.existsSync(row.full_log_path)) {
    const file = jsonParse(fs.readFileSync(row.full_log_path, "utf8"), null);
    if (file) {
      res.json({ event: file });
      return;
    }
  }
  res.json({ event: errorRowToDetail(row) });
});

app.get("/api/error-events/:eventId/download", requireAuth, (req, res) => {
  const row = statements.errorEventForUser.get(req.params.eventId, req.user.id);
  if (!row) {
    res.status(404).json({ error: { message: "错误日志不存在。", code: "VALIDATION_ERROR", requestId: req.requestId } });
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${row.id}.json"`);
  if (row.full_log_path && fs.existsSync(row.full_log_path)) {
    res.send(fs.readFileSync(row.full_log_path, "utf8"));
    return;
  }
  res.send(`${JSON.stringify(errorRowToDetail(row), null, 2)}\n`);
});

app.patch("/api/error-events/:eventId", requireAuth, (req, res) => {
  statements.patchErrorEvent.run(Boolean(req.body.resolved), req.params.eventId, req.user.id);
  const row = statements.errorEventForUser.get(req.params.eventId, req.user.id);
  res.json({ event: errorRowToDetail(row) });
});

app.put("/api/me/api-key", requireAuth, (req, res) => {
  const apiKey = String(req.body.apiKey || "").trim();
  if (!apiKey) {
    res.status(400).json({ error: { message: "API key 不能为空。" } });
    return;
  }
  statements.upsertApiKey.run(req.user.id, encryptSecret(apiKey), apiKey.slice(-4));
  res.json({ apiKey: publicUser(req.user.id).apiKey });
});

app.delete("/api/me/api-key", requireAuth, (req, res) => {
  statements.deleteApiKey.run(req.user.id);
  res.json({ apiKey: publicUser(req.user.id).apiKey });
});

app.get("/api/me/api-key/status", requireAuth, (req, res) => {
  res.json({ apiKey: publicUser(req.user.id).apiKey });
});

function titleFromPrompt(text) {
  const title = String(text || "").trim().replace(/\s+/g, " ").slice(0, 22);
  return title || "新的对话制作";
}

function parsePlannerInput(text, overrides = {}) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const durationMatch = raw.match(/(\d+)\s*(秒|s|second|seconds)/i);
  let duration = durationMatch ? Number(durationMatch[1]) : 5;
  duration = Math.min(Math.max(duration, 3), 15);
  let ratio = "16:9";
  if (/9[:：]16|竖屏|抖音|小红书|reels|tiktok/i.test(raw)) ratio = "9:16";
  if (/1[:：]1|方图|方形/i.test(raw)) ratio = "1:1";
  if (/4[:：]3/i.test(raw)) ratio = "4:3";
  if (/3[:：]4/i.test(raw)) ratio = "3:4";

  let cameraMotion = "slow_push_in";
  if (/固定|静止|locked/i.test(raw)) cameraMotion = "locked";
  if (/拉远|pull/i.test(raw)) cameraMotion = "pull_back";
  if (/环绕|orbit|旋转/i.test(raw)) cameraMotion = "orbit";
  if (/横移|tracking|横向/i.test(raw)) cameraMotion = "truck_left";
  if (/手持|handheld/i.test(raw)) cameraMotion = "handheld";
  if (/俯冲|dive/i.test(raw)) cameraMotion = "dive";

  const negative = [];
  if (/不要文字|无文字|no text/i.test(raw)) negative.push("text, captions, subtitles");
  if (/不要logo|无logo|no logo/i.test(raw)) negative.push("logo, watermark");
  const referenceUrl = raw.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i)?.[0] || "";
  const storyboard = /分镜|镜头|三段|3段|storyboard|连续/i.test(raw);
  const verticalUseCase = /抖音|小红书|短视频|手机/i.test(raw);
  const styleWords = [];
  if (/高级|premium|质感/i.test(raw)) styleWords.push("premium commercial look, refined studio lighting");
  if (/电影|cinematic/i.test(raw)) styleWords.push("cinematic lighting, filmic depth");
  if (/赛博|cyber/i.test(raw)) styleWords.push("cyberpunk neon atmosphere");
  if (/可爱|cute/i.test(raw)) styleWords.push("cute playful visual tone");

  const modelPrompt = [
    raw || "A refined cinematic short video.",
    styleWords.join(", "),
    `Camera motion: ${motionLabel(cameraMotion)}.`,
    verticalUseCase ? "Optimized for vertical social media composition." : "",
    negative.length ? `Avoid: ${negative.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  return {
    intent: storyboard ? "storyboard" : "single_clip",
    mode: referenceUrl ? "image_to_video" : "text_to_video",
    displayPrompt: raw,
    modelPrompt,
    negativePrompt: negative.join(", "),
    duration,
    ratio,
    resolution: "720p",
    model: defaultModel,
    cameraMotion,
    motionStrength: /强烈|高运动|fast/i.test(lower) ? "high" : /轻微|慢|subtle/i.test(lower) ? "low" : "medium",
    referenceImageUrl: referenceUrl,
    firstFrameUrl: referenceUrl,
    lastFrameUrl: "",
    variantCount: /3个|三个|变体|variant/i.test(raw) ? 3 : 1,
    needsClarification: raw.length < 8,
    clarifyingQuestion: raw.length < 8 ? "你想让视频里展示什么主体？也可以直接使用默认参数生成。" : "",
    confidence: raw.length < 8 ? 0.42 : 0.82,
    ...overrides,
  };
}

function sessionResponse(session) {
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    linkedProjectId: session.linked_project_id,
    messageCount: session.message_count,
    taskCount: session.task_count,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

function messageResponse(message) {
  return {
    id: message.id,
    sessionId: message.session_id,
    role: message.role,
    type: message.type,
    content: jsonParse(message.content_json, {}),
    createdAt: message.created_at,
  };
}

function creationSessionForRequest(req, res) {
  const session = statements.creationSessionForUser.get(req.params.sessionId, req.user.id);
  if (!session) {
    const error = new Error("对话会话不存在或无权访问。");
    error.statusCode = 404;
    error.code = "VALIDATION_ERROR";
    sendLoggedError(req, res, error, { source: "backend", sessionId: req.params.sessionId, statusCode: 404 });
    return null;
  }
  return session;
}

app.get("/api/creation-sessions", requireAuth, (req, res) => {
  const sessions = statements.creationSessionsForUser.all(req.user.id).map(sessionResponse);
  res.json({ sessions, recentErrors: statements.recentErrorsForUser.all(req.user.id).map((row) => ({
    eventId: row.id,
    requestId: row.request_id,
    source: row.source,
    severity: row.severity,
    code: row.code,
    message: row.message,
    route: row.route,
    taskId: row.task_id,
    createdAt: row.created_at,
  })) });
});

app.post("/api/creation-sessions", requireAuth, (req, res) => {
  try {
    const sessionId = id("chat");
    const title = String(req.body.title || "新的对话制作").trim() || "新的对话制作";
    const project = makeProject(req.user.id, `${title} · 专业画布`);
    statements.createCreationSession.run(sessionId, req.user.id, title, project.id);
    const session = statements.creationSessionForUser.get(sessionId, req.user.id);
    res.status(201).json({ session: sessionResponse(session) });
  } catch (error) {
    sendLoggedError(req, res, error, { source: "backend", code: "SESSION_CREATE_FAILED", statusCode: 500 });
  }
});

app.get("/api/creation-sessions/:sessionId", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  const messages = statements.creationMessages.all(session.id).map(messageResponse);
  const plan = statements.latestCreationPlan.get(session.id);
  const tasks = statements.sessionTasks.all(session.id).map((task) => ({
    id: task.task_id,
    status: task.status,
    progress: task.progress,
    videoUrl: task.video_url,
    resultNodeId: task.result_node_id,
    sourceNodeId: task.source_node_id,
    upstreamTaskId: task.upstream_task_id,
    clipOrder: task.clip_order,
    createdAt: task.created_at,
  }));
  const latestTaskCreatedAt = tasks[tasks.length - 1]?.createdAt || "";
  const inferredPlanStatus =
    plan?.status === "ready" && latestTaskCreatedAt && latestTaskCreatedAt >= plan.created_at
      ? "submitted"
      : plan?.status;
  res.json({
    session: sessionResponse(session),
    messages,
    plan: plan ? { id: plan.id, intent: plan.intent, status: inferredPlanStatus, plan: jsonParse(plan.plan_json, {}) } : null,
    tasks,
  });
});

app.patch("/api/creation-sessions/:sessionId", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  statements.updateCreationSession.run(req.body.title || null, req.body.status || null, req.body.linkedProjectId || null, session.id, req.user.id);
  res.json({ session: sessionResponse(statements.creationSessionForUser.get(session.id, req.user.id)) });
});

app.delete("/api/creation-sessions/:sessionId", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  statements.deleteCreationSession.run(session.id, req.user.id);
  res.json({ ok: true });
});

app.get("/api/creation-sessions/:sessionId/messages", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  res.json({ messages: statements.creationMessages.all(session.id).map(messageResponse) });
});

app.post("/api/creation-sessions/:sessionId/messages", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  try {
    const messageId = id("msg");
    const role = req.body.role || "user";
    const type = req.body.type || "text";
    const content = req.body.content || { text: String(req.body.text || "") };
    statements.createCreationMessage.run(messageId, session.id, role, type, jsonStringify(redactDeep(content)));
    statements.updateCreationSession.run(titleFromPrompt(content.text) || null, null, null, session.id, req.user.id);
    res.status(201).json({ message: messageResponse(statements.creationMessages.all(session.id).find((item) => item.id === messageId)) });
  } catch (error) {
    sendLoggedError(req, res, error, { source: "backend", code: "MESSAGE_SAVE_FAILED", sessionId: session.id, statusCode: 500 });
  }
});

app.post("/api/creation-sessions/:sessionId/plan", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  try {
    const text = String(req.body.text || req.body.prompt || "");
    const userMessageId = id("msg");
    statements.createCreationMessage.run(userMessageId, session.id, "user", "text", jsonStringify({ text }));
    const plan = parsePlannerInput(text, req.body.overrides || {});
    const planId = id("plan");
    statements.createCreationPlan.run(planId, session.id, userMessageId, plan.intent, jsonStringify(plan), plan.needsClarification ? "needs_clarification" : "ready");
    const assistantMessageId = id("msg");
    statements.createCreationMessage.run(assistantMessageId, session.id, "assistant", "intent_card", jsonStringify({ plan }));
    if (session.title === "新的对话制作") {
      statements.updateCreationSession.run(titleFromPrompt(text), null, null, session.id, req.user.id);
    }
    res.json({ planId, sourceMessageId: userMessageId, assistantMessageId, plan });
  } catch (error) {
    sendLoggedError(req, res, error, { source: "planner", code: "PLANNER_PARSE_FAILED", sessionId: session.id, statusCode: 500 });
  }
});

app.post("/api/creation-sessions/:sessionId/generate", requireAuth, async (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  let payload;
  let taskIdValue;
  let resultNodeId;
  let sourceNodeId;
  try {
    const latestPlan = statements.latestCreationPlan.get(session.id);
    const plan = { ...(latestPlan ? jsonParse(latestPlan.plan_json, {}) : {}), ...(req.body.plan || {}) };
    const shotData = defaultShotData({
      title: `Chat Clip ${(statements.sessionTasks.all(session.id).length || 0) + 1}`,
      prompt: plan.modelPrompt || plan.displayPrompt || req.body.prompt || "",
      negativePrompt: plan.negativePrompt || "",
      duration: plan.duration || 5,
      ratio: plan.ratio || "16:9",
      resolution: plan.resolution || "720p",
      model: plan.model || defaultModel,
      referenceImageUrl: plan.referenceImageUrl || "",
      firstFrameUrl: plan.firstFrameUrl || "",
      lastFrameUrl: plan.lastFrameUrl || "",
      cameraMotion: plan.cameraMotion || "slow_push_in",
      motionStrength: plan.motionStrength || "medium",
    });
    payload = buildGenerationPayload(shotData);
    if (payload.image) payload.image = resolveProviderImageInput(req.user.id, payload.image);

    const linkedProject = session.linked_project_id
      ? statements.projectById.get(session.linked_project_id, req.user.id)
      : makeProject(req.user.id, `${session.title} · 专业画布`);
    sourceNodeId = id("shot");
    resultNodeId = id("render");
    taskIdValue = id("task");
    const clipOrder = statements.sessionTasks.all(session.id).length + 1;
    const baseX = 80 + (clipOrder - 1) * 840;
    const createLocal = db.transaction(() => {
      if (!session.linked_project_id) statements.updateCreationSession.run(null, null, linkedProject.id, session.id, req.user.id);
      saveNode(linkedProject.id, { id: sourceNodeId, type: "shot", position: { x: baseX, y: 120 }, data: shotData });
      saveNode(linkedProject.id, {
        id: resultNodeId,
        type: "render",
        position: { x: baseX + 420, y: 120 },
        data: { title: `${shotData.title} · 结果`, status: "queued", progress: 0, taskId: taskIdValue, sourceNodeId, videoUrl: "", error: "" },
      });
      saveEdge(linkedProject.id, { id: id("edge"), source: sourceNodeId, target: resultNodeId, kind: "render", data: { kind: "render" } });
      statements.createTask.run(taskIdValue, linkedProject.id, req.user.id, sourceNodeId, resultNodeId, "queued", 0, jsonStringify(safeJson(payload)), jsonStringify({ localRequest: { requestId: req.requestId, body: safeJson(req.body) } }));
      const taskMessageId = id("msg");
      statements.createCreationMessage.run(taskMessageId, session.id, "assistant", "task_card", jsonStringify({ taskId: taskIdValue, status: "queued", plan }));
      statements.linkSessionTask.run(id("sessiontask"), session.id, taskIdValue, taskMessageId, clipOrder, null, 1);
      if (latestPlan?.id) statements.updateCreationPlanStatus.run("submitted", latestPlan.id, session.id);
    });
    createLocal();

    const { body, debug } = await callProvider(req.user.id, "POST", "/v1/video/generations", payload);
    const normalized = normalizeTask(body);
    if (!normalized.upstreamTaskId) {
      const error = new Error("上游响应里没有 task id。");
      error.code = "PROVIDER_TASK_MISSING";
      error.debug = debug;
      throw error;
    }
    statements.updateTaskSubmitted.run(normalized.upstreamTaskId, normalized.status, normalized.progress ?? 0, jsonStringify(safeJson(body)), jsonStringify(debug), taskIdValue);
    updateRenderNode(linkedProject.id, resultNodeId, { status: normalized.status, progress: normalized.progress ?? 0, upstreamTaskId: normalized.upstreamTaskId });
    res.status(201).json({ task: taskResponse(statements.taskById.get(taskIdValue)), projectId: linkedProject.id, resultNodeId, sourceNodeId });
  } catch (error) {
    if (taskIdValue) {
      statements.updateTaskError.run(jsonStringify({ message: error.message, upstream: error.upstream }), jsonStringify(error.debug || {}), taskIdValue);
      if (resultNodeId && session.linked_project_id) updateRenderNode(session.linked_project_id, resultNodeId, { status: "failed", error: error.message });
    }
    const logged = createErrorEvent(req, error, {
      source: "provider",
      code: error.code || "CHAT_GENERATE_FAILED",
      sessionId: session.id,
      projectId: session.linked_project_id,
      taskId: taskIdValue,
      nodeId: resultNodeId,
      request: { body: req.body, payload },
      debug: error.debug,
      response: { message: error.message, upstream: error.upstream },
      statusCode: error.statusCode || 500,
    });
    if (taskIdValue) {
      statements.createCreationMessage.run(
        id("msg"),
        session.id,
        "assistant",
        "error",
        jsonStringify({ message: error.message, code: logged.code, requestId: logged.requestId, eventId: logged.eventId, taskId: taskIdValue }),
      );
    }
    res.status(error.statusCode || 500).json({ error: { message: error.message, code: logged.code, requestId: logged.requestId, eventId: logged.eventId, taskId: taskIdValue } });
  }
});

app.post("/api/creation-sessions/:sessionId/continue", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  const tasks = statements.sessionTasks.all(session.id);
  const last = tasks[tasks.length - 1];
  if (!last) {
    const error = new Error("还没有可续写的视频。");
    error.statusCode = 400;
    error.code = "TASK_CONTINUE_FAILED";
    sendLoggedError(req, res, error, { source: "backend", sessionId: session.id, statusCode: 400 });
    return;
  }
  const plan = parsePlannerInput(req.body.text || "延续上一镜头，继续描述下一段动作...", {
    firstFrameUrl: last.videoUrl ? "" : "",
    previousTaskId: last.task_id,
    previousVideoUrl: last.video_url,
  });
  const planId = id("plan");
  statements.createCreationPlan.run(planId, session.id, null, "continuation", jsonStringify(plan), "ready");
  const msgId = id("msg");
  statements.createCreationMessage.run(msgId, session.id, "assistant", "intent_card", jsonStringify({ plan, continuationFromTaskId: last.task_id }));
  res.status(201).json({ planId, messageId: msgId, plan });
});

app.post("/api/creation-sessions/:sessionId/send-to-canvas", requireAuth, (req, res) => {
  const session = creationSessionForRequest(req, res);
  if (!session) return;
  const projectId = session.linked_project_id || makeProject(req.user.id, `${session.title} · 专业画布`).id;
  statements.updateCreationSession.run(null, null, projectId, session.id, req.user.id);
  const tasks = statements.sessionTasks.all(session.id);
  const focusNodeId = tasks[tasks.length - 1]?.result_node_id || "";
  const msgId = id("msg");
  statements.createCreationMessage.run(msgId, session.id, "assistant", "canvas_export", jsonStringify({ projectId, focusNodeId, taskCount: tasks.length }));
  res.json({ projectId, focusNodeId, url: `/app/projects/${projectId}${focusNodeId ? `?focus=${focusNodeId}` : ""}` });
});

app.post("/api/me/api-key/test", requireAuth, async (req, res) => {
  const payload = {
    model: defaultModel,
    prompt: "Connectivity test: a clean five second shot of soft light moving across a glass creative desk, no text, no logo.",
    duration: 5,
    width: 1280,
    height: 720,
    n: 1,
    metadata: { ratio: "16:9", resolution: "720p", watermark: false },
  };

  try {
    const { body, debug } = await callProvider(req.user.id, "POST", "/v1/video/generations", payload);
    res.json({ ok: true, ...normalizeTask(body), debug });
  } catch (error) {
    const logged = createErrorEvent(req, error, {
      source: "provider",
      code: error.code || "PROVIDER_HTTP_ERROR",
      request: { body: payload },
      response: { message: error.message, upstream: error.upstream },
      debug: error.debug,
      statusCode: error.statusCode || 500,
    });
    res.status(error.statusCode || 500).json({
      error: {
        message: error.message,
        code: logged.code,
        requestId: logged.requestId,
        eventId: logged.eventId,
        upstream: error.upstream,
        debug: error.debug || {
          localRequest: { method: "POST", url: "/api/me/api-key/test", body: safeJson(payload) },
        },
      },
    });
  }
});

app.get("/api/projects", requireAuth, (req, res) => {
  let projects = statements.projectsForUser.all(req.user.id);
  if (!projects.length) {
    makeProject(req.user.id, "我的第一条视频链");
    projects = statements.projectsForUser.all(req.user.id);
  }
  res.json({ projects });
});

app.post("/api/projects", requireAuth, (req, res) => {
  const name = String(req.body.name || "未命名视频链").trim() || "未命名视频链";
  const project = makeProject(req.user.id, name);
  res.status(201).json({ project });
});

app.get("/api/projects/:projectId/canvas", requireAuth, requireProject, (req, res) => {
  const nodes = statements.nodesForProject.all(req.project.id).map(toFlowNode);
  const edges = statements.edgesForProject.all(req.project.id).map(toFlowEdge);
  res.json({
    project: req.project,
    viewport: jsonParse(req.project.viewport_json, { x: 0, y: 0, zoom: 1 }),
    nodes,
    edges,
  });
});

app.put("/api/projects/:projectId/canvas", requireAuth, requireProject, (req, res) => {
  const nodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
  const edges = Array.isArray(req.body.edges) ? req.body.edges : [];
  const viewport = req.body.viewport || { x: 0, y: 0, zoom: 1 };
  const saveCanvas = db.transaction(() => {
    statements.deleteEdgesForProject.run(req.project.id);
    statements.deleteNodesForProject.run(req.project.id);
    for (const node of nodes) saveNode(req.project.id, node);
    for (const edge of edges) saveEdge(req.project.id, edge);
    statements.updateProjectViewport.run(jsonStringify(viewport), req.project.id);
  });
  saveCanvas();
  res.json({ ok: true });
});

app.post("/api/projects/:projectId/nodes", requireAuth, requireProject, (req, res) => {
  const node = {
    id: req.body.id || id("node"),
    type: req.body.type || "shot",
    position: req.body.position || { x: 0, y: 0 },
    data: req.body.data || (req.body.type === "shot" ? defaultShotData() : {}),
  };
  saveNode(req.project.id, node);
  res.status(201).json({ node: { ...node, data: node.data } });
});

app.patch("/api/projects/:projectId/nodes/:nodeId", requireAuth, requireProject, (req, res) => {
  const row = statements.nodeById.get(req.params.nodeId, req.project.id);
  if (!row) {
    res.status(404).json({ error: { message: "节点不存在。" } });
    return;
  }
  const next = {
    id: row.id,
    type: req.body.type || row.type,
    position: {
      x: req.body.position?.x ?? row.x,
      y: req.body.position?.y ?? row.y,
    },
    width: req.body.width ?? row.width,
    height: req.body.height ?? row.height,
    data: { ...jsonParse(row.data_json, {}), ...(req.body.data || {}) },
  };
  saveNode(req.project.id, next);
  res.json({ node: next });
});

app.delete("/api/projects/:projectId/nodes/:nodeId", requireAuth, requireProject, (req, res) => {
  statements.deleteNodeEdges.run(req.project.id, req.params.nodeId, req.params.nodeId);
  statements.deleteNode.run(req.params.nodeId, req.project.id);
  res.json({ ok: true });
});

app.post("/api/projects/:projectId/nodes/:nodeId/generate", requireAuth, requireProject, async (req, res) => {
  const sourceNode = statements.nodeById.get(req.params.nodeId, req.project.id);
  if (!sourceNode) {
    res.status(404).json({ error: { message: "生成卡片不存在。" } });
    return;
  }

  let payload;
  const sourceData = { ...jsonParse(sourceNode.data_json, {}), ...(req.body.data || {}) };
  try {
    payload = buildGenerationPayload(sourceData);
    if (payload.image) {
      payload.image = resolveProviderImageInput(req.user.id, payload.image);
    }
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: { message: error.message } });
    return;
  }

  const resultNodeId = id("render");
  const localTaskId = id("task");
  const edgeId = id("edge");
  const resultNode = {
    id: resultNodeId,
    type: "render",
    position: { x: sourceNode.x + 420, y: sourceNode.y },
    data: {
      title: `${sourceData.title || "镜头"} · 结果`,
      status: "queued",
      progress: 0,
      taskId: localTaskId,
      sourceNodeId: sourceNode.id,
      upstreamTaskId: "",
      videoUrl: "",
      resultUrl: "",
      error: "",
    },
  };
  const edge = {
    id: edgeId,
    source: sourceNode.id,
    target: resultNodeId,
    kind: "render",
    data: { kind: "render" },
  };

  const createLocalTask = db.transaction(() => {
    saveNode(req.project.id, { ...sourceNode, position: { x: sourceNode.x, y: sourceNode.y }, data: sourceData });
    saveNode(req.project.id, resultNode);
    saveEdge(req.project.id, edge);
    statements.createTask.run(
      localTaskId,
      req.project.id,
      req.user.id,
      sourceNode.id,
      resultNodeId,
      "queued",
      0,
      jsonStringify(safeJson(payload)),
      jsonStringify({ localRequest: { method: "POST", url: `/api/projects/${req.project.id}/nodes/${sourceNode.id}/generate`, body: safeJson(req.body) } }),
    );
  });
  createLocalTask();

  try {
    const { body, debug } = await callProvider(req.user.id, "POST", "/v1/video/generations", payload);
    const normalized = normalizeTask(body);
    if (!normalized.upstreamTaskId) {
      const error = new Error("上游响应里没有 task id。");
      error.debug = debug;
      throw error;
    }
    statements.updateTaskSubmitted.run(
      normalized.upstreamTaskId,
      normalized.status,
      normalized.progress ?? 0,
      jsonStringify(safeJson(body)),
      jsonStringify(debug),
      localTaskId,
    );
    updateRenderNode(req.project.id, resultNodeId, {
      status: normalized.status,
      progress: normalized.progress ?? 0,
      upstreamTaskId: normalized.upstreamTaskId,
      videoUrl: normalized.videoUrl || "",
      resultUrl: normalized.resultUrl || "",
    });
    const task = statements.taskById.get(localTaskId);
    res.status(201).json({ task: taskResponse(task), node: toFlowNode(statements.nodeById.get(resultNodeId, req.project.id)), edge: toFlowEdge(statements.edgesForProject.all(req.project.id).find((item) => item.id === edgeId)) });
  } catch (error) {
    statements.updateTaskError.run(
      jsonStringify({ message: error.message, upstream: error.upstream }),
      jsonStringify(error.debug || {}),
      localTaskId,
    );
    updateRenderNode(req.project.id, resultNodeId, {
      status: "failed",
      error: error.message,
      errorCode: error.code || inferErrorCode(error, "NODE_GENERATE_FAILED"),
      requestId: req.requestId,
    });
    const logged = createErrorEvent(req, error, {
      source: "provider",
      code: error.code || "NODE_GENERATE_FAILED",
      projectId: req.project.id,
      taskId: localTaskId,
      nodeId: resultNodeId,
      request: { body: req.body, payload },
      response: { message: error.message, upstream: error.upstream },
      debug: error.debug,
      statusCode: error.statusCode || 500,
    });
    updateRenderNode(req.project.id, resultNodeId, {
      errorCode: logged.code,
      requestId: logged.requestId,
      eventId: logged.eventId,
    });
    res.status(error.statusCode || 500).json({
      error: {
        message: error.message,
        code: logged.code,
        requestId: logged.requestId,
        eventId: logged.eventId,
        task: taskResponse(statements.taskById.get(localTaskId)),
        node: toFlowNode(statements.nodeById.get(resultNodeId, req.project.id)),
        edge: toFlowEdge(statements.edgesForProject.all(req.project.id).find((item) => item.id === edgeId)),
        upstream: error.upstream,
        debug: error.debug,
      },
    });
  }
});

app.post("/api/projects/:projectId/render-nodes/:nodeId/continue", requireAuth, requireProject, (req, res) => {
  const renderNode = statements.nodeById.get(req.params.nodeId, req.project.id);
  if (!renderNode) {
    res.status(404).json({ error: { message: "视频结果卡片不存在。" } });
    return;
  }
  const renderData = jsonParse(renderNode.data_json, {});
  const task = renderData.taskId ? statements.taskForUser.get(renderData.taskId, req.user.id) : null;
  const sourceNode = task ? statements.nodeById.get(task.source_node_id, req.project.id) : null;
  const sourceData = sourceNode ? jsonParse(sourceNode.data_json, {}) : {};
  const firstFrameAssetId = task?.last_frame_asset_id || "";
  const firstFrameUrl = firstFrameAssetId ? `/api/assets/${firstFrameAssetId}` : "";
  const nextShotId = id("shot");
  const edgeId = id("edge");
  const nextShot = {
    id: nextShotId,
    type: "shot",
    position: { x: renderNode.x + 420, y: renderNode.y + 20 },
    data: defaultShotData({
      title: `Clip ${(Number(sourceData.clipNumber) || 1) + 1}`,
      prompt: "延续上一镜头，继续描述下一段动作...",
      duration: sourceData.duration || 5,
      ratio: sourceData.ratio || "16:9",
      resolution: sourceData.resolution || "720p",
      model: sourceData.model || defaultModel,
      cameraMotion: sourceData.cameraMotion || "slow_push_in",
      motionStrength: sourceData.motionStrength || "medium",
      firstFrameUrl,
      previousVideoUrl: task?.video_url || renderData.videoUrl || "",
      previousTaskId: task?.id || renderData.taskId || "",
      lastFrameAssetId: firstFrameAssetId,
      clipNumber: (Number(sourceData.clipNumber) || 1) + 1,
      frameLockNotice: firstFrameAssetId ? "" : "未锁定首帧，仅逻辑续写。",
    }),
  };
  const edge = {
    id: edgeId,
    source: renderNode.id,
    target: nextShotId,
    kind: "continuation",
    data: { kind: "continuation" },
  };
  saveNode(req.project.id, nextShot);
  saveEdge(req.project.id, edge);
  res.status(201).json({ node: nextShot, edge: { ...edge, type: "smoothstep", animated: true } });
});

app.get("/api/tasks/:taskId", requireAuth, async (req, res) => {
  const task = statements.taskForUser.get(req.params.taskId, req.user.id);
  if (!task) {
    res.status(404).json({ error: { message: "任务不存在。" } });
    return;
  }
  const refreshed = await refreshTask(task, req.user.id, req);
  res.json({ task: taskResponse(refreshed) });
});

app.get("/api/tasks/:taskId/debug", requireAuth, (req, res) => {
  const task = statements.taskForUser.get(req.params.taskId, req.user.id);
  if (!task) {
    res.status(404).json({ error: { message: "任务不存在。" } });
    return;
  }
  res.json({
    task: taskResponse(task),
    request: jsonParse(task.request_json, {}),
    response: jsonParse(task.response_json, null),
    error: jsonParse(task.error_json, null),
    debug: jsonParse(task.debug_json, null),
  });
});

app.get("/api/tasks/:taskId/logs", requireAuth, (req, res) => {
  const task = statements.taskForUser.get(req.params.taskId, req.user.id);
  if (!task) {
    res.status(404).json({ error: { message: "任务不存在。", code: "VALIDATION_ERROR", requestId: req.requestId } });
    return;
  }
  const events = statements.errorEventsForTask.all(req.params.taskId, req.user.id).map(errorRowToDetail);
  res.json({ task: taskResponse(task), events });
});

app.get("/api/assets/:assetId", requireAuth, (req, res) => {
  const asset = statements.assetForUser.get(req.params.assetId, req.user.id);
  if (!asset) {
    res.status(404).json({ error: { message: "素材不存在。" } });
    return;
  }
  if (asset.file_path && fs.existsSync(asset.file_path)) {
    res.sendFile(asset.file_path);
    return;
  }
  if (asset.url) {
    res.redirect(asset.url);
    return;
  }
  res.status(404).json({ error: { message: "素材文件不存在。" } });
});

app.get("/api/projects/:projectId/sequences", requireAuth, requireProject, (req, res) => {
  const clips = statements.completedTasksForProject.all(req.project.id).map((task, index) => ({
    id: task.id,
    order: index + 1,
    videoUrl: task.video_url,
    duration: jsonParse(task.request_json, {})?.duration || null,
    resultNodeId: task.result_node_id,
    sourceNodeId: task.source_node_id,
  }));
  res.json({ clips });
});

// Compatibility endpoints for the previous local tester.
app.get("/api/config", (_req, res) => {
  res.json({ baseUrl: providerBaseUrl, model: defaultModel, runtimeOnly: false });
});

const staticDir = fs.existsSync(distDir) ? distDir : publicDir;
app.use(express.static(staticDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Continuous Video Canvas is running at http://localhost:${port}`);
  console.log(`Provider is fixed to ${providerBaseUrl} with default model ${defaultModel}`);
  if (appSecret === "local-dev-secret-change-me") {
    console.log("APP_SECRET is not configured; using a local development secret.");
  }
});
