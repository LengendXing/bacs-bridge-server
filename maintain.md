# 迭代日志 · 飞书 × Claude Code 桥接系统

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
