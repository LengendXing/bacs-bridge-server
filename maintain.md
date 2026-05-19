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
