/**
 * @module channel/feishu/ws-client
 * @description 飞书 WebSocket 长连接管理器
 *
 * 管理飞书 WebSocket 客户端的完整生命周期：
 * - 启动 / 停止 / 重连 WebSocket 连接
 * - 接收飞书消息事件，路由到 CLI 进程
 * - 通过 session/state 管理问答会话状态
 * - 通过 session/manager 构建 CLI 启动配置
 * - 通过 cli/factory 获取对应 CLI adapter
 */

import {
  WSClient,
  EventDispatcher,
  Domain,
  LoggerLevel,
} from '@larksuiteoapi/node-sdk';
import { getAdapter } from '../../cli/factory.js';
import { getExecutor } from '../../executor/factory.js';
import {
  createSession,
  startHardDeadline,
  startOutputPolling,
  endSession,
  hasActiveSession,
  getSession,
  panelFingerprint,
  type SessionState,
  type SessionContext,
} from '../../session/state.js';
import type { ChoicePanel } from '../../cli/types.js';
import { buildCliConfig } from '../../session/manager.js';
import { getDb } from '../../db/index.js';
import { bindings, machines, chatTimeLine } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../../middleware/logger.js';
import * as sender from './sender.js';
import { broadcastTimeline } from '../../routes/timeline.js';
import * as billing from '../../billing/service.js';

// ── 类型定义 ────────────────────────────────────────────────────────────

/** 绑定记录类型（从 schema 推断） */
type BindingRecord = typeof bindings.$inferSelect;

/** 运行中的 WebSocket 客户端条目 */
interface ClientEntry {
  /** SDK WebSocket 客户端实例 */
  wsClient: WSClient;
  /** SDK 事件分发器 */
  eventDispatcher: EventDispatcher;
  /** 是否已连接 */
  connected: boolean;
}

/** 飞书消息事件中的 message 字段 */
interface FeishuMessage {
  /** 消息类型 */
  message_type: string;
  /** 消息内容 JSON 字符串 */
  content?: string;
  /** 聊天 ID */
  chat_id: string;
}

/** 飞书消息事件中的 sender 字段 */
interface FeishuSender {
  /** 发送者类型 */
  sender_type?: string;
  /** 发送者 ID 信息 */
  sender_id?: {
    open_id?: string;
  };
}

/** 飞书消息接收事件 */
interface FeishuMessageEvent {
  /** 事件类型 */
  event_type?: string;
  /** 消息体 */
  message?: FeishuMessage;
  /** 发送者信息 */
  sender?: FeishuSender;
}

/**
 * 卡片按钮点击回调事件
 *
 * 飞书 v2 SDK 在 EventDispatcher 中将 card.action.trigger 事件标准化后传入。
 * 我们关心 action.value（构卡时塞入的业务参数）+ operator（点击者）+ open_chat_id。
 */
interface CardActionEvent {
  event_type: 'card.action.trigger';
  /** 卡片按钮的业务参数（buildAwaitingCard 中 button.value） */
  action?: {
    value?: {
      action?: string;
      processName?: string;
      optionIndex?: number;
      [k: string]: unknown;
    };
  };
  /** 点击操作者 */
  operator?: {
    open_id?: string;
    union_id?: string;
  };
  /** 卡片所在的聊天 ID（用于回执路由） */
  open_chat_id?: string;
  /** 卡片消息 ID（用于回执路由 reply） */
  open_message_id?: string;
}

/** SDK logger 接口 */
interface SdkLogger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
}

// ── 运行状态 ────────────────────────────────────────────────────────────

/** 运行中的客户端: appId → ClientEntry */
const clients: Map<string, ClientEntry> = new Map();

/** SDK 已知的事件类型列表 */
const KNOWN_EVENTS = [
  'im.message.receive_v1',
  'im.message.read_v1',
  'im.message.reaction.created_v1',
  'im.message.reaction.deleted_v1',
  'im.chat.member.user.added_v1',
  'im.chat.member.user.deleted_v1',
  'im.chat.member.bot.added_v1',
  'im.chat.member.bot.deleted_v1',
  'im.chat.disbanded_v1',
  'im.chat.updated_v1',
  // 卡片按钮回调（飞书 v2 SDK 卡片交互事件）
  'card.action.trigger',
];

// ── 内部函数 ────────────────────────────────────────────────────────────

/** 只取 pane 中最后一个 ❯ 提示符之后的部分，避免统计到旧对话的工具调用 */
function extractRecentPane(raw: string): string {
  if (!raw) return raw;
  const lines = raw.split(/\r?\n/);
  let lastPromptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*❯\s/.test(lines[i])) { lastPromptIdx = i; break; }
  }
  return lastPromptIdx >= 0 ? lines.slice(lastPromptIdx).join('\n') : raw;
}

/**
 * 查询绑定记录：根据飞书 App ID 查找绑定
 *
 * @param appId - 飞书应用 App ID
 * @returns 绑定记录，未找到返回 null
 */
function getBindingByAppId(appId: string): BindingRecord | null {
  const db = getDb();
  const result = db
    .select()
    .from(bindings)
    .where(eq(bindings.feishuAppId, appId))
    .get();
  return result ?? null;
}

/**
 * 查询所有具有飞书凭据的绑定记录
 *
 * @returns 绑定记录数组
 */
function getAllBindingsWithFeishu(): BindingRecord[] {
  const db = getDb();
  return db.select().from(bindings).all();
}

/**
 * 发送回复内容到飞书
 *
 * 先尝试发送回复卡片，若失败则降级为纯文本发送。
 *
 * @param session   - 会话状态
 * @param reply     - 回复文本内容
 * @param isTimeout - 是否为超时兜底回复
 */
function sendReply(session: SessionState, reply: string, isTimeout: boolean): void {
  const { feishuAppId, feishuAppSecret, targetType, targetId, processName, msgText, cliKind, machineId } = session.ctx;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const adapter = getAdapter(cliKind);
  const timing = adapter.extractTiming(session.accumulated);
  // 只统计当前对话的工具调用次数（取最后 ❯ 之后的部分）
  const recentPane = extractRecentPane(session.accumulated);
  const toolCount = adapter.extractToolCount(recentPane);

  // 创建计费记录
  try {
    const binding = getBindingByAppId(feishuAppId);
    billing.createBillingRecord({
      processName,
      cliKind,
      modelId: binding?.modelOverride || null,
      providerId: binding?.providerId ?? null,
      machineId,
      userMessage: msgText,
      replySnippet: reply,
      elapsedSec: elapsed,
      toolCalls: toolCount,
      timing: timing || undefined,
      platform: 'feishu',
      targetId,
    });
  } catch (e: any) {
    logger.log('error', '计费记录写入失败', e.message);
  }

  // 计算估算费用（用于卡片展示）
  let costUsdEstimated: number | undefined;
  try {
    const MODEL_PRICING: Record<string, { input: number; output: number; inputRate: number; outputRate: number }> = {
      'claude-opus-4':   { input: 15,  output: 75,  inputRate: 15, outputRate: 8 },
      'claude-sonnet-4': { input: 3,   output: 15,  inputRate: 40, outputRate: 20 },
      'claude-haiku-4':  { input: 0.8, output: 4,   inputRate: 80, outputRate: 40 },
      'default':         { input: 3,   output: 15,  inputRate: 40, outputRate: 20 },
    };
    const binding = getBindingByAppId(feishuAppId);
    const modelId = binding?.modelOverride || '';
    const modelKey = Object.keys(MODEL_PRICING).find(k => modelId.toLowerCase().includes(k)) || 'default';
    const pricing = MODEL_PRICING[modelKey];
    const estInput = elapsed * pricing.inputRate;
    const estOutput = elapsed * pricing.outputRate * 0.3;
    costUsdEstimated = (estInput * pricing.input + estOutput * pricing.output) / 1_000_000;
    if (costUsdEstimated < 0.0001) costUsdEstimated = undefined;
  } catch { /* ignore */ }

  sender
    .sendReplyCard(feishuAppId, feishuAppSecret, targetType, targetId, {
      processName,
      userQuestion: msgText,
      reply,
      elapsed,
      isTimeout,
      toolCount: Object.keys(toolCount).length > 0 ? toolCount : undefined,
      timing: timing || undefined,
      costUsdEstimated,
    })
    .catch((e: Error) => {
      logger.log('error', '发送回复卡片失败', e.message);
      sender
        .sendText(feishuAppId, feishuAppSecret, targetType, targetId, reply)
        .catch((err: Error) =>
          logger.log('error', '发送 fallback 文本失败', err.message),
        );
    });

  logger.log(
    'info',
    `回复已发送到 ${targetType}:${targetId}, 耗时 ${elapsed}s, 长度 ${reply.length}`,
  );
  endSession(processName);
}

/**
 * 处理飞书接收到的消息
 *
 * 完整流程：
 * 1. 解析消息文本（去除 @机器人 前缀）
 * 2. 确定消息目标（群聊 chat_id 或私聊 open_id）
 * 3. 检查 CLI 进程是否在线（adapter.sessionExists）
 * 4. 并发保护（hasActiveSession）
 * 5. 创建会话（createSession）+ 构建 CLI 配置（buildCliConfig）
 * 6. 通过 adapter 发送消息到 CLI
 * 7. 启动进度通知 + 硬超时 + 输出轮询
 *
 * @param binding - 绑定记录
 * @param event   - 飞书消息事件
 */
/** /命令路由处理 */
function handleBridgeCommand(
  input: string,
  binding: BindingRecord,
  targetId: string,
  targetType: string,
): void {
  // 前缀 "!bacs-" 后的部分，如 "!bacs-status" → "status"
  const body = input.slice('!bacs-'.length).trim();
  const parts = body.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
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
      cmdModel(binding, parts[1], targetId, targetType);
      break;
    case 'effort':
      cmdEffort(binding, parts[1], targetId, targetType);
      break;
    default:
      sender
        .sendCard(feishuAppId!, feishuAppSecret!, targetType, targetId, sender.buildHelpCard(processName))
        .catch((e: Error) => logger.log('error', '发送帮助卡片失败', e.message));
  }
}

async function cmdStatus(binding: BindingRecord, targetId: string, targetType: string) {
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

  sender
    .sendCard(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, sender.buildStatusCard(binding.processName, statusRows))
    .catch((e: Error) => logger.log('error', '发送状态卡片失败', e.message));
}

async function cmdInterrupt(binding: BindingRecord, targetId: string, targetType: string) {
  const adapter = getAdapter(binding.cliKind);
  const sessionName = `${adapter.sessionPrefix}-${binding.processName}`;
  const executor = await getExecutor(binding.machineId ?? null);

  await executor.sendKeys(sessionName, ['Escape']);

  const session = getSession(binding.processName);
  if (session) session.replied = true;

  sender
    .sendCard(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, sender.buildInterruptAckCard(binding.processName))
    .catch((e: Error) => logger.log('error', '发送中断确认卡片失败', e.message));
}

async function cmdModel(binding: BindingRecord, modelId: string | undefined, targetId: string, targetType: string) {
  if (!modelId) {
    const current = binding.modelOverride || '默认';
    sender
      .sendText(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, `当前模型：${current}\n用法：/model <模型ID>`)
      .catch((e: Error) => logger.log('error', '发送模型信息失败', e.message));
    return;
  }
  // 更新绑定配置中的 modelOverride
  try {
    const db = getDb();
    db.update(bindings).set({ modelOverride: modelId, updatedAt: new Date().toISOString() }).where(eq(bindings.id, binding.id)).run();
    sender
      .sendText(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, `模型已切换为：${modelId}\n新会话将使用此模型，当前会话需 /interrupt 后生效`)
      .catch((e: Error) => logger.log('error', '发送模型切换确认失败', e.message));
  } catch (e: any) {
    logger.log('error', '切换模型失败', e.message);
  }
}

async function cmdEffort(binding: BindingRecord, level: string | undefined, targetId: string, targetType: string) {
  const validLevels = ['low', 'medium', 'high', 'xhigh', 'max'];
  if (!level || !validLevels.includes(level.toLowerCase())) {
    sender
      .sendText(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, `effort 只支持: ${validLevels.join('/')}\n用法：/effort <level>`)
      .catch((e: Error) => logger.log('error', '发送 effort 提示失败', e.message));
    return;
  }
  try {
    const db = getDb();
    db.update(bindings).set({ effort: level.toLowerCase(), updatedAt: new Date().toISOString() }).where(eq(bindings.id, binding.id)).run();
    sender
      .sendText(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, `effort 已切换为：${level.toLowerCase()}\n新会话将使用此设置`)
      .catch((e: Error) => logger.log('error', '发送 effort 切换确认失败', e.message));
  } catch (e: any) {
    logger.log('error', '切换 effort 失败', e.message);
  }
}

/**
 * 处理卡片按钮点击回调
 *
 * 用户在飞书侧点击决策卡片的按钮时触发：
 * 1. 校验 action.value.action === 'cc_choice'
 * 2. 查会话当前 awaiting，比对 processName
 * 3. 用 button.value.optionIndex 模拟"用户回复了 1/2/..."调 sendChoice
 * 4. 发回执卡片（绿色）
 */
function handleCardAction(binding: BindingRecord, event: CardActionEvent): void {
  const { processName } = binding;
  const value = event?.action?.value;
  if (!value || !value.action) {
    return;
  }

  // 中断按钮回调
  if (value.action === 'cc_interrupt') {
    if (value.processName !== processName) return;
    const adapter = getAdapter(binding.cliKind);
    const sessionName = `${adapter.sessionPrefix}-${processName}`;
    const session = getSession(processName);
    // 使用 session.ctx 的 target（来自原始消息），回退到 event 的 open_chat_id
    const targetType: 'chat_id' | 'open_id' = session
      ? session.ctx.targetType as 'chat_id' | 'open_id'
      : (event.open_chat_id ? 'chat_id' : 'open_id');
    const targetId = session
      ? session.ctx.targetId
      : (event.open_chat_id || event.operator?.open_id || '');
    if (!targetId || !binding.feishuAppId || !binding.feishuAppSecret) return;

    getExecutor(binding.machineId ?? null)
      .then((executor) => executor.sendKeys(sessionName, ['Escape']))
      .then(() => {
        const session = getSession(processName);
        if (session) session.replied = true;
        sender
          .sendCard(binding.feishuAppId!, binding.feishuAppSecret!, targetType, targetId, sender.buildInterruptAckCard(processName))
          .catch((e: Error) => logger.log('error', '发送中断确认卡片失败', e.message));
      })
      .catch((e: Error) => logger.log('error', '中断操作失败', e.message));
    return;
  }

  // 决策按钮回调
  if (value.action !== 'cc_choice') {
    logger.log('info', `[CardAction] 非决策回调，忽略 action=${value.action}`);
    return;
  }
  if (value.processName !== processName) {
    logger.log('warn', `[CardAction] 进程名不匹配: button=${value.processName} binding=${processName}`);
    return;
  }
  const optionIndex = Number(value.optionIndex);
  if (!Number.isFinite(optionIndex) || optionIndex < 1) {
    logger.log('warn', `[CardAction] optionIndex 无效: ${value.optionIndex}`);
    return;
  }
  const session = getSession(processName);
  if (!session || !session.awaiting) {
    // 用户可能在 awaiting 已被解除后再点按钮，给出友好提示
    const chatId = event.open_chat_id;
    if (chatId && binding.feishuAppId && binding.feishuAppSecret) {
      sender
        .sendText(
          binding.feishuAppId,
          binding.feishuAppSecret,
          'chat_id',
          chatId,
          `ℹ️ 当前已无待决策项（可能已超时或被其他渠道回复）`,
        )
        .catch((e: Error) => logger.log('error', '发送过期提示失败', e.message));
    }
    return;
  }
  const panel = session.awaiting.panel;
  // 使用 session.ctx 的 target（来自原始消息），确保回执发到群聊而非私聊
  const targetType = session.ctx.targetType as 'chat_id' | 'open_id';
  const targetId = session.ctx.targetId;
  if (!targetId || !binding.feishuAppId || !binding.feishuAppSecret) {
    logger.log('warn', '[CardAction] 缺少回执路由信息');
    return;
  }
  // 拿到 executor + adapter（与 handleIncomingMessage 一致：远程绑定走 SSH，本地走 local）
  const adapter = getAdapter(binding.cliKind);
  const sessionName = `${adapter.sessionPrefix}-${processName}`;
  // 直接用 String(optionIndex) 作为用户回复送入 sendChoice，其内部会按数字索引精确匹配
  getExecutor(binding.machineId ?? null)
    .then((executor) => adapter.sendChoice(sessionName, String(optionIndex), panel, executor))
    .then((r) => {
      if (!r.ok) {
        sender
          .sendCard(
            binding.feishuAppId!,
            binding.feishuAppSecret!,
            targetType,
            targetId,
            sender.buildChoiceUnrecognizedCard(processName, `按钮点击 #${optionIndex}`, panel.options),
          )
          .catch((e: Error) => logger.log('error', '发送卡片回调失败提示失败', e.message));
        return;
      }
      const chosenLabel = (panel.options[optionIndex - 1] || `第 ${optionIndex} 项`)
        .replace(/^\s*\d+\.\s*/, '')
        .trim();
      sender
        .sendCard(
          binding.feishuAppId!,
          binding.feishuAppSecret!,
          targetType,
          targetId,
          sender.buildChoiceAckCard(processName, chosenLabel, optionIndex),
        )
        .catch((e: Error) => logger.log('error', '发送卡片回调回执失败', e.message));
      session.awaiting = null;
      session.decisionJustMade = true;
      logger.log('info', `[CardAction] ${processName} 选择 ${optionIndex}. ${chosenLabel}`);
    })
    .catch((e: Error) => logger.log('error', '卡片回调 sendChoice 异常', e.message));
}

function handleIncomingMessage(binding: BindingRecord, event: FeishuMessageEvent): void {
  const { processName } = binding;
  const feishuAppId = binding.feishuAppId;
  const feishuAppSecret = binding.feishuAppSecret;
  const cliKind = binding.cliKind;
  const machineId = binding.machineId ?? null;
  const message = event?.message;
  if (!message || message.message_type !== 'text') return;

  if (!feishuAppId || !feishuAppSecret || !cliKind) return;

  let msgText = '';
  try {
    msgText = JSON.parse(message.content || '{}').text || '';
  } catch {
    msgText = '';
  }
  msgText = msgText.replace(/@_user_\d+\s*/g, '').trim();
  if (!msgText) return;

  // 写入 timeline（异步，不阻塞主流程）
  try {
    const db = getDb();
    let targetIp = 'localhost';
    if (binding.machineId) {
      const machine = db.select().from(machines).where(eq(machines.id, binding.machineId)).get();
      if (machine?.host) targetIp = machine.host;
    }
    const row = db.insert(chatTimeLine).values({
      platform: 'feishu',
      targetIp,
      processName: binding.processName,
      content: msgText,
    }).returning().get();
    if (row) {
      broadcastTimeline({
        id: row.id,
        platform: row.platform,
        targetIp: row.targetIp,
        processName: row.processName,
        content: row.content,
        createdAt: row.createdAt ?? new Date().toISOString(),
      });
    }
  } catch (e) {
    logger.log('error', 'timeline 写入失败', String(e));
  }

  const chatId = message.chat_id;
  const targetId = chatId || event?.sender?.sender_id?.open_id;
  const targetType = chatId ? 'chat_id' : 'open_id';
  if (!targetId) return;

  // bridge 命令路由：以 "!bacs-" 开头的消息由 bridge 本地处理
  // 其余所有消息（含 / 开头的 cc 内置命令）正常转发给 cc 进程
  if (msgText.startsWith('!bacs-')) {
    handleBridgeCommand(msgText, binding, targetId, targetType);
    return;
  }

  const adapter = getAdapter(cliKind);

  // All adapter calls now require executor — wrap in async
  (async () => {
    try {
    const executor = await getExecutor(machineId);

    if (!await adapter.sessionExists(processName, executor)) {
      sender
        .sendText(
          feishuAppId,
          feishuAppSecret,
          targetType,
          targetId,
          `进程 [${processName}] 已离线，请先在终端启动 CC 进程`,
        )
        .catch((e: Error) => logger.log('error', '发送离线提示失败', e.message));
      return;
    }

    if (hasActiveSession(processName)) {
      // 关键：active session 处于 awaiting_choice → 把这条消息当成"用户对决策面板的回复"
      // 通过 adapter.sendChoice 发送数字键/方向键，而不是 paste 文本到不存在的输入框
      const existing = getSession(processName);
      if (existing && existing.awaiting) {
        const panel = existing.awaiting.panel;
        const r = await adapter.sendChoice(
          `${adapter.sessionPrefix}-${processName}`,
          msgText,
          panel,
          executor,
        );
        if (!r.ok) {
          // 识别失败：发"无法识别"提示卡（保持 awaiting，用户可重发）
          sender
            .sendCard(
              feishuAppId,
              feishuAppSecret,
              targetType,
              targetId,
              sender.buildChoiceUnrecognizedCard(processName, msgText, panel.options),
            )
            .catch((e: Error) => logger.log('error', '发送选择失败卡片失败', e.message));
          return;
        }
        const chosenIdx = r.chosenIndex || 0;
        const chosenLabel = chosenIdx
          ? (panel.options[chosenIdx - 1] || `第 ${chosenIdx} 项`).replace(/^\s*\d+\.\s*/, '').trim()
          : '已发送';
        // 识别成功：发绿色回执卡片
        sender
          .sendCard(
            feishuAppId,
            feishuAppSecret,
            targetType,
            targetId,
            sender.buildChoiceAckCard(processName, chosenLabel, chosenIdx),
          )
          .catch((e: Error) => logger.log('error', '发送选择确认卡片失败', e.message));
        // 清掉 awaiting，由轮询继续判断 cc 后续状态（idle / 又一个面板 / working）
        existing.awaiting = null;
        existing.decisionJustMade = true;
        logger.log('info', `已转发选择到 ${processName}: idx=${r.chosenIndex}`);
        return;
      }

      sender
        .sendText(
          feishuAppId,
          feishuAppSecret,
          targetType,
          targetId,
          `进程 [${processName}] 正在处理上一条消息，请稍后再试`,
        )
        .catch((e: Error) => logger.log('error', '发送忙提示失败', e.message));
      return;
    }

    const ctx: SessionContext = {
      feishuAppId,
      feishuAppSecret,
      targetType,
      targetId,
      msgText,
      processName,
      cliKind,
      machineId,
    };

    const session = createSession(ctx);
    buildCliConfig(binding);

    const result = await adapter.sendInput(
      `${adapter.sessionPrefix}-${processName}`,
      msgText,
      executor,
    );
    if (!result.ok) {
      logger.log('error', '发送消息到进程失败', result.error);
      sender
        .sendText(
          feishuAppId,
          feishuAppSecret,
          targetType,
          targetId,
          `发送到 CC 进程失败: ${result.error}`,
        )
        .catch((e: Error) => logger.log('error', '发送错误提示失败', e.message));
      endSession(processName);
      return;
    }
    logger.log('info', `消息已路由到进程 ${processName}: ${msgText.slice(0, 60)}`);

    startHardDeadline(session, (s: SessionState) => {
      if (s.replied) return;

      // 硬超时前再检测一次：如果 cc 正在等待决策但之前 extractChoicePanel
      // 没识别出来（新格式），此时尝试用全量 pane 重新检测
      if (!s.awaiting) {
        const panel = adapter.extractChoicePanel(s.accumulated);
        if (panel) {
          s.awaiting = { panel, panelKey: panelFingerprint(panel), pushedAt: Date.now() };
          const card = sender.buildAwaitingCard(
            s.processName,
            panel.title,
            panel.options,
            panel.defaultIndex,
            s.ctx.msgText,
          );
          sender
            .sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
            .catch((e: Error) => logger.log('error', '发送决策卡片失败', e.message));
          logger.log('info', `硬超时检测到决策面板: ${panel.title}（${panel.options.length} 个选项）`);
          return;
        }
      }

      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      const reply = adapter.extractReply(s.accumulated, s.ctx.msgText);
      if (reply && reply.length > 5) {
        s.replied = true;
        sendReply(s, reply, true);
      } else {
        const card = sender.buildTimeoutCard(s.processName, elapsed);
        sender
          .sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
          .catch((e: Error) => logger.log('error', '发送超时卡片失败', e.message));
        s.replied = true;
        endSession(s.processName);
      }
    });

    startOutputPolling(session, {
      onReply: (s: SessionState, reply: string) => {
        if (s.replied) return;
        if (!reply) {
          sender
            .sendText(
              s.ctx.feishuAppId,
              s.ctx.feishuAppSecret,
              s.ctx.targetType,
              s.ctx.targetId,
              '[CC 已完成处理，但未能提取到回复内容。请检查 tmux 会话或重试]',
            )
            .catch((e: Error) => logger.log('error', '发送空回复提示失败', e.message));
          s.replied = true;
          endSession(s.processName);
          return;
        }
        s.replied = true;
        sendReply(s, reply, false);
      },
      onAwaiting: (s: SessionState, panel: ChoicePanel) => {
        const card = sender.buildAwaitingCard(
          s.processName,
          panel.title,
          panel.options,
          panel.defaultIndex,
          s.ctx.msgText,
        );
        sender
          .sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
          .catch((e: Error) => logger.log('error', '发送决策卡片失败', e.message));
        logger.log('info', `cc 等待决策: ${panel.title}（${panel.options.length} 个选项）`);
      },
      onProgress: (s: SessionState) => {
        if (s.awaiting) return;
        const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
        const card = sender.buildWorkingCard(s.processName, elapsed, s.ctx.msgText, s.lastToolCalls);
        sender
          .sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
          .catch((e: Error) => logger.log('error', '发送进度卡片失败', e.message));
      },
    });
    } catch (e: any) {
      logger.log('error', '消息处理异常', e.message || e);
      endSession(processName);
    }
  })();
}

// ── 公开 API ────────────────────────────────────────────────────────────

/**
 * 启动飞书 WebSocket 长连接
 *
 * 为指定绑定创建 WSClient 和 EventDispatcher，注册消息处理器，
 * 启动 WebSocket 连接。若该 appId 已有连接则跳过。
 *
 * @param binding - 绑定记录
 * @throws WebSocket 连接失败时抛出异常
 */
export async function start(binding: BindingRecord): Promise<void> {
  const feishuAppId = binding.feishuAppId;
  const feishuAppSecret = binding.feishuAppSecret;
  const { processName } = binding;

  // 飞书凭据为必要字段，缺失则无法建立连接
  if (!feishuAppId || !feishuAppSecret) {
    logger.log('warn', `缺少飞书凭据，跳过 WebSocket 启动: process=${processName}`);
    return;
  }

  if (clients.has(feishuAppId)) {
    logger.log('warn', `WebSocket 客户端已存在: app_id=${feishuAppId}`);
    return;
  }

  const eventDispatcher = new EventDispatcher({});

  // 统一事件处理器
  const handler = (event: FeishuMessageEvent): void => {
    logger.log('info', `[WSEvent] type=${event?.event_type}`);
    const b = feishuAppId ? getBindingByAppId(feishuAppId) : null;
    if (!b) {
      logger.log('warn', `[WSEvent] 未找到绑定: app_id=${feishuAppId}`);
      return;
    }
    // 卡片按钮点击回调：与普通消息不同，evt 结构包含 action.value
    if (event?.event_type === 'card.action.trigger') {
      handleCardAction(b, event as unknown as CardActionEvent);
      return;
    }
    if (event?.event_type === 'im.message.receive_v1') {
      if (event?.sender?.sender_type === 'bot') {
        logger.log('info', '[WSEvent] 过滤机器人消息');
        return;
      }
      handleIncomingMessage(b, event);
    }
  };

  // 注册所有已知事件类型到同一处理器
  const handlers: Record<string, typeof handler> = {};
  KNOWN_EVENTS.forEach((e) => {
    handlers[e] = handler;
  });
  eventDispatcher.register(handlers);

  // SDK 日志适配器
  const sdkLogger: SdkLogger = {
    info: (...args: unknown[]) => logger.log('debug', '[SDK:info]', ...args),
    debug: (...args: unknown[]) => logger.log('debug', '[SDK:debug]', ...args),
    warn: (...args: unknown[]) => logger.log('warn', '[SDK:warn]', ...args),
    error: (...args: unknown[]) => logger.log('error', '[SDK:error]', ...args),
    trace: (...args: unknown[]) => logger.log('debug', '[SDK:trace]', ...args),
  };

  const wsClient = new WSClient({
    appId: feishuAppId,
    appSecret: feishuAppSecret,
    domain: Domain.Feishu,
    loggerLevel: LoggerLevel.trace,
    logger: sdkLogger,
    autoReconnect: true,
    onReady: () => {
      logger.log('info', `WebSocket 已连接: app_id=${feishuAppId}, process=${processName}`);
      const entry = clients.get(feishuAppId);
      if (entry) entry.connected = true;
    },
    onReconnecting: () => {
      logger.log('info', `WebSocket 重连中: app_id=${feishuAppId}`);
      const entry = clients.get(feishuAppId);
      if (entry) entry.connected = false;
    },
    onReconnected: () => {
      logger.log('info', `WebSocket 重连成功: app_id=${feishuAppId}`);
      const entry = clients.get(feishuAppId);
      if (entry) entry.connected = true;
    },
    onError: (err: Error) => {
      logger.log('error', `WebSocket 错误: app_id=${feishuAppId}`, err.message);
      const entry = clients.get(feishuAppId);
      if (entry) entry.connected = false;
    },
  });

  clients.set(feishuAppId, { wsClient, eventDispatcher, connected: false });

  try {
    await wsClient.start({ eventDispatcher });
  } catch (e) {
    const entry = clients.get(feishuAppId);
    if (entry) entry.connected = false;
    throw e;
  }
}

/**
 * 停止飞书 WebSocket 长连接
 *
 * 关闭指定 appId 的 WebSocket 客户端并从运行中移除。
 *
 * @param appId - 飞书应用 App ID
 */
export function stop(appId: string): void {
  const client = clients.get(appId);
  if (!client) return;
  try {
    client.wsClient.close({ force: true });
  } catch {
    // ignore close errors
  }
  clients.delete(appId);
  logger.log('info', `WebSocket 已关闭: app_id=${appId}`);
}

/**
 * 检查指定 appId 的 WebSocket 是否已连接
 *
 * @param appId - 飞书应用 App ID
 * @returns 已连接返回 true
 */
export function isConnected(appId: string): boolean {
  const client = clients.get(appId);
  return !!(client && client.connected);
}

/**
 * 启动所有已绑定飞书应用的 WebSocket 连接
 *
 * 查询所有绑定记录，对具有 feishuAppId 和 feishuAppSecret 的绑定
 * 逐一启动 WebSocket 连接。启动失败的绑定会记录错误日志但不阻塞其他。
 */
export async function startAll(): Promise<void> {
  const allBindings = getAllBindingsWithFeishu();
  for (const b of allBindings) {
    if (b.feishuAppId && b.feishuAppSecret) {
      start(b).catch((e: Error) =>
        logger.log('error', `启动绑定 WebSocket 失败: ${b.processName}`, e.message),
      );
    }
  }
}
