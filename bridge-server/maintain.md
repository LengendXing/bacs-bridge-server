## v0.1.1 - 2026-05-09

### 变更内容
- 管理面板 Tab 导航改造：首页/列表/日志/帮助 四个 Tab 切换
- 新建绑定改为 Modal 弹窗，从列表 Tab 的「新建」按钮触发
- 绑定表格新增「复制终端命令」按钮，一键复制 `claude -r <sessionId>` 到剪贴板
- 修复 Box-Drawing 表格 Unicode 字符检测范围（U+2500–U+257F）
- CC 回复管道从 tmux TUI 改为 stream-json 子进程模式
- 会话持久化：session_id 写入 bindings.json，服务重启不丢失

### 影响范围
- admin/index.html, admin/js/app.js
- src/process/communicator.js, src/feishu/converter.js
- data/bindings.json

### 功能列表
- 管理面板：Tab 导航 / Modal 绑定 / 终端命令复制 / 日志查看 / 帮助指引
- 飞书消息 → CC 进程桥接（stream-json 管道）
- 进程绑定状态监控（WS 连接、在线/离线状态）
- 飞书原生表格渲染（pipe table / box-drawing table）
