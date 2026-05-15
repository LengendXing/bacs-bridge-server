# Codex CLI 多实例隔离部署完整调研（2026）

# 官方资料

- OpenAI Codex CLI 官方帮助文档  
  https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-tarted

- OpenAI Codex GitHub 仓库  
  https://github.com/openai/codex

- NPM 包  
  https://www.npmjs.com/package/@openai/codex

---

# 1. CODEX_HOME 是否存在？

结论：

存在，而且是官方支持的。

Codex CLI 使用：

```bash
CODEX_HOME
```

决定配置根目录。

默认：

```bash
~/.codex
```

可以覆盖：

```bash
export CODEX_HOME=/opt/codex/profile-a
```

---

## 隔离内容

```text
$CODEX_HOME/
├── config.toml
├── auth.json
├── history.jsonl
├── logs/
├── sessions/
└── skills/
```

即：

- config.toml
- auth.json
- logs
- history
- sessions
- skills
- MCP 配置

都会隔离。

---

# 2. 是否支持 --config-dir / --home

目前稳定官方方案：

```bash
CODEX_HOME=...
```

没有正式稳定支持：

```bash
--config-dir
--home
```

---

## 支持的配置覆盖方式

```bash
-c key=value
--config key=value
```

例如：

```bash
codex -c model=\"gpt-5\"
```

但这不是配置目录切换。

---

# 3. 环境变量优先级

结论：

环境变量优先级高于 config.toml。

大致优先级：

```text
CLI flags
> environment variables
> -c key=value
> profile
> config.toml
> defaults
```

---

## 可用环境变量

```bash
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_MODEL
```

---

## 可以完全不用 config.toml

例如：

```bash
export OPENAI_API_KEY=xxx
export OPENAI_BASE_URL=https://gateway.xxx.com/v1
export OPENAI_MODEL=gpt-4.1

codex
```

即可运行。

---

# 4. model_provider 最小配置

实际上：

OpenAI-compatible 网关最简单方式：

```bash
OPENAI_BASE_URL=
OPENAI_API_KEY=
```

即可。

---

## config.toml 最小示例

```toml
model = "gpt-4.1"
model_provider = "myproxy"

[model_providers.myproxy]
name = "myproxy"
base_url = "https://gateway.example.com/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
```

关键字段：

```toml
base_url
env_key
```

---

# 5. auth.json 是否必要

结论：

如果使用：

```bash
OPENAI_API_KEY
```

则：

- 不需要 auth.json
- 没有 auth.json 不会报错

---

## 两种认证方式

### A. ChatGPT Login

生成：

```text
~/.codex/auth.json
```

OAuth token。

---

### B. API KEY

直接：

```bash
OPENAI_API_KEY=
```

即可。

---

## 推荐

多实例 + 第三方网关：

全部使用 API KEY。

不要共享 auth.json。

---

# 6. --full-auto 行为

官方定义：

| 模式 | 行为 |
|---|---|
| suggest | 只建议，不执行 |
| auto-edit | 自动改文件，但执行命令前确认 |
| full-auto | 自动改文件 + 自动执行命令 |

---

## full-auto 实际行为

```text
Read, write, and execute commands autonomously
```

即：

- 自动读文件
- 自动写文件
- 自动执行 shell
- 自动推进任务

---

## 不是无限 root

仍然受：

- sandbox
- cwd
- 文件权限
- 网络限制

影响。

---

## 更细粒度控制

已有：

```text
approval_policy
sandbox_policy
```

以及：

```bash
/permissions
/status
/debug-config
```

---

# 7. 多实例并发安全性

结论：

使用：

```bash
CODEX_HOME
```

隔离后基本安全。

---

## 隔离内容

```text
$CODEX_HOME
```

下：

- logs
- history
- sessions
- auth
- config

都会隔离。

---

## 已知风险

### 1. auth.json 共享

OAuth refresh token 会互踢。

因此：

不要共享 auth.json。

---

### 2. 项目级配置

Codex 支持：

```text
./.codex/config.toml
```

多个实例跑同一 repo：

可能共享项目配置。

---

## 推荐

每个实例：

- 独立 CODEX_HOME
- 独立工作目录
- 独立 auth
- 独立 tmux

---

# 8. 非交互启动（REPL）

默认：

```bash
codex
```

就是 REPL/TUI 模式。

不会退出。

会持续等待输入。

---

## tmux 示例

启动：

```bash
tmux new -s codex-a
codex
```

发送：

```bash
tmux send-keys -t codex-a "帮我修复bug" Enter
```

---

## 不要使用

```bash
codex "prompt"
```

因为：

这是一次性执行模式。

执行完成后退出。

---

# 9. 正确 npm 包名

结论：

官方正确 npm 包名是：

```bash
@openai/codex
```

官方安装命令：

```bash
npm install -g @openai/codex
```

官方文档明确写的是这个。

---

## 不要使用

```bash
npm install -g codex
```

原因：

NPM 上：

```text
codex
```

并不是 OpenAI 官方包。

可能装到别人的包。

---

## 安装后执行命令

虽然包名是：

```bash
@openai/codex
```

但安装后命令仍然是：

```bash
codex
```

即：

```bash
npm install -g @openai/codex

codex
```

---

## 其他安装方式

Homebrew：

```bash
brew install codex
```

---

# 10. 版本与升级

## 查看版本

方式 1：

```bash
codex --version
```

或：

```bash
codex -V
```

---

## 查看 npm 已安装版本

```bash
npm list -g @openai/codex
```

---

# 官方升级方式

官方帮助文档明确支持：

```bash
codex --upgrade
```

会自动升级到最新版本。

---

## 也可以使用 npm 升级

```bash
npm update -g @openai/codex
```

或者：

```bash
npm install -g @openai/codex@latest
```

---

# 推荐升级方式

推荐：

```bash
codex --upgrade
```

因为：

这是官方内置升级路径。

---

# 当前版本节奏

Codex CLI 更新非常快。

例如：

- 0.114.0
- 0.122.0
- 0.124.0
- 0.128.0
- 0.30.0

都在最近持续发布。

---

# 推荐部署结构

```text
tmux:codex-a
  CODEX_HOME=/srv/codex/a
  OPENAI_BASE_URL=...
  OPENAI_API_KEY=...
  cwd=/srv/work/a

tmux:codex-b
  CODEX_HOME=/srv/codex/b
  OPENAI_BASE_URL=...
  OPENAI_API_KEY=...
  cwd=/srv/work/b
```

---

# 推荐启动脚本

```bash
#!/usr/bin/env bash

export CODEX_HOME=/srv/codex/a

export OPENAI_BASE_URL=https://gateway.example.com/v1
export OPENAI_API_KEY=sk-xxxxx
export OPENAI_MODEL=gpt-4.1

mkdir -p "$CODEX_HOME"

cd /srv/work/a

exec codex
```

---

# tmux 后台启动

```bash
tmux new -d -s codex-a "/srv/bin/start-codex-a.sh"
```

---

# 发消息

```bash
tmux send-keys -t codex-a "修复当前项目中的 lint error" Enter
```

---

# 强烈建议

不要共享：

```text
CODEX_HOME
workdir
auth.json
```

这样最稳定。

---

# 附录：接入 feishu-claudecode-bridge 的待实测项（TODO）

本指南覆盖了 Codex CLI 的隔离/认证/tmux 启动方式，足以作为多实例部署蓝本。
但要把 Codex 接入现有 bridge（替换或并存于 Claude Code），下面这些点必须先在真机上实测，不能凭文档臆测：

## TODO-1：Codex TUI 提示符 / 输入分隔符

现状（Claude Code）：
- `extractReplyContent` 用 `❯` 作为本轮用户消息之后的截断锚点。
- 见 `c5185b3 fix(v0.5.8)`：截断匹配从 `│ >` 改为 `❯`。

Codex 待实测：
- 启动 `codex` REPL 后，pane 中实际显示的输入提示符是什么字符？（可能是 `>`、`▌`、`█`、或带颜色的复合字符）
- 用户消息行、assistant 输出行、思考/工具调用行各自的前缀分别是什么？
- 是否存在类似 Claude 的"本轮起点"明确锚点？还是需要按空行/分隔线切分？

操作步骤：
```bash
CODEX_HOME=/tmp/codex-probe tmux new -d -s codex-probe "codex"
sleep 3
tmux send-keys -t codex-probe "你好，请回复一句话" Enter
sleep 5
tmux capture-pane -t codex-probe -p -S -200 > /tmp/codex-pane.txt
```
拿 `/tmp/codex-pane.txt` 反推 `extractReplyContent` 的 Codex 版实现。

## TODO-2：流式输出节奏

- Claude Code 的 pane 输出节奏（逐字/逐块）决定了 bridge 的轮询窗口和"输出稳定"判定。
- Codex 是否同样逐 token 刷新 TUI？还是整段刷新？
- 影响：`isOutputStable` / 防抖时间常数是否需要单独调。

## TODO-3：思考态 / 工具调用的可见性

- Claude Code 在 TUI 中会显示 `· Thinking…` / 工具调用块，bridge 需要识别"还在思考"vs"已结束"。
- Codex TUI 对应的状态行是什么？是否也有可识别的"忙碌→空闲"过渡？

## TODO-4：单卡片渲染上限

- 当前对 Claude 输出限制每张飞书卡片最多 4 个原生 table（见 v0.5.6）。
- Codex 输出的 markdown 风格是否一致？是否需要单独的降级阈值？

## TODO-5：CLI adapter 抽象边界

接入 Codex 时建议新增 provider 抽象（对应 task #18），最小接口：
- `start(profileDir, workdir) → tmuxSession`
- `send(session, text)`
- `capture(session) → rawPaneText`
- `extractLatestReply(rawPaneText, turnAnchor) → string`
- `isBusy(rawPaneText) → boolean`

只有 `extractLatestReply` 和 `isBusy` 是 CLI 强相关的，需要 Claude / Codex 各写一份；其余可以共享。

## TODO-6：不要踩的坑

- `codex "prompt"` 是 one-shot，执行完就退出 —— bridge **必须**用 REPL 模式（裸 `codex`），否则 pane 会立即 EOF。
- npm 包名只用 `@openai/codex`，不要装 `codex`（非官方）。
- 每个实例独立 `CODEX_HOME` + 独立 workdir + 独立 tmux session，不要共享 `auth.json`。
