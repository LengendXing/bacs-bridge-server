const { WSClient, EventDispatcher, Domain, LoggerLevel } = require('@larksuiteoapi/node-sdk');
const comm = require('../process/communicator');
const store = require('../binding/store');
const logger = require('../middleware/logger');
const config = require('../config').load();

// 运行中的客户端: appId → { wsClient, eventDispatcher, connected }
const clients = {};

// 每个 process 的活跃会话 session（一次问答的全部状态）
// processName → { progressTimer, stableTimer, hardDeadlineTimer, accumulated, startedAt, replied, ctx }
const sessions = {};

function clearSessionTimers(processName) {
  const s = sessions[processName];
  if (!s) return;
  if (s.progressTimer) { clearInterval(s.progressTimer); s.progressTimer = null; }
  if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }
  if (s.hardDeadlineTimer) { clearTimeout(s.hardDeadlineTimer); s.hardDeadlineTimer = null; }
}

function endSession(processName) {
  clearSessionTimers(processName);
  comm.stopPolling(processName);
  delete sessions[processName];
}

function handleIncomingMessage(binding, event) {
  const { process_name, feishu_app_id, feishu_app_secret } = binding;
  const message = event?.message;
  if (!message || message.message_type !== 'text') return;

  let msgText = '';
  try {
    msgText = JSON.parse(message.content || '{}').text || '';
  } catch {
    msgText = '';
  }
  // 去除 @机器人 前缀（飞书群里 @ 机器人会带 @_user_1 之类的占位）
  msgText = msgText.replace(/@_user_\d+\s*/g, '').trim();
  if (!msgText) return;

  const chatId = message.chat_id;
  const targetId = chatId || event?.sender?.sender_id?.open_id;
  const targetType = chatId ? 'chat_id' : 'open_id';
  if (!targetId) return;

  const sender = require('./sender');

  if (!comm.sessionExists(process_name)) {
    sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `进程 [${process_name}] 已离线，请先在终端启动 CC 进程`)
      .catch(e => logger.log('error', '发送离线提示失败', e.message));
    return;
  }

  // 并发保护：上一条还在处理则提示忙
  if (sessions[process_name]) {
    sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `进程 [${process_name}] 正在处理上一条消息，请稍后再试`)
      .catch(e => logger.log('error', '发送忙提示失败', e.message));
    return;
  }

  // 启动一个新会话
  const session = {
    progressTimer: null,
    stableTimer: null,
    hardDeadlineTimer: null,
    accumulated: '',
    startedAt: Date.now(),
    replied: false,
    ctx: { feishu_app_id, feishu_app_secret, targetType, targetId, msgText, process_name }
  };
  sessions[process_name] = session;

  // 发送消息到 CC
  const result = comm.sendInput(process_name, msgText);
  if (result.error) {
    logger.log('error', '发送消息到进程失败', result.error);
    sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `发送到 CC 进程失败: ${result.error}`)
      .catch(e => logger.log('error', '发送错误提示失败', e.message));
    endSession(process_name);
    return;
  }
  logger.log('info', `消息已路由到进程 ${process_name}: ${msgText.slice(0, 60)}`);

  startProgressTimer(session);
  startHardDeadline(session);
  startOutputPolling(session);
}

function startProgressTimer(session) {
  const sender = require('./sender');
  const { feishu_app_id, feishu_app_secret, targetType, targetId, msgText, process_name } = session.ctx;
  const interval = (config.bridge.progress_interval || 60) * 1000;

  session.progressTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    const card = sender.buildProgressCard(process_name, elapsed, msgText);
    sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
      .catch(e => logger.log('error', '发送进度卡片失败', e.message));
  }, interval);
}

function startHardDeadline(session) {
  const sender = require('./sender');
  const { feishu_app_id, feishu_app_secret, targetType, targetId, process_name } = session.ctx;
  const timeoutMs = (config.bridge.timeout || 600) * 1000;

  session.hardDeadlineTimer = setTimeout(() => {
    if (session.replied) return;
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);

    // 超时也尝试一次提取，能拿到就发，否则发超时卡片
    const reply = comm.extractReplyContent(session.accumulated, session.ctx.msgText);
    if (reply && reply.length > 5) {
      session.replied = true;
      sendReply(session, reply, true);
    } else {
      const card = sender.buildTimeoutCard(process_name, elapsed);
      sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
        .catch(e => logger.log('error', '发送超时卡片失败', e.message));
      session.replied = true;
      endSession(process_name);
    }
  }, timeoutMs);
}

function startOutputPolling(session) {
  const { process_name } = session.ctx;
  const stableMs = Math.max(3, (config.bridge.poll_interval || 2) * 2) * 1000;

  comm.startPolling(process_name, () => {
    // 累积所有输出 = 直接 capture 当前完整 pane（避免 delta 切片错位）
    const cur = comm.captureOutput(process_name);
    if (!cur.error) {
      session.accumulated = cur.output;
    }

    // 每次有输出就重置稳定窗口
    if (session.stableTimer) clearTimeout(session.stableTimer);
    session.stableTimer = setTimeout(() => {
      tryFinish(session);
    }, stableMs);
  });

  // 即使 CC 一直没新输出，也要定期检查 isIdle（防止 CC 直接进入空闲未触发任何输出）
  // 7 秒后做第一次空闲探测
  setTimeout(() => tryFinish(session), 7000);
}

function tryFinish(session) {
  if (session.replied) return;
  const { process_name } = session.ctx;
  const sess = sessions[process_name];
  if (!sess || sess !== session) return; // 会话已被替换/结束

  if (!comm.isIdle(process_name)) return; // CC 仍在忙

  // 双确认：500ms 后再查一次，避免 ❯ 短暂出现误判
  setTimeout(() => {
    if (session.replied) return;
    if (sessions[process_name] !== session) return;
    if (!comm.isIdle(process_name)) return;

    const reply = comm.extractReplyContent(session.accumulated, session.ctx.msgText);
    if (!reply) {
      // 没拿到内容但已空闲，说明可能 pane 被截断或回复为空 — 兜底发个简短提示
      const sender = require('./sender');
      const { feishu_app_id, feishu_app_secret, targetType, targetId } = session.ctx;
      sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
        '[CC 已完成处理，但未能提取到回复内容。请检查 tmux 会话或重试]')
        .catch(e => logger.log('error', '发送空回复提示失败', e.message));
      session.replied = true;
      endSession(process_name);
      return;
    }
    session.replied = true;
    sendReply(session, reply, false);
  }, 500);
}

function sendReply(session, reply, isTimeout) {
  const sender = require('./sender');
  const { feishu_app_id, feishu_app_secret, targetType, targetId, process_name, msgText } = session.ctx;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);

  sender.sendReplyCard(feishu_app_id, feishu_app_secret, targetType, targetId, {
    processName: process_name,
    userQuestion: msgText,
    reply,
    elapsed,
    isTimeout
  }).catch(e => {
    logger.log('error', '发送回复卡片失败', e.message);
    // fallback：纯文本发送
    sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId, reply)
      .catch(err => logger.log('error', '发送 fallback 文本失败', err.message));
  });

  logger.log('info', `回复已发送到 ${targetType}:${targetId}, 耗时 ${elapsed}s, 长度 ${reply.length}`);
  endSession(process_name);
}

async function start(binding) {
  const { feishu_app_id, feishu_app_secret, process_name } = binding;

  if (clients[feishu_app_id]) {
    logger.log('warn', `WebSocket 客户端已存在: app_id=${feishu_app_id}`);
    return;
  }

  const eventDispatcher = new EventDispatcher({});

  const knownEvents = [
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

  const handler = (event) => {
    logger.log('info', `[WSEvent] type=${event?.event_type}`);
    const b = store.getByAppId(feishu_app_id);
    if (!b) {
      logger.log('warn', `[WSEvent] 未找到绑定: app_id=${feishu_app_id}`);
      return;
    }
    if (event?.event_type === 'im.message.receive_v1') {
      if (event?.sender?.sender_type === 'bot') {
        logger.log('info', `[WSEvent] 过滤机器人消息`);
        return;
      }
      handleIncomingMessage(b, event);
    }
  };

  const handlers = {};
  knownEvents.forEach(e => { handlers[e] = handler; });
  eventDispatcher.register(handlers);

  const sdkLogger = {
    info: (...args) => logger.log('debug', '[SDK:info]', ...args),
    debug: (...args) => logger.log('debug', '[SDK:debug]', ...args),
    warn: (...args) => logger.log('warn', '[SDK:warn]', ...args),
    error: (...args) => logger.log('error', '[SDK:error]', ...args),
    trace: (...args) => logger.log('debug', '[SDK:trace]', ...args),
  };

  const wsClient = new WSClient({
    appId: feishu_app_id,
    appSecret: feishu_app_secret,
    domain: Domain.Feishu,
    loggerLevel: LoggerLevel.trace,
    logger: sdkLogger,
    autoReconnect: true,
    onReady: () => {
      logger.log('info', `WebSocket 已连接: app_id=${feishu_app_id}, process=${process_name}`);
      if (clients[feishu_app_id]) clients[feishu_app_id].connected = true;
    },
    onReconnecting: () => {
      logger.log('info', `WebSocket 重连中: app_id=${feishu_app_id}`);
      if (clients[feishu_app_id]) clients[feishu_app_id].connected = false;
    },
    onReconnected: () => {
      logger.log('info', `WebSocket 重连成功: app_id=${feishu_app_id}`);
      if (clients[feishu_app_id]) clients[feishu_app_id].connected = true;
    },
    onError: (err) => {
      logger.log('error', `WebSocket 错误: app_id=${feishu_app_id}`, err.message);
      if (clients[feishu_app_id]) clients[feishu_app_id].connected = false;
    }
  });

  clients[feishu_app_id] = { wsClient, eventDispatcher, connected: false };

  try {
    await wsClient.start({ eventDispatcher });
  } catch (e) {
    if (clients[feishu_app_id]) clients[feishu_app_id].connected = false;
    throw e;
  }
}

function stop(appId) {
  const client = clients[appId];
  if (!client) return;
  try {
    client.wsClient.close({ force: true });
  } catch {
    // ignore
  }
  delete clients[appId];
  logger.log('info', `WebSocket 已关闭: app_id=${appId}`);
}

function isConnected(appId) {
  return !!(clients[appId] && clients[appId].connected);
}

async function startAll() {
  const bindings = store.getAll();
  for (const b of bindings) {
    if (b.feishu_app_id && b.feishu_app_secret) {
      start(b).catch(e =>
        logger.log('error', `启动绑定 WebSocket 失败: ${b.process_name}`, e.message)
      );
    }
  }
}

module.exports = { start, stop, isConnected, startAll };
