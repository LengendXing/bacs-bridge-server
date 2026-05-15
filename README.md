# 机器人 × AI-CLI 桥接系统（bacs-bridge-server）

> 把聊天机器人变成 Claude Code / Codex 等 AI CLI 的远程交互入口。不再需要 SSH 进服务器开终端 —— 在聊天里 @ 机器人，就能直接驱动一个或多个 AI 编程进程。

[🌐 多语言版本](#-多语言版本--language-versions) · [🤖 配套安卓端 bacs-android](#-配套安卓端-bacs-android)

---

## 📖 目录

- [项目简介](#-项目简介)
- [核心特性](#-核心特性)
- [系统架构](#-系统架构)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [部署指南](#-部署指南)
- [使用文档](#-使用文档)
- [配套安卓端 bacs-android](#-配套安卓端-bacs-android)
- [环境变量](#-环境变量)
- [常见问题](#-常见问题)
- [版本与迭代](#-版本与迭代)
- [License](#-license)

---

## 🌟 项目简介

**bacs-bridge-server** 是一个将聊天机器人与 AI CLI 工具（Claude Code / Codex）双向桥接的系统。它通过一个常驻的 Bridge Server 把机器人消息事件路由到指定的 CLI 进程，再把 CLI 的回复发送回群聊或私聊。

适用场景：
- 团队中通过聊天群协作驱动 AI 编程任务
- 在没有 PC 的场景（手机、平板）下，远程操控服务器上的 Claude Code
- 把同一台服务器上的多个 AI 进程绑定到不同的聊天机器人，做项目隔离
- 通过浏览器或安卓端实时观察 AI 处理进度、日志与对话 Timeline

---

## ✨ 核心特性

| 模块 | 能力 |
|------|------|
| **多机器绑定** | 支持同一服务器上同时管理多个 CLI 进程（cc-a / cc-b / codex-x ...），每个进程独立绑定一个聊天机器人 |
| **远程机器管理** | 内置 SSH Executor，可统一管理本机 + 多台远程机器的 tmux session |
| **双 CLI 支持** | Claude Code（cc）和 Codex 两种 CLI 适配器，可同时混用 |
| **服务商灵活配置** | 自带 Anthropic / OpenAI 等服务商配置，支持自定义 base_url 与 API Key |
| **多模型 + Effort** | cc 支持 low~max，codex 支持 minimal~xhigh，按模型 maxEffort 自动截断 |
| **Web Terminal** | 浏览器内 xterm 直连 tmux pane，所见即所得，关窗不杀业务进程 |
| **实时 Timeline** | 首页 SSE 实时推送所有 AI ↔ 用户消息，TransitionGroup 动画 |
| **TOTP 双因子认证** | 内置 2FA，支持信任设备指纹（FingerprintJS）+ Cookie Token 双通道 |
| **审计日志** | 所有敏感操作（绑定、登录、Terminal 接入）均写 audit_logs |
| **macOS 风主题** | Tailwind + shadcn/ui 黑白灰风格，支持 Light/Dark 切换 |
| **PM2 一键部署** | 自带 `deploy.sh` + `ecosystem.config.cjs`，源码与运行时分离 |

---

## 🏗 系统架构

```
┌────────────┐   @ 机器人 + 消息    ┌────────────────┐
│  用户       │ ───────────────────▶│  飞书开放平台   │
│ (飞书/手机) │ ◀───────────────── │ (Open Feishu)   │
└────────────┘                     └────────┬───────┘
                                            │ Webhook / WS
                                            ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel 抽象      │   │   ← 飞书 WS Client
                              │  │ Session 路由      │   │
                              │  │ CLI Adapter       │   │
                              │  │ Executor (本机+SSH)│   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  本机或远程机器          │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

技术栈：
- **前端**：Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **后端**：Node.js 20+ + Express + ws + node-pty + ssh2
- **数据库**：SQLite + Drizzle ORM
- **进程管理**：tmux + PM2

---

## 📁 项目结构

```
bacs-bridge-server/
├── src/
│   ├── client/               # Vue 3 前端
│   │   ├── views/            # 9 个核心页面（Home/Bindings/Machines/Providers/Terminal/Logs/Settings/Login/Layout）
│   │   ├── components/       # 通用组件（Pagination/TerminalPanel ...）
│   │   ├── composables/      # useAuth / useDeviceId / useTerminalSession
│   │   └── router/           # vue-router
│   ├── server/               # Express 后端
│   │   ├── routes/           # auth/bindings/machines/providers/sessions/logs/timeline/settings/models/health
│   │   ├── channel/          # 飞书 WS Channel + 抽象接口
│   │   ├── cli/              # CC / Codex adapter
│   │   ├── executor/         # 本机 + SSH 执行器
│   │   ├── terminal/         # pty-bridge + ws-server（Web Terminal）
│   │   ├── auth/             # JWT + TOTP + 信任设备指纹
│   │   ├── db/               # Drizzle schema + 迁移文件
│   │   └── session/          # 会话状态机（idle / working / awaiting_choice）
│   └── shared/               # 前后端共享类型
├── scripts/                  # migrate-db / seed-admin / migrate-bindings
├── data/                     # SQLite 数据库（运行时生成）
├── docs/                     # 文档（含 readme/、plans/）
├── deploy.sh                 # PM2 一键部署脚本
├── cll.sh                    # 远程一键安装脚本
├── ecosystem.config.cjs      # PM2 配置
├── .env.example
└── package.json
```

---

## 🚀 快速开始

### 1. 环境要求

- Node.js ≥ 20
- npm ≥ 10（或 pnpm）
- tmux ≥ 3.0（CLI 进程托管）
- 至少一个 AI CLI 可执行：`claude`（Claude Code）或 `codex`
- 一个飞书企业自建应用（需开通 `im:message`、`im:message.group_at_msg`）

### 2. 本地启动

```bash
# 克隆
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env，填入 JWT_SECRET 等

# 初始化数据库 + 种子账号
npm run db:migrate
npm run seed

# 开发模式（前后端并行）
npm run dev
```

访问 `http://localhost:3456/`，使用默认账号 `nimasile` / 你在 `.env` 里设置的 `ADMIN_PASSWORD` 登录。

---

## 📦 部署指南

### 方式一：一键远程部署（推荐）

在目标服务器上执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh)
```

指定安装目录：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh) /opt/bacs-bridge
```

部署后目录结构：

```
bacs-bridge-server/
├── sourceCode/   ← 源码（git pull 更新）
└── deploy/       ← 运行时（PM2 从此启动）
```

### 方式二：手动 PM2 部署

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server
bash deploy.sh
```

`deploy.sh` 会：
1. `npm ci` 安装依赖
2. `npm run build` 构建前后端
3. 拷贝 `dist/`、`scripts/`、`package.json` 等到 `../deploy/`
4. 在 `../deploy/` 中 `pm2 start ecosystem.config.cjs`

### 方式三：日常更新流程

```bash
cd sourceCode/
git pull
bash deploy.sh   # 自动构建 + 重启 PM2
```

### 首次部署后必做

1. 编辑 `deploy/.env`，填写 `JWT_SECRET`、`ADMIN_PASSWORD`
2. 浏览器访问 `http://<服务器IP>:3456/`
3. 默认账号登录后，进入「设置」开启 2FA（强烈建议）
4. 「机器」菜单：默认本机已就绪；如需远程机器，新建并填 SSH 凭证
5. 「服务商」菜单：新建 Anthropic / OpenAI / 自定义 服务商，填 base_url + API Key
6. 服务器上启动 tmux session：`tmux new-session -d -s cc-work`
7. 「绑定」菜单：新增飞书机器人绑定，填 App ID / App Secret / Verification Token / Encrypt Key + 选择 CLI + 服务商 + 模型 + Effort
8. 聊天群里 @ 机器人发送任意消息 → 后台会自动启动 cc/codex 进程并桥接

---

## 📘 使用文档

### 飞书应用配置

1. 进入 [飞书开放平台](https://open.feishu.cn/)，创建**企业自建应用**
2. 开通权限：
   - `im:message`（发送消息）
   - `im:message:receive_v1`（接收消息）
   - `im:message.group_at_msg`（接收群内 @）
3. 事件订阅：开启 **长连接模式**（推荐）或配置 Request URL `https://<host>/webhook/feishu`
4. 拷贝 App ID / App Secret / Verification Token / Encrypt Key → 粘贴到 Bridge 的「绑定」配置

### 创建绑定

进入「绑定」菜单 → 新增：
- **绑定名称**：自定义（如 `cc-projectA`）
- **机器（host）**：选择本机或预先建好的远程机器
- **CLI 类型**：cc / codex
- **服务商**：选择已创建的服务商
- **模型**：自动从服务商探查；探查失败可手动选择默认模型或输入自定义模型 ID
- **Effort**：按模型 maxEffort 显示可选档位
- **飞书应用四件套**：App ID / Secret / Verification Token / Encrypt Key

保存后，Bridge 会自动尝试连接飞书长连接 WS，状态变为 `online` 后即可在飞书群里 @ 机器人使用。

### Web Terminal

「绑定」列表中点 `Terminal` 按钮，浏览器内直接打开 xterm，等价于本地执行：

```bash
tmux attach -t cc-projectA
```

**关键安全约束：关闭浏览器 Terminal Tab 不会 kill tmux session，业务进程持续运行**。

支持 Ctrl-b d 主动 detach，ResizeObserver 同步窗口大小，5 分钟无操作自动断开 WebSocket（业务进程不受影响）。

### 实时 Timeline

首页底部 Timeline 区块显示最近 20 条飞书消息（SSE 实时推送），新条目从顶部 scale+fade 滑入，点击展开/收起完整内容，平台 tag 彩色区分（飞书绿 / Telegram 蓝预留）。

### 系统日志

「日志」菜单：SSE 实时滚动后端运行日志（支持回放最近 N 行 + 心跳保活）。

### 主题切换

右上角太阳/月亮图标切换 Light / Dark 模式，主题色为黑白灰系。

---

## 📱 配套安卓端 bacs-android

> 项目地址：[https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** 是本系统的官方安卓端 App，让你在手机上：

- 🔔 实时接收 Bridge Timeline 推送，AI 回复像 IM 消息一样到达
- ⌨️ 直接在手机上输入指令发回 Bridge，无需打开飞书
- 📊 查看所有绑定的 CLI 进程状态（online / offline / awaiting_choice）
- 📜 浏览历史会话与系统日志
- 🔐 TOTP 双因子登录 + 设备指纹信任
- 🌙 跟随系统的 Light / Dark 主题

**连接方式**：App 启动后填入 Bridge Server 地址（如 `http://192.168.1.100:3456`），扫描设置页里的快捷登录二维码即可完成一键登录（60s 短期 JWT → 客户端 exchange 长 token 方案，避免二维码泄露）。

**安卓端项目**完整文档请见 [bacs-android README](https://github.com/LengendXing/bacs-android#readme)。

---

## 🔧 环境变量

`.env`（见 `.env.example`）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `BRIDGE_PORT` | `3456` | HTTP / WS 监听端口 |
| `BRIDGE_HOST` | `0.0.0.0` | 监听地址 |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | 进度卡片刷新间隔（秒） |
| `BRIDGE_TIMEOUT` | `600` | 单次 AI 等待超时（秒） |
| `BRIDGE_POLL_INTERVAL` | `2` | tmux capture-pane 轮询间隔（秒） |
| `BRIDGE_MAX_CONCURRENT` | `4` | 最大并发会话数 |
| `DB_PATH` | `./data/bridge.db` | SQLite 文件路径 |
| `JWT_SECRET` | — | **必填**，JWT 签名密钥 |
| `ADMIN_PASSWORD` | `admin` | 首次 seed 时管理员密码 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `LOG_DIR` | `./logs` | 日志目录 |

---

## ❓ 常见问题

**Q: 飞书消息发送后无响应？**
A: 优先检查：① 绑定状态是否 `online`；② 服务器 tmux session 是否存活；③ 服务商 API Key 是否有效；④ 「日志」菜单实时查看后端日志。

**Q: 远程机器登录失败（Not logged in）？**
A: v1.0.8 已修复——确保使用 `bash -ilc` 包裹的 tmux 启动命令以加载远程 rc 文件。如仍有问题，检查远程 `~/.bashrc` 中是否能找到 `claude` / `codex` 可执行。

**Q: SSH 长任务期间失联？**
A: v1.0.10 已修复——心跳从 5min → 30s，并移除 60s 主动空闲断连。

**Q: tmux session 不存在如何处理？**
A: Bridge 会在「绑定上线」时自动创建对应 session（如 `cc-xxx`、`codex-xxx`），无需手动操作。

**Q: 关闭 Web Terminal 浏览器窗口会 kill 业务进程吗？**
A: **不会**。Web Terminal 仅 detach tmux 客户端，业务 session 持续运行。代码层有强制防御：`session-name` 走白名单正则，关闭路径绝不调用 `tmux kill-session`。

---

## 🗂 版本与迭代

完整迭代日志见 [maintain.md](docs/maintain.md)。

近期版本：
- **v1.1.7**（当前）—— 多语言 README 文档（11 种语言）+ 配套 bacs-android 介绍
- **v1.1.6** —— 系统标题 + 删右上角退出 + bacs_chat_time_line 实时 Timeline
- **v1.1.5** —— 信任设备指纹重构（双通道：deviceId + cookie token）
- **v1.1.4** —— BindingsView 双 Tab + 列表分页 + Terminal 单例 + 5min 保活
- **v1.1.3** —— 浏览器内 Web Terminal（xterm + tmux）
- **v1.0.0** —— 全面重构（Vite + Vue 3 + Express + Drizzle + macOS 主题）

---

## 🌐 多语言版本 / Language Versions

| 语言 | Language | 文件 |
|------|----------|------|
| 🇨🇳 简体中文 | Chinese (Simplified) | [README.zh.md](docs/readme/README.zh.md) |
| 🇺🇸 English | English | [README.en.md](docs/readme/README.en.md) |
| 🇯🇵 日本語 | Japanese | [README.ja.md](docs/readme/README.ja.md) |
| 🇷🇺 Русский | Russian | [README.ru.md](docs/readme/README.ru.md) |
| 🇩🇪 Deutsch | German | [README.de.md](docs/readme/README.de.md) |
| 🇫🇷 Français | French | [README.fr.md](docs/readme/README.fr.md) |
| 🇪🇸 Español | Spanish | [README.es.md](docs/readme/README.es.md) |
| 🇸🇦 العربية | Arabic (RTL) | [README.ar.md](docs/readme/README.ar.md) |
| 🇨🇳 བོད་སྐད་ | Tibetan | [README.bo.md](docs/readme/README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | Uyghur (RTL) | [README.ug.md](docs/readme/README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](docs/readme/README.ko.md) |

---

## 📄 License

MIT © [LengendXing](https://github.com/LengendXing)
