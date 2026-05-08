const { WSClient, EventDispatcher, Domain, LoggerLevel } = require('@larksuiteoapi/node-sdk');
const comm = require('../process/communicator');
const store = require('../binding/store');
const logger = require('../middleware/logger');
const config = require('../config').load();

// 运行中的客户端: appId → { wsClient, eventDispatcher, connected }
const clients = {};

// 运行中的进度定时器: processName → { timerId, startTime }
const progressTimers = {};

// 已捕获的输出内容: processName → accumulatedOutput
const accumulatedOutput = {};

// 处理来消息的标记: processName → true (防止并发)
const pendingRequests = {};

// 发送消息并启动进度跟踪
function handleIncomingMessage(binding, event) {
  const { process_name, feishu_app_id, feishu_app_secret } = binding;
  const message = event?.message;
  if (!message || message.message_type !== 'text') return;

  const msgText = JSON.parse(message.content || '{}').text || '';
  if (!msgText.trim()) return;

  const chatId = message.chat_id;
  const targetId = chatId || event?.sender?.sender_id?.open_id;
  const targetType = chatId ? 'chat_id' : 'open_id';

  if (!targetId) return;

  if (!comm.sessionExists(process_name)) {
    require('./sender').sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `进程 [${process_name}] 已离线`)
      .catch(e => logger.log('error', '发送离线提示失败', e.message));
    return;
  }

  // 防止并发请求
  if (pendingRequests[process_name]) {
    require('./sender').sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `进程 [${process_name}] 正在处理上一条消息，请稍后再试`)
      .catch(e => logger.log('error', '发送忙提示失败', e.message));
    return;
  }
  pendingRequests[process_name] = true;

  const result = comm.sendInput(process_name, msgText);
  if (result.error) {
    pendingRequests[process_name] = false;
    logger.log('error', '发送消息到进程失败', result.error);
    return;
  }
  logger.log('info', `消息已路由到进程 ${process_name}`);

  const sender = require('./sender');
  accumulatedOutput[process_name] = '';
  let elapsed = 0;
  let progressTimerId = null;

  function clearProgressTimer() {
    if (progressTimerId) {
      clearInterval(progressTimerId);
      progressTimerId = null;
    }
  }

  function startProgressTimer() {
    if (progressTimerId) return;
    progressTimerId = setInterval(() => {
      elapsed += config.bridge.progress_interval;
      if (elapsed >= config.bridge.timeout) {
        clearProgressTimer();
        comm.stopPolling(process_name);
        pendingRequests[process_name] = false;
        const card = sender.buildTimeoutCard(process_name, elapsed);
        sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
          .catch(e => logger.log('error', '发送超时卡片失败', e.message));
        return;
      }
      const card = sender.buildProgressCard(process_name, elapsed, msgText);
      sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
        .catch(e => logger.log('error', '发送进度卡片失败', e.message));
    }, config.bridge.progress_interval * 1000);
    progressTimers[process_name] = { timerId: progressTimerId, startTime: Date.now() };
  }

  function finishAndReply() {
    clearProgressTimer();
    if (progressTimers[process_name]) {
      clearInterval(progressTimers[process_name].timerId);
      delete progressTimers[process_name];
    }
    comm.stopPolling(process_name);
    pendingRequests[process_name] = false;

    const full = accumulatedOutput[process_name] || '';
    const reply = comm.extractReplyContent(full, msgText);
    if (reply) {
      sender.sendMarkdown(feishu_app_id, feishu_app_secret, targetType, targetId, reply)
        .catch(e => logger.log('error', '发送完整回复失败', e.message));
    } else {
      sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
        '[CC 回复内容为空]')
        .catch(e => logger.log('error', '发送空回复提示失败', e.message));
    }
    logger.log('info', `回复已发送到 ${targetType}:${targetId}`);
    delete accumulatedOutput[process_name];
  }

  // 稳定性检测：输出停更 N 秒 + ❯ 提示符 = CC 已完成
  comm.startPolling(process_name, (delta) => {
    accumulatedOutput[process_name] += delta;

    if (!comm.isIdle(process_name)) {
      // CC 正在处理中
      startProgressTimer();
    }

    // 重置稳定定时器
    if (comm._pendingComplete?.[process_name]) {
      clearTimeout(comm._pendingComplete[process_name]);
    }
    if (!comm._pendingComplete) comm._pendingComplete = {};

    comm._pendingComplete[process_name] = setTimeout(() => {
      // 输出停更 N 秒后，确认 CC 空闲再发送
      if (comm.isIdle(process_name)) {
        finishAndReply();
      }
      // 如果仍不在空闲状态，不发送，等下一次 output 变化再判断
    }, config.bridge.poll_interval * 3 * 1000);
  });

  // 存储进度定时器引用（用于外部清除）
  const actualTimer = setInterval(() => {}, 99999999); // placeholder, real timer is progressTimerId
  clearInterval(actualTimer);
  progressTimers[process_name] = { timerId: actualTimer, startTime: Date.now() };
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
    logger.log('info', `[WSEvent] 收到事件: type=${event?.event_type}`, JSON.stringify(event || {}));
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

  logger.log('info', `已注册事件监听: ${knownEvents.join(', ')}`);

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
      clients[feishu_app_id].connected = true;
    },
    onReconnecting: () => {
      logger.log('info', `WebSocket 重连中: app_id=${feishu_app_id}`);
      clients[feishu_app_id].connected = false;
    },
    onReconnected: () => {
      logger.log('info', `WebSocket 重连成功: app_id=${feishu_app_id}`);
      clients[feishu_app_id].connected = true;
    },
    onError: (err) => {
      logger.log('error', `WebSocket 错误: app_id=${feishu_app_id}`, err.message);
      clients[feishu_app_id].connected = false;
    }
  });

  clients[feishu_app_id] = { wsClient, eventDispatcher, connected: false };

  try {
    await wsClient.start({ eventDispatcher });
  } catch (e) {
    if (clients[feishu_app_id]) {
      clients[feishu_app_id].connected = false;
    }
    throw e;
  }
}

function stop(appId) {
  const client = clients[appId];
  if (!client) return;

  try {
    client.wsClient.close({ force: true });
  } catch (e) {
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
