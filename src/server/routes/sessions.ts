/**
 * @module routes/sessions
 * @description tmux 会话查询
 *
 * 提供两个端点：
 * 1. GET /api/sessions         — 列出所有 CLI 类型的 tmux 会话
 * 2. GET /api/sessions/unbound — 列出未绑定的 tmux 会话（可供挂载）
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAllSessions, listUnboundSessions } from '../session/manager.js';

const router = Router();

// ── 所有会话接口均需认证 ──
router.use(requireAuth);

/**
 * GET /api/sessions
 *
 * 列出所有 CLI 类型的 tmux 会话名（cc-xxx / codex-xxx）
 */
router.get('/api/sessions', (_req, res) => {
  const sessions = listAllSessions();
  res.json({ code: 0, data: sessions });
});

/**
 * GET /api/sessions/unbound
 *
 * 列出未绑定的 tmux 会话名，用于前端「挂载已有进程」下拉选项
 */
router.get('/api/sessions/unbound', (_req, res) => {
  const unbound = listUnboundSessions();
  res.json({ code: 0, data: unbound });
});

export default router;
