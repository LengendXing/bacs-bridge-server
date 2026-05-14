/**
 * @module routes/timeline
 * @description 消息时间线查询 + SSE 实时推送
 *
 * GET /api/timeline        — 查询最近 N 条时间线记录
 * GET /api/timeline/stream — SSE 实时推送新消息
 * POST /api/timeline       — 写入一条记录（内部调用，由 channel 层触发）
 */

import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { chatTimeLine } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyToken } from '../auth/jwt.js';
import type { Response } from 'express';

const router = Router();

// ── SSE 订阅者集合 ──
const subscribers = new Set<Response>();

/**
 * 向所有 SSE 订阅者广播新 timeline 事件。
 * 由 channel 层在消息写入 DB 后调用。
 */
export function broadcastTimeline(entry: {
  id: number;
  platform: string;
  targetIp: string;
  processName: string;
  content: string;
  createdAt: string | null;
}): void {
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(data);
    } catch {
      subscribers.delete(res);
    }
  }
}

// ── GET /api/timeline — 查询最近 20 条 ──
router.get('/api/timeline', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .select()
    .from(chatTimeLine)
    .orderBy(desc(chatTimeLine.id))
    .limit(20)
    .all()
    .reverse(); // 最旧的在前，最新的在后（前端从下往上展示倒序）
  res.json({ code: 0, data: rows });
});

// ── GET /api/timeline/stream — SSE 实时推送 ──
router.get('/api/timeline/stream', (req, res) => {
  const token =
    (req.query.token as string) ||
    (req.headers['x-auth-token'] as string) ||
    req.cookies?.auth_token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');

  subscribers.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(':hb\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
});

export default router;
