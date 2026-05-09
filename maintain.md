# 迭代日志 · 飞书 × Claude Code 桥接系统

## v0.4.0 - 2026-05-09
### 变更内容
- **回复内容缺失修复**: `extractReplyContent()` 重写为「● 块分组提取」策略
  - 助手块 vs 工具调用块分离（`● ToolName(...)` 工具调用直接 skip）
  - 支持块内续行（缩进续行 + 段内空行保留段落结构）
  - 兜底分支：找不到任何 ● 块时返回去 TUI 装饰后的全部纯文本
  - 移除激进过滤：不再因「行包含 │」就直接丢弃，避免误删表格/正文
  - 移除「`if (!/^\w+\(/.test(content))`」误判，避免代码片段被当工具调用过滤
- **回复不及时修复**: `ws-client.js` 重写会话状态机
  - 集中管理 progressTimer / stableTimer / hardDeadlineTimer，杜绝重复赋值导致的定时器泄漏
  - 稳定窗口：每次有新输出重置定时器，到期后做 `isIdle` **双确认（500ms 间隔）** 再发回复
  - 硬超时兜底：到达 `bridge.timeout` 时若 `extractReplyContent` 能拿到内容，仍发出（带"已超时兜底"标记）
  - 新增 7s 兜底空闲探测：CC 直接进入空闲未触发任何输出时也能正确收尾
  - 输出累积改为整 pane 重新 capture，避免 delta 切片错位 / pane 重绘破坏
- **回复格式修复**: `sender.js` 新增 `sendReplyCard()`
  - GFM 表格语法（`| col | col |` + `| --- |`）自动转为代码块（飞书 markdown 不支持 GFM 表格）
  - 长回复自动分段：每段 ≤ 4500 字符，按换行优先切分
  - 卡片头部展示：用户问题摘要 / 进程名 / 耗时 / 是否超时兜底
  - fallback：sendReplyCard 失败自动降级为纯文本 `sendText`
- **tmux 命令注入修复**: `communicator.sendInput()` 改用 `load-buffer + paste-buffer` 模式
  - base64 编码避免所有 shell 转义陷阱
  - 多行消息 / `$(cmd)` / 反引号 / 单双引号都安全
- **管理面板复制命令修复**: `admin/js/app.js`
  - 修正错误的 `b.session_id` 引用（后端从未返回该字段，永远复制为 `claude`）
  - 改为复制 `tmux attach -t claude-{processName}`（与 bridge 后端 SESSION_PREFIX 对齐）
  - 新增 `copyToClipboard()` 通用工具：HTTPS 走 `navigator.clipboard`，HTTP 走 `execCommand('copy')` fallback，都失败则 `window.prompt` 让用户手动复制
  - 新增 `copyStartCmd()` 用于后续展示 cc.sh 启动命令复制
- **cc.sh 智能化重构**（合并 cc1.sh 智能化点 + 去硬编码）
  - `<name> attach|go` 不存在时自动创建并进入（go 是 attach 别名）
  - `-s` 交互式模式：列出实例 → 输入名 → 存在 attach / 不存在自动创建并 attach
  - 全部硬编码（BASE_URL / API_KEY / SESSION_PREFIX）改为环境变量读取
  - 仅在显式提供 `ANTHROPIC_*` 环境变量时才注入 CC 进程
  - 保留飞书绑定参数 `--app-id/--app-secret` + bridge-server 自动注册/注销
- **死代码清理**: 删除 `bridge-server/src/feishu/crypto.js`（v0.2.0 改 WebSocket 后已无人调用，且 `config.feishu` 已不存在导致内部 `conf.app_secret` 取值就是 undefined）

### 影响范围
- `bridge-server/src/process/communicator.js`：extractReplyContent 重写、sendInput 改 load-buffer 模式、capture 行数 200→500、startPolling 增加 pane 重绘防护
- `bridge-server/src/feishu/ws-client.js`：会话状态机重构（sessions Map）、定时器集中管理、双确认空闲探测、硬超时兜底
- `bridge-server/src/feishu/sender.js`：新增 sendReplyCard / sanitizeMarkdownForFeishu / chunkMarkdown
- `bridge-server/src/feishu/crypto.js`：**已删除（死代码）**
- `bridge-server/package.json`：版本 0.1.1 → 0.4.0
- `admin/js/app.js`：copyToClipboard / copyTermCmd / copyStartCmd 重写
- `admin/index.html`：按钮 title 调整（无结构变更）
- `cc.sh`：智能化重构 + 去硬编码
- `cc1.sh`：**已删除（合并到 cc.sh 后无用）**

### 功能列表
- 飞书回复内容完整提取（不再丢失正文）
- 回复格式适配（GFM 表格自动降级 / 长回复分段 / 卡片头部带元信息）
- 回复及时性提升（双确认 + 硬超时兜底 + pane 重绘防护）
- 管理面板复制 attach 命令支持 HTTP/HTTPS 双环境
- cc.sh 智能化：attach 自动创建 / 交互式 -s / 全外部化配置
- tmux 命令注入安全加固（多行消息、shell 元字符不再破坏）

### 待解决问题
- 后台管理面板「新建绑定」流程改造（先填表→自动给 cc.sh 启动命令复制）— 用户决定本轮**不做**，后续迭代
- 关于 WS 事件接收偶发不稳定的飞书侧 BUG — 暂无变更（与本次回复链路修复无关）

---

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
