const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config').load();
const logger = require('./middleware/logger');

const feishuRoutes = require('./routes/feishu');
const adminRoutes = require('./routes/admin');

const app = express();

// ── 中间件 ──
app.use(cors());
app.use(express.json());
app.use(logger.middleware);

// ── 静态文件（管理面板） ──
app.use('/admin', express.static(path.join(__dirname, '..', '..', 'admin')));

// ── 路由 ──
app.use('/', feishuRoutes);
app.use('/', adminRoutes);

// ── 健康检查 ──
app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', version: require('../package.json').version });
});

// ── 启动 ──
const { port, host } = config.server;
app.listen(port, host, () => {
  logger.log('info', 'Bridge Server 启动', { host, port });
  console.log(`Bridge Server 运行在 http://${host}:${port}`);
  console.log(`管理面板: http://${host}:${port}/admin/`);

  // 恢复所有已绑定的 WebSocket 连接
  const wsClient = require('./feishu/ws-client');
  wsClient.startAll().catch(e =>
    logger.log('error', '恢复 WebSocket 连接失败', e.message)
  );
});
