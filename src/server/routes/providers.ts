/**
 * @module routes/providers
 * @description 服务商 CRUD + 模型列表自动拉取
 *
 * 服务商代表一个 AI API 网关（如 Anthropic 官方、OpenAI 官方、自建代理）。
 * 创建/编辑后自动调用该服务商的 /v1/models API 拉取模型列表。
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import https from 'https';
import { getDb } from '../db/index.js';
import { providers, models } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';

const router = Router();

// ── 所有服务商接口均需认证（逐路由挂载，避免拦截 SSE 等其他 router 的请求） ──

/**
 * GET /api/providers
 *
 * 列出所有服务商（api_key 脱敏）
 */
router.get('/api/providers', requireAuth, (_req, res) => {
  const db = getDb();
  const all = db.select().from(providers).all();
  // api_key 脱敏：只显示前6位和后4位
  const safe = all.map(p => ({
    ...p,
    apiKey: p.apiKey ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}` : null,
  }));
  res.json({ code: 0, data: safe });
});

/**
 * POST /api/providers
 *
 * 新建服务商
 * - kind='local' → 不需要 base_url / api_key
 * - kind='custom' → 必须提供 base_url + api_key
 * - 创建后自动拉取模型列表
 */
router.post('/api/providers', requireAuth, async (req, res) => {
  const { name, kind, baseUrl, apiKey } = req.body;

  if (!name) {
    return res.json({ code: 1003, message: '请填写服务商名称' });
  }

  if (kind === 'custom' && (!baseUrl || !apiKey)) {
    return res.json({ code: 1003, message: '自定义模式需填写请求地址和密钥' });
  }

  const db = getDb();

  try {
    const result = db.insert(providers).values({
      name,
      kind: kind || 'custom',
      baseUrl: kind === 'local' ? null : baseUrl,
      apiKey: kind === 'local' ? null : apiKey,
    }).run();

    const providerId = Number(result.lastInsertRowid);
    logger.log('info', `服务商创建: ${name} (id=${providerId})`);

    // 自动拉取模型列表（custom 模式）
    if (kind === 'custom' && baseUrl && apiKey) {
      try {
        await fetchModelsForProvider(providerId, baseUrl, apiKey);
      } catch (e: any) {
        logger.log('warn', `服务商 ${name} 模型拉取失败`, e.message);
      }
    }

    const provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
    res.json({ code: 0, data: provider });
  } catch (e: any) {
    logger.log('error', '服务商创建失败', e.message);
    res.json({ code: 1001, message: '创建失败: ' + e.message });
  }
});

/**
 * PUT /api/providers/:id
 *
 * 编辑服务商（修改 base_url/api_key 后自动重新拉取模型）
 */
router.put('/api/providers/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.json({ code: 1003, message: '无效的 ID' });
  }

  const { name, kind, baseUrl, apiKey } = req.body;
  const db = getDb();

  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '服务商不存在' });
  }

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (name) updates.name = name;
  if (kind) updates.kind = kind;
  if (kind === 'local') {
    updates.baseUrl = null;
    updates.apiKey = null;
  } else {
    if (baseUrl !== undefined) updates.baseUrl = baseUrl;
    if (apiKey !== undefined) updates.apiKey = apiKey;
  }

  db.update(providers).set(updates).where(eq(providers.id, id)).run();

  // 如果修改了 base_url 或 api_key，重新拉取模型
  const newBaseUrl = updates.baseUrl ?? existing.baseUrl;
  const newApiKey = updates.apiKey ?? existing.apiKey;
  if (newBaseUrl && newApiKey) {
    try {
      await fetchModelsForProvider(id, newBaseUrl, newApiKey);
    } catch (e: any) {
      logger.log('warn', `服务商 id=${id} 模型重新拉取失败`, e.message);
    }
  }

  const updated = db.select().from(providers).where(eq(providers.id, id)).get();
  logger.log('info', `服务商编辑: id=${id}`);
  res.json({ code: 0, data: updated });
});

/**
 * DELETE /api/providers/:id
 *
 * 删除服务商（级联删除其模型列表）
 */
router.delete('/api/providers/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.json({ code: 1003, message: '无效的 ID' });
  }

  const db = getDb();
  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '服务商不存在' });
  }

  db.delete(providers).where(eq(providers.id, id)).run();
  logger.log('info', `服务商删除: ${existing.name} (id=${id})`);
  res.json({ code: 0, message: '已删除' });
});

// ════════════════════════════════════════════════════════════════════
// 模型列表拉取工具函数
// ════════════════════════════════════════════════════════════════════

/**
 * 调用服务商 /v1/models API 拉取模型列表并入库
 *
 * 先删除该服务商旧模型，再插入新模型。
 * 自动推断每个模型的 cliKind（cc / codex）。
 *
 * @param providerId - 服务商 ID
 * @param baseUrl - API 请求地址
 * @param apiKey - API 密钥
 */
async function fetchModelsForProvider(providerId: number, baseUrl: string, apiKey: string): Promise<void> {
  // 标准化 URL
  let url = baseUrl.replace(/\/+$/, '');
  if (!url.endsWith('/v1/models')) {
    url = url.includes('/v1') ? `${url}/models` : `${url}/v1/models`;
  }

  const modelsData = await fetchModelsApi(url, apiKey);
  const db = getDb();

  // 先删除旧模型
  db.delete(models).where(eq(models.providerId, providerId)).run();

  // 插入新模型
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

  logger.log('info', `服务商 id=${providerId} 拉取到 ${modelsData.length} 个模型`);
}

/**
 * 调用 /v1/models API（兼容 OpenAI 和 Anthropic 风格）
 *
 * @param url - 完整的 /v1/models URL
 * @param apiKey - API 密钥
 * @returns 模型数组 [{ id, name }]
 */
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
        } catch (e) {
          reject(new Error(`模型 API 响应解析失败: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('模型 API 请求超时')); });
    req.end();
  });
}

/**
 * 根据模型 ID 和 URL 推断 cliKind
 *
 * - 模型名含 claude / URL 含 anthropic → 'cc'
 * - 模型名含 gpt / o1 / o3 / o4 / URL 含 openai → 'codex'
 * - 默认 → 'cc'
 */
function inferCliKind(modelId: string, baseUrl: string): 'cc' | 'codex' {
  const lower = modelId.toLowerCase();
  const urlLower = baseUrl.toLowerCase();

  if (lower.includes('claude') || urlLower.includes('anthropic')) return 'cc';
  if (lower.includes('gpt') || /^o[134]/.test(lower) || urlLower.includes('openai')) return 'codex';

  return 'cc';
}

export default router;
