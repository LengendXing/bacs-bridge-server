/**
 * @module routes/logs
 * @description 日志查询 + SSE 实时推送
 *
 * 提供三个端点：
 * 1. GET /api/logs        — 查询审计日志（从 audit_logs 表）
 * 2. GET /api/logs/system  — 查询系统运行日志（从日志文件读取）
 * 3. GET /api/logs/stream  — SSE 实时日志推送（tail -f）
 */

import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { getDb } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyToken } from '../auth/jwt.js';
import logger from '../middleware/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();

// ── SSE 端点单独认证（支持 query token，因为 EventSource 不支持自定义 header） ──
router.get('/api/logs/stream', (req, res) => {
  // 从 query 或 header 取 token
  const token = (req.query.token as string) || req.headers['x-auth-token'] as string || req.cookies?.auth_token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // 初始 heartbeat

  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logDir, `bridge-${today}.log`);

  if (!fs.existsSync(logFile)) {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logFile, '');
  }

  const tail = spawn('tail', ['-f', '-n', '0', logFile], { stdio: ['ignore', 'pipe', 'ignore'] });

  tail.stdout.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      let data: any;
      try {
        data = JSON.parse(line);
      } catch {
        data = { raw: line };
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });

  req.on('close', () => { tail.kill(); });
});

// ── 其他日志接口均需认证 ──
router.use(requireAuth);

// ── ESM-safe __dirname ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 日志文件目录 */
const logDir = path.resolve(__dirname, '../../../logs');

/**
 * GET /api/logs
 *
 * 查询审计日志，按时间倒序，默认返回最近 100 条
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
 */
router.get('/api/logs/system', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 1000);

  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logDir, `bridge-${today}.log`);

  if (!fs.existsSync(logFile)) {
    return res.json({ code: 0, data: [] });
  }

  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-limit);

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
