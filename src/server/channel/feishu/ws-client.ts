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
  startProgressTimer,
  startHardDeadline,
  startOutputPolling,
  endSession,
  hasActiveSession,
  type SessionState,
  type SessionContext,
} from '../../session/state.js';
import { buildCliConfig } from '../../session/manager.js';
import { getDb } from '../../db/index.js';
import { bindings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../../middleware/logger.js';
import * as sender from './sender.js';

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
];

// ── 内部函数 ────────────────────────────────────────────────────────────

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
  const { feishuAppId, feishuAppSecret, targetType, targetId, processName, msgText } = session.ctx;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);

  sender
    .sendReplyCard(feishuAppId, feishuAppSecret, targetType, targetId, {
      processName,
      userQuestion: msgText,
      reply,
      elapsed,
      isTimeout,
    })
    .catch((e: Error) => {
      logger.log('error', '发送回复卡片失败', e.message);
      // fallback：纯文本发送
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

  const chatId = message.chat_id;
  const targetId = chatId || event?.sender?.sender_id?.open_id;
  const targetType = chatId ? 'chat_id' : 'open_id';
  if (!targetId) return;

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

    startProgressTimer(session, (s: SessionState) => {
      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      const card = sender.buildProgressCard(s.processName, elapsed, s.ctx.msgText);
      sender
        .sendCard(s.ctx.feishuAppId, s.ctx.feishuAppSecret, s.ctx.targetType, s.ctx.targetId, card)
        .catch((e: Error) => logger.log('error', '发送进度卡片失败', e.message));
    });

    startHardDeadline(session, (s: SessionState) => {
      if (s.replied) return;
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

    startOutputPolling(session, (s: SessionState, reply: string) => {
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
