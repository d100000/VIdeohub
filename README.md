# 连续视频画布

一个本地运行的 AI 连续视频生成平台。用户登录后配置自己的 API key，可以从“立即制作”进入对话式生成，也可以进入专业无限画布，把一个视频接到下一个视频后面，形成可连续预览的镜头链。

## 已实现

- 首页：浅色产品首页，包含“立即制作”主入口、对话式生成入口和专业画布入口。
- 对话式生成：模仿即梦式自然语言创作，支持规则化 Planner、参数解析、阶段式生成 pipeline、任务追踪、结果预览和续写下一段。
- 专业画布：React Flow 无限画布，作为高级模式使用。
- 注册 / 登录：邮箱密码账号体系，httpOnly cookie session。
- API key：使用前必须配置，后端加密保存，前端只显示后四位。
- 固定上游：视频生成 Base URL 写死为 `https://www.taijiai.online/`。
- 无限画布：React Flow 画布、右键菜单、视频卡片、结果卡片、备注卡片、参考图卡片、小地图、缩放和平移。
- 连续视频：完成的视频结果卡可以“续写下一段”，自动创建连线的下一个视频生成卡片。
- 后端持久化：SQLite 保存用户、项目、画布节点、连线、任务、请求/响应、错误和视频 URL。
- 视频存储策略：不保存视频文件本体，只保存远端 `video_url`；末帧提取只临时下载视频，完成后删除临时 mp4。
- 完整错误日志：失败会写入 SQLite 和 `data/logs/full/*.json`；详情页和下载内容保留完整请求体、返回体、上游 rawText、stack 和上下文，只脱敏敏感字段。

## 启动

```bash
npm install
npm run build
npm run dev
```

打开：

```text
http://localhost:1234
```

端口默认固定为 `1234`，也可以通过环境变量覆盖：

```bash
PORT=1234 npm run dev
```

## 环境变量

```bash
APP_SECRET=change-this-secret
SEEDANCE_MODEL=seedance-2.0-720p
PORT=1234
```

`APP_SECRET` 用于 session cookie 和 API key 加密。开发环境没有配置时会使用本地默认值，正式使用建议设置。

## 使用流程

1. 进入首页，点击“开始使用”或“进入工作台”。
2. 注册或登录。
3. 在 onboarding 页面填写 API key。
4. 进入 `/make`，选择“对话式生成”或“专业画布模式”。
5. 对话式生成：输入自然语言，系统先进入“解析创意”，再展示参数确认卡，点击生成后进入等待/生成/完成的 pipeline。
6. 专业画布模式：右键画布空白处，新建视频生成卡片。
7. 填写提示词、秒数、比例、参考图、首尾帧和镜头运动。
8. 点击“生成”，系统创建连线的结果卡片并开始轮询任务。
9. 生成完成后，视频会在结果卡片和右侧面板自动播放。
10. 点击“续写下一段”，继续生成后续镜头。
11. 底部序列预览条会按顺序播放已完成的视频 URL。
12. 如果失败，任务卡和右侧日志面板会显示简洁错误，点击后打开完整日志弹窗。

## 主要 API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `PUT /api/me/api-key`
- `GET /api/me/api-key/status`
- `POST /api/me/api-key/test`
- `GET /api/creation-sessions`
- `POST /api/creation-sessions`
- `GET /api/creation-sessions/:sessionId`
- `POST /api/creation-sessions/:sessionId/plan`
- `POST /api/creation-sessions/:sessionId/generate`
- `POST /api/creation-sessions/:sessionId/continue`
- `POST /api/creation-sessions/:sessionId/send-to-canvas`
- `POST /api/client-errors`
- `GET /api/error-events`
- `GET /api/error-events/:eventId`
- `GET /api/error-events/:eventId/download`
- `PATCH /api/error-events/:eventId`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId/canvas`
- `PUT /api/projects/:projectId/canvas`
- `POST /api/projects/:projectId/nodes`
- `PATCH /api/projects/:projectId/nodes/:nodeId`
- `DELETE /api/projects/:projectId/nodes/:nodeId`
- `POST /api/projects/:projectId/nodes/:nodeId/generate`
- `POST /api/projects/:projectId/render-nodes/:nodeId/continue`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/debug`
- `GET /api/tasks/:taskId/logs`
- `GET /api/assets/:assetId`
- `GET /api/projects/:projectId/sequences`

## 数据位置

```text
data/app.db
data/assets/
data/logs/
data/logs/full/
```

SQLite 数据库会自动创建。`data/assets/` 只保存图片资产，例如从视频临时提取出的末帧；不会保存 mp4 视频文件。

`data/logs/app-YYYY-MM-DD.ndjson` 保存错误摘要，`data/logs/full/err_xxx.json` 保存完整错误详情。完整日志不截断，只脱敏 API key、password、cookie、session 等敏感字段。

## 技术栈

- Express
- SQLite / better-sqlite3
- bcryptjs
- React
- Vite
- React Flow / XYFlow
- React Query
- Lucide Icons

## 验证记录

- `npm run build` 已通过。
- 已验证首页 HTML 和主视觉资源可访问。
- 已验证注册、项目创建、API key 加密保存、画布读取接口。
- 已验证对话式 Planner、无效 API key 生成失败、完整错误日志详情、完整 JSON 下载和前端错误上报。
- 已优化对话式生成 UI：主流程不再显示裸 JSON，改为输入、解析、任务、结果的清晰链路；右侧结果面板支持预览、参数、日志三类查询。
