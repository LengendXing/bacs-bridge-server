# 迭代日志 · 飞书 × Claude Code 桥接系统

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
