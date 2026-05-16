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
