# 迭代日志 · 飞书 × Claude Code 桥接系统

## v1.0.7 - 2026-05-11
### 变更内容
- **修复远程绑定的 ENV 注入语义**：SSH 绑定到远程机后，飞书收到 `Not logged in · Please run /login`。三处根因：
  1. `CLAUDE_BIN` 用 `${process.env.HOME}/.local/bin/claude` 拼出本地 bridge 的家目录路径，发到远程后路径不存在 → 退而执行远程 PATH 里的 `claude`；
  2. `custom` 模式只注入 `ANTHROPIC_API_KEY`，但第三方中转站普遍只认 `ANTHROPIC_AUTH_TOKEN`；
  3. 残留一行 `envParts.push('ANTHROPIC_AUTH_TOKEN=')` 把 token 显式清空，反而压制了远程已有 OAuth 凭据，也没补充新 token → 远程 claude 处于"既没 env 又没 OAuth"的失登录状态。
- **改动**（仅 ENV 层临时覆盖，绝不修改远程主机 `~/.claude/` 与 rc 文件）：
  - `src/server/cli/cc-adapter.ts`：
    - `CLAUDE_BIN` 默认改为裸 `claude`，依赖远程 PATH 解析；仍支持 `CLAUDE_BIN` 环境变量覆盖
    - `custom` 模式同时注入 `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` + `ANTHROPIC_AUTH_TOKEN`（后两者取同值）
    - 用 `env -u CLAUDE_CODE_OAUTH_TOKEN` 屏蔽远程 `claude login` 写入的 OAuth 令牌（仅在本次子进程层生效）
    - 抽出 `shellSingleQuote` 工具函数复用单引号转义
  - `src/server/session/manager.ts`：`buildCliConfig` 的 `cc` 分支 envVars 增加 `ANTHROPIC_AUTH_TOKEN: provider.apiKey`
- **行为对照**（按你"绑定即配置"诉求验证）：
  | 绑定 provider | 机器 | bridge 注入 | 远程主机 `~/.claude/` |
  |---|---|---|---|
  | local | 本机 | 无 | 用本机配置 |
  | local | 远程 | 无 | 用远程本机配置 ✅ |
  | custom | 本机 | BASE/KEY/TOKEN，unset OAUTH | 不动 ✅ |
  | custom | 远程 | BASE/KEY/TOKEN，unset OAUTH | **不动**（只在 tmux 子进程 ENV 临时覆盖）✅ |

### 测试
- `src/server/cli/cc-adapter.test.ts` 新增 6 个 `buildStartCmd` 用例：
  1. `local` 不注入任何 env
  2. `custom` 同时注入 `API_KEY` + `AUTH_TOKEN` 且 `-u CLAUDE_CODE_OAUTH_TOKEN`
  3. 不再产生 `ANTHROPIC_AUTH_TOKEN=` 清空形式
  4. 仅给 `API_KEY` 时 fallback 同步到 `AUTH_TOKEN`
  5. 单引号转义安全
  6. `CLAUDE_BIN` 未设时不带本地 HOME 路径
- 共 13 个测试用例（原 7 个 extractReply + 新 6 个 buildStartCmd）全部通过
- `npm run build` 通过；`npm run lint` 因仓库历史缺 eslint.config.js 未跑（非本次范围）

### 影响范围
- `src/server/cli/cc-adapter.ts`（CLAUDE_BIN + buildStartCmd 重写）
- `src/server/cli/cc-adapter.test.ts`（新增 buildStartCmd describe 块）
- `src/server/session/manager.ts`（envVars 增加 ANTHROPIC_AUTH_TOKEN）
- `package.json`（1.0.6 → 1.0.7）

---

## v1.0.6 - 2026-05-11
### 变更内容
- **修复 extractReply 二次防御（替代 v1.0.5 的 2b4e01d 版本）**：上一版只识别裸 `❯`（`/^\s*❯\s*$/`），漏掉 cc TUI 实际渲染的 `│ ❯ │`（被边框包裹的空闲光标）→ 残留输出仍含 `│ ❯ │` 提示行
- **改进点**：
  - 空闲光标识别正则改为 `/^\s*(?:│\s*)?❯(?:\s|$)/`，同时识别裸光标和被边框包裹的光标
  - `promptBody` 提取也剥掉左右两侧 `│` 边框，确保被边框包住的空 `│ ❯ │` 也判定为 idle
  - `after` 过滤器扩展排除：`esc to interrupt` / `ctrl+[a-z]` / `to expand` / `to redo` 等所有状态/快捷键行（之前只排除 `? for shortcuts` / `ctrl+o to expand`）
  - cleaned 阶段补充过滤 `│ ❯` 的边框包裹光标残留
- **新增 vitest 单元测试**（src/server/cli/cc-adapter.test.ts）覆盖 6 个关键场景：
  1. 用户原始现场（"现在几点了" + 闲置 ❯ + ? for shortcuts）—— 不丢失回复
  2. 多轮历史短消息只返回本轮，不混入旧回复
  3. 边框包裹的 `│ ❯ │` 识别为光标行（v1.0.5 在此测试上失败）
  4. 长回复多行保留
  5. raw 空字符串返回空（由调用方走"未能提取"分支）
  6. 完全非典型输出走 fallback，避免再次出现"未能提取"

### 测试对比（同一份测试集）
| 场景 | v1.0.5 (2b4e01d) | v1.0.6（本次）|
|---|---|---|
| 闲置 ❯ + ? for shortcuts | ❌ 残留 `│ ❯ │` | ✅ |
| 多轮历史短消息 | ✅ | ✅ |
| 边框包裹的 `│ ❯ │` | ❌ 漏识别 | ✅ |
| 长回复多行 | ✅ | ✅ |
| raw 为空 | ✅ | ✅ |
| 非典型输出兜底 | ✅ | ✅ |
| **总计** | **4/6** | **6/6** |

### 影响范围
- src/server/cli/cc-adapter.ts（extractReply 二次防御 + cleaned 阶段过滤）
- src/server/cli/cc-adapter.test.ts（新增）
- package.json（v1.0.4-Beta → v1.0.6；v1.0.5 已被旧分支占用，跳过）

### 验证方式
- `npx vitest run --root . --config /dev/null src/server/cli/cc-adapter.test.ts` → 6/6 通过
- `npm run build` → 通过
- 部署到远程机器后，飞书侧不应再收到「[CC 已完成处理，但未能提取到回复内容]」（除 raw 真为空 / cc 进程异常等极端情况）

---

## v1.0.4-Beta - 2026-05-11
### 变更内容
- **新增「快捷登录」功能（Android 客户端扫码登录）**：设置页新增「快捷登录」卡片，展示二维码 + 60s 倒计时 + 手动刷新按钮 + 倒计时归零自动刷新。客户端扫码后用短期 JWT 调 `/api/auth/exchange` 换长 JWT，避免长期 token 通过二维码泄露
- **新增「对外服务地址」配置项**：设置页新增配置入口；二维码中的 `server` 字段优先使用此值，未配置则按 `req.protocol/host` 自动推断（含 `X-Forwarded-*` 反代支持）
- **新增数据表 app_settings（KV）**：存放应用级配置；运行时 `CREATE TABLE IF NOT EXISTS` 兼容老库
- **后端新增接口**：`POST /api/auth/qr-token`（需登录，返回 60s 短 JWT + server）、`POST /api/auth/exchange`（短 token 换长 token）、`GET / PUT /api/settings/external-url`
- **JWT 模块扩展**：`signToken` 增加可选 `expiresIn` 参数
- **顺手修复（Bindings）**：选「本机环境变量」(providerId=null) 时模型下拉为空 → 改为按 cliKind 列出所有模型并按 modelId 去重，同步与 cc-adapter「无论 providerKind 只要指定 model 就生效」的注入逻辑

### 影响范围
- src/server/db/schema.ts、src/server/db/index.ts（新增 ensureAppSettingsTable）
- src/server/auth/jwt.ts（signToken 支持自定义 expiresIn）
- src/server/routes/auth.ts（新增 qr-token / exchange）
- src/server/routes/settings.ts（新增）
- src/server/index.ts（挂载 settingsRoutes）
- src/client/views/SettingsView.vue（快捷登录卡片 + 对外地址）
- src/client/views/BindingsView.vue（模型下拉修复）
- package.json（v1.0.4 → v1.0.4-Beta）

### 验证方式
- 设置页打开看到二维码 + 60s 倒计时 + 服务器地址；点「手动刷新」秒级刷新
- 倒计时归零自动刷新，时间窗合理
- 「对外服务地址」保存后立即生效（二维码 server 字段变更）
- `curl POST /api/auth/qr-token`（带有效 X-Auth-Token）→ 返回 token / server / expiresIn / expiresAt
- 客户端用短 token 调 `POST /api/auth/exchange` → 返回长 token

### 已知不修
- 二维码 token 仍允许 60s 内重复扫描（未实现"扫一次即作废"）
- 短 token 未做 AES 加密（文档列为可选项）

---

## v1.0.5 - 2026-05-11
### 变更内容
- **修复 Web 系统日志 SSE 1002 错误（关键 bug）**：`bindings/providers/models/sessions/machines/logs` 6 个 router 之前都在顶部使用 `router.use(requireAuth)` 且未限定路径，导致任何 `/api/*` 请求（包括 `/api/logs/stream`）进入 router 时都被 requireAuth 拦截 → 浏览器 EventSource 走 `?token=` 永远拿到 1002。改为每条路由单独挂 `requireAuth`，SSE 路由独立鉴权（已支持 query token）

### 影响范围
- src/server/routes/bindings.ts、providers.ts、models.ts、sessions.ts、machines.ts、logs.ts
- package.json（v1.0.4 → v1.0.5）

### 验证方式
- 浏览器登录后访问 `/logs` 页面 → 系统日志标签 → 状态从「未连接」变为「已连接」，实时显示
- curl 验证：`curl -s -i 'http://host/api/logs/stream?token=<JWT>'` 返回 200 + `text/event-stream`
- curl 不带 token 仍返回 401 文本 `Unauthorized`（鉴权未关闭）

---

## v1.0.4 - 2026-05-11
### 变更内容
- **机器管理：默认本机记录**：启动时自动 seed 一条 `local/localhost` 记录（builtin=1），写入当前系统版本（如 `Darwin 22.6.0`）。本机不允许编辑/删除/SSH 测试，操作列显示 `-`，路由层硬拦截
- **菜单顺序调整**：首页 → 机器 → 服务商 → 绑定 → 日志 → 设置
- **系统日志页面接通**：修复 `/api/logs/stream` 文件名与 logger 写入文件名不一致（`bridge-${date}.log` vs `${date}.log`）导致 SSE 永远空。新增初始 200 行回放 + 25s 心跳 + token 来源统一
- **绑定弹窗增加模型字段**：表单顺序调整为「CLI 类型 → 运行机器 → 服务商 → 模型 → 飞书 ID/密钥」。模型下拉按 `cliKind + providerId` 过滤；CLI/服务商变更时自动校验当前 modelId 是否仍有效
- **编辑绑定支持改模型**：CLI 类型保持禁改，模型字段开放编辑，提交时携带 `modelId`
- **Bug 修复（cc-adapter）**：`buildStartCmd` 之前未注入模型，导致绑定指定模型对 Claude Code 无效。现在注入 `ANTHROPIC_MODEL` 环境变量并追加 `--model` 参数
- **Bug 修复（编辑接口）**：`/api/edit` 当 `feishuAppSecret` 为空字符串时不再覆盖原密钥（前端编辑表单留空表示不改）
- **schema 扩展**：machines 表新增 `os_version`、`builtin` 列；运行时 `ALTER TABLE` 兼容老库
- **executor 路由本机短路**：`getExecutor` 检测到 builtin 机器走 LocalExecutor，避免 SSH 自连接

### 影响范围
- src/server/db/schema.ts、src/server/db/index.ts（新增 ensureMachineColumns/seedLocalMachine）
- src/server/routes/machines.ts、src/server/routes/bindings.ts、src/server/routes/logs.ts
- src/server/cli/cc-adapter.ts、src/server/executor/factory.ts
- src/client/views/LayoutView.vue、MachinesView.vue、BindingsView.vue、LogsView.vue
- src/shared/types.ts、package.json（v1.0.3 → v1.0.4）

### Review 备注
- 当前最近提交 `741915c` 已正确：`tryFinish` 不再提前置 `replied=true`
- 项目缺少 ESLint 9 配置（`eslint.config.js` 不存在）；已知问题不阻塞本次迭代
- npm audit 报 bcrypt → @mapbox/node-pre-gyp → tar 链路 14 个漏洞，修复需升级 bcrypt 6（breaking change），不在本次范围

---

## v1.0.2 - 2026-05-10
### 变更内容
- **菜单图标 macOS 线性风格**：用 lucide-vue-next 线性图标替换 emoji
- **Favicon 不显示修复**：vite.config.ts 指定 publicDir，确保 favicon.svg 复制到 dist
- **数据库迁移脚本**：新增 scripts/migrate-db.ts，支持增量迁移 + 迁移记录
- **deploy.sh 迁移集成**：构建前自动执行迁移，指向 deploy/ 目录的数据库

### 影响范围
- src/client/views/LayoutView.vue
- vite.config.ts
- scripts/migrate-db.ts（新增）
- deploy.sh
- package.json

---

## v1.0.1 - 2026-05-10
### 变更内容
- **远程机器管理模块**：新增 RemoteExecutor 抽象层 + SshExecutor + LocalExecutor
- **凭据加密**：AES-256-GCM + HKDF(JWT_SECRET) 加密存储 SSH 密码/私钥
- **数据库新增 machines 表** + bindings 增加 machineId 列
- **7 个机器管理 API**：CRUD + SSH 连接测试 + 心跳检查
- **后端全面 async 化**：CliAdapter 接口改为 async + executor 参数
- **前端 MachinesView**：机器管理页面 + 绑定页增加机器选择器
- **Logo 修复**：BACS 字母 2×2 布局（BA/CS），黑白明暗主题切换
- **Favicon 修复**：同步更新为 2×2 布局 + prefers-color-scheme

### 影响范围
- 新增 src/server/executor/（types/local/ssh/factory/ssh-factory）
- 新增 src/server/crypto/credentials.ts
- 新增 src/server/routes/machines.ts
- 新增 src/client/views/MachinesView.vue
- 改造 src/server/cli/（types/cc-adapter/codex-adapter）
- 改造 src/server/session/（manager/state）
- 改造 src/server/routes/（bindings/sessions）
- 改造 src/server/channel/feishu/ws-client.ts
- 改造 src/client/views/BindingsView.vue + LayoutView.vue + router

### 功能列表
- 注册远程 Linux/Mac 服务器（SSH 密码/密钥认证）
- SSH 连接池（自动重连/空闲断开/心跳检测）
- 绑定支持选择运行机器（本机/远程）
- 机器 CRUD + 连接测试 + 心跳
- Logo 2×2 BA/CS 黑白主题
- 完全向后兼容（machineId=null 走本地路径）

---

## v1.0.0 - 2026-05-10
### 变更内容
- **V1.0 全面重构**：从纯 JS + 静态 HTML 原型升级为 Vite + Vue 3 + TypeScript 全栈项目
- **前端框架**：Vue 3 + Composition API + shadcn-vue + Tailwind CSS，苹果 macOS 黑白灰风格
- **后端框架**：Express 4 + TypeScript，统一 API 路由
- **数据库**：SQLite + Drizzle ORM（6 张表：users / trusted_devices / providers / models / bindings / audit_logs）
- **认证系统**：JWT + bcrypt + TOTP 2FA（otplib）+ 信任设备 + 恢复码
- **CLI Adapter 抽象**：CliAdapter 接口 + CC 适配器（完整）+ Codex 适配器（骨架）
- **Channel 抽象**：Channel 接口 + 飞书渠道实现，未来可扩展 Telegram/微信
- **服务商/模型管理**：providers 表 + models 表 + 自动从 /v1/models API 拉取
- **绑定管理完整实现**：CRUD + tmux 启动/杀死 + WS 生命周期管理 + 审计日志
- **会话管理**：轮询 + 双确认空闲检测 + 硬超时兜底 + 进度通知
- **部署方案**：PM2 + ecosystem.config.cjs + deploy.sh 一键部署脚本
- **数据迁移**：migrate-bindings.ts 一次性从旧 bindings.json 迁移到 SQLite

### 影响范围
- 全部代码重写，旧 `bridge-server/` 和 `admin/` 目录已废弃
- 数据存储从 JSON 文件迁移到 SQLite
- 认证从明文密码改为 bcrypt + JWT + 2FA
- 架构从单文件模块改为分层抽象（cli / channel / session / db / auth）

### 功能列表
- Vue 3 SPA 管理面板（macOS 风格 + 暗色模式）
- 账号密码登录 + TOTP 2FA + 信任设备
- 服务商 CRUD + 模型列表自动拉取
- 绑定 CRUD（新建/挂载/编辑/解绑）
- Claude Code / Codex 双 CLI 适配
- 飞书 WebSocket 长连接（Channel 抽象）
- 审计日志 + 系统日志查看
- PM2 守护进程 + 一键部署

---

## v0.5.8 - 2026-05-10
### 变更内容
- **extractReplyContent 截断匹配优化**：从 │ > 改为 ❯ 定位本轮对话起点

### 影响范围
- `bridge-server/src/process/communicator.js`：extractReplyContent Step 0

### 功能列表
- 回复提取更精准定位到本轮用户消息之后

## v0.5.7 - 2026-05-10
### 变更内容
- **extractReplyContent 截断到本轮用户消息之后再提取**

### 影响范围
- `bridge-server/src/process/communicator.js`

## v0.5.6 - 2026-05-09
### 变更内容
- 限制每张卡片最多 4 个原生 table 元素，超出降级代码块

### 影响范围
- `bridge-server/src/feishu/sender.js`

## v0.5.5 - 2026-05-09
### 变更内容
- sendMessage 遇飞书 API 非零 code 改为 reject + 错误日志

### 影响范围
- `bridge-server/src/feishu/sender.js`

## v0.5.4 - 2026-05-09
### 变更内容
- 表格渲染重做：sender.js 将表格转为飞书原生 table 元素
- GFM 表格 + box-drawing 表格 → parseGfmTable() / parseBoxDrawingTable()
- replyToCardElements() 统一处理回复文本

### 影响范围
- `bridge-server/src/feishu/sender.js`

### 功能列表
- CC 回复中的表格在飞书以原生 table 组件渲染

## v0.5.3 - 2026-05-09
### 变更内容
- 修复 box-drawing 表格被截断/丢弃

### 影响范围
- `bridge-server/src/process/communicator.js`

## v0.5.2 - 2026-05-09
### 变更内容
- 修复 box-drawing 表格无法对齐显示

### 影响范围
- `bridge-server/src/feishu/sender.js`

## v0.5.1 - 2026-05-09
### 变更内容
- 修复 isIdle() 误判：新增 "esc to interrupt" 忙碌检测
- 修复快速响应漏抓：tryFinish() 发送前额外全量 pane 刷新

### 影响范围
- `bridge-server/src/process/communicator.js` / `bridge-server/src/feishu/ws-client.js`

## v0.5.0 - 2026-05-09
### 变更内容
- 管理面板「新建绑定」改造（自动创建 CC 进程）
- 管理面板「编辑绑定」新增
- 管理面板「解绑」改造（可选 kill tmux）
- per-process Claude 接入配置
- 新增 /api/bind/mount / /api/edit / /api/sessions/unbound

### 影响范围
- admin/ / bridge-server/src/ 全部

## v0.4.0 - 2026-05-09
### 变更内容
- extractReplyContent 重写为 ● 块分组提取
- ws-client 会话状态机重构
- sendReplyCard + GFM 表格降级 + 长回复分段
- tmux 命令注入加固（load-buffer + paste-buffer）
- 管理面板复制命令修复
- cc.sh 智能化重构

## v0.3.0 - 2026-05-08
### 变更内容
- isIdle / isProcessing + extractReplyContent 重写
- 进度/超时卡片通知
- Markdown 格式回复
- 并发保护 + 输出基线修复

## v0.2.0 - 2026-05-08
### 变更内容
- 管理面板密码登录
- 飞书 WebSocket 长连接
- per-binding 飞书凭据

## v0.1.0 - 2026-05-08
### 变更内容
- 项目初始化
- Express + tmux 通信
- 飞书 Webhook 回调
- 管理面板
