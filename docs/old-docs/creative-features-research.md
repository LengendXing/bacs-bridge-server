# 飞书 × Claude Code Bridge — 创意功能调研报告

> 调研时间：2026-05-17
> 当前版本：v1.1.24
> 目标：梳理飞书卡片能力 + Claude Code 可观测特性，产出后续可做的创意功能方案

---

## 一、飞书交互卡片能力全景

### 1.1 交互组件

| 组件 | 标签 | 用途 |
|---|---|---|
| 按钮 | `button` | 9 种视觉类型（default/primary/danger/filled/laser 等），支持二次确认弹窗 |
| 单选下拉 | `select_static` | 从预设列表选一项 |
| 多选下拉 | `multi_select_static` | 从预设列表选多项 |
| 人员选择 | `select_person` / `person_selector` | 选组织内人员 |
| 日期选择 | `date_picker` | yyyy-MM-dd |
| 时间选择 | `picker_time` | HH:mm |
| 日期时间 | `datetime_picker` | 日期+时间 |
| 复选框 | `checkbox` | 开关切换 |
| 输入框 | `input` | 单行/多行/密码，最长 1000 字符 |
| 折叠按钮组 | `overflow` | "更多操作"菜单 |

### 1.2 展示组件

| 组件 | 标签 | 用途 |
|---|---|---|
| Markdown | `markdown` | 富文本（飞书 Markdown 子集） |
| 图片 | `img` | 通过 img_key 显示 |
| 图表 | `chart` | 嵌入式图表 |
| 进度条 | `progress` | 百分比进度 |
| 表格 | `table` | 原生数据表格（columns + rows） |
| 分割线 | `hr` | — |
| 注脚 | `note` | 底部灰色小字 |
| 文件预览 | `file_preview` | 文件预览 |
| 媒体 | `media` | 媒体播放器 |

### 1.3 容器/布局组件

| 容器 | 标签 | 用途 |
|---|---|---|
| 分栏 | `column_set` | 多列水平布局，flex_mode: stretch/flow/bisect/trisect |
| 可折叠面板 | `collapsible_panel` | 展开/折叠内容区 |
| 表单 | `form` | 输入组件 + 提交按钮，一次性异步提交 |
| 标签页 | `tab` | 标签式内容切换 |
| 交互容器 | `interactive_container` | 给任意内容块加点击行为 |

### 1.4 回调机制

- **事件名**：`card.action.trigger`（v2） / `card.action.trigger_v1`（旧版）
- **回调数据**：包含 `action.value`（自定义载荷）、`action.form_value`（表单全部字段）、`action.tag`（组件类型）
- **响应选项**：
  - 3 秒内返回 `{ toast, card }` 可立即更新卡片
  - 或返回 `{}` 不更新，30 分钟内用 token 延迟更新（最多 2 次）
- **toast 类型**：info / success / error / warning
- **权限**：不需要特殊 scope，但需在开发者后台订阅回调事件 + 选择「长连接」订阅方式
- **错误码 200340**：未配置回调地址 ← 当前用户遇到的按钮报错

### 1.5 速率/约束

- 每个聊天每分钟最多 5 条消息（机器人）
- Markdown 元素约 4000 字符
- 按钮文本 100 字符
- 容器嵌套最多 5 层
- 回调交互有效期：14 天（2.0 卡片）
- 延迟更新 token：30 分钟，最多 2 次

---

## 二、Claude Code 可观测特性

### 2.1 当前已捕获的 TUI 信号

| 信号 | 位置 | 当前用途 |
|---|---|---|
| `❯` + `? for shortcuts` | detectState | idle 状态判断 |
| `esc to interrupt` | detectState | working 状态判断 |
| `╭──╮` 框 + `❯ 1. Yes` | extractChoicePanel | 决策面板识别（box 格式） |
| `⏵⏵ accept edits on` | extractChoicePanel | 决策面板识别（inline 格式） |
| `●` bullet 行 | extractReply | 回复内容提取 |
| `● Bash(...)` / `● Read(...)` | extractReply | 工具调用行（当前过滤丢弃） |
| `✻ Brewed for 5s` | extractReply | 耗时行（当前过滤丢弃） |
| `❯ 用户输入` | extractReply | 本轮输入锚点定位 |

### 2.2 可提取但尚未利用的 TUI 信息

| 信息 | 来源 | 价值 |
|---|---|---|
| **版本号** | `╭─── Claude Code v2.1.126 ───╮` | 展示 cc 版本，判断功能兼容性 |
| **工作目录** | `cwd: ~/project/xxx` | 告知用户 cc 当前在哪个项目 |
| **模型名称** | `glm-5.1 with max effort` | 展示当前使用的模型 |
| **账户信息** | `joshster@gmail.com's Organization` | 展示 cc 登录身份 |
| **工具调用名称** | `● Bash(...)`, `● Read(...)`, `● Edit(...)` | 实时告知"cc 正在读文件/执行命令" |
| **耗时统计** | `✻ Brewed for 5s`, `✻ Cooked for 2m 25s` | 展示 cc 思考/执行耗时 |
| **折叠行数** | `… +35 lines (ctrl+o to expand)` | 判断输出量级 |
| **权限模式** | `⏵⏵ accept edits on` vs `⏵⏵ allow once on` | 判断当前权限策略 |
| **API Usage** | 欢迎横幅中 | 计费/用量信息 |

### 2.3 Claude Code CLI 结构化输出能力

cc 支持 `-p`（print/headless）模式，可产出结构化 JSON：

| 标志 | 输出 | 价值 |
|---|---|---|
| `--output-format json` | `{ result, session_id, total_cost_usd }` | 单次任务拿最终结果 + 费用 |
| `--output-format stream-json` | NDJSON 实时流：`system/init`（模型/工具/MCP）、文本 delta、API 重试事件 | 实时流式推送 |
| `--permission-prompt-tool` | 将权限弹窗委托给 MCP 工具 | 干净的权限交互（无需 tmux 抓屏） |
| `--allowedTools` | 预授权工具列表 | 减少权限弹窗 |
| `--max-turns N` | 限制 agent 循环轮次 | 成本控制 |
| `--max-budget-usd N` | 限制预算 | 成本控制 |
| `--json-schema` | 结构化输出匹配 JSON Schema | 需要精确格式的任务 |
| `--session-id UUID` | 指定会话 ID | 会话管理 |
| `--continue` / `--resume` | 续接历史会话 | 跨会话连续对话 |

---

## 三、创意功能方案

### 🌟 Tier 1 — 高价值 + 低成本（建议优先做）

#### 3.1 工具调用实时状态卡片

**现状**：用户只能看到"处理中"，不知道 cc 在干什么。
**方案**：轮询时提取 `● Bash(...)` / `● Read(...)` 等工具调用行，更新进度卡片内容。

```
┌─────────────────────────────────────────┐
│ ⚙️ cc-b2 正在工作                        │
│                                         │
│ ● 当前操作：Bash(git push origin main)  │
│ ● 已执行 3 个工具调用                    │
│ ⏱ 已耗时 45s                            │
│                                         │
│ [中断]                                  │
└─────────────────────────────────────────┘
```

**飞书卡片要素**：markdown + progress + button（中断=发 Escape）
**改动量**：cc-adapter 新增 extractToolCalls()，state.ts 轮询更新，sender.ts 新增 buildWorkingCard

#### 3.2 决策卡片回调修复（200340）

**现状**：按钮点击报 200340，只能文本回复。
**方案**：在飞书开发者后台配置：
1. 事件与回调 → 订阅方式 → 长连接接收事件/回调
2. 添加 `card.action.trigger` 事件订阅
3. 确保机器人类型为「应用」（非自定义 Webhook 机器人）

**改动量**：纯配置，无代码改动

#### 3.3 耗时/费用统计卡片

**现状**：`✻ Brewed for 5s` / `✻ Cooked for 2m 25s` 被丢弃。
**方案**：提取耗时行，在回复卡片底部显示统计。

```
┌─────────────────────────────────────────┐
│ 💬 cc-b2 回复                            │
│                                         │
│ [回复内容...]                           │
│                                         │
│ ─────────────────                       │
│ ⏱ 思考 12s · 执行 45s · 总计 57s        │
│ 🔧 工具调用: Bash×2, Edit×1             │
└─────────────────────────────────────────┘
```

**改动量**：cc-adapter extractReply 保留耗时/工具行，sender.ts buildReplyCard 加 note

#### 3.4 可折叠长回复

**现状**：长代码直接全量展示，飞书消息很长。
**方案**：回复超过阈值时，用 `collapsible_panel` 折叠代码块/详细内容。

```
┌─────────────────────────────────────────┐
│ 💬 cc-b2 回复                            │
│                                         │
│ [摘要/结论部分...]                       │
│                                         │
│ ▶ 代码详情（32 行）                      │
│ ▶ 工具输出（15 行）                      │
│                                         │
│ ─────────────────                       │
│ ⏱ 总计 23s                              │
└─────────────────────────────────────────┘
```

**改动量**：sender.ts buildReplyCard 对长内容用 collapsible_panel

---

### 🚀 Tier 2 — 高价值 + 中等成本

#### 3.5 /命令快捷交互

**方案**：用户在飞书发 `/` 开头的消息，触发特殊操作而非直接发给 cc。

| 命令 | 功能 |
|---|---|
| `/status` | 查看所有绑定进程当前状态（idle/working/awaiting） |
| `/interrupt` | 中断当前 cc 执行（发 Escape） |
| `/history` | 查看最近 N 条对话摘要 |
| `/model sonnet` | 切换模型（kill 旧 session → 新建） |
| `/effort high` | 调整 effort |
| `/permissions auto` | 切换权限模式 |
| `/cost` | 查看累计 token/费用统计 |
| `/files` | 列出 cc 工作目录文件树 |

**飞书卡片要素**：form + select_static（模型选择） + button（执行/取消）
**改动量**：ws-client.ts handleMessage 加 `/` 前缀路由，各命令处理器

#### 3.6 多会话状态看板

**方案**：发 `/status` 返回一张实时状态看板卡片，展示所有绑定进程。

```
┌─────────────────────────────────────────┐
│ 📊 进程看板                               │
│                                         │
│ 进程   │ 模型      │ 状态    │ 耗时      │
│ b2     │ opus-4.7  │ ⏳工作中 │ 45s      │
│ a2     │ sonnet-4.6│ 💤空闲  │ —        │
│ c2     │ haiku-4.5 │ 🔔待决策│ 2m 12s   │
│                                         │
│ [刷新]                                  │
└─────────────────────────────────────────┘
```

**飞书卡片要素**：table + button（刷新=回调重新查询）
**改动量**：新增 /status 命令处理器 + buildStatusDashboardCard

#### 3.7 权限模式切换卡片

**方案**：当 cc 弹出权限确认时，除了 Accept/Reject，还提供「切换权限模式」选项。

```
┌─────────────────────────────────────────┐
│ ⚠️ cc-b2 等待决策                         │
│                                         │
│ ● Allow Bash command: rm /tmp/test      │
│                                         │
│ [1. Allow once] [2. Allow session]      │
│ [3. Deny]                               │
│                                         │
│ ▶ 权限设置                              │
│   模式: [default ▾]  ← 下拉选择         │
│   [应用并重启]                          │
└─────────────────────────────────────────┘
```

**飞书卡片要素**：button + collapsible_panel + select_static + form

#### 3.8 回复卡片双向更新

**方案**：利用飞书回调 token（30 分钟有效），cc 回复到达后直接更新决策卡片为结果卡片，而不是发新消息。

**流程**：
1. 决策卡片发送 → 保留 callback token
2. 用户点击按钮 → 3 秒内返回 `{ toast: "已转发" }`
3. cc 回复完成 → 用 token 延迟更新卡片为结果

**改动量**：ws-client.ts handleCardAction 返回 toast + 保存 token，state.ts tryFinish 时调用延迟更新 API

---

### 🔮 Tier 3 — 创新探索

#### 3.9 代码差异预览卡片

**方案**：当 cc 修改文件时，解析 `● Edit(...)` 工具行 + capturePane 中的 diff 片段，在飞书卡片中展示代码变更摘要。

**飞书卡片要素**：markdown（语法高亮 diff） + button（Accept/Reject） + collapsible_panel（完整 diff）

#### 3.10 多人协作审批

**方案**：群聊场景下，cc 的决策面板推送到群，多人可投票。用 `update_multi: true` 共享卡片实时更新投票状态。

```
┌─────────────────────────────────────────┐
│ 🗳 集体决策                              │
│                                         │
│ Allow Bash: deploy.sh?                  │
│                                         │
│ ✅ 同意 2 票  │  ❌ 拒绝 0 票           │
│ 👤 @张三 @李四  │                        │
│                                         │
│ [同意] [拒绝]                            │
└─────────────────────────────────────────┘
```

**飞书卡片要素**：button + update_multi + 延迟更新 token

#### 3.11 Claude Code Headless 模式集成

**方案**：除 tmux 模式外，新增 headless 模式。用 `claude -p --output-format stream-json` 启动，通过 JSON 流实时获取结构化输出。

**优势**：
- 不需要 tmux + 正则解析
- 获得精确的 model/token/cost 数据
- `--permission-prompt-tool` 可委托权限弹窗给 bridge 自己的 MCP 工具
- 流式输出可逐段推送到飞书

**改动量**：新增 headlessExecutor + streamJsonAdapter，可与 tmux 模式共存

#### 3.12 定时任务 / 周期巡检

**方案**：用户在飞书配置定时任务，bridge 定时启动 cc 执行巡检脚本，结果推送回飞书。

```
/monitor add "每天 9:00 检查服务器日志错误" --cron "0 9 * * *"
```

**飞书卡片要素**：form（配置 cron + 脚本） + table（历史执行记录） + button（立即执行/暂停/删除）

#### 3.13 图片/文件传递

**方案**：用户在飞书发图片 → bridge 保存到临时文件 → cc 可通过 Read 工具查看。cc 生成的图表 → 上传到飞书 → 以 img 组件展示。

**飞书卡片要素**：img + file_preview

#### 3.14 多模型对比

**方案**：同一问题发给多个 cc 实例（不同模型），结果并排展示在飞书分栏卡片中。

```
┌────────────┬────────────┐
│ Opus 4.7   │ Sonnet 4.6 │
│ 回复内容... │ 回复内容... │
│ ⏱ 45s      │ ⏱ 12s      │
│ 💰 $0.12   │ 💰 $0.03    │
└────────────┴────────────┘
```

**飞书卡片要素**：column_set (bisect) + markdown + note

---

## 四、优先级矩阵

| 方案 | 价值 | 成本 | 依赖 | 建议版本 |
|---|---|---|---|---|
| 3.2 决策回调修复 | 高 | 极低 | 飞书后台配置 | v1.1.24 立即 |
| 3.1 工具调用状态卡片 | 高 | 低 | extractToolCalls | v1.1.25 |
| 3.3 耗时/费用统计 | 中 | 低 | extractReply 改 | v1.1.25 |
| 3.4 可折叠长回复 | 中 | 低 | sender.ts | v1.1.25 |
| 3.5 /命令交互 | 高 | 中 | 新增路由层 | v1.1.26 |
| 3.6 多会话看板 | 中 | 中 | /status 命令 | v1.1.26 |
| 3.8 卡片双向更新 | 高 | 中 | 回调 token | v1.1.26 |
| 3.7 权限模式切换 | 中 | 中 | select_static | v1.1.27 |
| 3.9 代码 diff 预览 | 高 | 高 | diff 解析 | v1.1.28 |
| 3.11 Headless 模式 | 极高 | 高 | 新架构 | v1.2.0 |
| 3.10 多人协作审批 | 中 | 高 | update_multi | v1.2.x |
| 3.12 定时任务 | 中 | 高 | cron 调度 | v1.2.x |
| 3.13 图片/文件传递 | 中 | 中 | Upload API | v1.2.x |
| 3.14 多模型对比 | 低 | 高 | 多实例管理 | v1.3.x |

---

## 五、关键前提条件

### 飞书后台必须配置（否则 3.2/3.7/3.8/3.10 全部无法工作）

1. **应用类型**：必须是「自建应用」，不能是 Webhook 机器人
2. **事件订阅方式**：选择「长连接接收事件/回调」
3. **添加事件**：`card.action.trigger`
4. **权限范围**：
   - `im:message:send_as_bot`（发消息）
   - `im:resource`（卡片交互，如有）
   - `contact:user.employee_id:readonly`（获取 user_id）

### Claude Code Headless 模式前提

1. cc v2.1.118+ 支持 `--output-format stream-json`
2. `--permission-prompt-tool` 需要 MCP 服务器配合
3. Headless 模式不支持交互式 TUI 操作（如文件编辑 diff 预览）

---

## 六、附录：当前卡片 vs 可演进卡片对比

| 场景 | 当前卡片 | 可演进卡片 |
|---|---|---|
| 处理中 | 纯文字"处理中" + 耗时 | 工具名 + 进度条 + [中断]按钮 |
| 决策面板 | 按钮列表 + 文本回退 | 按钮回调 + 权限模式下拉 + 二次确认 |
| 回复 | 全量 markdown | 摘要 + 折叠详情 + 耗时统计 + 工具计数 |
| 状态查询 | 无 | 表格看板 + [刷新]按钮 + 实时更新 |
| 配置 | 无 | 表单卡片（模型/effort/权限下拉） |
| 代码修改 | 无感知 | diff 预览 + Accept/Reject 按钮 |
