/**
 * @module routes/bots
 * @description Bots 管理 CRUD —— 多平台机器人凭据统一存储（v1.1.10 引入）
 *
 * 当前仅 feishu 平台有实际数据，Telegram / QQ / 微信 为后续扩展占位。
 *
 * 路由：
 * - GET    /api/bots?platform=feishu  列表（secret 脱敏）
 * - POST   /api/bots                  新建
 * - PUT    /api/bots/:id              编辑（备注必可改）
 * - DELETE /api/bots/:id              删除
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { bots } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';

const router = Router();

const SUPPORTED_PLATFORMS = ['feishu', 'telegram', 'qq', 'wechat'] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 6) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-2)}`;
}

/**
 * GET /api/bots?platform=feishu
 *
 * 列出指定平台下的所有 Bot（secret 脱敏）
 */
router.get('/api/bots', requireAuth, (req, res) => {
  const platform = String(req.query.platform || 'feishu') as Platform;
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return res.json({ code: 1003, message: '不支持的平台' });
  }
  const db = getDb();
  const list = db.select().from(bots).where(eq(bots.platform, platform)).all();
  const safe = list.map((b) => ({
    ...b,
    secret: maskSecret(b.secret),
  }));
  res.json({ code: 0, data: safe });
});

/**
 * POST /api/bots
 *
 * 新建 Bot
 */
router.post('/api/bots', requireAuth, (req, res) => {
  const { platform, name, appId, secret, remark } = req.body || {};
  if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
    return res.json({ code: 1003, message: '不支持的平台' });
  }
  if (!name || !String(name).trim()) {
    return res.json({ code: 1003, message: '请填写机器人名称' });
  }
  const db = getDb();
  try {
    const result = db
      .insert(bots)
      .values({
        platform,
        name: String(name).trim(),
        appId: appId ? String(appId).trim() : null,
        secret: secret ? String(secret).trim() : null,
        remark: remark ? String(remark) : null,
      })
      .run();
    const id = Number(result.lastInsertRowid);
    const row = db.select().from(bots).where(eq(bots.id, id)).get();
    logger.log('info', `Bot 创建: ${platform}/${name} (id=${id})`);
    res.json({ code: 0, data: row });
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.json({ code: 1001, message: '同平台下机器人名称已存在' });
    }
    res.json({ code: 1001, message: '创建失败: ' + (e?.message || 'unknown') });
  }
});

/**
 * PUT /api/bots/:id
 *
 * 编辑 Bot（备注必可改；其他字段如传入则更新）
 */
router.put('/api/bots/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.json({ code: 1003, message: '无效的 ID' });

  const db = getDb();
  const existing = db.select().from(bots).where(eq(bots.id, id)).get();
  if (!existing) return res.json({ code: 1004, message: 'Bot 不存在' });

  const { name, appId, secret, remark } = req.body || {};
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (name !== undefined) updates.name = String(name).trim();
  if (appId !== undefined) updates.appId = appId ? String(appId).trim() : null;
  if (secret !== undefined) updates.secret = secret ? String(secret).trim() : null;
  if (remark !== undefined) updates.remark = remark === null ? null : String(remark);

  try {
    db.update(bots).set(updates).where(eq(bots.id, id)).run();
    const updated = db.select().from(bots).where(eq(bots.id, id)).get();
    logger.log('info', `Bot 更新: ${existing.platform}/${existing.name} (id=${id})`);
    res.json({ code: 0, data: updated });
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.json({ code: 1001, message: '同平台下机器人名称已存在' });
    }
    res.json({ code: 1001, message: '更新失败: ' + (e?.message || 'unknown') });
  }
});

/**
 * DELETE /api/bots/:id
 *
 * 删除 Bot
 */
router.delete('/api/bots/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.json({ code: 1003, message: '无效的 ID' });

  const db = getDb();
  const existing = db.select().from(bots).where(eq(bots.id, id)).get();
  if (!existing) return res.json({ code: 1004, message: 'Bot 不存在' });

  db.delete(bots).where(eq(bots.id, id)).run();
  logger.log('info', `Bot 删除: ${existing.platform}/${existing.name} (id=${id})`);
  res.json({ code: 0, message: '已删除' });
});

export default router;
