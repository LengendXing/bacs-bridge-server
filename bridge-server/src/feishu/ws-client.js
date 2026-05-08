const WebSocket = require('ws');
const { getAccessToken } = require('./sender');
const comm = require('../process/communicator');
const store = require('../binding/store');
const logger = require('../middleware/logger');
const config = require('../config').load();

// 运行中的 WebSocket 客户端: appId → { ws, reconnectTimer, reconnecting }
const clients = {};

// 运行中的进度定时器: processName → { timerId, startTime }
const progressTimers = {};

// 已捕获的输出内容: processName → accumulatedOutput
const accumulatedOutput = {};

// 发送消息并启动进度跟踪
function handleIncomingMessage(binding, message, senderId) {
  const { process_name, feishu_app_id, feishu_app_secret } = binding;
  const msgContent = message?.content;
  if (!msgContent) return;

  let msgText = '';
  try {
    const parsed = JSON.parse(msgContent);
    msgText = parsed.text || '';
  } catch {
    msgText = String(msgContent);
  }

  if (!msgText.trim()) return;

  const chatId = message.chat_id;
  const targetId = chatId || senderId;
  const targetType = chatId ? 'chat_id' : 'user_id';

  if (!comm.sessionExists(process_name)) {
    require('./sender').sendText(feishu_app_id, feishu_app_secret, targetType, targetId,
      `进程 [${process_name}] 已离线`)
      .catch(e => logger.log('error', '发送离线提示失败', e.message));
    return;
  }

  const result = comm.sendInput(process_name, msgText);
  if (result.error) {
    logger.log('error', '发送消息到进程失败', result.error);
    return;
  }
  logger.log('info', `消息已路由到进程 ${process_name}`);

  const sender = require('./sender');
  accumulatedOutput[process_name] = '';
  let elapsed = 0;

  const timerId = setInterval(() => {
    elapsed += config.bridge.progress_interval;
    if (elapsed >= config.bridge.timeout) {
      clearInterval(timerId);
      delete progressTimers[process_name];
      comm.stopPolling(process_name);
      const card = sender.buildTimeoutCard(process_name, elapsed);
      sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
        .catch(e => logger.log('error', '发送超时卡片失败', e.message));
      return;
    }
    const res = comm.captureOutput(process_name, 200);
    const snippet = res.output || '(暂无输出)';
    const card = sender.buildProgressCard(process_name, elapsed, snippet);
    sender.sendCard(feishu_app_id, feishu_app_secret, targetType, targetId, card)
      .catch(e => logger.log('error', '发送进度卡片失败', e.message));
  }, config.bridge.progress_interval * 1000);

  progressTimers[process_name] = { timerId, startTime: Date.now() };

  comm.startPolling(process_name, (delta) => {
    accumulatedOutput[process_name] += delta;

    const pendingTimer = comm._pendingComplete?.[process_name];
    if (pendingTimer) clearTimeout(pendingTimer);
    if (!comm._pendingComplete) comm._pendingComplete = {};

    comm._pendingComplete[process_name] = setTimeout(() => {
      const full = accumulatedOutput[process_name] || '';
      if (progressTimers[process_name]) {
        clearInterval(progressTimers[process_name].timerId);
        delete progressTimers[process_name];
      }
      comm.stopPolling(process_name);
      sender.sendText(feishu_app_id, feishu_app_secret, targetType, targetId, full)
        .catch(e => logger.log('error', '发送完整回复失败', e.message));
      logger.log('info', `回复已发送到 ${targetType}:${targetId}`);
      delete accumulatedOutput[process_name];
    }, config.bridge.poll_interval * 3 * 1000);
  });
}

// 为指定 binding 启动 WebSocket 长连接
async function start(binding) {
  const { feishu_app_id, feishu_app_secret, process_name } = binding;

  if (clients[feishu_app_id]) {
    logger.log('warn', `WebSocket 客户端已存在: app_id=${feishu_app_id}`);
    return;
  }

  async function connect() {
    try {
      const token = await getAccessToken(feishu_app_id, feishu_app_secret);

      const https = require('https');
      const wsUrl = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'open.feishu.cn',
          path: '/open-apis/event/v1/ws/url',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 404) {
              reject(new Error('WebSocket API 不可用(404)：请确认已在飞书开放平台开启"使用长连接接收事件"'));
              return;
            }
            try {
              const json = JSON.parse(data);
              if (json.code === 0 && json.data?.url) {
                resolve(json.data.url);
              } else {
                reject(new Error(`获取 WebSocket URL 失败: ${json.msg || data}`));
              }
            } catch (e) {
              reject(new Error(`API 响应解析失败 (HTTP ${res.statusCode}): ${data.slice(0, 100)}`));
            }
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({}));
        req.end();
      });

      logger.log('info', `WebSocket 连接中: app_id=${feishu_app_id}`);

      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        logger.log('info', `WebSocket 已连接: app_id=${feishu_app_id}, process=${process_name}`);
        clients[feishu_app_id] = { ws, reconnectTimer: null, reconnecting: false };
      });

      ws.on('message', (rawData) => {
        try {
          const data = JSON.parse(rawData.toString());
          const eventType = data?.header?.event_type;

          if (eventType === 'im.message.receive_v1') {
            const binding = store.getByAppId(feishu_app_id);
            if (!binding) return;

            const event = data.event;
            const senderId = event?.sender?.sender_id?.user_id;
            const message = event?.message;

            if (message?.sender_type === 'bot') return;

            handleIncomingMessage(binding, message, senderId);
          }
        } catch (e) {
          logger.log('error', 'WebSocket 消息解析失败', e.message);
        }
      });

      ws.on('close', (code) => {
        logger.log('warn', `WebSocket 断开: app_id=${feishu_app_id}, code=${code}`);
        delete clients[feishu_app_id];

        if (store.getByAppId(feishu_app_id)) {
          setTimeout(() => {
            if (store.getByAppId(feishu_app_id)) {
              logger.log('info', `WebSocket 重连中: app_id=${feishu_app_id}`);
              connect().catch(e => logger.log('error', 'WebSocket 重连失败', e.message));
            }
          }, 5000);
        }
      });

      ws.on('error', (err) => {
        logger.log('error', `WebSocket 错误: app_id=${feishu_app_id}`, err.message);
      });

    } catch (e) {
      logger.log('error', `WebSocket 启动失败: app_id=${feishu_app_id}`, e.message);
      // 30秒后重试
      setTimeout(() => {
        if (store.getByAppId(feishu_app_id)) {
          connect().catch(() => {});
        }
      }, 30000);
    }
  }

  await connect();
}

function stop(appId) {
  const client = clients[appId];
  if (!client) return;

  if (client.ws) {
    client.ws.close();
  }
  delete clients[appId];
  logger.log('info', `WebSocket 已关闭: app_id=${appId}`);
}

function isConnected(appId) {
  return !!(clients[appId] && clients[appId].ws?.readyState === WebSocket.OPEN);
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
