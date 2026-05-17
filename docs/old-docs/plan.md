# 任务计划 · 机器人 × AI-CLI 桥接系统

## 待办（按优先级）
- [ ] 升级 bcrypt 到 v6 解决 6 个间接依赖（@mapbox/node-pre-gyp → tar）安全告警（breaking change，需评估迁移成本）
- [ ] Claude Code headless 模式集成（stream-json 精确费用 + token 统计）

## v1.1.25 · 2026-05-17
- [x] extractToolCalls + extractTiming + extractToolCount 解析函数 ✅ 2026-05-17
- [x] SessionState 扩展 lastToolCalls + 轮询提取 ✅ 2026-05-17
- [x] buildWorkingCard 替换 buildProgressCard（工具调用 + 中断按钮） ✅ 2026-05-17
- [x] 回复卡片 note 加 timing + toolCount + costUsdEstimated 统计 ✅ 2026-05-17
- [x] collapsible_panel 长回复折叠（>1500 字符） ✅ 2026-05-17
- [x] /命令路由（/status /interrupt /model /effort） ✅ 2026-05-17
- [x] handleCardAction cc_interrupt 中断按钮回调 ✅ 2026-05-17
- [x] 计费数据库表 + 计费服务 + API（billing/details/conversation_billing） ✅ 2026-05-17
- [x] 菜单改造（日志→一级菜单+3二级）+ 扣费日志页面 ✅ 2026-05-17

## v1.1.6 · 2026-05-14
- [x] Logo 右侧加「笨迪桥接」文字（left 侧边栏 + top 顶栏） ✅ 2026-05-14
- [x] 删除右上角退出按钮（left/top 两种模式均清理） ✅ 2026-05-14
- [x] 新建 bacs_chat_time_line 表（迁移文件 0004_chat_timeline.sql + schema） ✅ 2026-05-14
- [x] ws-client.ts 写入 timeline hook（收到消息 → DB 写入 + SSE 广播） ✅ 2026-05-14
- [x] 新建 /api/timeline + /api/timeline/stream SSE 端点 ✅ 2026-05-14
- [x] HomeView 首页 Timeline 区块（SSE 实时 + TransitionGroup 插入动画 + 展开/收起） ✅ 2026-05-14

## v1.1.5-fix · 2026-05-14
- [x] 修复 Pagination.vue CSS 变量名错误（--mac-text* → --text*），background 改用 var(--card)/var(--border) ✅ 2026-05-14
- [x] 修复 BindingsView tab-bar 灰色底部，统一用主题变量 var(--bg)/var(--card)/var(--accent) ✅ 2026-05-14
- [x] MachinesView 补充前端分页（Pagination 组件，默认 20 条/页） ✅ 2026-05-14
- [x] ProvidersView 服务商列表 + 模型列表各加分页（切换服务商重置 modelPage） ✅ 2026-05-14

## v1.1.5 · 2026-05-14
- [x] 引入 @fingerprintjs/fingerprintjs，实现 useDeviceId.ts（计算+localStorage 缓存） ✅ 2026-05-14
- [x] trusted_devices 表加 device_id 列（迁移文件 0003_trusted_device_fingerprint.sql） ✅ 2026-05-14
- [x] 后端 verifyTrustedDevice 改为双通道（deviceId 主 + cookie token 辅），createTrustedDevice 支持写入 deviceId ✅ 2026-05-14
- [x] 前端 useAuth.login/verify2fa 自动带 deviceId，shared types 加 deviceId 字段 ✅ 2026-05-14
- [x] 重写 trusted-device.test.ts，13 用例全覆盖双通道逻辑，54/54 全通过 ✅ 2026-05-14

## v1.1.4 · 2026-05-13
- [x] BindingsView 右内容区改双 Tab（列表 + Terminal），底部胶囊 Tab Bar，250ms 平滑过渡 ✅ 2026-05-13
- [x] 后端 /api/status 加分页（?page=&pageSize=，DB 层 limit/offset，向后兼容）✅ 2026-05-13
- [x] 通用 Pagination.vue 组件（智能省略号、4 档 pageSize、mac 风格 + dark mode）✅ 2026-05-13
- [x] Terminal 单例化：useTerminalSession composable 管 ws + xterm buffer + 5min idle timer ✅ 2026-05-13
- [x] TerminalPanel.vue 组件抽取，TerminalView 改为路由包装层（独立路由直链保留）✅ 2026-05-13
- [x] LayoutView keep-alive 包 BindingsView，切菜单状态保活 + 5 分钟超时断 ws ✅ 2026-05-13
- [x] Terminal 按钮交互改为切 Tab，不再 window.open 新窗口 ✅ 2026-05-13

## v1.1.3 · 2026-05-12
- [x] Web Terminal：「绑定」列表新增 Terminal 按钮，浏览器内 xterm 直连 tmux pane ✅ 2026-05-12
- [x] 后端 pty-bridge（本机 node-pty / 远程 ssh2 shell channel）+ /ws/terminal WebSocket 端点 + 鉴权 + 审计 ✅ 2026-05-12
- [x] 前端 TerminalView 独立路由 + 子窗口 token 交换 + ResizeObserver 同步窗口大小 ✅ 2026-05-12
- [x] 安全防御：session 名白名单正则 + 关闭路径绝不 kill-session ✅ 2026-05-12
- [x] pty-bridge.test.ts：isSafeSessionName 注入防御断言（50/50 全过）✅ 2026-05-12
- [ ] 部署机端到端验证：happy path / 关窗不杀进程 / 远程 SSH / tmux session 不存在四组用例

## v1.1.2 · 2026-05-12
- [x] 修复 2FA「信任设备」失效：cleanExpiredDevices gt/lt 条件写反 + logout 错误清 trusted_device cookie + useApi fetch 显式 credentials + cookie maxAge 用常量 ✅ 2026-05-12
- [x] 顺手修复 describeUserAgent 把 iPhone(含"Mac OS X" 子串) 误识别为 macOS ✅ 2026-05-12
- [x] 新增 trusted-device.test.ts（9 用例覆盖 create/verify/clean/UA） ✅ 2026-05-12

## v1.1.1 · 2026-05-12
- [x] 修复 cc/codex 等待 Yes/No 决策面板时无法捕获、无法转发用户选择 ✅ 2026-05-12
- [x] CliAdapter 三态识别（idle/working/awaiting_choice）+ 选择面板提取 + sendChoice ✅ 2026-05-12
- [x] executor 新增 sendKeys（直接 tmux send-keys 走方向键/数字键不走 paste-buffer） ✅ 2026-05-12
- [x] session 状态机：awaiting_choice 推决策卡片但不结束 session；用户回复路由到 sendChoice ✅ 2026-05-12
- [x] 决策卡片 buildAwaitingCard 显示标题+选项+默认项标记 ✅ 2026-05-12
- [x] vitest.config.ts 补全：`npm run test` 可扫到后端测试 ✅ 2026-05-12

## v1.0.10 · 2026-05-12
- [x] 修复 SshExecutor 60s 主动空闲断连：长任务期间会让远程 cc 看似失联（实测 46.224.12.231 abcd 全部失联） ✅ 2026-05-12
- [x] 心跳 5min → 30s，更快发现半死 socket ✅ 2026-05-12

## v1.0.9 · 2026-05-11
- [x] 绑定表单新增 effort 字段：cc 支持 low~max，codex 支持 minimal~xhigh；按模型 maxEffort 截断 ✅ 2026-05-11
- [x] cc-adapter 注入 `--effort`，codex-adapter 注入 `-c model_reasoning_effort=` ✅ 2026-05-11
- [x] bindings 表新增 modelOverride（优先于 FK）+ effort 字段 ✅ 2026-05-11
- [x] 服务商探查失败时回退内置默认模型 5+5 + 支持手输自定义模型 ID ✅ 2026-05-11
- [x] 远程实测 root@49.12.243.33：`--model claude-opus-4-7 --effort max` → pane 显示 "Opus 4.7 with max effort · ◈ max" ✅ 2026-05-11

## v1.0.8 · 2026-05-11
- [x] 彻底修复远程 Not logged in：用 bash -ilc 包裹 tmux 启动命令以加载远程 rc 文件，绕过 Ubuntu/Debian `[ -z "$PS1" ] && return` 守卫 ✅ 2026-05-11
- [x] 去掉 ANTHROPIC_API_KEY 注入，避免 claude CLI 弹出确认页阻塞 tmux 会话 ✅ 2026-05-11
- [x] codex-adapter 同步改造为 bash -ilc 启动 ✅ 2026-05-11
- [x] 在真实远程主机 root@49.12.243.33 端到端验证 local + custom 两种模式都登录成功 ✅ 2026-05-11

## v1.0.7 · 2026-05-11
- [x] 修复远程绑定 ENV 注入：CLAUDE_BIN 去本地 HOME / custom 同时注入 API_KEY+AUTH_TOKEN / env -u 屏蔽远程 OAuth（不动远程文件） ✅ 2026-05-11
- [x] 新增 buildStartCmd 6 个单元测试防回归 ✅ 2026-05-11

## v1.0.0 · 全面重构（2026-05-10）

- [x] Phase 1: Vite + Vue 3 + TypeScript 项目初始化 ✅ 2026-05-10
- [x] Phase 1: Express 后端骨架 + config.yaml ✅ 2026-05-10
- [x] Phase 1: 前端页面骨架 + macOS 主题 + 暗色模式 ✅ 2026-05-10
- [x] Phase 2: SQLite + Drizzle ORM + 6 张表 + 迁移文件 ✅ 2026-05-10
- [x] Phase 2: 认证 + 2FA + 服务商/模型 全套 API 和前端 ✅ 2026-05-10
- [x] Phase 3: CLI Adapter 抽象 + CC 适配器 + Codex 骨架 ✅ 2026-05-10
- [x] Phase 4: Channel 抽象 + 飞书重构 + 路由实现 ✅ 2026-05-10
- [x] Phase 5: PM2 + deploy.sh + 文档更新 ✅ 2026-05-10

## v1.0.4-Beta · 2026-05-11
- [x] 设置页快捷登录二维码 + 60s 倒计时 + 自动/手动刷新 ✅ 2026-05-11
- [x] 二维码方案改为「短期 JWT + 客户端 exchange 长 token」避免泄露 ✅ 2026-05-11
- [x] 对外服务地址配置项（app_settings KV）+ X-Forwarded-* 反代支持 ✅ 2026-05-11
- [x] 顺手修：Bindings 选本机环境变量时模型下拉为空 ✅ 2026-05-11

## v1.0.6 · 2026-05-11
- [x] extractReply 二次防御：识别被边框包裹的 `│ ❯ │` 空闲光标 + 加强 after 过滤 + cleaned 边框光标过滤（替代 v1.0.5 的 2b4e01d，6/6 测试） ✅ 2026-05-11
- [x] 新增 cc-adapter.extractReply 单元测试 6 个场景防回归 ✅ 2026-05-11

## v1.0.5 · 2026-05-11
- [x] 修复 SSE 1002：6 个 router 改为逐路由挂 requireAuth（避免 router.use 拦截 SSE） ✅ 2026-05-11

## v1.0.4 · 2026-05-11
- [x] 代码 Review + 修复 cc-adapter 模型未注入 + 编辑绑定空 secret 覆盖 bug ✅ 2026-05-11
- [x] 机器管理添加默认本机记录（builtin） ✅ 2026-05-11
- [x] 菜单顺序调整：首页→机器→服务商→绑定→日志→设置 ✅ 2026-05-11
- [x] 系统日志 SSE 接通（修文件名 + 回放 + 心跳） ✅ 2026-05-11
- [x] 绑定弹窗新增模型字段 + 表单顺序调整 + CLI/服务商联动 ✅ 2026-05-11
- [x] 编辑绑定支持改模型（CLI 仍禁改） ✅ 2026-05-11

## 待办（后续迭代）

- [x] 远程机器管理模块（Executor 抽象 + SshExecutor + 机器管理 CRUD + 前端） ✅ 2026-05-10
- [x] 前端绑定表单完善（服务商→模型级联选择） ✅ 2026-05-11
- [ ] Codex 适配器完善（需 TUI 实测：isIdle / extractReply）
- [ ] 前端 2FA 设置弹窗（QR 码显示 + 验证码输入）
- [ ] 前端服务商管理弹窗
- [ ] 旧数据迁移执行（migrate-bindings.ts）
- [ ] 清理废弃文件（bridge-server/ / admin/ / cc.sh 等）
- [ ] 单元测试补全（核心模块覆盖率 ≥ 80%）
- [ ] Codex CLI 适配器实测
- [ ] 远程机器端到端联调（需远程测试机）
