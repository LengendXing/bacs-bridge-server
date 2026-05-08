# 迭代日志 · 飞书 × Claude Code 桥接系统

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
