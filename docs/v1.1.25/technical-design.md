# v1.1.25 技术方案

> 版本：v1.1.25
> 日期：2026-05-17
> 基于：v1.1.24 代码库
> 状态：技术设计

---

## 一、总体架构变更

```
┌─────────────────────────────────────────────────────────────────┐
│  飞书消息 → ws-client.ts handleMessage                         │
│    ├─ /命令路由（新增）                                        │
│    │   ├─ /status  → buildStatusCard()                        │
│    │   ├─ /interrupt → sendKeys(Escape)                       │
│    │   ├─ /model <id> → 重启 cc 会话                          │
│    │   └─ /effort <level> → 重启 cc 会话                      │
│    ├─ session.awaiting → sendChoice()（不变）                  │
│    ├─ session.active → sendInput()（不变）                     │
│    └─ 新 session → sendInput() + startPolling()（不变）        │
│                                                                 │
│  轮询 → state.ts startOutputPolling                            │
│    ├─ extractChoicePanel()（不变）                              │
│    ├─ extractToolCalls()（新增）→ 更新 session.toolCalls       │
│    └─ extractTiming()（新增）→ 更新 session.timing             │
│                                                                 │
│  进度卡片 → onProgress                                         │
│    └─ buildProgressCard() → buildWorkingCard()（替换）        │
│                                                                 │
│  回复卡片 → sendReplyCard                                      │
│    ├─ note 加耗时+工具统计（改造）                             │
│    └─ 长回复 collapsible_panel（改造）                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、需求 1：工具调用实时状态卡片

### 2.1 新增函数：extractToolCalls

**文件**：`src/server/cli/cc-adapter.ts`

```ts
/** 从 pane 文本中提取当前可见的工具调用列表（最近 N 个）
 *  匹配 cc TUI 中的工具调用行格式：
 *  - ● Bash(git push origin main)
 *  - ● Read(auth.py)
 *  - ● Edit(config.json)
 *  - ● Write(output.txt)
 *  - ● Glob(*.ts)
 *  - ● Grep(pattern)
 *  - ● List(...)
 *  - ● TodoRead / TodoWrite
 */
export function extractToolCalls(raw: string, maxItems = 3): string[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const toolRe = /●\s+(\w+)\((.*?)\)/;
  const results: string[] = [];
  // 从下往上取最近的工具调用
  for (let i = lines.length - 1; i >= 0 && results.length < maxItems; i--) {
    const m = lines[i].match(toolRe);
    if (m) {
      const name = m[1];
      const arg = m[2].length > 20 ? m[2].slice(0, 20) + '...' : m[2];
      results.unshift(`${name}(${arg})`);
    }
  }
  return results;
}
```

### 2.2 SessionState 扩展

**文件**：`src/server/session/state.ts`

```ts
export interface SessionState {
  // ... 现有字段 ...
  /** 最近一次轮询检测到的工具调用列表 */
  lastToolCalls: string[];
}
```

### 2.3 轮询中提取工具调用

**文件**：`src/server/session/state.ts` startOutputPolling

在 `session.accumulated = res.output;` 之后新增：

```ts
// 提取工具调用信息
session.lastToolCalls = adapter.extractToolCalls(res.output);
```

需要给 CliAdapter 接口加 `extractToolCalls` 方法声明。

### 2.4 新增卡片：buildWorkingCard

**文件**：`src/server/channel/feishu/sender.ts`

替换现有的 `buildProgressCard`，新增参数 `toolCalls: string[]`：

```ts
export function buildWorkingCard(
  processName: string,
  elapsed: number,
  userQuestion: string,
  toolCalls: string[] = [],
): InteractiveCard {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
  const question = userQuestion
    ? userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion
    : '未知问题';

  // 工具调用展示
  let toolMd = '';
  if (toolCalls.length > 0) {
    toolMd = '\n**当前操作：**\n' + toolCalls.map(t => `  ○ ${t}`).join('\n');
  }

  return {
    header: {
      title: { tag: 'plain_text', content: '⏳ Claude Code 处理中...' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'markdown',
        content: `**进程：** ${processName}\n**问题：** ${question}\n**已耗时：** ${timeStr}${toolMd}`,
      },
      { tag: 'action', actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '中断' },
          type: 'danger',
          value: { action: 'cc_interrupt', processName },
        },
      ]},
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [
          { tag: 'plain_text', content: '完整回复完成后将自动返回' },
        ],
      },
    ],
  };
}
```

### 2.5 onProgress 回调传递 toolCalls

**文件**：`src/server/channel/feishu/ws-client.ts`

修改 onProgress 回调，从 session.lastToolCalls 取工具调用信息：

```ts
startProgressTimer(session, (s: SessionState) => {
  if (s.awaiting) return;
  const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
  const card = sender.buildWorkingCard(
    s.processName, elapsed, s.ctx.msgText, s.lastToolCalls,
  );
  sender.sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
    .catch((e: Error) => logger.log('error', '发送进度卡片失败', e.message));
});
```

### 2.6 中断按钮回调处理

**文件**：`src/server/channel/feishu/ws-client.ts` handleCardAction

已有 handleCardAction 处理 `cc_choice`，扩展支持 `cc_interrupt`：

```ts
if (actionValue.action === 'cc_interrupt') {
  const executor = await getExecutor(binding.machineId ?? null);
  await executor.sendKeys(sessionName, ['Escape']);
  sender.sendCard(...sender.buildInterruptAckCard(processName));
  return;
}
```

---

## 三、需求 2：耗时与工具统计

### 3.1 新增函数：extractTiming

**文件**：`src/server/cli/cc-adapter.ts`

```ts
/** 从 pane 文本中提取 cc 的耗时统计行
 *  cc TUI 中会显示：
 *  - ✻ Brewed for 5s
 *  - ✻ Cooked for 2m 25s
 *  - ✻ Sautéed for 34s
 *  - ✻ Crunched for 7m 14s
 *  - ✻ Baked for 12s
 *  返回最近一条耗时（秒），0 表示未找到
 */
export function extractTiming(raw: string): number {
  if (!raw) return 0;
  const lines = raw.split(/\r?\n/);
  // 倒序找最近的耗时行
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/✻\s+\w+\s+for\s+(\d+)(?:m(\d+))?s/i);
    if (m) {
      const mins = m[2] ? parseInt(m[1], 10) : 0;
      const secs = m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
      return mins * 60 + secs;
    }
  }
  return 0;
}
```

### 3.2 扩展 extractReply 返回值

**文件**：`src/server/cli/cc-adapter.ts`

当前 `extractReply` 返回 `string`，改为返回 `{ text: string; toolCount: Record<string, number> }`：

```ts
interface ReplyResult {
  text: string;
  /** 工具调用统计，如 { Bash: 2, Edit: 1, Read: 3 } */
  toolCount: Record<string, number>;
}

function extractReply(raw: string, userMessage: string): ReplyResult {
  // ... 现有逻辑提取 text ...
  // 额外统计工具调用
  const toolRe = /●\s+(\w+)\(/g;
  const toolCount: Record<string, number> = {};
  let m;
  while ((m = toolRe.exec(raw)) !== null) {
    const name = m[1];
    toolCount[name] = (toolCount[name] || 0) + 1;
  }
  return { text, toolCount };
}
```

所有调用方需从 `.text` 取回复文本，从 `.toolCount` 取统计。

### 3.3 回复卡片 note 加统计

**文件**：`src/server/channel/feishu/sender.ts` sendReplyCard

修改 `sendReplyCard` 接口，新增 `toolCount` 和 `timing` 参数：

```ts
export interface ReplyCardOptions {
  processName: string;
  userQuestion: string;
  reply: string;
  elapsed: number;
  isTimeout: boolean;
  toolCount?: Record<string, number>;  // 新增
  timing?: number;                      // 新增：cc 自报耗时（秒）
}
```

底部 note 改为：

```ts
const toolStr = opts.toolCount
  ? Object.entries(opts.toolCount).map(([k, v]) => `${k}×${v}`).join(' · ')
  : '';
const timingStr = opts.timing ? ` · ⏱ cc ${opts.timing}s` : '';
const noteContent = `⏱ 总计 ${elapsedStr}${timingStr}${toolStr ? ' · 🔧 ' + toolStr : ''} · ${new Date().toLocaleString('zh-CN')}`;
```

### 3.4 sendReply 传递统计

**文件**：`src/server/channel/feishu/ws-client.ts` sendReply

```ts
function sendReply(session: SessionState, replyResult: ReplyResult, isTimeout: boolean): void {
  // ...
  const timing = adapter.extractTiming(session.accumulated);
  sender.sendReplyCard(feishuAppId, feishuAppSecret, targetType, targetId, {
    processName, userQuestion: msgText,
    reply: replyResult.text,
    elapsed, isTimeout,
    toolCount: replyResult.toolCount,
    timing,
  });
}
```

---

## 四、需求 3：可折叠长回复

### 4.1 修改 replyToCardElements

**文件**：`src/server/channel/feishu/sender.ts`

当前 `replyToCardElements` 将回复转为 markdown/hr/table 元素。改造为：

```ts
const COLLAPSE_THRESHOLD = 1500;

function replyToCardElements(reply: string): CardElement[] {
  // ... 现有表格/代码块解析逻辑 ...

  if (totalCharCount <= COLLAPSE_THRESHOLD) {
    return elements; // 短回复不变
  }

  // 长回复：前部分保持可见，后半折叠
  const visibleElements = splitAtThreshold(elements, COLLAPSE_THRESHOLD);
  const collapsedElements = remainingElements(elements, visibleElements.length);

  if (collapsedElements.length > 0) {
    const lineCount = collapsedElements.reduce(
      (acc, el) => acc + (el.tag === 'markdown' ? (el as any).content.split('\n').length : 1), 0
    );
    visibleElements.push({
      tag: 'collapsible_panel',
      expanded: false,
      header: { title: { tag: 'plain_text', content: `详细内容（约 ${lineCount} 行）` } },
      elements: collapsedElements,
    } as any);
  }

  return visibleElements;
}
```

### 4.2 collapsible_panel 类型定义

**文件**：`src/server/channel/feishu/sender.ts`

扩展 CardElement union：

```ts
interface CollapsiblePanelElement {
  tag: 'collapsible_panel';
  expanded: boolean;
  header: { title: { tag: 'plain_text'; content: string } };
  elements: CardElement[];
}
```

---

## 五、需求 4：/命令快捷交互

### 5.1 命令路由

**文件**：`src/server/channel/feishu/ws-client.ts` handleIncomingMessage

在消息内容检查之后、sessionExists 检查之前，插入 `/命令` 路由：

```ts
const msgText = (message.content || '').trim();

// /命令路由：以 / 开头的消息由 bridge 本地处理，不转发给 cc
if (msgText.startsWith('/')) {
  handleSlashCommand(msgText, binding, targetId, targetType);
  return;
}

// 原有流程...
```

### 5.2 handleSlashCommand 实现

**文件**：`src/server/channel/feishu/ws-client.ts`

```ts
function handleSlashCommand(
  input: string,
  binding: BindingRecord,
  targetId: string,
  targetType: string,
): void {
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);
  const { processName, feishuAppId, feishuAppSecret, cliKind, machineId } = binding;
  const adapter = getAdapter(cliKind);

  switch (cmd) {
    case 'status':
      cmdStatus(binding, targetId, targetType);
      break;
    case 'interrupt':
      cmdInterrupt(binding, targetId, targetType);
      break;
    case 'model':
      cmdModel(binding, args[0], targetId, targetType);
      break;
    case 'effort':
      cmdEffort(binding, args[0], targetId, targetType);
      break;
    default:
      // 未知命令 → 帮助卡片
      sender.sendCard(feishuAppId!, feishuAppSecret!, targetType, targetId,
        sender.buildHelpCard(processName)
      ).catch((e: Error) => logger.log('error', '发送帮助卡片失败', e.message));
  }
}
```

### 5.3 /status 命令

```ts
async function cmdStatus(binding: BindingRecord, targetId: string, targetType: string) {
  // 查询当前所有绑定对应的 tmux session 状态
  const adapter = getAdapter(binding.cliKind);
  const executor = await getExecutor(binding.machineId ?? null);
  const sessions = await adapter.listSessions(executor);

  const statusRows = [];
  for (const name of sessions) {
    const session = getSession(name);
    const state = session
      ? (session.awaiting ? '🔔待决策' : session.replied ? '✅已完成' : '⏳工作中')
      : '💤空闲';
    const elapsed = session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0;
    statusRows.push({ process: name, state, elapsed });
  }

  sender.sendCard(
    binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId,
    sender.buildStatusCard(binding.processName, statusRows),
  ).catch((e: Error) => logger.log('error', '发送状态卡片失败', e.message));
}
```

### 5.4 /interrupt 命令

```ts
async function cmdInterrupt(binding: BindingRecord, targetId: string, targetType: string) {
  const adapter = getAdapter(binding.cliKind);
  const sessionName = `${adapter.sessionPrefix}-${binding.processName}`;
  const executor = await getExecutor(binding.machineId ?? null);

  await executor.sendKeys(sessionName, ['Escape']);

  const session = getSession(binding.processName);
  if (session) session.replied = true; // 标记结束，停止轮询

  sender.sendCard(
    binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId,
    sender.buildInterruptAckCard(binding.processName),
  ).catch((e: Error) => logger.log('error', '发送中断确认卡片失败', e.message));
}
```

### 5.5 /model 和 /effort 命令

```ts
async function cmdModel(binding: BindingRecord, modelId: string, targetId: string, targetType: string) {
  if (!modelId) {
    // 无参数 → 发当前模型信息
    sender.sendCard(...sender.buildModelInfoCard(binding.processName, binding));
    return;
  }
  // 有参数 → 重启 cc 会话使用新模型
  // 1. kill 旧 session
  // 2. 更新 binding 配置中的 modelId
  // 3. 用新 buildStartCmd 启动
  // 4. 发确认卡片
}

async function cmdEffort(binding: BindingRecord, level: string, targetId: string, targetType: string) {
  const validLevels = ['low', 'medium', 'high', 'xhigh', 'max'];
  if (!level || !validLevels.includes(level)) {
    sender.sendText(..., `effort 只支持: ${validLevels.join('/')}`);
    return;
  }
  // 类似 /model：kill 旧 session → 更新配置 → 重启
}
```

### 5.6 新增卡片构建函数

**文件**：`src/server/channel/feishu/sender.ts`

| 函数 | 用途 |
|---|---|
| `buildStatusCard(processName, rows)` | 进程状态看板（table） |
| `buildInterruptAckCard(processName)` | 中断确认卡片（green） |
| `buildHelpCard(processName)` | /命令帮助列表（blue） |
| `buildModelInfoCard(processName, binding)` | 当前模型信息 |
| `buildInterruptButton()` | 中断按钮（用于 handleCardAction 中 cc_interrupt） |

---

## 六、CliAdapter 接口扩展

**文件**：`src/server/cli/types.ts`

```ts
export interface CliAdapter {
  // ... 现有方法 ...

  /** 从 pane 文本中提取当前可见的工具调用列表
   *  @param raw - capturePane 返回的原始输出
   *  @param maxItems - 最多返回几个（默认 3）
   */
  extractToolCalls(raw: string, maxItems?: number): string[];

  /** 从 pane 文本中提取 cc 自报的耗时（秒）
   *  @param raw - capturePane 返回的原始输出
   *  @returns 耗时秒数，0 表示未找到
   */
  extractTiming(raw: string): number;
}
```

Codex adapter 需要实现同名方法（返回空数组/0 即可，codex 暂不支持）。

---

## 七、改动量评估

| 文件 | 改动 | 风险 |
|---|---|---|
| `cc-adapter.ts` | +extractToolCalls (~20 行) +extractTiming (~15 行) +extractReply 返回值改造 | 中（extractReply 改返回值需改所有调用方） |
| `cc-adapter.test.ts` | +extractToolCalls 测试 (~40 行) +extractTiming 测试 (~30 行) | 低 |
| `codex-adapter.ts` | +extractToolCalls/extractTiming 空实现 (~10 行) | 低 |
| `types.ts` | +CliAdapter 两个方法声明 | 低 |
| `state.ts` | SessionState 加 lastToolCalls + 轮询提取 | 低 |
| `sender.ts` | +buildWorkingCard +buildStatusCard +buildHelpCard +buildInterruptAckCard +collapsible_panel +replyToCardElements 改造 +note 统计 | 中（卡片构建改动多） |
| `ws-client.ts` | +handleSlashCommand +cmdStatus +cmdInterrupt +cmdModel +cmdEffort +handleCardAction 扩展 cc_interrupt +onProgress 改用 buildWorkingCard +sendReply 传 toolCount/timing | 中（新增路由层） |

**总计**：约 +300 行新代码，~50 行改造

---

## 八、测试计划

| 模块 | 测试内容 |
|---|---|
| extractToolCalls | 标准 `● Bash(git push)` / `● Read(auth.py)` / 无工具调用 / 超长参数截断 / 多轮历史只取最近 |
| extractTiming | `✻ Brewed for 5s` / `✻ Cooked for 2m 25s` / 无耗时行 / `✻ Sautéed for 34s` |
| extractReply | 返回值含 toolCount 字段 / 空回复 / 多工具调用统计 |
| buildWorkingCard | 有工具调用 vs 无工具调用 / 超长参数截断 |
| collapsible_panel | 短回复不折叠 / 长回复折叠 / 边界值 1500 字符 |
| handleSlashCommand | /status /interrupt /model sonnet-4 /effort high /未知命令 /大小写混写 |
| handleCardAction | cc_interrupt 回调 |

---

## 九、开发顺序

1. **extractToolCalls + extractTiming**（cc-adapter.ts + types.ts + 测试）
2. **SessionState 扩展 + 轮询提取**（state.ts）
3. **buildWorkingCard**（sender.ts）+ onProgress 改造（ws-client.ts）
4. **extractReply 返回值改造** + sendReplyCard note 统计
5. **collapsible_panel 长回复**
6. **/命令路由 + 各命令处理器**
7. **handleCardAction 扩展 cc_interrupt**
8. **端到端验证**
9. **收尾：lint/build/test/版本/maintain/plan/commit/push**
