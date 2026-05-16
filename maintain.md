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
