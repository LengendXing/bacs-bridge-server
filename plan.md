# 任务计划 · 飞书 × Claude Code 桥接系统

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
