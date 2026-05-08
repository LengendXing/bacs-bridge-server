# 迭代日志 · 飞书 × Claude Code 桥接系统

## v0.3.0 - 2026-05-08
### 变更内容
- **CC 状态检测**: 新增 `isIdle()` / `isProcessing()` — 通过 ❯ 提示符检测空闲/处理中
- **回复提取重构**: `extractReplyContent()` 完全重写，从 TUI 纯文本解析最终回复
  - 过滤 TUI 框架边框（╭╰│）、工具调用（●ToolName）、工具结果（⎿）、提示符（❯）
  - 保留 Unicode 表格边框（│ 开头但含中文/数据内容的行）
  - 过滤 CC 头部/侧边栏英文字段（Welcome back、Claude Code v、API Usage 等）
  - 过滤操作提示（ctrl+o、? for shortcuts、Listed N directory）
- **完成检测**: ❯ 提示符 + 稳定性确认（poll_interval * 3 秒无输出变化）→ 自动回复
- **进度通知**: `buildProgressCard()` / `buildTimeoutCard()`，每 60s 发送进度卡片
- **Markdown 回复**: `sendMarkdown()` 通过飞书交互式卡片发送，支持表格/代码块/加粗
- **并发保护**: `pendingRequests` 防止重复处理同进程消息
- **输出基线**: `startPolling` 从当前 pane 长度开始，避免旧会话内容泄漏
- **飞书 Webhook 通知**: 集成 CLAUDE.md SECTION 0 飞书实时通知（需求确认 + 进度汇报）

### 影响范围
- `communicator.js`: 新增 isIdle/isProcessing/extractReplyContent 重写/startPolling 基线修复
- `sender.js`: 新增 sendMarkdown/buildProgressCard/buildTimeoutCard
- `ws-client.js`: 重构 handleIncomingMessage，新增进度定时器/完成检测/并发保护
- `config.yaml`: progress_interval=60, timeout=600, poll_interval=2

### 功能列表
- ❯ 提示符空闲检测
- TUI 纯文本回复提取（含表格保留）
- 稳定性确认自动回复
- 60s 进度/10min 超时卡片通知
- Markdown 格式回复（交互式卡片承载）

### 待解决问题
- ⚠️ WebSocket 事件接收不稳定：2026-05-08 13:33 成功接收一次后，多次重启均未收到事件
- WS ping/pong 正常但无 event 帧到达：疑似飞书服务端事件路由因快速重连混乱
- 临时方案：等待 30s+ 后重启（给飞书清理旧连接的时间）

## v0.2.0 - 2026-05-08
### 变更内容
- 管理面板增加密码登录保护（config.yaml admin_password）
- 进程名输入改为下拉列表（自动查询 tmux claude-* 会话）
- 飞书对接从 Webhook 回调改为 WebSocket 长连接
- 绑定模型重构：feishu_target → feishu_app_id + feishu_app_secret
- 飞书凭据改为 per-binding 级别（每个 CC 进程绑定独立飞书应用）
- 管理面板嵌入飞书自建应用配置指引
- cc.sh 参数更新（--bind → --app-id + --app-secret）
- 新增 ws-client.js 模块（WebSocket 长连接管理）

### 影响范围
- 配置文件 config.yaml：移除全局 feishu 配置，新增 admin_password
- 绑定存储 store.js：字段变更（feishu_target → feishu_app_id + feishu_app_secret）
- 飞书模块：新增 ws-client.js，sender.js 改为接受 per-app 凭据
- 路由层：feishu.js 移除 webhook 回调，admin.js 新增 /api/auth + 认证中间件
- 管理面板：index.html 加登录遮罩，app.js 加认证逻辑
- cc.sh：参数从 --bind 改为 --app-id + --app-secret

### 功能列表
- 密码保护的 Web 管理面板
- CC 进程下拉列表（动态获取 tmux 会话）
- 飞书 WebSocket 长连接事件接收
- 每个 CC 进程绑定独立飞书应用
- 飞书应用配置步骤指引

## v0.1.0 - 2026-05-08
### 变更内容
- 项目初始化，目录结构和基础配置
- Bridge Server 核心实现（Express + tmux 通信）
- 进程管理模块（多实例管理、在线检测）
- 飞书 SDK 模块（签名验证、消息发送、卡片构建）
- 绑定管理模块（JSON 持久化、CRUD）
- REST API（webhook/feishu、bind/unbind/status/logs/sessions）
- cc.sh 扩展（支持 --bind 参数）
- 后台管理面板（纯 HTML+CSS+JS，Tailwind CSS，dark/light 切换）

### 影响范围
- 全新项目，无影响

### 功能列表
- 飞书事件接收与 URL 验证
- 多 CC 进程绑定管理
- tmux 会话通信（send-keys / capture-pane）
- 进度汇报与超时处理
- 管理面板（状态总览、绑定/解绑、日志查看）
- 主题切换（dark/light）
