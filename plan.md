# 任务计划 · 飞书 × Claude Code 桥接系统

## v0.4.0 · Bug 修复批次（2026-05-09）

- [x] P0-1 修复回复内容缺失（extractReplyContent 重写为 ● 块分组提取 + 兜底） ✅ 2026-05-09
- [x] P0-2 修复回复不及时（ws-client 会话状态机 + 双确认 + 硬超时兜底 + pane 重绘防护） ✅ 2026-05-09
- [x] P0-3 修复回复格式（sendReplyCard + GFM 表格降级 + 长回复分段 + fallback 文本） ✅ 2026-05-09
- [x] P0-4 修复管理面板复制 attach 命令（HTTP/HTTPS 双环境 + execCommand fallback + prompt 兜底） ✅ 2026-05-09
- [x] P1-1 tmux 命令注入加固（load-buffer + paste-buffer 模式） ✅ 2026-05-09
- [x] P1-2 cc.sh 智能化重构（attach 自动创建、-s 交互、外部化所有配置） ✅ 2026-05-09
- [x] P1-3 删除死代码 crypto.js + cc1.sh ✅ 2026-05-09
- [x] P1-4 maintain.md / plan.md 更新 + 版本号 0.1.1 → 0.4.0 ✅ 2026-05-09

## 历史已完成

- [x] 初始化项目结构 ✅ 2026-05-08
- [x] 配置管理模块（config.js）✅ 2026-05-08
- [x] 绑定存储模块（store.js）✅ 2026-05-08
- [x] 进程通信模块（communicator.js + manager.js）✅ 2026-05-08
- [x] 飞书 SDK 模块（sender.js）✅ 2026-05-08
- [x] 路由层（feishu.js + admin.js）✅ 2026-05-08
- [x] 服务入口（index.js）✅ 2026-05-08
- [x] cc.sh 扩展（--app-id/--app-secret）✅ 2026-05-08
- [x] 管理面板（admin/index.html + js/app.js）✅ 2026-05-08
- [x] 联调测试 ✅ 2026-05-08
- [x] lint/audit 检查 ✅ 2026-05-08
- [x] 文档更新（maintain.md + plan.md）✅ 2026-05-08
- [x] 管理面板加密码保护（登录页 + config.yaml admin_password）✅ 2026-05-08
- [x] 进程名改为下拉列表（查询 tmux sessions 动态填充）✅ 2026-05-08
- [x] 飞书对接改为 WebSocket 长连接（ws-client.js + per-binding 凭据）✅ 2026-05-08
- [x] 绑定数据模型重构（feishu_target → feishu_app_id + feishu_app_secret）✅ 2026-05-08
- [x] 管理面板嵌入飞书应用创建指引 ✅ 2026-05-08
- [x] ❯ 提示符空闲检测 + 稳定性确认自动回复 ✅ 2026-05-08
- [x] TUI 纯文本回复提取（含 Unicode 表格保留）✅ 2026-05-08
- [x] 进度/超时卡片通知（60s/10min）✅ 2026-05-08
- [x] Markdown 格式回复（交互式卡片承载）✅ 2026-05-08
- [x] 并发保护 + 输出基线修复 ✅ 2026-05-08
- [x] 飞书 Webhook 需求确认通知集成 ✅ 2026-05-08

## v0.5.0 · 管理面板重构（2026-05-09）

- [x] 后端数据模型扩展（store.js：edit() + claude_mode/base_url/api_key + ensureDataFile） ✅ 2026-05-09
- [x] 进程管理改造（manager.js：start() 支持 custom 模式环境变量子进程注入） ✅ 2026-05-09
- [x] 后端接口改造（/api/bind 重名校验+原子回滚 + /api/bind/mount + /api/edit + /api/sessions/unbound） ✅ 2026-05-09
- [x] 前端 HTML 改造（编辑 modal + 解绑 modal + Claude 接入配置 radio + 表格新列） ✅ 2026-05-09
- [x] 前端 JS 改造（openBindModal/openEditModal/openUnbindModal + loadUnboundSessions） ✅ 2026-05-09
- [x] 版本号 0.4.0 → 0.5.0 + maintain.md + plan.md ✅ 2026-05-09

## v0.5.4 · 表格转飞书原生 table 元素（2026-05-09）

- [x] P0-1 GFM/box-drawing 表格解析为飞书原生 table 元素，移除代码块包裹方案 ✅ 2026-05-09

## v0.5.3 · box-drawing 表格提取修复（2026-05-09）

- [x] P0-1 修复 extractReplyContent 丢弃 box-drawing 表格行：新增零缩进续行判断 + fallback 不剥 │ ✅ 2026-05-09

## v0.5.2 · box-drawing 表格渲染修复（2026-05-09）

- [x] P0-1 修复 box-drawing 表格在飞书无法对齐：sanitizeMarkdownForFeishu() 新增检测+代码块包裹 ✅ 2026-05-09

## v0.5.1 · isIdle 误判修复（2026-05-09）

- [x] P0-1 修复 isIdle() 误判：新增 "esc to interrupt" 忙碌检测，扩大捕获行数 ✅ 2026-05-09
- [x] P0-2 修复快速响应漏抓：tryFinish() 发送前额外全量 pane 刷新 ✅ 2026-05-09

## 待办（后续迭代）

- [ ] 后台管理面板「新建绑定」流程改造（先填表 → 自动给 cc.sh 启动命令复制 → 检测在线状态）
- [ ] WebSocket 事件接收偶发不稳定问题排查（飞书侧路由问题）
- [ ] bridge-server 单元测试补全（核心模块覆盖率 ≥ 80%）
