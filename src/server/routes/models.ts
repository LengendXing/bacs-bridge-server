/**
 * @module routes/models
 * @description 模型列表查询 + 刷新
 *
 * 模型数据由服务商创建时自动拉取。
 * 此路由提供按服务商筛选查询 + 手动刷新功能。
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import https from 'https';
import { getDb } from '../db/index.js';
import { providers, models } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';

const router = Router();

/**
 * GET /api/models?providerId=X
 *
 * 查询模型列表
 * - 不带 providerId → 返回所有模型
 * - 带 providerId → 返回指定服务商的模型
 */
router.get('/api/models', requireAuth, (req, res) => {
  const db = getDb();
  const providerId = req.query.providerId ? parseInt(req.query.providerId as string, 10) : undefined;

  let result;
  if (providerId && !isNaN(providerId)) {
    result = db.select().from(models).where(eq(models.providerId, providerId)).all();
  } else {
    result = db.select().from(models).all();
  }

  res.json({ code: 0, data: result });
});

/**
 * POST /api/models/refresh/:providerId
 *
 * 手动刷新指定服务商的模型列表
 * - 调用服务商 /v1/models API
 * - 替换该服务商的所有模型记录
 */
router.post('/api/models/refresh/:providerId', requireAuth, async (req, res) => {
  const providerId = parseInt(req.params.providerId as string, 10);
  if (isNaN(providerId)) {
    return res.json({ code: 1003, message: '无效的服务商 ID' });
  }

  const db = getDb();
  const provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
  if (!provider) {
    return res.json({ code: 1004, message: '服务商不存在' });
  }

  if (provider.kind === 'local' || !provider.baseUrl || !provider.apiKey) {
    return res.json({ code: 1003, message: '本地服务商无法拉取模型列表' });
  }

  try {
    await refreshProviderModels(providerId, provider.baseUrl, provider.apiKey);
    const updated = db.select().from(models).where(eq(models.providerId, providerId)).all();
    res.json({ code: 0, data: updated });
  } catch (e: any) {
    logger.log('error', `服务商 id=${providerId} 模型刷新失败`, e.message);
    res.json({ code: 1001, message: '模型刷新失败: ' + e.message });
  }
});

/**
 * PUT /api/models/:id/cli-kind
 *
 * 手动覆盖模型的 cliKind 标记
 */
router.put('/api/models/:id/cli-kind', requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { cliKind } = req.body;

  if (isNaN(id)) {
    return res.json({ code: 1003, message: '无效的模型 ID' });
  }

  if (cliKind !== 'cc' && cliKind !== 'codex') {
    return res.json({ code: 1003, message: 'cliKind 只能是 cc 或 codex' });
  }

  const db = getDb();
  db.update(models).set({ cliKind }).where(eq(models.id, id)).run();

  const updated = db.select().from(models).where(eq(models.id, id)).get();
  res.json({ code: 0, data: updated });
});

// ════════════════════════════════════════════════════════════════════
// 工具函数（与 providers.ts 同逻辑，提取为共享函数后续优化）
// ════════════════════════════════════════════════════════════════════

async function refreshProviderModels(providerId: number, baseUrl: string, apiKey: string): Promise<void> {
  let url = baseUrl.replace(/\/+$/, '');
  if (!url.endsWith('/v1/models')) {
    url = url.includes('/v1') ? `${url}/models` : `${url}/v1/models`;
  }

  const modelsData = await fetchModelsApi(url, apiKey);
  const db = getDb();

  db.delete(models).where(eq(models.providerId, providerId)).run();

  const now = new Date().toISOString();
  for (const m of modelsData) {
    const cliKind = inferCliKind(m.id, baseUrl);
    db.insert(models).values({
      providerId,
      modelId: m.id,
      displayName: m.name || m.id,
      cliKind,
      fetchedAt: now,
    }).run();
  }

  logger.log('info', `服务商 id=${providerId} 模型刷新，拉取 ${modelsData.length} 个模型`);
}

function fetchModelsApi(url: string, apiKey: string): Promise<Array<{ id: string; name?: string }>> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const list = json.data || json.models || [];
          resolve(list.map((m: any) => ({
            id: m.id || m.name,
            name: m.display_name || m.name || m.id,
          })));
        } catch {
          reject(new Error(`模型 API 响应解析失败`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('模型 API 请求超时')); });
    req.end();
  });
}

function inferCliKind(modelId: string, baseUrl: string): 'cc' | 'codex' {
  const lower = modelId.toLowerCase();
  const urlLower = baseUrl.toLowerCase();
  if (lower.includes('claude') || urlLower.includes('anthropic')) return 'cc';
  if (lower.includes('gpt') || /^o[134]/.test(lower) || urlLower.includes('openai')) return 'codex';
  return 'cc';
}

export default router;
