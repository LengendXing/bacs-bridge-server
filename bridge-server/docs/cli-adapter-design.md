# 双 CLI（CC + Codex）目录结构与抽象层设计

> 状态：草案 / 对应 plan 任务 #14。落地拆到 #17 / #18 / #19 / #16 / #20。

## 目标

让 bridge-server 同时支持 Claude Code 与 Codex 两种 CLI 后端。每个飞书会话绑定一种 CLI，bridge 主流程不感知具体 CLI 的输入输出细节。

## 一、抽象边界

bridge 现在直接 `tmux send-keys` + `capture-pane` + 跑 `extractReplyContent` 截回复。这套逻辑是 CC 专属的（认 `❯` 提示符、`│ >` 输入框、CC 的 ANSI 渲染）。Codex 的 pane 形态不同，硬塞会炸。

抽象一个 **CliAdapter** 接口，把"CLI 相关的全部知识"关在 adapter 里，manager / sender / routes 只跟接口打交道：

```
CliAdapter {
  kind                          // 'cc' | 'codex'
  startSession(sessionId)       // tmux new-session + 起 CLI 进程
  stopSession(sessionId)
  sendPrompt(sessionId, text)   // 写入 prompt（含各 CLI 的换行/提交差异）
  captureReply(sessionId)       // 抓 pane → 截取本轮回复纯文本
  isReady(sessionId)            // 进程/会话是否还活着
}
```

`manager.js` 持有 `Map<sessionId, CliAdapter>`，按 `binding.cli_kind` 路由。

## 二、目录结构（增量改动）

```
bridge-server/src/
  cli/                         # 新增
    index.js                   # createAdapter(kind, deps) 工厂
    base.js                    # 公共：tmux 封装、ANSI strip、超时
    cc-adapter.js              # 现 process/communicator.js 的逻辑搬过来
    codex-adapter.js           # 新写，参考 codex-cli-complete-guide
  process/
    manager.js                 # 改：按 cli_kind 选 adapter；不再直接 tmux
    communicator.js            # 删（逻辑迁入 cli/cc-adapter.js）
  binding/
    store.js                   # 改：binding 增 cli_kind 字段（#17 落库）
  routes/
    admin.js                   # 改：绑定接口收 cli_kind（#19）
    feishu.js                  # 不变（manager 内部分流）
  feishu/                      # 不变
  config.js / config.yaml      # 增：codex.command / codex.tmux_prefix 等
```

新增目录只有 `cli/`，老的 `process/communicator.js` 平移过去，对外接口收敛到 `CliAdapter`。

## 三、配置扩展（config.yaml）

```yaml
cli:
  default_kind: cc            # 新会话默认绑定
  cc:
    command: claude
    tmux_session_prefix: cc-
    prompt_marker: "❯"
    capture_lines: 200
  codex:
    command: codex            # 待 probe 确认
    tmux_session_prefix: codex-
    prompt_marker: "?"        # 占位，TODO-1 后填
    capture_lines: 200
```

每个 adapter 只读自己那段。

## 四、Binding 数据模型

现 store.js 大致 `{ feishu_chat_id → tmux_session }`。改成：

```
binding {
  feishu_chat_id        PK
  cli_kind              'cc' | 'codex'
  tmux_session          string
  created_at, updated_at
}
```

迁移：旧记录默认 `cli_kind='cc'`，#17 SQLite 重写时一次性补字段。

## 五、调用链（绑定后一条飞书消息）

```
飞书 webhook
  → routes/feishu.js
  → manager.handleMessage(chat_id, text)
      ├─ store.getBinding(chat_id)  → { cli_kind, tmux_session }
      ├─ adapter = adapters.get(cli_kind)
      ├─ adapter.sendPrompt(tmux_session, text)
      ├─ adapter.captureReply(tmux_session)   // 含轮询 + 截取
      └─ feishu/sender.js 回卡片
```

manager 不再认 `❯`，认 adapter。

## 六、与后续任务的衔接

- **#18 抽象 CLI adapter** = 落地本设计的 `cli/` 目录 + cc-adapter 平移 + codex-adapter v1（先 probe prompt_marker 再写 capture）
- **#17 SQLite binding** = store.js 重写时直接按新 schema 建表
- **#19 路由 + 前端 cli_kind** = admin.js 绑定接口加字段，前端选项二选一
- **#16 tmux 脚本** = `tmux-up.sh cc|codex`，prefix 走 config
- **#20 联调** = 两个会话各绑一种 kind，互不干扰

## 七、不做什么（避免过度设计）

- 不做插件机制 / 动态加载，adapter 两个写死注册
- 不做 CLI 之间的会话迁移
- 不做同一个 chat_id 并发多 CLI（一对一绑定）
- ANSI 解析不引外部库，沿用现有正则 + adapter 内部小工具
