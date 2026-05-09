const express = require('express');
const router = express.Router();
const store = require('../binding/store');
const manager = require('../process/manager');
const comm = require('../process/communicator');
const logger = require('../middleware/logger');
const wsClient = require('../feishu/ws-client');
const config = require('../config').load();

let authTokens = {};

function checkAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token && authTokens[token]) return next();
  res.status(401).json({ code: 1002, message: '未登录或会话已过期' });
}

// ── POST /api/auth ──
router.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const adminPassword = config.server.admin_password || 'admin';
  if (!password) return res.json({ code: 1003, message: '请输入密码' });
  if (password !== adminPassword) return res.json({ code: 1002, message: '密码错误' });
  const token = require('crypto').randomUUID();
  authTokens[token] = Date.now();
  logger.log('info', '管理面板登录成功');
  res.json({ code: 0, data: { token } });
});

// ── POST /api/logout ──
router.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) delete authTokens[token];
  res.json({ code: 0, message: '已退出' });
});

// ── GET /api/status ──
router.get('/api/status', checkAuth, (req, res) => {
  const status = manager.getStatus();
  const sessions = comm.listSessions();
  const bound = new Set(status.map(s => s.process_name));
  for (const s of sessions) {
    if (!bound.has(s)) {
      status.push({ process_name: s, feishu_app_id: null, status: 'online' });
    }
  }
  for (const b of status) {
    b.ws_connected = b.feishu_app_id ? wsClient.isConnected(b.feishu_app_id) : false;
  }
  res.json({ code: 0, data: status });
});

// ── POST /api/bind ── 新建绑定（自动创建 CC 进程）
router.post('/api/bind', checkAuth, async (req, res) => {
  const { process_name, feishu_app_id, feishu_app_secret, claude_mode, claude_base_url, claude_api_key } = req.body;

  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    return res.json({ code: 1003, message: '缺少必填参数 process_name / feishu_app_id / feishu_app_secret' });
  }

  // 进程名合法性检查（只允许字母数字下划线横线）
  if (!/^[a-zA-Z0-9_-]+$/.test(process_name)) {
    return res.json({ code: 1003, message: '进程名只允许字母、数字、下划线、横线' });
  }

  // 重名校验：tmux 已有同名会话
  if (comm.sessionExists(process_name)) {
    return res.json({ code: 1001, message: `tmux 会话 claude-${process_name} 已存在，请换一个进程名或使用「挂载已有进程」` });
  }

  // 重名校验：bindings.json 已有记录
  const existingBinding = store.getByProcess(process_name);
  if (existingBinding) {
    return res.json({ code: 1001, message: `进程名 ${process_name} 已被绑定，请换一个名称` });
  }

  // 飞书 App ID 重复校验
  const existingApp = store.getByAppId(feishu_app_id);
  if (existingApp) {
    return res.json({ code: 1001, message: `飞书 App ID ${feishu_app_id} 已被进程 ${existingApp.process_name} 绑定` });
  }

  // 自定义模式必填校验
  if (claude_mode === 'custom' && (!claude_base_url || !claude_api_key)) {
    return res.json({ code: 1003, message: '自定义模式需填写 Base URL 和 API Key' });
  }

  // 启动 CC 进程
  const startResult = manager.start(process_name, {
    claude_mode: claude_mode || 'env',
    claude_base_url: claude_mode === 'custom' ? claude_base_url : null,
    claude_api_key: claude_mode === 'custom' ? claude_api_key : null,
  });

  if (startResult.error) {
    return res.json({ code: 1001, message: `启动 CC 进程失败: ${startResult.error}` });
  }

  // 写入 bindings.json
  const result = store.create({
    process_name,
    feishu_app_id,
    feishu_app_secret,
    claude_mode: claude_mode || 'env',
    claude_base_url: claude_mode === 'custom' ? claude_base_url : null,
    claude_api_key: claude_mode === 'custom' ? claude_api_key : null,
  });

  if (result.error) {
    // 回滚：杀掉刚起的 CC 进程
    try { require('child_process').execSync(`tmux kill-session -t claude-${process_name}`, { stdio: 'ignore' }); } catch {}
    return res.json({ code: 1001, message: result.error });
  }

  // 启动 WebSocket 长连接
  wsClient.start(result.binding).catch(e => {
    logger.log('error', `启动 WebSocket 失败: ${process_name}`, e.message);
    // WS 启动失败 → 回滚 binding + 进程
    store.remove(process_name);
    try { require('child_process').execSync(`tmux kill-session -t claude-${process_name}`, { stdio: 'ignore' }); } catch {}
  });

  logger.log('info', `绑定创建+进程启动: ${process_name} ↔ app_id=${feishu_app_id} mode=${claude_mode || 'env'}`);
  res.json({ code: 0, data: result.binding });
});

// ── POST /api/bind/mount ── 挂载已有 tmux 进程（不创建新进程）
router.post('/api/bind/mount', checkAuth, (req, res) => {
  const { process_name, feishu_app_id, feishu_app_secret, claude_mode, claude_base_url, claude_api_key } = req.body;

  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    return res.json({ code: 1003, message: '缺少必填参数' });
  }

  // 必须已有 tmux 会话
  if (!comm.sessionExists(process_name)) {
    return res.json({ code: 1004, message: `tmux 会话 claude-${process_name} 不存在，请先在终端启动 CC 进程` });
  }

  // binding 不能重复
  if (store.getByProcess(process_name)) {
    return res.json({ code: 1001, message: `进程名 ${process_name} 已绑定，可使用编辑修改` });
  }
  if (store.getByAppId(feishu_app_id)) {
    return res.json({ code: 1001, message: `飞书 App ID 已被其他进程绑定` });
  }

  const result = store.create({
    process_name,
    feishu_app_id,
    feishu_app_secret,
    claude_mode: claude_mode || 'env',
    claude_base_url: claude_mode === 'custom' ? claude_base_url : null,
    claude_api_key: claude_mode === 'custom' ? claude_api_key : null,
  });

  if (result.error) return res.json({ code: 1001, message: result.error });

  wsClient.start(result.binding).catch(e =>
    logger.log('error', `启动 WebSocket 失败: ${process_name}`, e.message)
  );

  store.updateStatus(process_name, 'online');
  logger.log('info', `挂载已有进程: ${process_name} ↔ app_id=${feishu_app_id}`);
  res.json({ code: 0, data: result.binding });
});

// ── POST /api/edit ── 编辑绑定（进程名不可改）
router.post('/api/edit', checkAuth, (req, res) => {
  const { process_name, feishu_app_id, feishu_app_secret, claude_mode, claude_base_url, claude_api_key } = req.body;

  if (!process_name) {
    return res.json({ code: 1003, message: '缺少 process_name' });
  }

  if (claude_mode === 'custom' && (!claude_base_url || !claude_api_key)) {
    return res.json({ code: 1003, message: '自定义模式需填写 Base URL 和 API Key' });
  }

  // 如果 App ID 有变化，检查新 App ID 是否已被其他进程使用
  if (feishu_app_id) {
    const existing = store.getByAppId(feishu_app_id);
    if (existing && existing.process_name !== process_name) {
      return res.json({ code: 1001, message: `飞书 App ID 已被进程 ${existing.process_name} 使用` });
    }
  }

  const updates = {};
  if (feishu_app_id) updates.feishu_app_id = feishu_app_id;
  if (feishu_app_secret) updates.feishu_app_secret = feishu_app_secret;
  if (claude_mode) updates.claude_mode = claude_mode;
  updates.claude_base_url = claude_mode === 'custom' ? (claude_base_url || null) : null;
  updates.claude_api_key = claude_mode === 'custom' ? (claude_api_key || null) : null;

  // 取旧 binding（edit 之前），用于停止旧 WS 连接
  const oldBinding = store.getByProcess(process_name);

  const result = store.edit(process_name, updates);
  if (result.error) return res.json({ code: 1004, message: result.error });

  // 停止旧 WS（用旧 app_id）
  if (oldBinding && oldBinding.feishu_app_id) {
    wsClient.stop(oldBinding.feishu_app_id);
  }
  wsClient.start(result.binding).catch(e =>
    logger.log('error', `编辑后重启 WebSocket 失败: ${process_name}`, e.message)
  );

  logger.log('info', `绑定编辑: ${process_name}`);
  res.json({ code: 0, data: result.binding });
});

// ── POST /api/unbind ── 解绑（可选同时停止进程）
router.post('/api/unbind', checkAuth, (req, res) => {
  const { process_name, kill_process } = req.body;
  if (!process_name) return res.json({ code: 1003, message: '缺少 process_name' });

  const binding = store.getByProcess(process_name);
  if (binding && binding.feishu_app_id) {
    wsClient.stop(binding.feishu_app_id);
  }

  const result = store.remove(process_name);
  if (result.error) return res.json({ code: 1004, message: result.error });

  // kill_process 默认 true（闭环管理）
  if (kill_process !== false) {
    try {
      require('child_process').execSync(`tmux kill-session -t claude-${process_name} 2>/dev/null || true`, { stdio: 'ignore', shell: '/bin/bash' });
      comm.stopPolling(process_name);
    } catch {}
  }

  logger.log('info', `绑定解除: ${process_name}, kill_process=${kill_process !== false}`);
  res.json({ code: 0, data: result.binding });
});

// ── GET /api/logs ──
router.get('/api/logs', checkAuth, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const logDir = path.join(__dirname, '..', '..', 'logs');
  const todayFile = `${new Date().toISOString().slice(0, 10)}.log`;
  const logPath = path.join(logDir, todayFile);
  try {
    if (!fs.existsSync(logPath)) return res.json({ code: 0, data: [] });
    const raw = fs.readFileSync(logPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-100);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
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

// ── GET /api/sessions/unbound ── 列出未绑定的 tmux 会话（用于挂载）
router.get('/api/sessions/unbound', checkAuth, (req, res) => {
  const sessions = comm.listSessions();
  const bindings = store.getAll();
  const boundNames = new Set(bindings.map(b => b.process_name));
  const unbound = sessions.filter(s => !boundNames.has(s));
  res.json({ code: 0, data: unbound });
});

module.exports = router;
