## v1.1.29 - 2026-05-19
### 变更内容
**机器自动预装（Provision）— 创建机器后自动 SSH 上去安装环境**
- 新增：幂等预装脚本 `scripts/provision-remote.sh`
  - 自动检测/安装 Node.js ≥18、tmux、Claude Code CLI
  - 自动创建 PATH symlink（`/usr/local/bin/claude`）
  - 输出 JSON 结果供后端解析
- 新增：后端预装模块 `src/server/executor/provision.ts`
  - `provisionMachine(machineId)` 读取脚本 → base64 编码 → SSH 远程执行
  - 解析 JSON 结果 → 更新 machines 表 osVersion
- 新增：API `POST /api/machines/:id/provision` 手动预装端点
- 优化：`POST /api/machines` 创建机器后，后台异步自动触发预装
- 优化：`POST /api/machines/:id/test` 增加 Claude 版本检测结果
- 前端：MachinesView 新增「预装」按钮 + 预装结果弹窗 + 预装状态列
- i18n：zh/en 新增预装相关文案
- 类型：shared/types 新增 ProvisionResult 类型

### 影响范围
- `scripts/provision-remote.sh` — 新建
- `src/server/executor/provision.ts` — 新建
- `src/server/routes/machines.ts` — 加 provision 端点 + 创建后自动预装
- `src/client/views/MachinesView.vue` — 加预装按钮/弹窗/状态列
- `src/client/locales/zh.ts` / `en.ts` — 加预装文案
- `src/shared/types.ts` — 加 ProvisionResult + MachineTestResult.claudeVersion

## v1.1.28.6 - 2026-05-19
### 变更内容
**修复多轮决策后 AI 回复丢失 + 轮询加速到 1 秒**
- Bug 修复：多轮决策（如 Submit answers）后 AI 回复永远无法转发回飞书
  - 根因：tryFinish stale panel override 将 state 从 `awaiting_choice` 改写为 `idle` 后，
    代码落入双重确认路径（500ms 后再调 detectState），但 detectState 因 scrollback
    旧面板文本再次返回 `awaiting_choice`，双重确认检查 `state2 !== 'idle'` 直接 return，
    回复永远不会被提取发送
  - 修复：stale panel override 成功后，跳过双重确认，直接用已有的 executor 捕获
    全量 pane 提取回复并发送（stale panel override 已经验证了 idle 状态，无需重复确认）
- 轮询间隔从 8-15 秒随机改为 ~1 秒（800-1200ms 抖动）
  - stableMs 从 20s 降为 3s（1s 轮询下 3 次不变即确认稳定）
  - stateCheckEvery 从 3 改为 5（每 ~5s 主动检测终态）
  - 决策后快速轮询从 3-5s 改为 500ms，stableTimer 从 5s 改为 2s
  - 初始安全网检测从 7s 改为 3s

### 影响范围
- `src/server/session/state.ts` — stale panel override 跳过双重确认 + 轮询参数全量调整

## v1.1.28.5 - 2026-05-19
### 变更内容
**修复中断后消息路由完全阻断 — session 未释放**
- 根因：cc_interrupt 中断处理器只设 `session.replied = true` 但未调 `endSession()`
  - session 永远留在 Map 中 → `hasActiveSession()` 始终返回 true
  - 新消息全部命中"正在处理上一条消息"分支，无法路由到 CC
  - 中断后所有消息和决策卡片回调均失效
- 修复：中断处理器改用 `endSession(processName)` 替代手动设 `replied=true`
  - 正确清除 timers + 从 Map 移除 → 后续消息可正常路由

### 影响范围
- `src/server/channel/feishu/ws-client.ts` — cc_interrupt handler 改用 endSession
- `src/server/session/state.test.ts` — 补充 endSession 释放验证测试

## v1.1.28.4 - 2026-05-19
### 变更内容
**修复决策面板标题丢失 + 回复内容混入决策确认文本**
- Bug 1 修复：extractBorderlessPanel 标题扫描遇空行 break → CC v2.1.138 面板问题与选项间有空行，标题永远扫不到
  - 改为跳过空行继续扫描（最多跳 3 行），实测 "要不要回去继续写代码？" 正确提取
- Bug 2 修复：extractReply 把 `● User answered Claude's questions:` 决策确认文本算进回复
  - 新增过滤：User answered / Accepted edits / Rejected edits / Allowed Bash / Denied 等CC内部确认行
  - AI 真实回复（如 "行，真够了。有事再叫我。"）不再被决策确认文本污染
- 新增 3 条单元测试覆盖空行标题提取 + 决策确认过滤

### 影响范围
- `src/server/cli/cc-adapter.ts` — extractBorderlessPanel 标题扫描跳空行 + extractReply 过滤决策确认
- `src/server/cli/cc-adapter.test.ts` — 新增 3 条测试

## v1.1.28.3 - 2026-05-19
### 变更内容
**修复决策后无限轮询 — v1.1.28.2 引入的回归 Bug**
- 根因1：`decisionJustMade=true` 且面板仍在 pane 中时，`if (panel)` 分支 return early，decisionJustMade 永远不被消费，stableTimer 被清除，tryFinish 永远无法触发
- 根因2：tryFinish 中 detectState 因 scrollback 旧面板返回 `awaiting_choice` 直接 return，CC 实际 idle 但检测不到
- 修复：
  - poll()：decisionJustMade 或已决策面板时不 return early，让 5s stable 计时器生效
  - poll()：decisionJustMade 后用 3-5s 快速轮询替代 8-15s 随机间隔
  - 新增 `lastDecidedPanelKey` 字段，防止决策后面板重复推送
  - tryFinish()：awaiting_choice + session.awaiting===null 时检查 pane 底部 idle 指示符，覆写为 idle
  - 面板消失时清除 lastDecidedPanelKey

### 影响范围
- `src/server/session/state.ts` — poll() 不再 return early + tryFinish stale 面板覆写 + lastDecidedPanelKey
- `src/server/channel/feishu/ws-client.ts` — CardAction + text choice handler 设 lastDecidedPanelKey
- `src/server/session/state.test.ts` — 新增 lastDecidedPanelKey 测试

## v1.1.28.2 - 2026-05-19
### 变更内容
**修复决策后 AI 回复延迟 2 分钟的关键 Bug**
- 根因：handler 调 sendChoice 后立即设 `session.awaiting = null`，但轮询循环中「面板消失后重启 stable 计时器」的分支只在 `session.awaiting !== null` 时触发
  - 导致面板消失时 stable 计时器不会重启，系统只能依赖 pollCount（每 3 轮 ~30-45s）触发 tryFinish
  - 若输出长度不变（面板消失 + CC 输出长度接近），stable 计时器也不设置
  - 多轮 pollCount 循环 + tryFinish 返回 working → 累计延迟 2 分钟+
- 修复：新增 `decisionJustMade: boolean` 标志
  - handler 设 `awaiting = null` 时同时设 `decisionJustMade = true`
  - 轮询检测到 `decisionJustMade` → 立即启动 5s 短 stable 计时器（而非等 20s 或 3 轮 pollCount）
  - 面板仍在 pane 中（CC 未处理按键）+ `decisionJustMade` → 跳过重复推送决策卡片
- 实测日志对照：08:56:12 选择 No → 08:57:53 回复发送（101s 延迟），修复后预期 ~15-20s

### 影响范围
- `src/server/session/state.ts` — SessionState 新增 decisionJustMade + 轮询逻辑修改
- `src/server/channel/feishu/ws-client.ts` — CardAction + text choice handler 设 decisionJustMade
- `src/server/session/state.test.ts` — 补充 decisionJustMade 初始值断言

## v1.1.28.1 - 2026-05-19
### 变更内容
**连续决策面板支持 + inline 面板检测修复 + 新增 19 条测试**
- 修复 inline 格式面板检测 Bug：`raw.match(inlineRe)` 从上往下找第一个匹配，连续 inline 面板时会误取旧面板
  - 改为 `raw.matchAll(inlineRe)` 取最后一个匹配（最新的 inline 面板）
- 验证连续决策面板场景完整支持：
  - box 格式：倒序扫描 `╰──╯` 天然取最新 ✅
  - borderless 格式：倒序找 `❯ N.` 天然取最新 ✅
  - inline 格式：修复后取最后一个匹配 ✅
  - awaiting 清除后 `!session.awaiting` 为 true，相同指纹面板仍会推送 ✅
- 新增 7 条 cc-adapter 连续面板测试（box 重复、inline 重复、Edit 权限、Bash 权限、工作状态、idle 回复提取、inline accept→reject）
- 新增 12 条 state.ts 单元测试（session 生命周期、panelFingerprint、awaiting 连续转换、ctx 保持、进度通知时间逻辑）
- 新建 `src/server/session/state.test.ts` 测试文件

### 影响范围
- `src/server/cli/cc-adapter.ts` — inline 面板匹配修复（matchAll 取最后）
- `src/server/cli/cc-adapter.test.ts` — 新增 7 条连续面板测试
- `src/server/session/state.test.ts` — 新建，12 条状态机测试

## v1.1.28 - 2026-05-19
### 变更内容
**决策后回复丢失修复 + chatId 路由修复 + 轮询机制重构**
- Bug 1 修复：`state.ts` 面板消失后 `session.awaiting = null` 未重启 stable 计时器，导致决策后 AI 回复无法被捕获转发
  - 原代码只清了 awaiting 但注释"触发 stable 重新计时"下无实际代码
  - 现在面板消失后立即启动 20s stable 计时器，确保 tryFinish 被触发
- Bug 2 修复：`ws-client.ts` handleCardAction 中 targetType/targetId 从 event.open_chat_id 推导，飞书 SDK 不一定填充该字段，回退到 operator.open_id 导致回执发到私聊
  - 改为使用 session.ctx.targetType 和 session.ctx.targetId（来自原始消息路由），确保决策反馈发到群聊
  - 中断按钮回调同样修复：优先使用 session.ctx，回退到 event
- 轮询机制重构：
  - 固定 setInterval 改为递归 setTimeout + 8～15 秒随机间隔
  - 进度通知从独立 startProgressTimer 合并到轮询循环：前 10 分钟每 1 分钟，10 分钟后每 10 分钟
  - 硬超时从 600s（10 分钟）改为 3600s（1 小时），移除 awaiting 状态下跳过硬超时逻辑
  - stableMs 从 `pollInterval*2` 改为固定 20 秒（适配 8~15s 轮询节奏）
  - SessionState 接口：`progressTimer` → `pollTimer`，新增 `lastProgressNotifiedAt`
  - 移除 `startProgressTimer` 函数，进度通知逻辑内联到 PollingHandlers.onProgress

### 影响范围
- `src/server/session/state.ts` — Bug 1 修复 + 轮询重构 + 接口变更
- `src/server/channel/feishu/ws-client.ts` — Bug 2 修复 + 移除 startProgressTimer + onProgress 回调
- `src/server/config.ts` — bridge.timeout 默认值 600 → 3600
- `config.yaml` — timeout: 600 → 3600

## v1.1.27 - 2026-05-19
### 变更内容
**CC v2.1.138 全量面板类型测试 + 修复**
- 在远程机器创建 CC v2.1.138 测试进程，实测捕获所有面板格式
- 发现并修复关键 Bug：`extractBorderlessPanel` 向下扫描时 hint 检查先于选项检查执行，导致含 `(shift+tab)` 的选项行（如 `2. Yes, allow all edits during this session (shift+tab)`）被误判为 hint 行，提前终止扫描，面板返回 null
- 新增 CC v2.1.138 面板格式识别：
  - Bash 权限面板（`────── 顶部分隔 + Bash command + ❯ N. 选项 + Esc to cancel · Tab to amend · ctrl+e to explain`）
  - Edit 权限面板（`╌╌╌ diff 分隔线 + Do you want to make this edit? + ❯ N. 选项`）
  - Write 权限面板（`────── + Write file + Do you want to create? + ❯ N. 选项`）
- `╌`（U+254C）分隔符加入识别：separatorRe、title 扫描 break 判断、extractReply 清洗
- `Tab to amend` / `ctrl+e to explain` 提示加入 detectState 兜底 + extractReply 过滤
- 新增 4 条单元测试覆盖 CC v2.1.138 实际面板格式（Bash/Edit/Write + shift+tab 选项回归）

### 影响范围
- `src/server/cli/cc-adapter.ts` — extractBorderlessPanel 选项/hint 检查顺序 + ╌ 分隔符 + Tab to amend
- `src/server/cli/cc-adapter.test.ts` — 新增 4 条 v2.1.138 面板测试

## v1.1.26.5 - 2026-05-19
### 变更内容
**修复 CC v2.1.126 无边框决策面板识别（v1.1.26.4 修复失败后的二次修复）**
- `extractBorderlessPanel` 重写核心算法：从 `❯ N.` 行向下扫描收集选项（原代码错误地向上扫描，导致只收集到 1 个选项返回 null）
- 支持描述子行（如 `affirmative`）：深度缩进 ≥4 空格的非选项行自动跳过
- 支持分隔线（`──────`）：分隔线后的选项（如选项 4）仍被收集
- 支持底栏 `Enter to select · ↑/↓ to navigate · Esc to cancel` 提示模式
- `detectState` 兜底新增 `Enter to select` 和 `↑/↓ to navigate` 模式匹配
- `extractReply` 和 `parseChoiceOptions` 过滤规则新增 `to navigate` 匹配
- 新增 5 条单元测试覆盖 CC v2.1.126 实际面板格式（含描述子行 + 分隔线 + 4 选项）

### 影响范围
- `src/server/cli/cc-adapter.ts` — extractBorderlessPanel 完全重写 + detectState / extractReply / parseChoiceOptions 模式更新
- `src/server/cli/cc-adapter.test.ts` — 新增 5 条无边框面板测试

## v1.1.26.4 - 2026-05-19
### 变更内容
**修复 CC 决策面板检测严重 Bug**
- `extractChoicePanel` 新增无边框选项列表检测（cc v2.1.x 新 UI 格式：`❯ 1. Yes` / `  2. No` 无 ╭──╮ 框线）
- `detectState` 新增决策面板指示符兜底检测（`shift+tab to cycle`、`Enter to confirm`、`Esc to cancel` + `❯ N.`）
- `detectState` 修复 idle 误判：改为只检查 pane 底部 5 行内 `❯` + `? for shortcuts` 相邻出现，避免历史残留行误判为 idle
- 内联选择正则兼容单 ⏵ 格式和 ▶▶ / ▸▸ 变体
- `extractReply` 新增过滤规则：过滤 `⏵⏵ accept/reject/allow/deny` 行、`(shift+tab to cycle)` 提示、无边框决策面板底栏提示
- 硬超时处理器新增全量 pane 决策面板重检测：超时前再尝试 `extractChoicePanel`，发现面板则推送决策卡而非发送兜底文本

### 影响范围
- `src/server/cli/cc-adapter.ts` — extractChoicePanel / detectState / extractReply
- `src/server/channel/feishu/ws-client.ts` — 硬超时处理器 + panelFingerprint import
- `src/server/session/state.ts` — panelFingerprint export

## v1.1.26 - 2026-05-17
### 变更内容
**UI 国际化 + 帮助页面 + 面包屑导航**
- R1: 主题切换改为 Sun/Moon 图标按钮（移除滑块开关）
- R2: 语言切换按钮（zh/en）+ vue-i18n 框架搭建 + 全量 i18n 迁移（13 个 View + 2 套语言包 ~260 key）
- R3: 帮助按钮（Info 图标）→ /help 帮助页面（飞书接入指引 + Telegram/QQ/微信占位）
- R4: 全局面包屑导航组件（Breadcrumb.vue + 路由 meta.breadcrumb）
- R5: 版本号 1.1.25.4 → 1.1.26
- R6: 侧边栏仅展开当前路由所在分组，不再全部展开

### 影响范围
- `src/client/i18n/index.ts` — 新建 i18n 配置
- `src/client/locales/zh.ts` / `en.ts` — 新建完整语言包
- `src/client/main.ts` — 注册 i18n 插件
- `src/client/views/LayoutView.vue` — R1/R2/R3/R6 + i18n
- `src/client/views/LoginView.vue` — i18n 迁移
- `src/client/views/SettingsView.vue` — i18n 迁移
- `src/client/views/BotsView.vue` — i18n 迁移
- `src/client/views/MachinesView.vue` — i18n 迁移
- `src/client/views/ProvidersView.vue` — i18n 迁移
- `src/client/views/BindingsView.vue` — i18n 迁移
- `src/client/views/HomeView.vue` — i18n 迁移
- `src/client/views/LogsRealtimeView.vue` — i18n 迁移
- `src/client/views/LogsAuditView.vue` — i18n 迁移
- `src/client/views/LogsBillingView.vue` — i18n 迁移
- `src/client/views/HelpView.vue` — 新建帮助页面
- `src/client/components/Breadcrumb.vue` — 新建面包屑组件
- `src/client/router/index.ts` — 新增 /help 路由 + meta.breadcrumb
- `package.json` — 版本号 + vue-i18n 依赖

## v1.1.24 - 2026-05-17
### 变更内容
**决策面板 cc v2.1.x 内联格式识别修复（关键 Bug）**
- `cc-adapter.ts` extractChoicePanel 新增 ⏵⏵ 内联格式识别：cc v2.1.126+ 使用 `⏵⏵ accept edits on (shift+tab to cycle)` 替代 `╭──╮` 框格式
- 识别 3 种内联类型：代码修改确认（Accept/Reject edits）、权限确认（Allow once/session/Deny）、通用确认（Confirm/Cancel）
- `cc-adapter.ts` sendChoice 对 `format: 'inline'` 面板发送 Enter（确认）或 Escape（拒绝）
- `types.ts` ChoicePanel 新增 `format?: 'box' | 'inline'` 字段区分面板渲染格式
- `resolveChoiceIndex` 新增 accept/reject/allow 关键词支持
- 新增 9 个单元测试覆盖内联格式面板识别 + sendChoice 按键策略

### 影响范围
- `src/server/cli/cc-adapter.ts` — extractChoicePanel + sendChoice + resolveChoiceIndex
- `src/server/cli/types.ts` — ChoicePanel 接口
- `src/server/cli/cc-adapter.test.ts` — 新增测试

## v1.1.23 - 2026-05-17
### 变更内容
**模块 1 · QQ 图标修正**
- `BotsView.vue:267` QQ 平台 logo SVG 重写：从"鬼"形改为更接近企鹅的圆头+圆身+双眼+双脚轮廓

**模块 2 · 5 处按钮文案统一**
- `ProvidersView.vue` L7 按钮 + L96 弹窗标题：「新建服务商」→「新增」
- `BindingsView.vue` L10/L11 按钮：「新建绑定」「挂载已有」→「新增」「挂载」；L403/L404 弹窗标题：「新建绑定」「挂载已有进程」→「新增」「挂载进程」
- `MachinesView.vue` L6 按钮「添加机器」→「新增」；L27 空态文案同步；L45「测试连接」→「测试」；L83 弹窗标题「添加机器」→「新增」

**模块 3 · 决策弹窗双向交互修复（核心）**
- **路径 A（文本回退升级）**`ws-client.ts` handleMessage awaiting 分支：
  - 选择成功的回执从 sendText 升级为 sendCard（绿色「决策已转发」卡片，醒目）
  - 选择失败的提示从误导性的"正在处理上一条"改为 sendCard「无法识别您的选择」卡片（含可选项清单，保持 awaiting 状态等用户重发）
- **路径 B（卡片按钮 + 卡片回调）：**
  - `sender.ts` 扩展 InteractiveCard 类型：新增 ButtonElement/ActionElement
  - `sender.ts buildAwaitingCard` 在卡片下方追加 actions 块，每个选项渲染为一个按钮（默认项 ⭐ + primary 样式）
  - `sender.ts` 新增 `buildChoiceAckCard` 和 `buildChoiceUnrecognizedCard` 两个卡片构造函数
  - `ws-client.ts` KNOWN_EVENTS 加 `card.action.trigger`
  - `ws-client.ts` 新增 `CardActionEvent` 类型 + `handleCardAction` 函数：识别 `action.value.action === 'cc_choice'`、校验 processName、调 sendChoice 并发回执
  - 在 handler 顶部加 `event_type === 'card.action.trigger'` 分支路由

**模块 3 单元测试补充**
- `cc-adapter.test.ts` 新增 5 条 v1.1.23 回归测试：中文面板识别、4 选项面板边界、嵌入工具调用后的面板、飞书按钮模拟（精确数字索引）、飞书按钮第 1 项无方向键

### 影响范围
- 前端：BotsView / ProvidersView / BindingsView / MachinesView 共 4 个视图，10+ 处文案 + 1 处 SVG
- 后端：sender.ts（类型扩展 + 3 处卡片构造）、ws-client.ts（KNOWN_EVENTS + 卡片回调路由 + 回执升级）、cc-adapter.test.ts（新增 5 条测试）
- audit 高危 2 项（axios via @larksuiteoapi）— 沿用 v1.1.15 政策保持（上游 SDK 限制，定制 SDK 引入 cardAction 支持，不能轻易升级）

### 功能列表
- 飞书侧用户终于能直接点决策卡片上的按钮回复 cc，不再需要打字
- 即便打字回复也能用更友好的卡片回执（成功绿色 / 失败橙色 + 可选项提示）
- 卡片回调路径接通飞书 v2 SDK `card.action.trigger` 事件（需用户在飞书机器人后台开通该事件订阅，未开通时 A 路径仍可用）
- UI 按钮文案统一为「新增/挂载/测试」短词，减少视觉噪声
- QQ 图标从"鬼"修正为"企鹅"，对齐其他平台 logo 风格

## v1.1.22 - 2026-05-16
### 变更内容
- 首页 Timeline 卡片高度 680 → 640px（用户反馈再缩 40px）
  - HomeView.vue `.tl-body` `height: 680px` → `height: 640px`
- 确认版本号来源统一为单一源（无代码变更，仅确认现状）
  - `package.json.version` → `vite.config.ts` `define: __APP_VERSION__` → `LayoutView.vue` `appVersion` → UI 两处展示（top header + left sidebar）
  - 后端、scripts 无任何硬编码版本

### 影响范围
- 仅 HomeView.vue 一行

### 功能列表
- Timeline 卡片可见高度从 680px 调整为 640px
- 版本号管理：以后只改 package.json，所有 UI 展示位置自动同步

---

## v1.1.21 - 2026-05-16
### 变更内容
- 首页 Timeline 卡片高度 760 → 680px（用户反馈先砍 60 再缩 20，共砍 80px）
  - HomeView.vue `.tl-body` `height: 760px` → `height: 680px`

### 影响范围
- 仅 HomeView.vue 一行

### 功能列表
- Timeline 卡片可见高度从 760px 调整为 680px

---

## v1.1.20 - 2026-05-16
### 变更内容
- 首页 Timeline 卡片高度 440 → 760px（用户反馈 +320px）
  - HomeView.vue `.tl-body` `height: 440px` → `height: 760px`

### 影响范围
- 仅 HomeView.vue 一行
- 视觉：Timeline 卡片可见高度提升，超出仍内部滚动

### 功能列表
- Timeline 卡片可见高度从 440px 提升到 760px

---

## v1.1.19 - 2026-05-16
### 变更内容
- 首页 Timeline 改回固定高度卡片 + 内部滚动（feat/home-timeline-fixed-scroll）
  - 撤掉 v1.1.17 的 flex 拉伸方案（`.home-root` flex col / `.tl-card` flex:1）
  - HomeView.vue 模板根去掉 `home-root` class、Timeline 卡去掉 `tl-card` class
  - `.tl-body` 改为 `height: 440px; overflow-y: auto;`，按 bba 样图固定卡片尺寸
  - 内容超出 440px 在卡片内部滚动，不跟随视口尺寸变化

### 影响范围
- 仅 HomeView.vue
- 视觉：Timeline 卡片在任何视口下都是固定 440px 高度，与样图一致

### 功能列表
- Timeline 列表区域为固定 440px 卡片，超出条目内部滚动

---

## v1.1.18 - 2026-05-16
### 变更内容
- 顶部标题下展示当前系统版本号（feat/home-version-display）
  - `vite.config.ts` 新增 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`，构建期注入版本号
  - 新增 `src/client/env.d.ts` 声明 `__APP_VERSION__` 类型 + 引入 `vite/client` 类型
  - `LayoutView.vue`
    - top 模式 header：「Bridge Admin Control System」同行追加 `v1.1.x` 版本徽章（圆角灰底）
    - left 模式 sidebar-header：「笨迪桥接」下方加一行小号版本号
  - 版本号在 build 时硬编码进 bundle，零运行时开销，无需调用接口

### 影响范围
- vite.config.ts、src/client/env.d.ts（新增）、src/client/views/LayoutView.vue
- 视觉：所有页面顶部都能看到当前系统版本

### 功能列表
- 顶部标题区域常驻版本号显示，发版后用户/运维直观知道当前在跑哪个版本

---

## v1.1.17 - 2026-05-16
### 变更内容
- 首页 Timeline 改用 flex 布局真正撑满视口（v1.1.16 calc 方案视觉上未铺满）
  - HomeView.vue 模板根 `<div>` 加 class `home-root`：`display:flex; flex-direction:column; min-height: calc(100vh - 120px);`
  - Timeline 卡 `.glass-card` 加 class `tl-card`：`flex:1; display:flex; flex-direction:column; min-height:0;`
  - `.tl-body` `max-height: calc(100vh - 240px)` → `flex: 1`，配合外层 flex 链路自适应撑满
  - 保留 `min-height: 360px` 小屏保底

### 影响范围
- 仅 HomeView.vue 一个文件，模板 2 处 class + CSS 1 处替换 + 2 块新增

### 功能列表
- Timeline 列表区域真正撑到视口底部，列表多时滚动，少时也不再有大块底部空白

---

## v1.1.16 - 2026-05-16
### 变更内容
- 首页 Timeline 面板高度撑满视口（feat/home-timeline-height）
  - `src/client/views/HomeView.vue` `.tl-body` `max-height: 480px` → `max-height: calc(100vh - 240px); min-height: 360px;`
  - 顶部偏移 240px = Layout header + 内边距 + 4 个统计卡片 + mt-6 间距
  - 小屏保底 360px，避免视口太矮时被压扁

### 影响范围
- 仅 HomeView.vue 一处样式
- 移动端/小屏：min-height 兜底；桌面端：跟随视口自适应高度
- 视觉行为：Timeline 列表在大屏上完整展示更多条目，无需固定 480px 上限

### 功能列表
- 与截图标注一致：Timeline 面板高度跟随主视口自动撑满，不再被固定上限截断

---

## v1.1.15 - 2026-05-16
### 变更内容
- 依赖安全升级（fix/security-deps）
  - `bcrypt` ^5.1.1 → ^6.0.0（API 兼容，密码哈希/校验回归通过）
  - `drizzle-orm` ^0.38.0 → ^0.45.2（修复 SQL 注入 GHSA；schema/查询代码无破坏，54/54 测试通过）
  - `vite` ^6.0.0 → ^7.3.3、`vitest` ^2.1.0 → ^3.2.4、`@vitejs/plugin-vue` ^5.2.0 → ^6.0.7、`drizzle-kit` ^0.30.0 → ^0.31.10（dev 链）
  - 新增 `overrides.esbuild = ^0.25.10` 强制全树替换被 `@esbuild-kit/esm-loader` 拽下来的旧 esbuild
- audit 结果：10 vulnerabilities (8 moderate + 2 high) → **仅剩 2 high**（axios via `@larksuiteoapi/node-sdk`，官方修复版仅在 1.57.0-beta，无法上 beta，本轮维持现状）
- 验收
  - `npm run build` ✅（client 12s / server tsc 通过）
  - `npm test` ✅ 54/54
  - lint 失败属历史问题（eslint v9 缺 eslint.config.js），未在本轮范围内

### 影响范围
- 仅 package.json / package-lock.json
- 运行时行为零变更：bcrypt hashSync/compareSync 同名 API；drizzle-orm 0.45 在我们当前查询模式（基础 select/insert/update + sqlite-core）下兼容；esbuild override 仅影响构建工具

### 功能列表
- 安全态势：高危漏洞从 2 个外部来源 + drizzle-orm 自身 SQL 注入 + esbuild dev server 信息泄露 全面清理，剩余 axios 链条受上游 SDK 限制

---

## v1.1.14 - 2026-05-16
### 变更内容
- 新建/编辑绑定改造为「先选平台 → 再选 Bot」关联关系
  - 之前：绑定弹窗里手填 飞书 App ID + App Secret，与 v1.1.10 引入的 bacs_bots 表割裂
  - 现在：弹窗第一步选平台（feishu / telegram / qq / wechat，后三者 disabled），第二步从该平台已有 Bot 中选择
  - 列表第二列由「飞书 App ID」改为「平台 / Bot 名称」（裸 App ID 移到 title tooltip）
- 数据模型变更
  - bindings 表新增 `bot_id INTEGER REFERENCES bacs_bots(id) ON DELETE SET NULL`（v1.1.10 注释里规划的字段正式落地）
  - 老库通过 ensureBindingBotIdColumn（PRAGMA + ALTER TABLE）兜底自动加列
  - 启动一次性回填：runBindingBotIdBackfillOnce 按 bindings.feishu_app_id 匹配 bacs_bots.app_id 写入 bot_id；幂等键 `app_settings.bindingBotIdMigrationDone`
- 后端 API 改造
  - 新增辅助函数 resolveBotCredentials：优先 botId 查 bots 表拿凭据，回退旧字段（兼容期）
  - /api/bind /api/bind/mount /api/edit 入参支持 botId；旧字段 feishuAppId/Secret 仍兼容
  - /api/edit 中 botId 变更会触发 ws 重启（与凭据变更等价）
  - /api/status 返回值新增 botId / botName / botPlatform
- 保留 bindings.feishu_app_id / feishu_app_secret 字段作为冗余存储
  - 写入时由 bot 关联推导填充，ws-client.ts / state.ts 不动，零联动风险

### 影响范围
- 数据库：bindings 表新增 bot_id 列
- API：/api/bind /api/bind/mount /api/edit /api/status
- 文件：src/server/db/schema.ts, src/server/db/index.ts, src/server/routes/bindings.ts, src/shared/types.ts, src/client/views/BindingsView.vue
- package.json 1.1.13 → 1.1.14

### 功能列表
- 通过下拉关联 Bot 创建/编辑绑定，避免重复填写飞书凭据
- 历史绑定自动按 App ID 关联到对应 Bot
- 同一 Bot 可被多个绑定关联（场景：多 CLI 进程共用一套飞书凭据）

---

## v1.1.13 - 2026-05-16
### 变更内容
- Bots 工具栏 3 个 UI 问题修复
  - 滑块 Tabbar：之前 4 个 tab 强制等宽（flex 1）导致 Telegram 文字被挤；改为每个 tab 按内容宽度撑开，滑块用 ResizeObserver 测量 active tab 的 offsetLeft / offsetWidth 动态驱动 left / width，过渡仍为 0.22s ease 缓动
  - 搜索输入框：之前 inline width 180 + 工具栏 nowrap 在窄屏被挤掉；改为 class `bots-search-input`（220px / min 160px），工具栏外层 flex-wrap，操作区 nowrap 整体下移
  - 平台图标：之前用 lucide `Smartphone`（手机图标）代替微信，4 个平台全无真实 logo；改为 4 个 inline SVG functional component（Feishu / Telegram / QQ / WeChat），单色 currentColor，可被滑块文字色继承
- 实现细节
  - `makeLogo(viewBox, path)` 工厂返回 FunctionalComponent，统一签名 `{ size? }`，使用 `<component :is>` 无侵入接入
  - ResizeObserver + window resize 双保险，字体加载完成后会重新测量

### 影响范围
- src/client/views/BotsView.vue（template + script + style 全部调整）
- package.json 1.1.12 → 1.1.13

---

## v1.1.12 - 2026-05-16
### 变更内容
- 修复 Bots 模块 UI 配色，对齐项目主题变量（解决 dark 模式下颜色不对劲的问题）
  - 滑块 Tabbar：容器 `--surface-2`（不存在）→ `var(--bg)`；滑块 `--surface`（不存在）→ `var(--card)` + 1px border
  - 弹窗：mask 加 `backdrop-filter: blur(4px)`；卡片 `--surface`（不存在）→ `var(--card)` + 边框
  - 危险按钮：硬编码 `#d23f31` → `var(--danger)`，hover 改为实心填充风格
  - 警告框：硬编码红色 → `var(--danger)` + light/dark 双适配背景
  - 关联绑定计数徽章：硬编码 `rgba(0,0,0,0.06)` → `var(--bg) + 1px var(--border)`
- 根因：v1.1.11 误用了项目中不存在的 CSS 变量（`--surface`/`--surface-2`/`--primary`），fallback 颜色在 dark 模式下错误

### 影响范围
- src/client/views/BotsView.vue（仅 `<style scoped>` 区块）
- package.json 1.1.11 → 1.1.12

---

## v1.1.11 - 2026-05-16
### 变更内容
- Bots 模块 UI 升级
  - 顶部改为短小靠左的滑块式 Tabbar（飞书 / Telegram / QQ / 微信，带图标，切换有滑动动效）
  - 工具栏右侧新增搜索框 + 搜索按钮 + 新增按钮
  - table 取消行内备注编辑，操作列改为「编辑 / 删除」按钮，均走弹窗
  - 列表新增「关联绑定」计数列
- DELETE /api/bots/:id 改为级联删除
  - 删除 Bot 时找出所有 platform=feishu 且 feishu_app_id 匹配的关联绑定
  - 依次：停 channel → 杀对应 tmux/CLI 会话 → 删 binding → 最后删 Bot
  - 返回包含 cascadedBindings 计数 + killResults 明细
  - 审计日志记录 bot_delete 动作
- PUT /api/bots/:id 禁止修改 AppID（避免破坏关联关系，提示删除后新建）
- 菜单
  - 「Bots 管理」改名为「Bots」
  - 绑定管理子菜单顺序调整为：Bots → 服务商 → 绑定

### 影响范围
- src/server/routes/bots.ts（DELETE 级联 + GET 加 bindingCount + PUT 校验）
- src/client/views/BotsView.vue（重写：滑块 Tabbar + 工具栏 + 编辑/删除弹窗）
- src/client/views/LayoutView.vue（菜单文案 + 顺序）
- package.json 1.1.10 → 1.1.11

---

## v1.1.10 - 2026-05-16
### 变更内容
- 左侧/顶部菜单两级化：原扁平菜单重构为分组结构
  - 新增「运维中心」一级菜单 → 包含「机器」
  - 新增「绑定管理」一级菜单 → 包含「服务商」「绑定」「Bots 管理」（新增）
- 新增 Bots 管理模块（v1.1.10）
  - 路由 /bots，4 平台 Tab：飞书 / Telegram / QQ / 微信
  - 当前仅飞书有数据；Telegram / QQ / 微信 为占位（后续版本扩展）
  - 飞书列表 4 列：Name / AppID / 密钥（脱敏）/ 备注（可编辑，blur 自动保存）
- 新增 bacs_bots 数据表（业务前缀 bacs_）+ /api/bots CRUD 路由
- 启动时一次性迁移脚本：将现有 bindings 中的飞书机器人凭据导入 bacs_bots
  - 字段映射：process_name → name，feishu_app_id → app_id，feishu_app_secret → secret
  - 幂等：通过 app_settings.botsMigrationDone 标记，仅执行一次

### 影响范围
- 数据库：新增表 bacs_bots
- 后端：
  - src/server/db/schema.ts（新增 bots 表定义）
  - src/server/db/index.ts（新增 ensureBacsBotsTable + runBotsMigrationOnce）
  - src/server/routes/bots.ts（新文件：GET/POST/PUT/DELETE /api/bots）
  - src/server/index.ts（挂载 botsRoutes）
- 前端：
  - src/client/views/BotsView.vue（新文件）
  - src/client/router/index.ts（新增 /bots 路由）
  - src/client/views/LayoutView.vue（菜单两级化重构）

### 功能列表
- 重启后用户进入「绑定管理 → Bots 管理 → 飞书」可见迁移过来的机器人列表
- 备注列可点击编辑，失焦或按 Enter 自动保存
- 后续版本规划：新建绑定改为从 Bots 中选择，不再重复填写凭据

---

## v1.1.9 - 2026-05-15
### 变更内容
- 绑定列表操作列新增「刷新」按钮（位于编辑与解绑之间）
- 新增 POST /api/rebind 后端接口：保留绑定配置 → 杀 tmux 进程 → 断飞书 WS → 重启 CLI 进程 → 重连飞书 WS

### 影响范围
- src/server/routes/bindings.ts（新增 rebind 路由）
- src/client/views/BindingsView.vue（新增刷新按钮 + rebindingMap + rebind 函数）

### 功能列表
- 刷新按钮：点击后保留配置重启 CLI，用户无感知，PID 变化
- 刷新按钮仅在线状态可点击，操作中显示「重启中...」loading 态

## v1.1.29.1 - 2026-05-20
### 变更内容
**修复 scrollback 残留 "esc to interrupt" 导致 idle 误判为 working，回复后仍轮询**
- Bug 修复：CC 完成回复回到 idle 后，scrollback 仍残留 `esc to interrupt`
  - 根因：`detectState` 全文搜 `esc to interrupt` → 返回 `working`
  - 底部实际已出现 `❯` + `? for shortcuts`（真实 idle 信号），但 working 检测优先级更高
  - `tryFinish` 永远判定 working → 回复无法提取/发送 → 轮询不停止
- 修复：idle 检测提升到 working 之前 + `esc to interrupt` 只看底部 8 行

### 影响范围
- `src/server/cli/cc-adapter.ts` — `detectState` 函数调整检测顺序和范围
