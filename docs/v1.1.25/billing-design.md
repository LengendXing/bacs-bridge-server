# v1.1.25 计费服务设计方案

> 版本：v1.1.25
> 日期：2026-05-17
> 基于：v1.1.24 代码库
> 状态：设计完成

---

## 一、用户体感

### 当前痛点
用户每次与 cc 对话后，不知道这轮对话花了多少钱。cc 的定价是按 token 计费，不同模型（Opus/Sonnet/Haiku）单价差异巨大，用户无法感知成本。

### 上线后体验
1. **每轮对话结束**，回复卡片底部自动附加 `💰 $0.023 · ⏱ 45s · 🔧 Bash×2 Edit×1` 统计信息
2. **管理面板**：「日志」升级为一级菜单，内含三个二级菜单：
   - **实时日志**（原系统日志）
   - **审计日志**（不变）
   - **扣费日志**（新增）：分页表格，每行显示一轮对话的进程名、模型、耗时、费用、时间
3. **详情弹窗**：点击扣费日志每行的「详情」按钮，弹出详细计费面板：
   - 基础信息：进程名、模型、服务商、耗时
   - 工具调用明细：Bash×2 / Edit×1 / Read×3 各多少次
   - 费用拆分：思考耗时 / 执行耗时 / 预估 token / 美元金额

---

## 二、费用数据来源分析

### 2.1 当前 tmux 模式能抓取的信号

| 信号 | 来源 | 精度 |
|---|---|---|
| 耗时（秒） | `✻ Brewed for 5s` | 精确 |
| 工具调用名+次数 | `● Bash(...)` / `● Read(...)` | 精确 |
| 模型名称 | 绑定配置（binding.modelOverride / models.modelId） | 精确 |
| 服务商 | 绑定配置（binding.providerId） | 精确 |
| 用户消息 | session.ctx.msgText | 精确 |
| USD 费用 | **无法从 tmux 获取** | ❌ |

### 2.2 获取精确 USD 费用的途径

| 方案 | 原理 | 可行性 |
|---|---|---|
| **cc headless `--output-format json`** | `{ result, session_id, total_cost_usd }` | ⭐ 最佳：精确 cost，但需 headless 模式（架构大改） |
| **cc `--output-format stream-json`** | NDJSON 流中包含 `system/init`、token 统计 | ⭐ 精确但需 headless |
| **cc 会话文件** | `~/.claude/projects/*/sessions/` 存 JSON | 🔶 可行：session 结束后读文件，但路径不确定 |
| **Anthropic Usage API** | 官方用量查询接口 | ❌ 无公开的实时 usage API |
| **模型+耗时估算** | 按模型单价 × 估算 token 数 | 🔶 粗略估算，误差大 |

### 2.3 决策：双层计费策略

**现阶段（tmux 模式）**：记录可观测数据（耗时、工具调用、模型），用**模型单价估算**生成预估费用。

**未来（headless 模式）**：cc `--output-format stream-json` 直接获取 `total_cost_usd`，写入精确值。

数据库表设计同时支持两种来源：`costUsd`（实际精确值）+ `costUsdEstimated`（估算值）。headless 模式上线后，精确值优先。

### 2.4 费用估算算法

基于 Anthropic 公开定价（2026-05）：

| 模型 | 输入 $/1M tokens | 输出 $/1M tokens |
|---|---|---|
| claude-opus-4 | $15 | $75 |
| claude-sonnet-4 | $3 | $15 |
| claude-haiku-4 | $0.80 | $4 |

估算公式：
```
avgInputTokens = elapsedSeconds * modelInputRate
avgOutputTokens = elapsedSeconds * modelOutputRate * 0.3  // 输出通常比输入慢
costUsdEstimated = (avgInputTokens * inputPrice + avgOutputTokens * outputPrice) / 1_000_000
```

其中 `modelInputRate` / `modelOutputRate` 为经验值（tokens/秒），默认：
- Opus: ~15 input/s, ~8 output/s
- Sonnet: ~40 input/s, ~20 output/s
- Haiku: ~80 input/s, ~40 output/s

> ⚠️ 这是粗略估算，仅作参考。估算值在 UI 上标注「约」，精确值标注「精」。

---

## 三、数据库表设计

### 3.1 bacs_billing_records — 计费主表

```sql
CREATE TABLE bacs_billing_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  process_name  TEXT NOT NULL,                     -- 绑定进程名（如 b2）
  cli_kind      TEXT NOT NULL DEFAULT 'cc',        -- CLI 类型
  model_id      TEXT,                              -- 使用的模型 ID（如 claude-sonnet-4-20250514）
  provider_id   INTEGER,                           -- 关联服务商 ID
  machine_id    INTEGER,                           -- 关联机器 ID（null=本机）
  user_message  TEXT,                              -- 用户发送的消息（截断 200 字符）
  reply_snippet TEXT,                              -- 回复摘要（前 200 字符）
  elapsed_sec   INTEGER NOT NULL DEFAULT 0,        -- 总耗时（秒）
  tool_calls_json TEXT,                            -- 工具调用统计 JSON：{"Bash":2,"Edit":1}
  cost_usd          REAL,                          -- 精确费用（headless 模式时写入）
  cost_usd_estimated REAL,                         -- 估算费用（tmux 模式）
  cost_source       TEXT NOT NULL DEFAULT 'estimated', -- 'estimated' | 'precise'
  session_id        TEXT,                          -- cc session_id（headless 模式可获取）
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_billing_process ON bacs_billing_records (process_name);
CREATE INDEX idx_billing_model  ON bacs_billing_records (model_id);
CREATE INDEX idx_billing_created ON bacs_billing_records (created_at);
```

### 3.2 bacs_billing_details — 计费明细表

```sql
CREATE TABLE bacs_billing_details (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  billing_id    INTEGER NOT NULL REFERENCES bacs_billing_records(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL,                     -- 'thinking' | 'execution' | 'tool_call'
  tool_name     TEXT,                              -- 工具名（stage=tool_call 时有值）
  tool_arg      TEXT,                              -- 工具参数摘要（截断 100 字符）
  duration_sec  INTEGER DEFAULT 0,                -- 该阶段耗时（秒）
  token_in      INTEGER,                           -- 输入 token 数（headless 时有值）
  token_out     INTEGER,                           -- 输出 token 数（headless 时有值）
  cost_usd      REAL,                              -- 该阶段费用
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_billing_detail_billing ON bacs_billing_details (billing_id);
```

### 3.3 bacs_conversation_billing — 对话关联计费表

```sql
CREATE TABLE bacs_conversation_billing (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  billing_id        INTEGER NOT NULL REFERENCES bacs_billing_records(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL DEFAULT 'feishu',  -- 消息平台
  target_id         TEXT,                             -- 飞书 chat_id / group_id
  timeline_id       INTEGER REFERENCES bacs_chat_time_line(id), -- 关联消息时间线
  user_message_full TEXT,                            -- 用户完整消息
  reply_sent        INTEGER DEFAULT 0,              -- 是否已发送回复（0/1）
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_conv_billing_billing ON bacs_conversation_billing (billing_id);
CREATE INDEX idx_conv_billing_target  ON bacs_conversation_billing (platform, target_id);
```

### 3.4 表关系图

```
bacs_chat_time_line ────┐
                        │ timeline_id
bacs_conversation_billing ──── bacs_billing_records ──── bacs_billing_details
  (对话 ↔ 计费关联)           (计费主表)                  (计费明细)
  platform / target_id        process / model / cost       stage / tool / token
```

---

## 四、Drizzle ORM Schema 定义

### 文件：`src/server/db/schema.ts` 新增

```ts
// ════════════════════════════════════════════════════════════════════
// 10. bacs_billing_records — 计费主表（v1.1.25 引入）
// ════════════════════════════════════════════════════════════════════

export const billingRecords = sqliteTable('bacs_billing_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  processName: text('process_name').notNull(),
  cliKind: text('cli_kind').notNull().default('cc'),
  modelId: text('model_id'),
  providerId: integer('provider_id'),
  machineId: integer('machine_id'),
  userMessage: text('user_message'),
  replySnippet: text('reply_snippet'),
  elapsedSec: integer('elapsed_sec').notNull().default(0),
  toolCallsJson: text('tool_calls_json'),
  costUsd: real('cost_usd'),
  costUsdEstimated: real('cost_usd_estimated'),
  costSource: text('cost_source').notNull().default('estimated'),
  sessionId: text('session_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 11. bacs_billing_details — 计费明细表（v1.1.25 引入）
// ════════════════════════════════════════════════════════════════════

export const billingDetails = sqliteTable('bacs_billing_details', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  billingId: integer('billing_id').notNull().references(() => billingRecords.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(),
  toolName: text('tool_name'),
  toolArg: text('tool_arg'),
  durationSec: integer('duration_sec').default(0),
  tokenIn: integer('token_in'),
  tokenOut: integer('token_out'),
  costUsd: real('cost_usd'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 12. bacs_conversation_billing — 对话关联计费表（v1.1.25 引入）
// ════════════════════════════════════════════════════════════════════

export const conversationBilling = sqliteTable('bacs_conversation_billing', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  billingId: integer('billing_id').notNull().references(() => billingRecords.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull().default('feishu'),
  targetId: text('target_id'),
  timelineId: integer('timeline_id').references(() => chatTimeLine.id),
  userMessageFull: text('user_message_full'),
  replySent: integer('reply_sent', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});
```

---

## 五、计费服务核心模块

### 5.1 文件：`src/server/billing/service.ts`

```ts
/**
 * @module billing/service
 * 计费服务：对话结束 → 生成计费记录 + 明细
 */

import { getDb } from '../db/index.js';
import { billingRecords, billingDetails, conversationBilling, chatTimeLine } from '../db/schema.js';
import { desc, eq, sql } from 'drizzle-orm';

/** 模型单价配置（$/1M tokens） */
const MODEL_PRICING: Record<string, { input: number; output: number; inputRate: number; outputRate: number }> = {
  'claude-opus-4':       { input: 15, output: 75, inputRate: 15, outputRate: 8 },
  'claude-sonnet-4':     { input: 3,  output: 15, inputRate: 40, outputRate: 20 },
  'claude-haiku-4':      { input: 0.8, output: 4, inputRate: 80, outputRate: 40 },
  // 兜底
  'default':             { input: 3,  output: 15, inputRate: 40, outputRate: 20 },
};

export interface BillingInput {
  processName: string;
  cliKind: string;
  modelId: string | null;
  providerId: number | null;
  machineId: number | null;
  userMessage: string;
  replySnippet: string;
  elapsedSec: number;
  toolCalls: Record<string, number>;
  timing?: number;           // cc 自报耗时
  costUsd?: number;          // 精确费用（headless 模式）
  sessionId?: string;
  // 对话关联
  platform?: string;
  targetId?: string;
  timelineId?: number | null;
}

/** 生成一条计费记录 */
export function createBillingRecord(input: BillingInput): number {
  const db = getDb();

  // 匹配模型定价
  const modelKey = Object.keys(MODEL_PRICING).find(k =>
    input.modelId?.toLowerCase().includes(k)
  ) || 'default';
  const pricing = MODEL_PRICING[modelKey];

  // 估算费用
  const estInputTokens = input.elapsedSec * pricing.inputRate;
  const estOutputTokens = input.elapsedSec * pricing.outputRate * 0.3;
  const costUsdEstimated = (estInputTokens * pricing.input + estOutputTokens * pricing.output) / 1_000_000;

  const costSource = input.costUsd != null ? 'precise' : 'estimated';

  const result = db.insert(billingRecords).values({
    processName: input.processName,
    cliKind: input.cliKind,
    modelId: input.modelId,
    providerId: input.providerId,
    machineId: input.machineId,
    userMessage: input.userMessage.slice(0, 200),
    replySnippet: input.replySnippet.slice(0, 200),
    elapsedSec: input.elapsedSec,
    toolCallsJson: JSON.stringify(input.toolCalls),
    costUsd: input.costUsd ?? null,
    costUsdEstimated,
    costSource,
    sessionId: input.sessionId ?? null,
  }).run();

  const billingId = result.lastInsertRowid as number;

  // 写入工具调用明细
  for (const [toolName, count] of Object.entries(input.toolCalls)) {
    db.insert(billingDetails).values({
      billingId,
      stage: 'tool_call',
      toolName,
      durationSec: 0,
    }).run();
  }

  // 写入对话关联
  if (input.platform || input.targetId) {
    db.insert(conversationBilling).values({
      billingId,
      platform: input.platform || 'feishu',
      targetId: input.targetId || null,
      timelineId: input.timelineId || null,
      userMessageFull: input.userMessage,
      replySent: true,
    }).run();
  }

  return billingId;
}

/** 查询计费记录（分页） */
export interface BillingPage {
  rows: any[];
  total: number;
}

export function queryBillingRecords(params: {
  page: number;
  pageSize: number;
  processName?: string;
  modelId?: string;
  startDate?: string;
  endDate?: string;
}): BillingPage {
  const db = getDb();
  const { page, pageSize, processName, modelId, startDate, endDate } = params;
  const offset = (page - 1) * pageSize;

  let where = '1=1';
  if (processName) where += ` AND process_name = '${processName.replace(/'/g, "''")}'`;
  if (modelId) where += ` AND model_id LIKE '%${modelId.replace(/'/g, "''")}%'`;
  if (startDate) where += ` AND created_at >= '${startDate.replace(/'/g, "''")}'`;
  if (endDate) where += ` AND created_at <= '${endDate.replace(/'/g, "''")}'`;

  const total = (db.all(sql`SELECT COUNT(*) as cnt FROM bacs_billing_records WHERE ${sql.raw(where)}`) as any[])[0]?.cnt ?? 0;
  const rows = db.all(sql`
    SELECT * FROM bacs_billing_records WHERE ${sql.raw(where)}
    ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}
  `);

  return { rows, total };
}

/** 查询单条计费记录明细 */
export function getBillingDetail(billingId: number): { record: any; details: any[]; conversations: any[] } {
  const db = getDb();
  const record = db.select().from(billingRecords).where(eq(billingRecords.id, billingId)).get();
  const details = db.select().from(billingDetails).where(eq(billingDetails.billingId, billingId)).all();
  const conversations = db.select().from(conversationBilling).where(eq(conversationBilling.billingId, billingId)).all();
  return { record, details, conversations };
}

/** 获取费用汇总统计 */
export function getBillingSummary(): {
  totalCost: number;
  totalEstimated: number;
  totalPrecise: number;
  recordCount: number;
  todayCost: number;
  weekCost: number;
  monthCost: number;
} {
  const db = getDb();

  const totalRow = db.all(sql`
    SELECT
      COALESCE(SUM(cost_usd), 0) as total_precise,
      COALESCE(SUM(cost_usd_estimated), 0) as total_estimated,
      COUNT(*) as cnt
    FROM bacs_billing_records
  `) as any[];

  const todayRow = db.all(sql`
    SELECT COALESCE(SUM(
      CASE WHEN cost_source = 'precise' THEN cost_usd ELSE cost_usd_estimated END
    ), 0) as today_cost
    FROM bacs_billing_records
    WHERE date(created_at) = date('now')
  `) as any[];

  const weekRow = db.all(sql`
    SELECT COALESCE(SUM(
      CASE WHEN cost_source = 'precise' THEN cost_usd ELSE cost_usd_estimated END
    ), 0) as week_cost
    FROM bacs_billing_records
    WHERE date(created_at) >= date('now', '-7 days')
  `) as any[];

  const monthRow = db.all(sql`
    SELECT COALESCE(SUM(
      CASE WHEN cost_source = 'precise' THEN cost_usd ELSE cost_usd_estimated END
    ), 0) as month_cost
    FROM bacs_billing_records
    WHERE date(created_at) >= date('now', '-30 days')
  `) as any[];

  const precise = totalRow[0]?.total_precise ?? 0;
  const estimated = totalRow[0]?.total_estimated ?? 0;

  return {
    totalCost: precise || estimated,
    totalPrecise: precise,
    totalEstimated: estimated,
    recordCount: totalRow[0]?.cnt ?? 0,
    todayCost: todayRow[0]?.today_cost ?? 0,
    weekCost: weekRow[0]?.week_cost ?? 0,
    monthCost: monthRow[0]?.month_cost ?? 0,
  };
}
```

---

## 六、API 路由设计

### 文件：`src/server/routes/billing.ts`

```ts
/**
 * GET /api/billing           — 分页查询计费记录
 * GET /api/billing/summary   — 费用汇总统计
 * GET /api/billing/:id       — 单条记录详情（含明细 + 对话关联）
 */

router.get('/api/billing', requireAuth, (req, res) => {
  // params: page, pageSize, processName, modelId, startDate, endDate
  // → queryBillingRecords()
});

router.get('/api/billing/summary', requireAuth, (req, res) => {
  // → getBillingSummary()
});

router.get('/api/billing/:id', requireAuth, (req, res) => {
  // → getBillingDetail(id)
  // 返回: { record, details, conversations }
});
```

---

## 七、菜单改造

### 7.1 当前结构

```
首页 | 运维中心(机器) | 绑定管理(Bots/服务商/绑定) | 日志 | 设置
```

「日志」是单层叶子节点，点击进入 LogsView（内部有系统日志/审计日志两个 Tab）。

### 7.2 改造后结构

```
首页 | 运维中心(机器) | 绑定管理(Bots/服务商/绑定) | 日志(实时日志/审计日志/扣费日志) | 设置
```

「日志」从叶子节点升级为**分组节点**（带 children），三个二级菜单。

### 7.3 路由变更

```ts
// 新增路由
{ path: 'logs/realtime',  name: 'logs-realtime',  component: () => import('../views/LogsView.vue') },
{ path: 'logs/audit',     name: 'logs-audit',     component: () => import('../views/LogsAuditView.vue') },
{ path: 'logs/billing',   name: 'logs-billing',   component: () => import('../views/LogsBillingView.vue') },

// 保留原 /logs 路由 → redirect 到 /logs/realtime
{ path: 'logs', redirect: '/logs/realtime' },
```

### 7.4 LayoutView.vue 菜单变更

```ts
// 旧：{ path: '/logs', label: '日志', icon: FileText }
// 新：
{
  label: '日志',
  icon: FileText,
  children: [
    { path: '/logs/realtime',  label: '实时日志', icon: Activity },     // lucide Activity
    { path: '/logs/audit',     label: '审计日志', icon: Shield },       // lucide Shield
    { path: '/logs/billing',   label: '扣费日志', icon: DollarSign },   // lucide DollarSign
  ],
}
```

需要 import `Activity`, `Shield`, `DollarSign` from lucide-vue-next。

### 7.5 expandedGroups 默认展开

```ts
// 新增 '日志' 到默认展开集合
const expandedGroups = ref<Set<string>>(new Set(['运维中心', '绑定管理', '日志']));
```

---

## 八、扣费日志页面设计

### 文件：`src/client/views/LogsBillingView.vue`

#### 8.1 页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│  扣费日志                                         🔍 筛选      │
│                                                                 │
│  ┌─ 汇总卡片 ─────────────────────────────────────────────┐    │
│  │ 今日  $0.45    本周  $2.31    本月  $8.76    累计  $12.05 │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ 计费表格 ─────────────────────────────────────────────┐    │
│  │ 时间 │ 进程 │ 模型 │ 耗时 │ 费用 │ 来源 │ 操作        │    │
│  │ ─────┼──────┼──────┼──────┼──────┼──────┼────────── │    │
│  │ 17:23│ b2   │sonnet│ 45s  │$0.023│ 约   │ [详情]     │    │
│  │ 16:41│ a2   │opus  │ 2m12s│$0.45 │ 约   │ [详情]     │    │
│  │ 15:30│ c2   │haiku │ 12s  │$0.003│ 约   │ [详情]     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                 │
│  共 156 条  ‹ 1 2 3 ... 8 ›  20条/页 ▾                        │
└─────────────────────────────────────────────────────────────────┘
```

#### 8.2 详情弹窗

点击「详情」按钮，弹出 `glass-card` 模态框：

```
┌─────────────────────────────────────────────────────────────┐
│  计费详情                                              [×]  │
│                                                             │
│  基础信息                                                   │
│  ──────────                                                 │
│  进程：b2                                                   │
│  模型：claude-sonnet-4-20250514                             │
│  服务商：Anthropic 官方                                      │
│  机器：本机                                                  │
│  总耗时：45s（cc 自报 42s）                                  │
│  费用：≈ $0.023（估算）                                      │
│                                                             │
│  工具调用                                                    │
│  ──────────                                                 │
│  Bash × 2  |  Edit × 1  |  Read × 3                         │
│                                                             │
│  对话关联                                                    │
│  ──────────                                                 │
│  平台：飞书                                                  │
│  目标：oc_xxxx                                              │
│  用户消息：请帮我修复 auth.py 中的登录 Bug...                  │
│  回复摘要：我检查了 auth.py 文件，发现登录 Bug 的根因是...      │
│                                                             │
│  ─────────────────────                                      │
│  ⚠️ 费用为估算值，仅供参考。切换至 headless 模式可获得精确值   │
└─────────────────────────────────────────────────────────────┘
```

#### 8.3 筛选功能

顶部「筛选」按钮展开筛选栏：
- 进程名下拉（从 billing_records 去重）
- 模型下拉
- 日期范围（开始 / 结束）

---

## 九、集成点：对话结束触发计费

### 9.1 ws-client.ts sendReply 改造

当 `tryFinish` → `onReply` 触发时，在发送回复卡片的同时创建计费记录：

```ts
function sendReply(session: SessionState, replyResult: ReplyResult, isTimeout: boolean): void {
  // ...现有回复卡片发送逻辑...

  // 新增：创建计费记录
  const timing = adapter.extractTiming(session.accumulated);
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const binding = getBindingByProcessName(session.processName);  // 需要新增此查询

  billing.createBillingRecord({
    processName: session.processName,
    cliKind: session.cliKind,
    modelId: binding?.modelOverride || binding?.modelId || null,
    providerId: binding?.providerId ?? null,
    machineId: session.ctx.machineId,
    userMessage: session.ctx.msgText,
    replySnippet: replyResult.text,
    elapsedSec: elapsed,
    toolCalls: replyResult.toolCount,
    timing,
    platform: 'feishu',
    targetId: session.ctx.targetId,
  });
}
```

### 9.2 回复卡片底部加费用

修改 `sender.ts` 的 `sendReplyCard`，在 note 中附加费用：

```ts
const costStr = opts.costUsdEstimated
  ? ` · 💰 ≈$${opts.costUsdEstimated.toFixed(4)}`
  : '';
const noteContent = `⏱ 总计 ${elapsedStr}${timingStr}${toolStr}${costStr} · ${new Date().toLocaleString('zh-CN')}`;
```

---

## 十、db/index.ts 运行时建表

与 `ensureBacsBotsTable` 风格一致，在 `initDatabase()` 中新增：

```ts
ensureBillingTables(sqlite);
```

```ts
function ensureBillingTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bacs_billing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_name TEXT NOT NULL,
      cli_kind TEXT NOT NULL DEFAULT 'cc',
      model_id TEXT,
      provider_id INTEGER,
      machine_id INTEGER,
      user_message TEXT,
      reply_snippet TEXT,
      elapsed_sec INTEGER NOT NULL DEFAULT 0,
      tool_calls_json TEXT,
      cost_usd REAL,
      cost_usd_estimated REAL,
      cost_source TEXT NOT NULL DEFAULT 'estimated',
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_billing_process ON bacs_billing_records (process_name)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_billing_model ON bacs_billing_records (model_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_billing_created ON bacs_billing_records (created_at)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bacs_billing_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_id INTEGER NOT NULL REFERENCES bacs_billing_records(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      tool_name TEXT,
      tool_arg TEXT,
      duration_sec INTEGER DEFAULT 0,
      token_in INTEGER,
      token_out INTEGER,
      cost_usd REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_billing_detail_billing ON bacs_billing_details (billing_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bacs_conversation_billing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_id INTEGER NOT NULL REFERENCES bacs_billing_records(id) ON DELETE CASCADE,
      platform TEXT NOT NULL DEFAULT 'feishu',
      target_id TEXT,
      timeline_id INTEGER,
      user_message_full TEXT,
      reply_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_conv_billing_billing ON bacs_conversation_billing (billing_id)`);
}
```

---

## 十一、文件改动清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/server/db/schema.ts` | 新增 | 3 张表 Drizzle 定义（billingRecords / billingDetails / conversationBilling） |
| `src/server/db/index.ts` | 新增 | `ensureBillingTables()` 运行时建表 |
| `src/server/billing/service.ts` | 新建 | 计费服务：createBillingRecord / queryBillingRecords / getBillingDetail / getBillingSummary |
| `src/server/routes/billing.ts` | 新建 | API 路由：GET /api/billing + /api/billing/summary + /api/billing/:id |
| `src/server/index.ts` | 修改 | import + app.use(billingRoutes) |
| `src/server/channel/feishu/ws-client.ts` | 修改 | sendReply 中调用 createBillingRecord |
| `src/server/channel/feishu/sender.ts` | 修改 | sendReplyCard 加 costUsdEstimated 参数 |
| `src/client/router/index.ts` | 修改 | 新增 logs/realtime + logs/audit + logs/billing 路由，/logs redirect |
| `src/client/views/LayoutView.vue` | 修改 | 日志从叶子→分组，import 新 icon |
| `src/client/views/LogsView.vue` | 修改 | 拆分：只保留实时日志 Tab 逻辑 |
| `src/client/views/LogsAuditView.vue` | 新建 | 审计日志独立页面（从 LogsView 拆出） |
| `src/client/views/LogsBillingView.vue` | 新建 | 扣费日志页面（汇总卡片 + 分页表格 + 详情弹窗） |

---

## 十二、开发顺序

1. **数据库层**：schema.ts 新增 3 表 + index.ts 建表函数
2. **计费服务**：billing/service.ts 核心逻辑
3. **API 路由**：billing.ts + index.ts 注册
4. **集成触发**：ws-client.ts sendReply 调用计费 + sender.ts 卡片加费用
5. **菜单改造**：LayoutView + router
6. **拆分视图**：LogsView 拆为 3 个独立 View
7. **扣费日志页面**：LogsBillingView 汇总 + 表格 + 分页 + 详情弹窗
8. **端到端验证**
9. **收尾：lint / build / test / 文档 / 版本 / commit / push**

---

## 十三、与 v1.1.25 其他需求的关系

| 需求 | 计费关联 |
|---|---|
| 需求 1：工具调用实时状态 | 工具调用数据 = 计费明细的来源 |
| 需求 2：耗时与工具统计 | timing + toolCount = 计费记录的核心字段 |
| 需求 3：可折叠长回复 | 无直接关联 |
| 需求 4：/命令交互 | /status 可加费用统计；/cost 可查询今日/本周费用 |

**建议**：先完成需求 1+2（提取工具调用和耗时），再接计费服务（复用提取的数据），最后做菜单+页面。
