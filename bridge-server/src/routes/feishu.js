const express = require('express');
const router = express.Router();
const cryptoUtil = require('../feishu/crypto');
const sender = require('../feishu/sender');
const store = require('../binding/store');
const comm = require('../process/communicator');
const logger = require('../middleware/logger');
const config = require('../config').load();

// 运行中的进度定时器: processName → { timerId, startTime }
const progressTimers = {};

// 已捕获的输出内容: processName → accumulatedOutput
const accumulatedOutput = {};

router.post('/webhook/feishu', (req, res) => {
  const body = req.body;

  // ── 1. URL 验证（首次配置事件订阅时） ──
  const challenge = cryptoUtil.handleChallenge(body);
  if (challenge) {
    logger.log('info', '飞书 URL 验证');
    return res.json(challenge);
  }

  // ── 2. 签名验证 ──
  if (!cryptoUtil.verify(req)) {
    logger.log('warn', '飞书签名验证失败');
    return res.status(401).json({ code: 1002, message: '签名验证失败' });
  }

  // ── 3. 解密消息 ──
  const payload = cryptoUtil.decrypt(body);
  logger.log('info', '飞书事件', { event_type: payload?.header?.event_type });

  // ── 4. 快速响应飞书（避免超时重试） ──
  res.json({ code: 0, message: 'ok' });

  // ── 5. 处理消息事件 ──
  if (!payload?.header?.event_type || payload.header.event_type !== 'im.message.receive_v1') {
    return;
  }

  const event = payload.event;
  const msgContent = event?.message?.content;
  if (!msgContent) return;

  // 解析消息文本
  let msgText = '';
  try {
    const parsed = JSON.parse(msgContent);
    msgText = parsed.text || '';
  } catch {
    msgText = String(msgContent);
  }

  if (!msgText.trim()) return;

  const chatId = event.message.chat_id;
  const userId = event.sender?.sender_id?.user_id;

  // ── 6. 查找绑定 ──
  const byChat = store.getByTarget(chatId);
  const byUser = userId ? store.getByTarget(userId) : null;
  const binding = byChat || byUser;

  if (!binding) {
    // 未绑定，回复提示
    const targetId = chatId || userId;
    const targetType = chatId ? 'chat_id' : 'user_id';
    sender.sendText(targetType, targetId, '该对话未绑定任何 Claude Code 进程。请通过管理面板绑定。').catch(e =>
      logger.log('error', '发送未绑定提示失败', e.message)
    );
    return;
  }

  // ── 7. 检查进程在线状态 ──
  if (!comm.sessionExists(binding.process_name)) {
    const targetId = chatId || userId;
    const targetType = chatId ? 'chat_id' : 'user_id';
    sender.sendText(targetType, targetId, `进程 [${binding.process_name}] 已离线`).catch(e =>
      logger.log('error', '发送离线提示失败', e.message)
    );
    return;
  }

  // ── 8. 发送消息到 CC 进程 ──
  const result = comm.sendInput(binding.process_name, msgText);
  if (result.error) {
    logger.log('error', '发送消息到进程失败', result.error);
    return;
  }
  logger.log('info', `消息已路由到进程 ${binding.process_name}`);

  // ── 9. 启动进度汇报定时器 ──
  accumulatedOutput[binding.process_name] = '';
  let elapsed = 0;
  const targetId = chatId || userId;
  const targetType = chatId ? 'chat_id' : 'user_id';

  const timerId = setInterval(() => {
    elapsed += config.bridge.progress_interval;
    if (elapsed >= config.bridge.timeout) {
      // 超时
      clearInterval(timerId);
      delete progressTimers[binding.process_name];
      comm.stopPolling(binding.process_name);
      const card = sender.buildTimeoutCard(binding.process_name, elapsed);
      sender.sendCard(targetType, targetId, card).catch(e =>
        logger.log('error', '发送超时卡片失败', e.message)
      );
      return;
    }
    const res = comm.captureOutput(binding.process_name, 200);
    const snippet = res.output || '(暂无输出)';
    const card = sender.buildProgressCard(binding.process_name, elapsed, snippet);
    sender.sendCard(targetType, targetId, card).catch(e =>
      logger.log('error', '发送进度卡片失败', e.message)
    );
  }, config.bridge.progress_interval * 1000);

  progressTimers[binding.process_name] = { timerId, startTime: Date.now() };

  // ── 10. 监听 CC 输出，检测完成 ──
  comm.startPolling(binding.process_name, (delta) => {
    accumulatedOutput[binding.process_name] += delta;

    // 简单策略: 停止输出超过 2 个轮询周期即视为回复完成
    // 使用 debounce: 每次有新输出重置等待
    const pendingTimer = comm._pendingComplete?.[binding.process_name];
    if (pendingTimer) clearTimeout(pendingTimer);
    if (!comm._pendingComplete) comm._pendingComplete = {};

    comm._pendingComplete[binding.process_name] = setTimeout(() => {
      const full = accumulatedOutput[binding.process_name] || '';
      // 清理进度定时器
      if (progressTimers[binding.process_name]) {
        clearInterval(progressTimers[binding.process_name].timerId);
        delete progressTimers[binding.process_name];
      }
      comm.stopPolling(binding.process_name);
      // 发送完整回复
      sender.sendText(targetType, targetId, full).catch(e =>
        logger.log('error', '发送完整回复失败', e.message)
      );
      logger.log('info', `回复已发送到 ${targetType}:${targetId}`);
      delete accumulatedOutput[binding.process_name];
    }, config.bridge.poll_interval * 3 * 1000); // 2*3=6s 无新输出视为完成
  });
});

module.exports = router;
