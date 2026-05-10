# 任务计划 · 飞书 × Claude Code 桥接系统

## v1.0.0 · 全面重构（2026-05-10）

- [x] Phase 1: Vite + Vue 3 + TypeScript 项目初始化 ✅ 2026-05-10
- [x] Phase 1: Express 后端骨架 + config.yaml ✅ 2026-05-10
- [x] Phase 1: 前端页面骨架 + macOS 主题 + 暗色模式 ✅ 2026-05-10
- [x] Phase 2: SQLite + Drizzle ORM + 6 张表 + 迁移文件 ✅ 2026-05-10
- [x] Phase 2: 认证 + 2FA + 服务商/模型 全套 API 和前端 ✅ 2026-05-10
- [x] Phase 3: CLI Adapter 抽象 + CC 适配器 + Codex 骨架 ✅ 2026-05-10
- [x] Phase 4: Channel 抽象 + 飞书重构 + 路由实现 ✅ 2026-05-10
- [x] Phase 5: PM2 + deploy.sh + 文档更新 ✅ 2026-05-10

## 待办（后续迭代）

- [x] 远程机器管理模块（Executor 抽象 + SshExecutor + 机器管理 CRUD + 前端） ✅ 2026-05-10
- [ ] Codex 适配器完善（需 TUI 实测：isIdle / extractReply）
- [ ] 前端绑定表单完善（服务商→模型级联选择）
- [ ] 前端 2FA 设置弹窗（QR 码显示 + 验证码输入）
- [ ] 前端服务商管理弹窗
- [ ] 旧数据迁移执行（migrate-bindings.ts）
- [ ] 清理废弃文件（bridge-server/ / admin/ / cc.sh 等）
- [ ] 单元测试补全（核心模块覆盖率 ≥ 80%）
- [ ] Codex CLI 适配器实测
- [ ] 远程机器端到端联调（需远程测试机）
