# Feishu × AI CLI Bridge (bacs-bridge-server)

> Turn the Feishu (Lark) bot into a remote interaction front-end for AI CLIs such as Claude Code / Codex. No more SSH-into-a-server-and-open-a-terminal — just @-mention the bot in Feishu to drive one or many AI coding processes.

[🌐 Other Languages](#-language-versions) · [🤖 Companion Android App: bacs-android](#-companion-android-app-bacs-android)

---

## 📖 Table of Contents

- [Introduction](#-introduction)
- [Core Features](#-core-features)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [User Guide](#-user-guide)
- [Companion Android App: bacs-android](#-companion-android-app-bacs-android)
- [Environment Variables](#-environment-variables)
- [FAQ](#-faq)
- [Versioning](#-versioning)
- [License](#-license)

---

## 🌟 Introduction

**bacs-bridge-server** is a bidirectional bridge between Feishu (Lark) bots and AI CLI tools (Claude Code / Codex). A long-running Bridge Server routes Feishu message events to specific CLI processes and pushes their replies back to the corresponding Feishu group or private chat.

Use cases:
- A team that wants to drive AI coding tasks collaboratively from a Feishu group
- Remote-operating Claude Code on a server from a phone / tablet
- Isolating multiple AI processes on one server, each bound to a different Feishu chat
- Monitoring live AI progress, logs and message Timeline from a browser or the Android app

---

## ✨ Core Features

| Module | Capability |
|--------|-----------|
| **Multi-process binding** | Run many CLI processes (cc-a / cc-b / codex-x ...) on one server, each bound to its own Feishu bot |
| **Remote-host management** | Built-in SSH Executor manages tmux sessions on local + multiple remote machines |
| **Dual CLI support** | Claude Code (`cc`) and Codex adapters can be mixed freely |
| **Provider config** | Anthropic / OpenAI / custom `base_url` + API key |
| **Models + Effort** | `cc` supports `low~max`, `codex` supports `minimal~xhigh`, capped per-model |
| **Web Terminal** | Browser xterm attached straight to the tmux pane; closing the tab does NOT kill the business process |
| **Live Timeline** | SSE-pushed message Timeline on the home page with animated insertions |
| **TOTP 2FA** | Built-in two-factor auth with dual-channel trusted-device (FingerprintJS + cookie token) |
| **Audit logs** | Bindings, logins, terminal sessions are all persisted in `audit_logs` |
| **macOS-flavored UI** | Tailwind + shadcn/ui in black/white/grey with Light/Dark toggle |
| **One-click PM2** | Bundled `deploy.sh` + `ecosystem.config.cjs`, source / runtime separated |

---

## 🏗 Architecture

```
┌────────────┐   @ bot + msg         ┌────────────────┐
│  User      │ ─────────────────────▶│  Feishu Cloud   │
│ (web/phone)│ ◀───────────────────  │ (Open Platform) │
└────────────┘                       └────────┬───────┘
                                              │ Webhook / WS
                                              ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel layer    │   │   ← Feishu WS Client
                              │  │ Session router   │   │
                              │  │ CLI Adapter      │   │
                              │  │ Executor (SSH+L) │   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  Local or remote host   │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

Stack:
- **Frontend**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **Backend**: Node.js 20+ + Express + ws + node-pty + ssh2
- **Database**: SQLite + Drizzle ORM
- **Process supervision**: tmux + PM2

---

## 📁 Project Structure

```
bacs-bridge-server/
├── src/
│   ├── client/          # Vue 3 frontend
│   │   ├── views/       # Home / Bindings / Machines / Providers / Terminal / Logs / Settings / Login / Layout
│   │   ├── components/  # Pagination / TerminalPanel ...
│   │   ├── composables/ # useAuth / useDeviceId / useTerminalSession
│   │   └── router/
│   ├── server/          # Express backend
│   │   ├── routes/      # auth / bindings / machines / providers / sessions / logs / timeline / settings / models / health
│   │   ├── channel/     # Feishu WS channel + abstraction
│   │   ├── cli/         # CC / Codex adapter
│   │   ├── executor/    # Local + SSH executor
│   │   ├── terminal/    # pty-bridge + ws-server (Web Terminal)
│   │   ├── auth/        # JWT + TOTP + trusted-device fingerprint
│   │   ├── db/          # Drizzle schema + migrations
│   │   └── session/     # State machine (idle / working / awaiting_choice)
│   └── shared/          # Shared TypeScript types
├── scripts/             # migrate-db / seed-admin / migrate-bindings
├── data/                # SQLite (runtime)
├── docs/                # readme/ + plans/
├── deploy.sh            # PM2 one-click deployment
├── cll.sh               # Remote one-line installer
├── ecosystem.config.cjs
├── .env.example
└── package.json
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js ≥ 20
- npm ≥ 10 (or pnpm)
- tmux ≥ 3.0
- At least one AI CLI binary: `claude` (Claude Code) or `codex`
- A Feishu **custom enterprise app** with `im:message`, `im:message.group_at_msg` permissions

### 2. Local development

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server

npm install
cp .env.example .env       # then fill in JWT_SECRET etc.

npm run db:migrate
npm run seed

npm run dev                # client + server concurrently
```

Open `http://localhost:3456/`, log in as `nimasile` with the `ADMIN_PASSWORD` set in `.env`.

---

## 📦 Deployment

### Option A — One-line remote install (recommended)

On the target server:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh)
```

With a custom directory:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh) /opt/bacs-bridge
```

Resulting layout:

```
bacs-bridge-server/
├── sourceCode/   ← source (git pull to update)
└── deploy/       ← runtime (PM2 starts here)
```

### Option B — Manual PM2

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server
bash deploy.sh
```

`deploy.sh` will:
1. `npm ci`
2. `npm run build` (client + server)
3. Copy `dist/`, `scripts/`, `package.json`, ... to `../deploy/`
4. `pm2 start ecosystem.config.cjs` inside `../deploy/`

### Option C — Routine updates

```bash
cd sourceCode/
git pull
bash deploy.sh   # rebuild + reload PM2
```

### Post-install checklist

1. Edit `deploy/.env` and set `JWT_SECRET`, `ADMIN_PASSWORD`
2. Open `http://<server-ip>:3456/`
3. Log in and enable 2FA from **Settings** (strongly recommended)
4. **Machines**: the local host is auto-registered; add remote hosts here if needed (SSH credentials)
5. **Providers**: add Anthropic / OpenAI / custom (base_url + API key)
6. On the server start a tmux session: `tmux new-session -d -s cc-work`
7. **Bindings**: new binding → fill Feishu App ID / Secret / Verification Token / Encrypt Key + pick CLI + provider + model + effort
8. @ the bot in your Feishu group — the corresponding `cc` / `codex` process is started and bridged automatically

---

## 📘 User Guide

### Feishu app configuration

1. Go to [open.feishu.cn](https://open.feishu.cn/) and create a **custom enterprise app**
2. Enable scopes:
   - `im:message`
   - `im:message:receive_v1`
   - `im:message.group_at_msg`
3. Event subscription: prefer **long-connection mode** (or configure Request URL `https://<host>/webhook/feishu`)
4. Copy App ID / App Secret / Verification Token / Encrypt Key into the Bridge **Bindings** form

### Creating a binding

**Bindings → New**:
- **Name**: e.g. `cc-projectA`
- **Machine**: local or a pre-registered remote
- **CLI**: cc / codex
- **Provider**: pick one of your configured providers
- **Model**: auto-discovered; if discovery fails, choose from the bundled defaults or paste a custom model ID
- **Effort**: shown based on the model's `maxEffort`
- **Feishu credentials**: App ID / Secret / Verification Token / Encrypt Key

Once saved, the Bridge opens the Feishu WS long connection; when the status flips to `online`, @ the bot from your Feishu chat to start using it.

### Web Terminal

Click `Terminal` on a binding row to open xterm in the browser — equivalent to running:

```bash
tmux attach -t cc-projectA
```

**Important safety contract: closing the terminal tab does NOT kill the tmux session — the business process keeps running.** Press Ctrl-b d to detach manually; ResizeObserver syncs window size; after 5 idle minutes the WS is closed (business process unaffected).

### Live Timeline

The home page bottom region shows the last 20 Feishu messages (SSE), with new entries sliding in from the top and an expand/collapse toggle. Platform tags are colour-coded (Feishu green / Telegram blue reserved).

### System Logs

**Logs** menu: SSE-streamed live backend logs with replay-on-connect + heartbeat.

### Theme

Top-right sun/moon icon toggles Light / Dark; the palette is black/white/grey.

---

## 📱 Companion Android App: bacs-android

> Project: [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** is the official Android client. With it you can:

- 🔔 Receive Timeline pushes in real time — AI replies arrive like IM messages
- ⌨️ Send commands back from your phone without opening Feishu
- 📊 Monitor every binding (online / offline / awaiting_choice)
- 📜 Browse history sessions and system logs
- 🔐 TOTP 2FA with device-fingerprint trust
- 🌙 Follows the system Light / Dark theme

**Connection**: enter the Bridge URL (e.g. `http://192.168.1.100:3456`) and scan the QR code from the Bridge **Settings** page for one-tap login (short-lived JWT → client-side exchange long token, so the QR code itself is harmless if leaked).

Full Android documentation: see [bacs-android README](https://github.com/LengendXing/bacs-android#readme).

---

## 🔧 Environment Variables

See `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `3456` | HTTP / WS port |
| `BRIDGE_HOST` | `0.0.0.0` | Bind address |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | Progress card refresh interval (s) |
| `BRIDGE_TIMEOUT` | `600` | Max wait per AI turn (s) |
| `BRIDGE_POLL_INTERVAL` | `2` | tmux `capture-pane` poll interval (s) |
| `BRIDGE_MAX_CONCURRENT` | `4` | Max concurrent sessions |
| `DB_PATH` | `./data/bridge.db` | SQLite path |
| `JWT_SECRET` | — | **Required** — JWT signing secret |
| `ADMIN_PASSWORD` | `admin` | Admin password used by the first `seed` |
| `LOG_LEVEL` | `info` | Log level |
| `LOG_DIR` | `./logs` | Log directory |

---

## ❓ FAQ

**Q: I sent a message in Feishu but the bot is silent.**
A: Check ① binding status is `online`; ② tmux session is alive; ③ provider API key is valid; ④ open the **Logs** menu to tail live backend logs.

**Q: Remote machine says "Not logged in".**
A: Fixed in v1.0.8 — the tmux launcher is wrapped in `bash -ilc` so the remote rc files load. If you still hit it, check that `claude` / `codex` is on `$PATH` in the remote `~/.bashrc`.

**Q: SSH drops during long-running tasks.**
A: Fixed in v1.0.10 — heartbeat reduced from 5min to 30s, and the 60s idle disconnect removed.

**Q: What if the tmux session does not exist?**
A: The Bridge auto-creates the session (e.g. `cc-xxx`, `codex-xxx`) when the binding comes online. No manual steps required.

**Q: Will closing the Web Terminal tab kill the business process?**
A: **No.** The terminal only detaches the tmux client; the session keeps running. There is a hard code-level guard: session names go through a whitelist regex, and the close path never invokes `tmux kill-session`.

---

## 🗂 Versioning

Full changelog: [maintain.md](../../maintain.md).

Recent versions:
- **v1.1.7** (current) — Multi-language README (10 languages) + bacs-android documentation
- **v1.1.6** — System title + remove top-right logout + bacs_chat_time_line live Timeline
- **v1.1.5** — Trusted-device fingerprint rewrite (dual-channel: deviceId + cookie token)
- **v1.1.4** — BindingsView two-tab layout + list pagination + Terminal singleton + 5-min keep-alive
- **v1.1.3** — Browser Web Terminal (xterm + tmux)
- **v1.0.0** — Full rewrite (Vite + Vue 3 + Express + Drizzle + macOS theme)

---

## 🌐 Language Versions

| Language | 文件 / File |
|----------|------|
| 🇨🇳 简体中文 / Chinese | [README.zh.md](README.zh.md) |
| 🇺🇸 English | [README.en.md](README.en.md) |
| 🇯🇵 日本語 | [README.ja.md](README.ja.md) |
| 🇷🇺 Русский | [README.ru.md](README.ru.md) |
| 🇩🇪 Deutsch | [README.de.md](README.de.md) |
| 🇫🇷 Français | [README.fr.md](README.fr.md) |
| 🇪🇸 Español | [README.es.md](README.es.md) |
| 🇸🇦 العربية | [README.ar.md](README.ar.md) |
| 🇨🇳 བོད་སྐད་ | [README.bo.md](README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | [README.ug.md](README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](README.ko.md) |

---

## 📄 License

MIT © [LengendXing](https://github.com/LengendXing)
