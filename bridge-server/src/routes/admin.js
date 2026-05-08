const express = require('express');
const router = express.Router();
const store = require('../binding/store');
const manager = require('../process/manager');
const comm = require('../process/communicator');
const logger = require('../middleware/logger');

// 本地白名单中间件
function localOnly(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }
  res.status(403).json({ code: 1002, message: '仅允许本地访问' });
}

// ── GET /api/status ── 查看所有进程状态
router.get('/api/status', localOnly, (req, res) => {
  const status = manager.getStatus();
  // 补充未绑定但在运行的进程
  const sessions = comm.listSessions();
  const bound = new Set(status.map(s => s.process_name));
  for (const s of sessions) {
    if (!bound.has(s)) {
      status.push({ process_name: s, feishu_target: null, feishu_type: null, status: 'online' });
    }
  }
  res.json({ code: 0, data: status });
});

// ── POST /api/bind ── 创建绑定
router.post('/api/bind', localOnly, (req, res) => {
  const { process_name, feishu_target, feishu_type } = req.body;
  if (!process_name || !feishu_target) {
    return res.json({ code: 1003, message: '缺少必填参数 process_name / feishu_target' });
  }
  const type = feishu_type || 'chat';
  if (!['chat', 'user'].includes(type)) {
    return res.json({ code: 1003, message: 'feishu_type 必须为 chat 或 user' });
  }

  const result = store.create({ process_name, feishu_target, feishu_type: type });
  if (result.error) {
    return res.json({ code: 1001, message: result.error });
  }

  // 自动标记在线状态
  if (comm.sessionExists(process_name)) {
    store.updateStatus(process_name, 'online');
  }

  logger.log('info', `绑定创建: ${process_name} ↔ ${feishu_target}`);
  res.json({ code: 0, data: result.binding });
});

// ── POST /api/unbind ── 解除绑定
router.post('/api/unbind', localOnly, (req, res) => {
  const { process_name } = req.body;
  if (!process_name) {
    return res.json({ code: 1003, message: '缺少必填参数 process_name' });
  }

  const result = store.remove(process_name);
  if (result.error) {
    return res.json({ code: 1004, message: result.error });
  }

  logger.log('info', `绑定解除: ${process_name}`);
  res.json({ code: 0, data: result.binding });
});

// ── GET /api/logs ── 查看最近日志（最后 100 行）
router.get('/api/logs', localOnly, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const logDir = path.join(__dirname, '..', '..', 'logs');
  const todayFile = `${new Date().toISOString().slice(0, 10)}.log`;
  const logPath = path.join(logDir, todayFile);

  try {
    if (!fs.existsSync(logPath)) {
      return res.json({ code: 0, data: [] });
    }
    const raw = fs.readFileSync(logPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-100);
    const entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
    res.json({ code: 0, data: entries });
  } catch (e) {
    res.json({ code: 0, data: [], message: e.message });
  }
});

// ── GET /api/sessions ── 列出所有 tmux 会话
router.get('/api/sessions', localOnly, (req, res) => {
  const sessions = comm.listSessions();
  res.json({ code: 0, data: sessions });
});

module.exports = router;
