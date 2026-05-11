/**
 * @module routes/settings
 * @description 应用级设置接口（KV 表 app_settings）
 *
 * - GET  /api/settings/external-url  读取对外服务地址
 * - PUT  /api/settings/external-url  保存对外服务地址
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';

const router = Router();

const KEY_EXTERNAL_URL = 'external_url';

/**
 * 推断当前请求的对外地址（优先 X-Forwarded-* 反代头），格式 `proto://host[:port]`，无尾斜杠。
 */
export function inferRequestOrigin(req: import('express').Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim()
    || req.protocol
    || 'http';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim()
    || (req.headers.host as string)
    || 'localhost';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/** 读取一个 setting 值；不存在返回 null */
export function readSetting(key: string): string | null {
  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

/** 写入一个 setting（upsert） */
function writeSetting(key: string, value: string): void {
  const db = getDb();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(appSettings.key, key))
      .run();
  } else {
    db.insert(appSettings).values({ key, value }).run();
  }
}

router.get('/api/settings/external-url', requireAuth, (_req, res) => {
  res.json({ code: 0, data: { externalUrl: readSetting(KEY_EXTERNAL_URL) || '' } });
});

router.put('/api/settings/external-url', requireAuth, (req, res) => {
  const raw = (req.body?.externalUrl as string | undefined) ?? '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed && !/^https?:\/\/[^\s/]+/.test(trimmed)) {
    return res.json({ code: 1003, message: '地址格式错误，必须以 http:// 或 https:// 开头' });
  }
  writeSetting(KEY_EXTERNAL_URL, trimmed);
  logger.log('info', `app_settings.external_url 已更新: ${trimmed || '(清空)'}`);
  res.json({ code: 0, data: { externalUrl: trimmed } });
});

export default router;
