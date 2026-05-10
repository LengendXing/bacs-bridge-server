/**
 * @module routes/logs
 * @description 日志查询
 *
 * 提供两个端点：
 * 1. GET /api/logs       — 查询审计日志（从 audit_logs 表）
 * 2. GET /api/logs/system — 查询系统运行日志（从日志文件读取）
 */

import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();

// ── 所有日志接口均需认证 ──
router.use(requireAuth);

// ── ESM-safe __dirname ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/logs
 *
 * 查询审计日志，按时间倒序，默认返回最近 100 条
 *
 * Query params:
 * - limit: 返回条数（默认 100，最大 500）
 * - action: 按操作类型筛选（如 'login', 'bind_create' 等）
 */
router.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
  const action = req.query.action as string | undefined;

  const db = getDb();

  if (action) {
    const rows = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, action))
      .orderBy(desc(auditLogs.id))
      .limit(limit)
      .all();
    return res.json({ code: 0, data: rows });
  }

  const rows = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit)
    .all();
  res.json({ code: 0, data: rows });
});

/**
 * GET /api/logs/system
 *
 * 读取当天系统日志文件的最近 N 行
 *
 * Query params:
 * - limit: 返回条数（默认 200，最大 1000）
 */
router.get('/api/logs/system', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 1000);

  // 日志文件路径: logs/bridge-YYYY-MM-DD.log
  const today = new Date().toISOString().slice(0, 10);
  const logDir = path.resolve(__dirname, '../../../logs');
  const logFile = path.join(logDir, `bridge-${today}.log`);

  if (!fs.existsSync(logFile)) {
    return res.json({ code: 0, data: [] });
  }

  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-limit);

    // 尝试解析为 JSON
    const parsed = recent.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });

    res.json({ code: 0, data: parsed });
  } catch (e: any) {
    logger.log('error', '读取系统日志失败', e.message);
    res.json({ code: 1001, message: '读取日志失败' });
  }
});

export default router;
