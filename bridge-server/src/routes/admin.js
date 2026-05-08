const express = require('express');
const router = express.Router();
const store = require('../binding/store');
const manager = require('../process/manager');
const comm = require('../process/communicator');
const logger = require('../middleware/logger');
const wsClient = require('../feishu/ws-client');
const config = require('../config').load();

// 简单 token 管理（服务端存储，重启则失效）
let authTokens = {};

// 登录验证中间件
function checkAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token && authTokens[token]) {
    return next();
  }
  res.status(401).json({ code: 1002, message: '未登录或会话已过期' });
}

// ── POST /api/auth ── 密码登录
router.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const adminPassword = config.server.admin_password || 'dabendi5201314scx';

  if (!password) {
    return res.json({ code: 1003, message: '请输入密码' });
  }

  if (password !== adminPassword) {
    return res.json({ code: 1002, message: '密码错误' });
  }

  const token = require('crypto').randomUUID();
  authTokens[token] = Date.now();
  logger.log('info', '管理面板登录成功');
  res.json({ code: 0, data: { token } });
});

// ── POST /api/logout ── 退出登录
router.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) delete authTokens[token];
  res.json({ code: 0, message: '已退出' });
});

// ── GET /api/status ── 查看所有进程状态
router.get('/api/status', checkAuth, (req, res) => {
  const status = manager.getStatus();
  const sessions = comm.listSessions();
  const bound = new Set(status.map(s => s.process_name));
  for (const s of sessions) {
    if (!bound.has(s)) {
      status.push({ process_name: s, feishu_app_id: null, status: 'online' });
    }
  }
  // 注入 ws_connected 状态
  for (const b of status) {
    if (b.feishu_app_id) {
      b.ws_connected = wsClient.isConnected(b.feishu_app_id);
    } else {
      b.ws_connected = false;
    }
  }
  res.json({ code: 0, data: status });
});

// ── POST /api/bind ── 创建绑定
router.post('/api/bind', checkAuth, (req, res) => {
  const { process_name, feishu_app_id, feishu_app_secret } = req.body;
  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    return res.json({ code: 1003, message: '缺少必填参数 process_name / feishu_app_id / feishu_app_secret' });
  }

  const result = store.create({ process_name, feishu_app_id, feishu_app_secret });
  if (result.error) {
    return res.json({ code: 1001, message: result.error });
  }

  // 自动标记在线状态
  if (comm.sessionExists(process_name)) {
    store.updateStatus(process_name, 'online');
  }

  // 启动 WebSocket 长连接
  wsClient.start(result.binding).catch(e =>
    logger.log('error', `启动 WebSocket 失败: ${process_name}`, e.message)
  );

  logger.log('info', `绑定创建: ${process_name} ↔ app_id=${feishu_app_id}`);
  res.json({ code: 0, data: result.binding });
});

// ── POST /api/unbind ── 解除绑定
router.post('/api/unbind', checkAuth, (req, res) => {
  const { process_name } = req.body;
  if (!process_name) {
    return res.json({ code: 1003, message: '缺少必填参数 process_name' });
  }

  // 先停止 WebSocket 连接
  const binding = store.getByProcess(process_name);
  if (binding && binding.feishu_app_id) {
    wsClient.stop(binding.feishu_app_id);
  }

  const result = store.remove(process_name);
  if (result.error) {
    return res.json({ code: 1004, message: result.error });
  }

  logger.log('info', `绑定解除: ${process_name}`);
  res.json({ code: 0, data: result.binding });
});

// ── GET /api/logs ── 查看最近日志
router.get('/api/logs', checkAuth, (req, res) => {
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
router.get('/api/sessions', checkAuth, (req, res) => {
  const sessions = comm.listSessions();
  res.json({ code: 0, data: sessions });
});

module.exports = router;
