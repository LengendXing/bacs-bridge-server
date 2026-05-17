# 迭代日志 · BACS Bridge Server

## v1.1.25 - 2026-05-17
### 变更内容
- **工具调用实时状态卡片**：处理中卡片显示最近 3 个工具调用名称（如 `Bash(git push)`），底部增加「中断」按钮
- **耗时与工具统计**：回复卡片底部 note 显示 cc 自报耗时 + 工具调用统计（如 `Bash×2 Edit×1`）+ 估算费用
- **可折叠长回复**：回复内容 > 1500 字符时后半部分自动放入 collapsible_panel 折叠
- **/命令快捷交互**：支持 /status（进程看板）、/interrupt（中断执行）、/model（切换模型）、/effort（调整 effort），未知命令返回帮助卡片
- **中断按钮回调**：handleCardAction 支持 cc_interrupt 动作，点击中断按钮发 Escape 到 cc
- **计费服务**：新增 bacs_billing_records / bacs_billing_details / bacs_conversation_billing 三张表 + 计费 API
- **扣费日志页面**：日志升级为一级菜单（实时日志 / 审计日志 / 扣费日志），扣费日志含汇总卡片 + 分页表格 + 详情弹窗
- **cc-adapter 扩展**：新增 extractToolCalls / extractTiming / extractToolCount 三个解析函数 + 14 个单元测试

### 影响范围
- 改动：cc-adapter.ts（+3 函数）、types.ts（+3 接口方法）、codex-adapter.ts（+3 空实现）、state.ts（+lastToolCalls）、sender.ts（+5 卡片构建函数 + collapsible_panel）、ws-client.ts（+/命令路由 + cc_interrupt + 计费集成）、schema.ts（+3 表）、db/index.ts（+ensureBillingTables）、index.ts（+billing 路由）、router/index.ts（+3 日志路由）、LayoutView.vue（菜单改造）
- 新增：billing/service.ts、routes/billing.ts、LogsRealtimeView.vue、LogsAuditView.vue、LogsBillingView.vue

## v1.1.8 - 2026-05-15
### 变更内容
- **编辑绑定自动重连 CLI 进程**：编辑绑定时若 providerId / modelId / modelOverride / effort / machineId 任一变更，自动 kill 旧 tmux 进程 → 断开飞书 WS → 按新配置重启 CLI → 重连 WS；仅飞书凭据变更时仍走原有 WS 重启逻辑
- **Attach 按钮改为弹窗选择复制**：点击 Attach 弹出选择弹窗，展示简洁版（`tmux attach`）和完整版（含 SSH）两条命令，默认选中简洁版，底部有取消/复制按钮
- **CI：推 tag 自动发布 GitHub Release**：新增 `.github/workflows/release.yml`，从 `docs/maintain.md` 自动提取 changelog

### 影响范围
- 改动：`src/server/routes/bindings.ts`（编辑重连逻辑）、`src/client/views/BindingsView.vue`（Attach 弹窗）
- 新增：`.github/workflows/release.yml`

## v1.1.7 - 2026-05-15
### 变更内容
- **多语言 README 文档（11 种语言）**：中文、英语、日语、德语、俄语、西班牙语、法语、阿拉伯语(RTL)、藏文、维吾尔语(RTL)、韩文
- **项目改名**：`feishu-claudecode-bridge` → `bacs-bridge-server`（package.json / PM2 / deploy.sh / cll.sh / 所有 README / GitHub 仓库）
- **修复删除服务商 502**：bindings 表 `provider_id` / `model_id` 外键缺 `onDelete`，删除被绑定的服务商时 SQLite 约束报错。删除前先 SET NULL 关联 binding 外键 + schema 加 `onDelete: 'set null'`
- **清除历史密钥脚本**：git filter-repo 从历史中彻底删除含硬编码 API Key 的 5 个脚本（ai.sh / ai2.sh / ai-new1.sh / cc1.sh / clod.sh）
- **根 README.md 替换为完整中文版**
- **md 文件迁移到 docs/**：maintain.md / plan.md / requirements / codex-guide
- **.gitignore 新增 ai*.sh / clod.sh / cc1.sh**

### 影响范围
- 新增：`docs/readme/README.*.md`（11 个）、`docs/rename-plan.md`
- 改动：`README.md`、`package.json`、`package-lock.json`、`ecosystem.config.cjs`、`deploy.sh`、`cll.sh`、`src/server/index.ts`、`src/server/crypto/credentials.ts`、`src/server/routes/providers.ts`、`src/server/db/schema.ts`、`.gitignore`
- 迁移：`maintain.md` → `docs/maintain.md`、`plan.md` → `docs/plan.md` 等

## v1.1.6 - 2026-05-14
### 变更内容
- **Logo 右侧加系统标题「笨迪桥接」**：left 模式 sidebar-header + top 模式 header 均显示标题
- **删除右上角退出按钮**：左下角已有退出，top 模式 header 和 left 模式顶栏的退出按钮全部移除
- **新建数据表 `bacs_chat_time_line`**：记录每条发送到飞书（及未来 Telegram 等）的消息，字段：id/platform/target_ip/process_name/content/created_at（迁移文件 0004_chat_timeline.sql）
- **消息写入 Hook**：`channel/feishu/ws-client.ts` 收到用户消息并解析文本后，异步写入 `bacs_chat_time_line`；若绑定有 machineId 则查机器 host 作为 target_ip，否则为 localhost
- **SSE 实时推送 `/api/timeline/stream`**：写入 DB 后通过 `broadcastTimeline()` 广播给所有订阅的 SSE 连接；心跳 25s；token 支持 query/header/cookie 三种传入方式
- **首页 Timeline 区块**：统计卡片下方新增实时 Timeline；SSE 连接展示「● 实时」绿色状态；最多展示 20 条，超出截断；TransitionGroup 动画：新条目从顶部 scale+fade 进入，旧条目 translateY 下沉；点击展开/收起完整内容；平台 tag 彩色（飞书绿 / Telegram 蓝）

### 影响范围
- 新增：`src/server/routes/timeline.ts`、`src/server/db/migrations/0004_chat_timeline.sql`
- 改动：`src/server/db/schema.ts`、`src/server/index.ts`、`src/server/channel/feishu/ws-client.ts`、`src/client/views/LayoutView.vue`、`src/client/views/HomeView.vue`

### 测试
- `npm run build` ✅（Vite + tsc，0 错误）
- SQLite `bacs_chat_time_line` 表已创建 ✅

## v1.1.5-fix - 2026-05-14
### 变更内容
- **[修复] 主题色不一致（灰色底部）**：
  - `Pagination.vue` 样式用了错误的 CSS 变量名 `--mac-text-secondary` / `--mac-text`（项目实际变量为 `--text-secondary` / `--text`），导致 dark/light 模式下 fallback 到 hardcoded 灰色（`#6b7280`、`#111827`、`#e5e7eb`）；修正为 `var(--text-secondary)` / `var(--text)`
  - `pagination-mac` 容器 `background: transparent` + `border-top: rgba(0,0,0,0.06)` 不跟随主题；改为 `background: var(--card)` + `border-top: var(--border)`，与 glass-card 内部完全融合
  - `BindingsView` tab-bar：`background: transparent` → `var(--bg)`；tab-btn 的 light 模式 `rgba(255,255,255,0.4)` → `var(--card)`，border `rgba(0,0,0,0.08)` → `var(--border)`；active 态统一用 `var(--accent)` / `var(--bg)` 代替 dark 模式特判的 `#e5e7eb`/`#111`
- **[修复] 其他页面 table 无分页**：
  - `MachinesView`：前端分页（`pagedMachines` computed），添加 `<Pagination>` 组件，默认每页 20 条
  - `ProvidersView`：服务商列表 + 模型列表各自独立分页（`pagedProviders` / `pagedModels`），切换服务商时 modelPage 重置为第 1 页；models 卡片样式统一为 `padding:0; overflow:hidden` 与其他卡片一致

### 影响范围
- 改动：`src/client/components/Pagination.vue`、`src/client/views/BindingsView.vue`、`src/client/views/MachinesView.vue`、`src/client/views/ProvidersView.vue`

### 测试
- `npm run build` ✅（前端 Vite + 后端 tsc，0 错误）

## v1.1.5 - 2026-05-14
### 变更内容
- **信任设备指纹重构**：引入 `@fingerprintjs/fingerprintjs`，前端在登录页计算稳定的浏览器设备指纹（基于 canvas/WebGL/UA 等多维度），存入 `localStorage`（key: `bacs_device_id`）。清 cookie 后指纹依然有效。
- **双通道验证**：`verifyTrustedDevice(userId, deviceToken?, deviceId?)` 同时检查 cookie token（辅助）和 deviceId 指纹（主通道），任意命中即视为信任设备，跳过 2FA。
- **数据库加列**：`trusted_devices` 表新增 `device_id TEXT` 字段，新增 `(user_id, device_id)` 联合索引（迁移文件 `0003_trusted_device_fingerprint.sql`）。
- **相同设备刷新**：同一 `deviceId` 再次信任时，旧记录先删再写（刷新过期时间），不产生重复行。
- **前端统一携带**：`useAuth.login()` 和 `verify2fa()` 均自动调用 `getDeviceId()` 拿指纹，`deviceId` 随请求发给后端。
- **类型更新**：`LoginRequest` / `Verify2faRequest` 加 `deviceId?: string`。
- **测试全覆盖**：重写 trusted-device.test.ts，覆盖双通道命中、userId 不匹配、双通道均过期、重复 deviceId 刷新等 13 个用例，54/54 全通过。

### 影响范围
- 新增：`src/client/composables/useDeviceId.ts`、`src/server/db/migrations/0003_trusted_device_fingerprint.sql`
- 改动：`src/server/auth/trusted-device.ts`、`src/server/routes/auth.ts`、`src/client/composables/useAuth.ts`、`src/shared/types.ts`、`src/server/db/schema.ts`、`src/server/auth/trusted-device.test.ts`

### 测试
- `npm run build` ✅（前端 Vite + 后端 tsc）
- `npx vitest run` ✅ 54/54（含全部历史用例 + 新增双通道 trusted-device 用例）

## v1.1.4 - 2026-05-13
### 变更内容
- **重构「Terminal」交互**：BindingsView 右内容区从「单页表格」改为「双 Tab 容器」。Tab 1 = 进程绑定列表（含分页），Tab 2 = 内嵌 Terminal。原 `Terminal` 按钮不再 `window.open` 新窗口，改为：`useTerminalSession.connect(bindingId) + activeTab='terminal'`，所有进程**共用同一个 xterm 实例 + 同一个 WebSocket**（单例 store），切换目标 binding 时仅复用承载层，关旧 ws 连新 ws，省内存、易管理。
- **列表分页（全站规范）**：后端 `GET /api/status` 新增 `?page=&pageSize=` 参数；走 `count(*)` 取总数 + `limit/offset` DB 层切片，仅对当前页做 `sessionExists/wsConnected` 异步查询，原全表 N 次 await 退化为 1 页 N 次；向后兼容：不传 `page` 仍返数组（HomeView 等老调用方零改动）。前端新增通用组件 `src/client/components/Pagination.vue`（智能省略号、4 档 pageSize 下拉、mac 风格 + dark mode）。
- **Terminal 全局单例 + 5 分钟保活**：新增 `src/client/composables/useTerminalSession.ts`：模块级单例管理 ws + 状态 + 输出缓冲（最多 1MB，xterm 重挂时 replay）+ idle timer。用户离开 Terminal Tab（切到列表）或离开「绑定」菜单时启动 5 分钟计时器，超时未回则自动 `disconnect()`；5 分钟内切回则 `cancelIdleTimer()` 复用连接。`LayoutView` 用 `<keep-alive include="BindingsView">` 包裹 router-view，让切菜单时 BindingsView 状态保活，配合 `onActivated/onDeactivated` 控制 idle timer。
- **Terminal 组件抽取**：新增 `src/client/components/TerminalPanel.vue`：纯展示层，接受 `bindingId` prop，挂载时创建 xterm + FitAddon + WebLinksAddon，订阅 composable 的 message handler，并通过 `replayBuffer` 重放历史输出；卸载时 dispose xterm 但**不**关 ws（由 composable 控制）。原 `TerminalView.vue` 改成路由包装层：保留独立路由 `/terminal/:bindingId`（含 boot token 换 token 流程）作为直链备份，渲染 `<TerminalPanel fullscreen>`。
- **底部 Tab Bar + 250ms 过渡**：在 BindingsView 底部新增胶囊式 Tab Bar，点击切换 Tab，使用 `<Transition>` + `transform/opacity` 实现 250ms 平滑过渡（forward/backward 方向不同），Terminal Tab 上叠加状态指示灯（绿/黄/红）。

### 影响范围
- 后端：`src/server/routes/bindings.ts`
- 前端新增：`src/client/components/Pagination.vue`、`src/client/components/TerminalPanel.vue`、`src/client/composables/useTerminalSession.ts`
- 前端改动：`src/client/views/BindingsView.vue`、`src/client/views/TerminalView.vue`、`src/client/views/LayoutView.vue`

### 测试
- `npm run build` ✅（前端 Vite + 后端 tsc）
- `npx vitest run` ✅ 50/50（含 v1.1.3 pty-bridge 注入防御等历史用例）
- 端到端验证项（建议手测）：分页翻页 / 切换 pageSize / 切 Tab 5 分钟未回自动断 ws / 切菜单 5 分钟未回自动断 ws / 切回 5 分钟内复用 ws / Terminal Tab 切换不同 binding 关旧连新 / 关闭 Tab 不 kill tmux session

## v1.1.3 - 2026-05-12
### 变更内容
- **新功能：浏览器内 Web Terminal**。在「绑定」列表的操作列新增 `Terminal` 按钮，点击后通过 `window.open` 打开独立页面，xterm 直连绑定进程对应的 tmux pane（cc-xxx / codex-xxx），交互体验等同本地 `tmux attach`。核心约束：**关闭 web-terminal 窗口 ≠ kill 业务进程**，飞书消息桥继续工作。
- **后端 `src/server/terminal/pty-bridge.ts`**：抽象 `TerminalSession` 接口；本机用 `node-pty` `spawn('bash', ['-ilc', 'exec tmux attach -t SESSION'])`；远程复用 `SshExecutor` 的 ssh2 client 开独立 `client.shell()` channel，首条命令同样 `exec tmux attach`，让 bash 被 tmux 替换 → channel 关闭走 SIGHUP，tmux 客户端干净 detach（业务 session 保留）。
- **后端 `src/server/terminal/ws-server.ts`**：挂载 `/ws/terminal?bindingId=&token=&cols=&rows=` WebSocket 端点。鉴权走 `verifyToken`（query 参数，与 SSE 同款方案）；连接前用 `executor.sessionExists` 预检 tmux 存在；每 binding 同时刻最多 1 个活跃终端，新连接顶掉旧的；开/关都写 `audit_logs`。协议：二进制透传按键流，文本 JSON 控制（`resize` / `ready` / `error` / `exit`）。
- **后端 `src/server/index.ts`**：用 `http.createServer(app)` 包装 Express 实例，在 listen 前调 `mountTerminalWs`，让 WebSocket 与 HTTP 共用端口。
- **后端 `src/server/executor/ssh.ts`**：新增 `acquireClient()` 暴露已连接的 ssh2 Client，仅供 web-terminal 等需要直接开 channel 的场景使用，调用方不得 destroy 整个 client。
- **前端 `src/client/views/TerminalView.vue`**：新增独立路由 `/terminal/:bindingId`（不嵌 LayoutView，全屏布局）。子窗口通过 `?boot=<60s short JWT>` 接收主窗口快捷登录 token，挂载时调 `/api/auth/exchange` 换长 token 存自己 sessionStorage（解决 sessionStorage 不跨 tab 共享的问题）。xterm + FitAddon + WebLinksAddon，ResizeObserver 同步 cols/rows，`Ctrl-b d` 主动 detach 显示「业务进程仍在运行」断开提示并提供重连按钮。
- **前端 `BindingsView.vue`**：新增 Terminal 按钮，仅在绑定 `online` 时可点；先调 `/api/auth/qr-token` 取短 token 再 `window.open` 子窗口（1100×720）。
- **安全防御**：`isSafeSessionName` 白名单正则 `/^[A-Za-z0-9_-]+$/` + 长度 ≤128，阻止 shell 元字符注入；任何「关闭终端」路径只 close PTY/channel，**绝不调用 `tmux kill-session`**（代码层防御，文档明示）。

### 测试
- 新增 `src/server/terminal/pty-bridge.test.ts`（3 用例）覆盖 `isSafeSessionName` 注入防御断言（合法名通过 / shell 元字符拒绝 / 边界长度）
- `npm run test` → 50/50 通过（新增 3 + 既有 47）
- `npm run build` → client + server 均通过；`TerminalView` 独立 chunk 73KB gzip
- ⚠️ 端到端真机验证（happy path / 关窗不杀进程 / 远程 SSH / tmux session 不存在）需在部署机上跑，详见 `docs/plans/v1.1.3-web-terminal.md` 测试计划
- ⚠️ `npm run lint` 因 ESLint 9 配置文件缺失（历史遗留）报错，与本次改动无关

### 影响范围
- `src/server/terminal/pty-bridge.ts`（新增）
- `src/server/terminal/ws-server.ts`（新增）
- `src/server/terminal/pty-bridge.test.ts`（新增）
- `src/server/index.ts`（http.createServer 包装 + mountTerminalWs）
- `src/server/executor/ssh.ts`（新增 acquireClient）
- `src/client/views/TerminalView.vue`（新增）
- `src/client/views/BindingsView.vue`（新增 Terminal 按钮 + openTerminal）
- `src/client/router/index.ts`（新增 /terminal/:bindingId 独立路由）
- `package.json`（1.1.2 → 1.1.3；新增 node-pty / xterm / xterm-addon-fit / xterm-addon-web-links / @types/ws 依赖）
- `docs/plans/v1.1.3-web-terminal.md`（技术方案文档归档）

## v1.1.2 - 2026-05-12
### 变更内容
- **修复 2FA「信任设备」失效**：用户勾选「信任此设备（30天内免验证）」后，下次登录依然被要求输入验证码。排查后发现是 4 个独立 bug 叠加，全部命中。
  1. **`cleanExpiredDevices` 条件写反（核心）**：`src/server/auth/trusted-device.ts` 用 `gt(expiresAt, now)` 表达"过期"，实际语义是"未来时间 = 还没过期"。每次登录开头调 `cleanExpiredDevices(user.id)` → 把**还在有效期内**的信任记录全删掉，过期的反而留着。`verifyTrustedDevice` 随后查不到 token 必走 2FA。改为 `lt(expiresAt, now)`。
  2. **`logout` 清掉了 trusted_device cookie**：`src/server/routes/auth.ts` 退出登录调 `res.clearCookie('trusted_device')`，把 30 天的信任凭据立刻删除。但产品语义"30 天内免验证"应该是设备级，不该被会话生命周期影响。改为登出时**只清会话级凭据，保留设备信任 cookie**。撤销设备信任应走设置页（后续工单）。
  3. **前端 fetch 未显式 `credentials`**：`src/client/composables/useApi.ts` 的 4 个请求（GET/POST/PUT/DELETE）都没设 `credentials`，默认 `same-origin` 在某些反代/打包场景下会丢 cookie，登录时读不到 `trusted_device` → 必走 2FA。统一改为 `credentials: 'same-origin'` 显式声明。
  4. **cookie maxAge 写死 30 天**：`auth.ts` 两处 `30 * 24 * 60 * 60 * 1000` 与 DB 端的 `TRUSTED_DEVICE_DAYS` 常量分离，改一处会漏一处。抽出 `TRUSTED_DEVICE_COOKIE_MAX_AGE_MS` 常量统一引用。
- **顺手修：`describeUserAgent` iPhone 误识别为 macOS**：iPhone UA 含 "Mac OS X" 子串，原代码先判 `Mac` 再判 `iPhone`，永远走不到 iOS 分支；Android UA 含 "Linux" 同理。把移动端判断提前。

### 测试
- 新增 `src/server/auth/trusted-device.test.ts`（9 用例）：
  1. createTrustedDevice → verifyTrustedDevice 正常路径
  2. 未知 token 返回 null
  3. 过期 token 不通过验证
  4. **cleanExpiredDevices 只删过期、保留有效**（核心回归用例）
  5. cleanExpiredDevices 限定 userId 不影响其他用户
  6. cleanExpiredDevices 不带 userId 全表清理
  7. describeUserAgent Chrome / macOS / Safari iOS / Edge Windows
- 全套 47/47 通过（cc-adapter 30 + codex-adapter 8 + trusted-device 9）
- `npm run build` 通过
- `npm audit` 6 个告警为 bcrypt → @mapbox/node-pre-gyp → tar 链路（已在 plan.md 列待办，breaking change 不在本版本范围）

### 影响范围
- `src/server/auth/trusted-device.ts`（cleanExpiredDevices 条件 + describeUserAgent OS 顺序）
- `src/server/routes/auth.ts`（logout 不清 cookie + maxAge 用常量）
- `src/client/composables/useApi.ts`（4 个请求加 `credentials: 'same-origin'`）
- `src/server/auth/trusted-device.test.ts`（新增）
- `package.json`（1.1.1 → 1.1.2）

### 部署须知
远程桥接服务必须 `git pull && npm run build && pm2 restart` 才能生效。**已存在的过期信任记录建议手动清一次**（旧 gt 逻辑下数据库里可能堆积了过期 token，新 lt 逻辑会在用户下次登录时自动清）。

---

## v1.1.1 - 2026-05-12
### 变更内容
- **修复 cc/codex 等待 Yes/No 决策时无法捕获 + 无法转发用户选择**。原本 cc 弹出 "Do you want to use this API key? 1.Yes 2.No" 等决策面板时，桥接侧 `isIdle` 把面板里的高亮 `❯` 误判为输入框光标 → 误以为 cc 已经 idle → 走 `extractReply` 提空内容 → 飞书既看不到面板，也无法把"1"/"是"转发给 cc。
- **三态状态机**：`isIdle()` 改成 `detectState()` 返回 `idle | working | awaiting_choice`。`awaiting_choice` 优先级最高（先按面板特征识别 ╭─...─╮ 框 + 多个 1./2./❯ 选项 + 问号标题，命中即返回，避免被 working 或 idle 覆盖）。
  - `src/server/cli/types.ts`：`CliAdapter` 新增 `detectState` / `extractChoicePanel` / `sendChoice`，`isIdle` 标记 deprecated 但保留兼容
  - `src/server/cli/cc-adapter.ts`：实现三个新方法，`isIdle` 内部委托给 `detectState`
  - `src/server/cli/codex-adapter.ts`：复用 cc 的 `extractChoicePanel` / `sendChoice`（codex 决策面板形态相同），`detectState` 接入工作中检测
- **session 状态机改造**：`SessionState` 新增 `awaiting: { panel, panelKey, pushedAt } | null` 字段。`startOutputPolling` 改用 `{ onReply, onAwaiting }` 双回调：
  - `awaiting_choice` → 调 `onAwaiting(panel)` 推决策卡片，**不结束 session**；通过 panelFingerprint 去重，同一面板不重复推
  - 之前在等待但当前已无面板 → 清 `awaiting`，恢复常规 stable→tryFinish
  - 处于 awaiting 时 hardDeadline 跳过、progress 卡片跳过，避免误导用户
- **决策回复路由**：`ws-client.handleIncomingMessage` 中，`hasActiveSession + getSession().awaiting` → 走 `adapter.sendChoice` 而非新建 session：
  - `sendChoice` 解析飞书自由文本（数字/yes/no/是/否/关键词包含）→ 算出目标序号 → 用 `defaultIndex` 与目标的差值发 `Up/Down`+ `C-m`，无 defaultIndex 则降级数字键 + `C-m`
  - executor 接口新增 `sendKeys(sessionName, keys[], betweenMs)`：直接 `tmux send-keys` 不走 paste-buffer（决策面板没有输入框，paste 会被吞）；ssh + local 双实现合并到一次 exec 保证按键节奏
- **新增决策卡片** `sender.buildAwaitingCard`：⚠️ 橙色，含面板标题、所有选项（默认项前加 👉）、引导用户回复方式
- **vitest 配置补全**：项目 `vite.config.ts` 把 root 设到 `src/client`，导致 `npm run test` 扫不到后端测试。新增 `vitest.config.ts` 显式设 `include: src/**/*.test.ts`，恢复全套测试可跑
- **测试**：cc-adapter.test.ts 新增 15 个用例（5 extractChoicePanel + 8 sendChoice），codex-adapter 新增 2 个；38/38 通过
- **build**：通过
- **audit**：6 个间接依赖告警（bcrypt→@mapbox/node-pre-gyp→tar），fix 需 bcrypt 主版本升级，列入 plan.md 待决，本版本不动

### 影响范围
- `src/server/cli/types.ts`（接口扩展 + 新类型 CliState/ChoicePanel）
- `src/server/cli/cc-adapter.ts`（新增 detectState / extractChoicePanel / sendChoice / resolveChoiceIndex）
- `src/server/cli/codex-adapter.ts`（detectState + 复用 cc 选择逻辑）
- `src/server/executor/types.ts`（新增 sendKeys）
- `src/server/executor/local.ts`（实现 sendKeys）
- `src/server/executor/ssh.ts`（实现 sendKeys + shellQuoteKey）
- `src/server/session/state.ts`（SessionState.awaiting + PollingHandlers + tryFinish 三态分支）
- `src/server/channel/feishu/ws-client.ts`（active+awaiting 路由 sendChoice + onAwaiting 推卡片 + 进度/超时跳过）
- `src/server/channel/feishu/sender.ts`（buildAwaitingCard）
- `src/server/cli/cc-adapter.test.ts`（+15 用例）
- `src/server/cli/codex-adapter.test.ts`（+2 用例）
- `vitest.config.ts`（新增）
- `package.json`（1.0.10 → 1.1.1，中版本号升级，发布打 tag）

### 部署须知
远程桥接服务必须 `git pull && npm run build && pm2 restart` 才能生效。

---

## v1.0.10 - 2026-05-12
### 变更内容
- **修复远程长任务期间 cc 看似"失联"的 bug**。SshExecutor 此前默认 60s 无 exec 就主动 `client.end()`，但远程 cc 跑长任务时桥接侧本就没指令——60s 一到自断 SSH，pollPane / sendInput 下一次再上来要重连，期间表现为"abcd 进程全部失联"。
  - `src/server/executor/ssh.ts` 移除 `IDLE_TIMEOUT` 主动断连：`startIdleTimer` 改 no-op，断连只在底层 socket 真正出错时由 `'close'` 事件触发，下一次 exec 通过 `ensureConnected` 自动重连
  - 心跳从 5min 收紧到 30s，更早发现"socket 半死"状态（NAT/防火墙静默 drop）
  - 不改 sendInput / capturePane 等业务逻辑

### 影响范围
- src/server/executor/ssh.ts
- 仅远程绑定（machineId 非 builtin）受影响；本机 LocalExecutor 无此问题

### 部署须知
远程桥接服务必须 `git pull && npm run build && pm2 restart` 才能生效，旧 dist 不会自愈。

## v1.0.9 - 2026-05-11
### 变更内容
- **绑定表单：模型 + effort 启动注入**。v1.0.8 的 `--model` 注入已写对，但用户无法在 UI 上单独选 effort，只能把模型+effort 拼成字符串（如 `claude-opus-4-7 - max`）当 modelId 填 → CLI 忽略非法值回退默认 → 看起来"模型没生效"。本次从根上解决：
  - `bindings` 表新增 `effort`（text, nullable）和 `modelOverride`（text, nullable，优先于 modelId FK）两个字段
  - cc-adapter 注入 `--effort <level>`（取值 low/medium/high/xhigh/max，v2.1.138 实测）
  - codex-adapter 注入 `-c model_reasoning_effort=<level>`（取值 minimal/low/medium/high/xhigh，本地 codex v0.128.0 实测 `reasoning effort: high` 输出确认生效）
  - manager.buildCliConfig：modelOverride 优先于 modelId FK + effort 透传
  - BindingForm 前端：选模型后按 `modelSupportsEffort()` 动态显示 effort 下拉，取值按 `getEffortOptions()` 按 maxEffort 截断（如 mini 截到 high）
- **服务商探查失败时默认模型回退**。不支持 `/v1/models` 的中转站/兼容服务商，模型下拉为空 → 用户无法绑定。
  - 新增 `src/shared/defaultModels.ts`：内置 Claude 5 个 + OpenAI 5 个默认模型清单，含 supportsEffort/maxEffort 元数据
  - 新增 API `GET /api/models/defaults?cliKind=cc|codex` 和 `GET /api/models/effort-options`
  - BindingForm：服务商切换时尝试探查，失败后 catch → 加载默认清单 + 显示 banner "服务商不支持模型探查"
  - 支持"手输自定义模型 ID"：模型下拉旁加"手输"按钮，切换后 modelOverride 字段直接存字符串，绕过 FK
- **远程实测验证**（root@49.12.243.33）：
  - `bash -ilc 'export ...; exec claude --model claude-opus-4-7 --effort max'`
  - pane 显示 "Opus 4.7 with max effort · ◈ max · /effort" ✅ 模型+effort 双注入生效

### 默认模型清单
**Claude（cc）**：claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5-20251001 / claude-opus-4-6 / claude-sonnet-4-5
**OpenAI（codex）**：gpt-5.5 / gpt-5.4-codex / gpt-5.3-codex / gpt-5.4-mini / gpt-5.2

### 测试
- cc-adapter.test.ts 新增 effort 用例（`--effort` 存在/不存在断言）
- codex-adapter.test.ts 新建（6 个用例含 `-c model_reasoning_effort=` 断言）
- 23/23 全部通过，`npm run build` 通过

### 影响范围
- `src/shared/defaultModels.ts`（新增）
- `src/shared/types.ts`（Binding/CreateBindingRequest 加 modelOverride/effort）
- `src/server/db/schema.ts`（bindings 加 modelOverride/effort + 迁移 0002）
- `src/server/cli/types.ts`（CliStartConfig 加 effort）
- `src/server/cli/cc-adapter.ts`（buildStartCmd 加 --effort）
- `src/server/cli/codex-adapter.ts`（buildStartCmd 加 -c model_reasoning_effort）
- `src/server/session/manager.ts`（modelOverride 优先 + effort 透传）
- `src/server/routes/bindings.ts`（create/mount/edit/status 加新字段）
- `src/server/routes/models.ts`（加 defaults + effort-options API）
- `src/client/views/BindingsView.vue`（探查失败回退 + 手输 + effort 下拉）
- `src/server/cli/cc-adapter.test.ts` / `src/server/cli/codex-adapter.test.ts`（新增/扩展）
- `package.json`（1.0.8 → 1.0.9）

---

## v1.0.8 - 2026-05-11
### 变更内容
- **彻底修复远程绑定 "Not logged in" 问题**。v1.0.7 只改了 env 字段名，没解决根因。本次基于真实远程主机（root@49.12.243.33，Ubuntu）抓到根因并验证修复有效。
- **真因**：bridge 通过 ssh2 `client.exec()` 启动 tmux，是**非交互非登录 shell**，Ubuntu/Debian `~/.bashrc` 顶部的 `[ -z "$PS1" ] && return` 守卫让整个 rc 文件被跳过 → 远程主机 export 在 `~/.bashrc` 里的 `ANTHROPIC_*` 完全读不到 → claude 子进程判定"未登录"。`bash -lc` 也没用（远程没有 `~/.bash_profile`，且仍被守卫拦截）；`bash -ilc` 才能加 `$PS1` 绕过守卫。
- **改动**：
  - `src/server/cli/cc-adapter.ts:buildStartCmd` 重写：把 `tmux new-session -d "claude"` 改为 `tmux new-session -d "bash -ilc 'export...; exec claude'"`。`-i` 设置 `$PS1` 绕过 rc 守卫，`-l` 兼容 `.bash_profile`/`.profile` 系发行版，`exec` 让 claude 替换 bash 进程不留壳。
  - `src/server/cli/codex-adapter.ts:buildStartCmd` 同步改造（codex 同样跑非交互 shell）。
  - **去掉 `ANTHROPIC_API_KEY` 注入**：远程实测发现，claude CLI 检测到 `ANTHROPIC_API_KEY` 时会弹出 *"Do you want to use this API key? 1.Yes 2.No(recommended)"* 交互确认页，导致 tmux 会话卡死、机器人"没响应"。仅保留 `ANTHROPIC_AUTH_TOKEN`（第三方中转站和官方 OAuth 都识别此字段，且不触发确认页）。
  - `src/server/session/manager.ts:buildCliConfig` cc 分支 envVars 同步去除 `ANTHROPIC_API_KEY`。
  - 仍保持原则：**绝不修改远程主机 `~/.claude/` 与 rc 文件**，所有 ENV 注入只作用于 tmux 子进程。
- **真实远程验证**（root@49.12.243.33 上抓 tmux pane）：
  - `local` 模式：`bash -ilc 'exec claude'` → Opus 4.6 主界面 ✅（远程 rc 中 ANTHROPIC_MODEL 生效）
  - `custom` 模式：`bash -ilc 'unset CLAUDE_CODE_OAUTH_TOKEN; export ANTHROPIC_BASE_URL=...; export ANTHROPIC_AUTH_TOKEN=...; export ANTHROPIC_MODEL=...; exec claude --model ...'` → Opus 4.7 主界面 ✅（绑定模型生效）

### 测试
- `cc-adapter.test.ts:buildStartCmd describe` 全部用例改写，新增"必须不注入 ANTHROPIC_API_KEY"、"bash -ilc 包裹"、"exec 替换 bash 进程"等断言
- 15 个测试用例（7 个 extractReply + 8 个 buildStartCmd）全部通过
- `npm run build` 通过

### 影响范围
- `src/server/cli/cc-adapter.ts`（buildStartCmd 重写）
- `src/server/cli/codex-adapter.ts`（buildStartCmd 重写）
- `src/server/session/manager.ts`（envVars 去除 ANTHROPIC_API_KEY）
- `src/server/cli/cc-adapter.test.ts`（buildStartCmd 用例重写）
- `package.json`（1.0.7 → 1.0.8）

---

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
