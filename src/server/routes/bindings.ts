/**
 * @module routes/bindings
 * @description 绑定关系 CRUD + 生命周期管理
 *
 * 绑定 = 一个 CLI 进程（tmux 会话）↔ 一个飞书应用。
 * 本模块提供 5 个端点：
 *
 * 1. GET  /api/status    — 列出所有绑定（含在线状态、WS 连接状态、关联服务商/模型）
 * 2. POST /api/bind      — 新建绑定：创建 tmux 会话 + 启动 WS
 * 3. POST /api/bind/mount — 挂载已有 tmux 会话 + 启动 WS
 * 4. POST /api/edit      — 编辑绑定（飞书凭据变更则重启 WS）
 * 5. POST /api/unbind    — 解绑：关闭 WS + 可选杀死 tmux 会话
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { bindings, providers, models, auditLogs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import { buildCliConfig, startCliProcess, listAllSessions } from '../session/manager.js';
import { getAdapter } from '../cli/factory.js';
import { killSession } from '../cli/base.js';
import { getChannel } from '../channel/router.js';

const router = Router();

// ── 所有绑定接口均需认证 ──
router.use(requireAuth);

/**
 * GET /api/status
 *
 * 列出所有绑定记录，附带运行时状态：
 * - status: 'online' / 'offline'（基于 tmux 会话是否存在）
 * - wsConnected: 飞书 WebSocket 是否已连接
 * - provider / model: 关联的服务商和模型信息
 * - feishuAppSecret 脱敏
 */
router.get('/api/status', (_req, res) => {
  const db = getDb();
  const allBindings = db.select().from(bindings).all();
  const allSessions = listAllSessions();

  const result = allBindings.map((b) => {
    const adapter = getAdapter(b.cliKind);
    const sessionName = `${adapter.sessionPrefix}-${b.processName}`;
    const isOnline = allSessions.includes(sessionName);
    let wsConnected = false;
    if (b.feishuAppId) {
      const channel = getChannel('feishu');
      wsConnected = channel?.isConnected(b.feishuAppId) ?? false;
    }

    // 查询关联的服务商
    let provider = null;
    if (b.providerId) {
      provider = db.select().from(providers).where(eq(providers.id, b.providerId)).get() ?? null;
      // 脱敏
      if (provider?.apiKey) {
        provider = { ...provider, apiKey: `${provider.apiKey.slice(0, 6)}...${provider.apiKey.slice(-4)}` };
      }
    }

    // 查询关联的模型
    let model = null;
    if (b.modelId) {
      model = db.select().from(models).where(eq(models.id, b.modelId)).get() ?? null;
    }

    return {
      id: b.id,
      processName: b.processName,
      cliKind: b.cliKind,
      providerId: b.providerId,
      modelId: b.modelId,
      feishuAppId: b.feishuAppId,
      feishuAppSecret: b.feishuAppSecret
        ? `${b.feishuAppSecret.slice(0, 4)}****`
        : null,
      status: isOnline ? 'online' : 'offline',
      wsConnected,
      provider,
      model,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  });

  res.json({ code: 0, data: result });
});

/**
 * POST /api/bind
 *
 * 新建绑定：创建 tmux 会话 + 启动飞书 WS 长连接
 *
 * 请求体：
 * - processName: 进程名（必须）
 * - cliKind: CLI 类型 'cc' | 'codex'
 * - providerId: 服务商 ID（可选，null = 本机环境变量）
 * - modelId: 模型 ID（可选）
 * - feishuAppId: 飞书 App ID（必须）
 * - feishuAppSecret: 飞书 App Secret（必须）
 */
router.post('/api/bind', async (req, res) => {
  const { processName, cliKind, providerId, modelId, feishuAppId, feishuAppSecret } = req.body;

  if (!processName) {
    return res.json({ code: 1003, message: '请填写进程名' });
  }
  if (!feishuAppId || !feishuAppSecret) {
    return res.json({ code: 1003, message: '请填写飞书 App ID 和 App Secret' });
  }

  const db = getDb();

  // 检查进程名是否重复
  const existing = db.select().from(bindings).where(eq(bindings.processName, processName)).get();
  if (existing) {
    return res.json({ code: 1003, message: `进程名 ${processName} 已被占用` });
  }

  // 构造绑定记录
  const id = uuid();
  const kind = cliKind || 'cc';

  // 先创建绑定记录（状态 offline）
  try {
    db.insert(bindings).values({
      id,
      processName,
      cliKind: kind,
      providerId: providerId || null,
      modelId: modelId || null,
      feishuAppId,
      feishuAppSecret,
      status: 'offline',
    }).run();
  } catch (e: any) {
    logger.log('error', '绑定创建失败', e.message);
    return res.json({ code: 1001, message: '创建失败: ' + e.message });
  }

  // 查询完整绑定记录（用于 buildCliConfig）
  const binding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
  const cfg = buildCliConfig(binding);

  // 启动 CLI 进程
  const startResult = startCliProcess(processName, kind, cfg);
  if (!startResult.ok) {
    // 启动失败，删除刚创建的记录
    db.delete(bindings).where(eq(bindings.id, id)).run();
    logger.log('error', `启动 CLI 进程失败: ${processName}`, startResult.error);
    return res.json({ code: 1001, message: startResult.error || 'CLI 进程启动失败' });
  }

  // 更新状态为 online
  db.update(bindings).set({ status: 'online', updatedAt: new Date().toISOString() }).where(eq(bindings.id, id)).run();

  // 启动飞书 WS 连接
  const channel = getChannel('feishu');
  if (channel) {
    try {
      const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
      await channel.start(updatedBinding);
    } catch (e: any) {
      logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
      // WS 失败不阻塞绑定创建，仅记录
    }
  }

  // 审计日志
  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_create',
    target: processName,
    detail: `cliKind=${kind}, feishuAppId=${feishuAppId}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定创建成功: ${processName} (${kind})`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

/**
 * POST /api/bind/mount
 *
 * 挂载已有 tmux 会话：不创建新 CLI 进程，仅启动飞书 WS 连接
 *
 * 请求体：
 * - processName: 进程名（必须是已存在的 tmux 会话）
 * - cliKind: CLI 类型
 * - providerId / modelId: 可选
 * - feishuAppId: 飞书 App ID（必须）
 * - feishuAppSecret: 飞书 App Secret（必须）
 */
router.post('/api/bind/mount', async (req, res) => {
  const { processName, cliKind, providerId, modelId, feishuAppId, feishuAppSecret } = req.body;

  if (!processName) {
    return res.json({ code: 1003, message: '请填写进程名' });
  }
  if (!feishuAppId || !feishuAppSecret) {
    return res.json({ code: 1003, message: '请填写飞书 App ID 和 App Secret' });
  }

  const kind = cliKind || 'cc';
  const adapter = getAdapter(kind);
  const sessionName = `${adapter.sessionPrefix}-${processName}`;

  // 检查 tmux 会话是否存在
  if (!adapter.sessionExists(processName)) {
    return res.json({ code: 1004, message: `tmux 会话 ${sessionName} 不存在，请先启动 CLI 进程` });
  }

  const db = getDb();

  // 检查进程名是否已被绑定
  const existing = db.select().from(bindings).where(eq(bindings.processName, processName)).get();
  if (existing) {
    return res.json({ code: 1003, message: `进程名 ${processName} 已被绑定` });
  }

  // 创建绑定记录
  const id = uuid();
  try {
    db.insert(bindings).values({
      id,
      processName,
      cliKind: kind,
      providerId: providerId || null,
      modelId: modelId || null,
      feishuAppId,
      feishuAppSecret,
      status: 'online', // 已有 tmux 会话，直接标记 online
    }).run();
  } catch (e: any) {
    logger.log('error', '挂载绑定失败', e.message);
    return res.json({ code: 1001, message: '挂载失败: ' + e.message });
  }

  // 启动飞书 WS 连接
  const channel = getChannel('feishu');
  if (channel) {
    try {
      const binding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
      await channel.start(binding);
    } catch (e: any) {
      logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
    }
  }

  // 审计日志
  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_mount',
    target: processName,
    detail: `cliKind=${kind}, mount existing session`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定挂载成功: ${processName} (${kind})`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

/**
 * POST /api/edit
 *
 * 编辑绑定：更新飞书凭据 / 服务商 / 模型
 * - 飞书凭据变更 → 关闭旧 WS + 启动新 WS
 * - 服务商/模型变更 → 下次会话时生效（无需重启 tmux）
 *
 * 请求体：
 * - id: 绑定 ID（必须）
 * - feishuAppId / feishuAppSecret / providerId / modelId: 可选更新字段
 */
router.post('/api/edit', async (req, res) => {
  const { id, feishuAppId, feishuAppSecret, providerId, modelId } = req.body;

  if (!id) {
    return res.json({ code: 1003, message: '请提供绑定 ID' });
  }

  const db = getDb();
  const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  // 构建更新字段
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (feishuAppId !== undefined) updates.feishuAppId = feishuAppId;
  if (feishuAppSecret !== undefined) updates.feishuAppSecret = feishuAppSecret;
  if (providerId !== undefined) updates.providerId = providerId || null;
  if (modelId !== undefined) updates.modelId = modelId || null;

  db.update(bindings).set(updates).where(eq(bindings.id, id)).run();

  // 飞书凭据变更 → 重启 WS
  const wsNeedsRestart =
    (feishuAppId !== undefined && feishuAppId !== existing.feishuAppId) ||
    (feishuAppSecret !== undefined && feishuAppSecret !== existing.feishuAppSecret);

  if (wsNeedsRestart) {
    const channel = getChannel('feishu');
    // 关闭旧 WS
    if (channel && existing.feishuAppId) {
      channel.stop(existing.feishuAppId);
    }
    // 启动新 WS
    if (channel && updates.feishuAppId && updates.feishuAppSecret) {
      try {
        const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
        await channel.start(updatedBinding);
      } catch (e: any) {
        logger.log('error', `飞书 WS 重启失败: ${existing.processName}`, e.message);
      }
    }
  }

  // 审计日志
  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_edit',
    target: existing.processName,
    detail: `updated: ${Object.keys(updates).filter(k => k !== 'updatedAt').join(', ')}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定编辑: ${existing.processName}`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

/**
 * POST /api/unbind
 *
 * 解绑：关闭飞书 WS + 可选杀死 tmux 会话 + 删除绑定记录
 *
 * 请求体：
 * - id: 绑定 ID（必须）
 * - killProcess: 是否杀死 tmux 会话（默认 false）
 */
router.post('/api/unbind', async (req, res) => {
  const { id, killProcess } = req.body;

  if (!id) {
    return res.json({ code: 1003, message: '请提供绑定 ID' });
  }

  const db = getDb();
  const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  // 关闭飞书 WS
  const channel = getChannel('feishu');
  if (channel && existing.feishuAppId) {
    channel.stop(existing.feishuAppId);
  }

  // 杀死 tmux 会话
  if (killProcess) {
    try {
      const adapter = getAdapter(existing.cliKind);
      const sessionName = `${adapter.sessionPrefix}-${existing.processName}`;
      killSession(sessionName);
    } catch (e: any) {
      logger.log('warn', `杀死 tmux 会话失败: ${existing.processName}`, e.message);
    }
  }

  // 删除绑定记录
  db.delete(bindings).where(eq(bindings.id, id)).run();

  // 审计日志
  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_delete',
    target: existing.processName,
    detail: `killProcess=${!!killProcess}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定已解绑: ${existing.processName}`);
  res.json({ code: 0, message: '已解绑' });
});

export default router;
