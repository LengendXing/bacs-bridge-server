const express = require('express');
const router = express.Router();
const wsClient = require('../feishu/ws-client');

// 飞书路由仅保留健康检查，事件接收已迁移到 WebSocket 长连接
// ws-client.js 在服务启动时自动恢复所有绑定连接

router.get('/api/ws-status', (req, res) => {
  const store = require('../binding/store');
  const bindings = store.getAll();
  const status = bindings.map(b => ({
    process_name: b.process_name,
    feishu_app_id: b.feishu_app_id,
    ws_connected: !!wsClient.isConnected(b.feishu_app_id)
  }));
  res.json({ code: 0, data: status });
});

module.exports = router;
