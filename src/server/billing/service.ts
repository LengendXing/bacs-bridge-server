/**
 * @module billing/service
 * @description 计费服务：对话结束 → 生成计费记录 + 明细
 */

import { getDb } from '../db/index.js';
import { billingRecords, billingDetails, conversationBilling } from '../db/schema.js';
import { desc, eq, sql } from 'drizzle-orm';

/** 模型单价配置（$/1M tokens）+ 估算 token 速率 */
const MODEL_PRICING: Record<string, { input: number; output: number; inputRate: number; outputRate: number }> = {
  'claude-opus-4':   { input: 15,  output: 75,  inputRate: 15, outputRate: 8 },
  'claude-sonnet-4': { input: 3,   output: 15,  inputRate: 40, outputRate: 20 },
  'claude-haiku-4':  { input: 0.8, output: 4,   inputRate: 80, outputRate: 40 },
  'default':         { input: 3,   output: 15,  inputRate: 40, outputRate: 20 },
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
  timing?: number;
  costUsd?: number;
  sessionId?: string;
  platform?: string;
  targetId?: string;
  timelineId?: number | null;
}

/** 生成一条计费记录 */
export function createBillingRecord(input: BillingInput): number {
  const db = getDb();

  const modelKey = Object.keys(MODEL_PRICING).find(k =>
    input.modelId?.toLowerCase().includes(k),
  ) || 'default';
  const pricing = MODEL_PRICING[modelKey];

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

  for (const [toolName, count] of Object.entries(input.toolCalls)) {
    for (let i = 0; i < count; i++) {
      db.insert(billingDetails).values({
        billingId,
        stage: 'tool_call',
        toolName,
        durationSec: 0,
      }).run();
    }
  }

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

export interface BillingPage {
  rows: any[];
  total: number;
}

/** 查询计费记录（分页） */
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

  const conditions: string[] = ['1=1'];
  if (processName) conditions.push(`process_name = '${processName.replace(/'/g, "''")}'`);
  if (modelId) conditions.push(`model_id LIKE '%${modelId.replace(/'/g, "''")}%'`);
  if (startDate) conditions.push(`date(created_at) >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) conditions.push(`date(created_at) <= '${endDate.replace(/'/g, "''")}'`);
  const where = conditions.join(' AND ');

  const totalRow = db.all(sql`SELECT COUNT(*) as cnt FROM bacs_billing_records WHERE ${sql.raw(where)}`) as any[];
  const total = totalRow[0]?.cnt ?? 0;
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
  totalPrecise: number;
  totalEstimated: number;
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
