import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { bindings, bindingGroups, providers, models, machines, auditLogs, bots } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import { buildCliConfig, startCliProcess } from '../session/manager.js';
import { getAdapter } from '../cli/factory.js';
import { getExecutor } from '../executor/factory.js';
import { getChannel } from '../channel/router.js';

const router = Router();

/**
 * v1.1.14：根据请求体解析绑定所需的飞书凭据。
 *
 * 优先使用 botId（新建/编辑绑定的标准路径）；缺失时回退到旧字段 feishuAppId/Secret（兼容期）。
 *
 * @returns
 *   - 成功：{ ok: true, botId, appId, secret, botName, platform }
 *     - botId 可能为 null（旧客户端只传 feishuAppId/Secret 时）
 *   - 失败：{ ok: false, message }
 */
function resolveBotCredentials(
  db: ReturnType<typeof getDb>,
  body: Record<string, any>
):
  | {
      ok: true;
      botId: number | null;
      appId: string;
      secret: string;
      botName: string | null;
      platform: string;
    }
  | { ok: false; message: string } {
  const rawBotId = body?.botId;
  const botId =
    rawBotId === undefined || rawBotId === null || rawBotId === ''
      ? null
      : Number(rawBotId);

  if (botId !== null) {
    if (!Number.isFinite(botId) || botId <= 0) {
      return { ok: false, message: 'botId 无效' };
    }
    const bot = db.select().from(bots).where(eq(bots.id, botId)).get();
    if (!bot) {
      return { ok: false, message: `Bot (id=${botId}) 不存在` };
    }
    if (!bot.appId || !bot.secret) {
      return {
        ok: false,
        message: `Bot ${bot.platform}/${bot.name} 缺少 appId 或 secret，请先到 Bots 页面补全`,
      };
    }
    return {
      ok: true,
      botId: bot.id,
      appId: bot.appId,
      secret: bot.secret,
      botName: bot.name,
      platform: bot.platform,
    };
  }

  // 兼容期：旧客户端直接传 feishuAppId/Secret
  const appId = body?.feishuAppId ? String(body.feishuAppId).trim() : '';
  const secret = body?.feishuAppSecret ? String(body.feishuAppSecret).trim() : '';
  if (!appId || !secret) {
    return { ok: false, message: '请选择机器人（或填写飞书 App ID 和 App Secret）' };
  }
  return { ok: true, botId: null, appId, secret, botName: null, platform: 'feishu' };
}

router.get('/api/status', requireAuth, async (req, res) => {
  try {
    const db = getDb();

    const rawPage = Number.parseInt(String(req.query.page ?? ''), 10);
    const rawSize = Number.parseInt(String(req.query.pageSize ?? ''), 10);
    const paginated = Number.isFinite(rawPage) && rawPage > 0;
    const page = paginated ? rawPage : 1;
    const pageSize = paginated
      ? Math.min(Math.max(Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 10, 1), 100)
      : 0;

    const totalRow = db.select({ c: sql<number>`count(*)` }).from(bindings).get();
    const total = Number(totalRow?.c ?? 0);

    const pageBindings = paginated
      ? db.select().from(bindings).limit(pageSize).offset((page - 1) * pageSize).all()
      : db.select().from(bindings).all();

    const result = await Promise.all(pageBindings.map(async (b) => {
      const adapter = getAdapter(b.cliKind);
      let isOnline = false;
      try {
        const executor = await getExecutor(b.machineId);
        isOnline = await adapter.sessionExists(b.processName, executor);
      } catch {
        // machines 表不存在或 executor 获取失败，降级用本地
        try {
          const executor = await getExecutor(null);
          isOnline = await adapter.sessionExists(b.processName, executor);
        } catch { /* ignore */ }
      }

      let wsConnected = false;
      if (b.feishuAppId) {
        const channel = getChannel('feishu');
        wsConnected = channel?.isConnected(b.feishuAppId) ?? false;
      }

      let provider = null;
      if (b.providerId) {
        try {
          provider = db.select().from(providers).where(eq(providers.id, b.providerId)).get() ?? null;
          if (provider?.apiKey) {
            provider = { ...provider, apiKey: `${provider.apiKey.slice(0, 6)}...${provider.apiKey.slice(-4)}` };
          }
        } catch { /* providers 表不存在 */ }
      }

      let model = null;
      if (b.modelId) {
        try {
          model = db.select().from(models).where(eq(models.id, b.modelId)).get() ?? null;
        } catch { /* models 表不存在 */ }
      }

      let machineName: string | null = null;
      if (b.machineId) {
        try {
          const m = db.select().from(machines).where(eq(machines.id, b.machineId)).get();
          machineName = m?.name ?? null;
        } catch { /* machines 表不存在 */ }
      }

      // v1.1.14：关联 bots 表，前端列表展示「平台 / Bot 名称」替代裸 appId
      let botName: string | null = null;
      let botPlatform: string | null = null;
      if (b.botId) {
        try {
          const bot = db.select().from(bots).where(eq(bots.id, b.botId)).get();
          botName = bot?.name ?? null;
          botPlatform = bot?.platform ?? null;
        } catch { /* bots 表不存在 */ }
      }

      return {
        id: b.id,
        processName: b.processName,
        cliKind: b.cliKind,
        providerId: b.providerId,
        modelId: b.modelId,
        modelOverride: b.modelOverride,
        effort: b.effort,
        machineId: b.machineId ?? null,
        machineName,
        botId: b.botId ?? null,
        groupId: b.groupId ?? null,
        sortOrder: b.sortOrder ?? 0,
        botName,
        botPlatform,
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
    }));

    if (paginated) {
      res.json({ code: 0, data: { items: result, total, page, pageSize } });
    } else {
      res.json({ code: 0, data: result });
    }
  } catch (e: any) {
    logger.log('error', '获取绑定状态失败', e.message);
    res.json({ code: 1001, message: '获取状态失败: ' + e.message });
  }
});

router.get('/api/status/:id/detail', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const bindingId = req.params.id as string;
    const binding = db.select().from(bindings).where(eq(bindings.id, bindingId)).get();

    if (!binding) {
      res.json({ code: 1004, message: '绑定不存在' });
      return;
    }

    const adapter = getAdapter(binding.cliKind);
    const sessionName = `${adapter.sessionPrefix}-${binding.processName}`;

    let state: string = 'unknown';
    let paneOutput = '';
    let sessionExists = false;
    let conversationName = sessionName;

    try {
      let executor = null;
      if (binding.machineId) {
        try { executor = await getExecutor(binding.machineId); } catch { /* fall through */ }
      }
      if (!executor) {
        try { executor = await getExecutor(0); } catch { /* fall through */ }
      }
      if (executor) {
        sessionExists = await adapter.sessionExists(binding.processName, executor);
        if (sessionExists) {
          state = await adapter.detectState(binding.processName, executor);
          const capture = await adapter.capturePane(sessionName, 80, executor);
          paneOutput = capture.output || '';
          try {
            const cn = await adapter.getConversationName(binding.processName, executor);
            if (cn) conversationName = cn;
          } catch { /* keep tmux session name */ }
        }
      }
    } catch { /* runtime状态获取失败不影响详情返回 */ }

    // 查询关联数据
    let provider = null;
    if (binding.providerId) {
      provider = db.select().from(providers).where(eq(providers.id, binding.providerId)).get();
    }
    let model = null;
    if (binding.modelId) {
      model = db.select().from(models).where(eq(models.id, binding.modelId)).get();
    }
    let machine = null;
    if (binding.machineId) {
      machine = db.select({ name: machines.name }).from(machines).where(eq(machines.id, binding.machineId)).get();
    }
    let bot = null;
    if (binding.botId) {
      bot = db.select({ name: bots.name, platform: bots.platform, appId: bots.appId }).from(bots).where(eq(bots.id, binding.botId)).get();
    }

    res.json({
      code: 0,
      data: {
        id: binding.id,
        processName: binding.processName,
        cliKind: binding.cliKind,
        providerId: binding.providerId,
        modelId: binding.modelId,
        modelOverride: binding.modelOverride,
        effort: binding.effort,
        machineId: binding.machineId,
        machineName: machine?.name ?? null,
        botId: binding.botId,
        botName: bot?.name ?? null,
        botPlatform: bot?.platform ?? null,
        feishuAppId: binding.feishuAppId,
        status: sessionExists ? 'online' : 'offline',
        wsConnected: binding.feishuAppId
          ? (getChannel('feishu')?.isConnected(binding.feishuAppId) ?? false)
          : false,
        createdAt: binding.createdAt,
        updatedAt: binding.updatedAt,
        provider: provider ? { id: provider.id, name: provider.name } : null,
        model: model ? { id: model.id, modelId: model.modelId, displayName: model.displayName } : null,
        runtime: { state, paneOutput, sessionExists, sessionName: conversationName },
      },
    });
  } catch (e: any) {
    logger.log('error', '获取绑定详情失败', e.message);
    res.json({ code: 1001, message: '获取详情失败: ' + e.message });
  }
});

router.post('/api/bind', requireAuth, async (req, res) => {
  const { processName, cliKind, providerId, modelId, modelOverride, effort, machineId } = req.body;

  if (!processName) {
    return res.json({ code: 1003, message: '请填写进程名' });
  }

  const db = getDb();

  // v1.1.14：优先用 botId 解析凭据；旧字段 feishuAppId/Secret 兼容期保留
  const cred = resolveBotCredentials(db, req.body);
  if (!cred.ok) {
    return res.json({ code: 1003, message: cred.message });
  }

  const existing = db.select().from(bindings).where(eq(bindings.processName, processName)).get();
  if (existing) {
    return res.json({ code: 1003, message: `进程名 ${processName} 已被占用` });
  }

  const id = uuid();
  const kind = cliKind || 'cc';
  const resolvedMachineId = machineId || null;

  try {
    db.insert(bindings).values({
      id,
      processName,
      cliKind: kind,
      providerId: providerId || null,
      modelId: modelId || null,
      modelOverride: modelOverride || null,
      effort: effort || null,
      botId: cred.botId,
      feishuAppId: cred.appId,
      feishuAppSecret: cred.secret,
      machineId: resolvedMachineId,
      status: 'offline',
    }).run();
  } catch (e: any) {
    logger.log('error', '绑定创建失败', e.message);
    return res.json({ code: 1001, message: '创建失败: ' + e.message });
  }

  const binding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
  const cfg = buildCliConfig(binding);

  const startResult = await startCliProcess(processName, kind, cfg, resolvedMachineId);
  if (!startResult.ok) {
    db.delete(bindings).where(eq(bindings.id, id)).run();
    logger.log('error', `启动 CLI 进程失败: ${processName}`, startResult.error);
    return res.json({ code: 1001, message: startResult.error || 'CLI 进程启动失败' });
  }

  db.update(bindings).set({ status: 'online', updatedAt: new Date().toISOString() }).where(eq(bindings.id, id)).run();

  const channel = getChannel('feishu');
  if (channel) {
    try {
      const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
      await channel.start(updatedBinding);
    } catch (e: any) {
      logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
    }
  }

  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_create',
    target: processName,
    detail: `cliKind=${kind}, botId=${cred.botId ?? 'null'}, feishuAppId=${cred.appId}, machineId=${resolvedMachineId}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定创建成功: ${processName} (${kind})`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

router.post('/api/bind/mount', requireAuth, async (req, res) => {
  const { processName, cliKind, providerId, modelId, modelOverride, effort, machineId } = req.body;

  if (!processName) {
    return res.json({ code: 1003, message: '请填写进程名' });
  }

  const db = getDb();

  // v1.1.14：优先用 botId 解析凭据
  const cred = resolveBotCredentials(db, req.body);
  if (!cred.ok) {
    return res.json({ code: 1003, message: cred.message });
  }

  const kind = cliKind || 'cc';
  const adapter = getAdapter(kind);
  const resolvedMachineId = machineId || null;
  const executor = await getExecutor(resolvedMachineId);
  const sessionName = `${adapter.sessionPrefix}-${processName}`;

  if (!await adapter.sessionExists(processName, executor)) {
    return res.json({ code: 1004, message: `tmux 会话 ${sessionName} 不存在，请先启动 CLI 进程` });
  }

  const existing = db.select().from(bindings).where(eq(bindings.processName, processName)).get();
  if (existing) {
    return res.json({ code: 1003, message: `进程名 ${processName} 已被绑定` });
  }

  const id = uuid();
  try {
    db.insert(bindings).values({
      id,
      processName,
      cliKind: kind,
      providerId: providerId || null,
      modelId: modelId || null,
      modelOverride: modelOverride || null,
      effort: effort || null,
      botId: cred.botId,
      feishuAppId: cred.appId,
      feishuAppSecret: cred.secret,
      machineId: resolvedMachineId,
      status: 'online',
    }).run();
  } catch (e: any) {
    logger.log('error', '挂载绑定失败', e.message);
    return res.json({ code: 1001, message: '挂载失败: ' + e.message });
  }

  const channel = getChannel('feishu');
  if (channel) {
    try {
      const binding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
      await channel.start(binding);
    } catch (e: any) {
      logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
    }
  }

  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_mount',
    target: processName,
    detail: `cliKind=${kind}, botId=${cred.botId ?? 'null'}, mount existing session, machineId=${resolvedMachineId}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定挂载成功: ${processName} (${kind})`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

router.post('/api/edit', requireAuth, async (req, res) => {
  const { id, botId, feishuAppId, feishuAppSecret, providerId, modelId, modelOverride, effort, machineId } = req.body;

  if (!id) {
    return res.json({ code: 1003, message: '请提供绑定 ID' });
  }

  const db = getDb();
  const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };

  // v1.1.14：若 botId 提供（且与 existing 不同），从 bots 表查新凭据覆盖 feishuAppId/Secret
  if (botId !== undefined) {
    if (botId === null || botId === '') {
      updates.botId = null;
    } else {
      const newBotId = Number(botId);
      if (!Number.isFinite(newBotId) || newBotId <= 0) {
        return res.json({ code: 1003, message: 'botId 无效' });
      }
      const bot = db.select().from(bots).where(eq(bots.id, newBotId)).get();
      if (!bot) {
        return res.json({ code: 1004, message: `Bot (id=${newBotId}) 不存在` });
      }
      if (!bot.appId || !bot.secret) {
        return res.json({ code: 1003, message: `Bot ${bot.platform}/${bot.name} 缺少凭据` });
      }
      updates.botId = bot.id;
      updates.feishuAppId = bot.appId;
      updates.feishuAppSecret = bot.secret;
    }
  }

  // 旧字段兼容：botId 未提供时仍可单独改 feishuAppId/Secret
  if (feishuAppId !== undefined && feishuAppId !== '') updates.feishuAppId = feishuAppId;
  // 空字符串 = 不修改密钥（避免编辑表单留空覆盖原值）；显式 null = 清空
  if (feishuAppSecret !== undefined && feishuAppSecret !== '') updates.feishuAppSecret = feishuAppSecret;
  if (providerId !== undefined) updates.providerId = providerId || null;
  if (modelId !== undefined) updates.modelId = modelId || null;
  if (modelOverride !== undefined) updates.modelOverride = modelOverride || null;
  if (effort !== undefined) updates.effort = effort || null;
  if (machineId !== undefined) updates.machineId = machineId || null;

  db.update(bindings).set(updates).where(eq(bindings.id, id)).run();

  // 判断 CLI 配置是否变更（providerId / modelId / modelOverride / effort / machineId）
  const cliConfigChanged =
    (providerId !== undefined && (providerId || null) !== existing.providerId) ||
    (modelId !== undefined && (modelId || null) !== existing.modelId) ||
    (modelOverride !== undefined && (modelOverride || null) !== existing.modelOverride) ||
    (effort !== undefined && (effort || null) !== existing.effort) ||
    (machineId !== undefined && (machineId || null) !== existing.machineId);

  if (cliConfigChanged) {
    // 杀掉旧 tmux 进程
    try {
      const adapter = getAdapter(existing.cliKind);
      const oldExecutor = await getExecutor(existing.machineId);
      const oldSessionName = `${adapter.sessionPrefix}-${existing.processName}`;
      await oldExecutor.killSession(oldSessionName);
      logger.log('info', `编辑重连: 已杀旧进程 ${oldSessionName}`);
    } catch (e: any) {
      logger.log('warn', `编辑重连: 杀旧进程失败 ${existing.processName}`, e.message);
    }

    // 断开飞书 WS
    const channel = getChannel('feishu');
    if (channel && existing.feishuAppId) {
      channel.stop(existing.feishuAppId);
    }

    // 按新配置重启 CLI 进程
    const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
    const cfg = buildCliConfig(updatedBinding);
    const startResult = await startCliProcess(
      updatedBinding.processName,
      updatedBinding.cliKind,
      cfg,
      updatedBinding.machineId,
    );

    if (!startResult.ok) {
      logger.log('error', `编辑重连: CLI 进程启动失败 ${updatedBinding.processName}`, startResult.error);
    } else {
      db.update(bindings).set({ status: 'online', updatedAt: new Date().toISOString() }).where(eq(bindings.id, id)).run();
    }

    // 重连飞书 WS
    if (channel && updatedBinding.feishuAppId && updatedBinding.feishuAppSecret) {
      try {
        await channel.start(updatedBinding);
      } catch (e: any) {
        logger.log('error', `编辑重连: 飞书 WS 重启失败 ${updatedBinding.processName}`, e.message);
      }
    }
  } else {
    // 非 CLI 配置变更，仅飞书凭据/Bot 关联变更时重启 WS
    // v1.1.14：botId 变更也算飞书凭据变更（因为它推导出新的 appId/secret）
    const newBotIdNum =
      botId === undefined ? undefined : botId === null || botId === '' ? null : Number(botId);
    const wsNeedsRestart =
      (newBotIdNum !== undefined && newBotIdNum !== (existing.botId ?? null)) ||
      (updates.feishuAppId !== undefined && updates.feishuAppId !== existing.feishuAppId) ||
      (updates.feishuAppSecret !== undefined && updates.feishuAppSecret !== existing.feishuAppSecret);

    if (wsNeedsRestart) {
      const channel = getChannel('feishu');
      if (channel && existing.feishuAppId) {
        channel.stop(existing.feishuAppId);
      }
      if (channel && updates.feishuAppId && updates.feishuAppSecret) {
        try {
          const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
          await channel.start(updatedBinding);
        } catch (e: any) {
          logger.log('error', `飞书 WS 重启失败: ${existing.processName}`, e.message);
        }
      }
    }
  }

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

router.post('/api/rebind', requireAuth, async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.json({ code: 1003, message: '请提供绑定 ID' });
  }

  const db = getDb();
  const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  // 1. 杀掉旧 tmux 进程
  try {
    const adapter = getAdapter(existing.cliKind);
    const executor = await getExecutor(existing.machineId);
    const sessionName = `${adapter.sessionPrefix}-${existing.processName}`;
    await executor.killSession(sessionName);
    logger.log('info', `刷新重连: 已杀旧进程 ${sessionName}`);
  } catch (e: any) {
    logger.log('warn', `刷新重连: 杀旧进程失败 ${existing.processName}`, e.message);
  }

  // 2. 断开飞书 WS
  const channel = getChannel('feishu');
  if (channel && existing.feishuAppId) {
    channel.stop(existing.feishuAppId);
  }

  // 3. 按原配置重启 CLI 进程
  const cfg = buildCliConfig(existing);
  const startResult = await startCliProcess(existing.processName, existing.cliKind, cfg, existing.machineId);

  if (!startResult.ok) {
    logger.log('error', `刷新重连: CLI 进程启动失败 ${existing.processName}`, startResult.error);
    db.update(bindings).set({ status: 'offline', updatedAt: new Date().toISOString() }).where(eq(bindings.id, id)).run();
    return res.json({ code: 1001, message: startResult.error || 'CLI 进程启动失败' });
  }

  db.update(bindings).set({ status: 'online', updatedAt: new Date().toISOString() }).where(eq(bindings.id, id)).run();

  // 4. 重连飞书 WS
  if (channel && existing.feishuAppId && existing.feishuAppSecret) {
    try {
      const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get()!;
      await channel.start(updatedBinding);
    } catch (e: any) {
      logger.log('error', `刷新重连: 飞书 WS 重启失败 ${existing.processName}`, e.message);
    }
  }

  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'bind_rebind',
    target: existing.processName,
    detail: `cliKind=${existing.cliKind}, machineId=${existing.machineId}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `绑定刷新重连成功: ${existing.processName}`);
  const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
  res.json({ code: 0, data: result });
});

router.post('/api/unbind', requireAuth, async (req, res) => {
  const { id, killProcess } = req.body;

  if (!id) {
    return res.json({ code: 1003, message: '请提供绑定 ID' });
  }

  const db = getDb();
  const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  const channel = getChannel('feishu');
  if (channel && existing.feishuAppId) {
    channel.stop(existing.feishuAppId);
  }

  if (killProcess) {
    try {
      const executor = await getExecutor(existing.machineId);
      const adapter = getAdapter(existing.cliKind);
      const sessionName = `${adapter.sessionPrefix}-${existing.processName}`;
      await executor.killSession(sessionName);
    } catch (e: any) {
      logger.log('warn', `杀死 tmux 会话失败: ${existing.processName}`, e.message);
    }
  }

  db.delete(bindings).where(eq(bindings.id, id)).run();

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

// ════════════════════════════════════════════════════════════════════
// 分组管理（v1.1.29.8 引入）
// ════════════════════════════════════════════════════════════════════

router.get('/api/groups', requireAuth, (_req, res) => {
  try {
    const db = getDb();
    const groups = db.select().from(bindingGroups).orderBy(bindingGroups.sortOrder).all();

    // 为每个分组加载其下绑定
    const result = groups.map((g) => {
      const groupBindings = db
        .select()
        .from(bindings)
        .where(eq(bindings.groupId, g.id))
        .orderBy(bindings.sortOrder)
        .all();
      return { ...g, bindings: groupBindings };
    });

    res.json({ code: 0, data: result });
  } catch (e: any) {
    res.json({ code: 1001, message: '获取分组失败: ' + e.message });
  }
});

router.post('/api/groups', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.json({ code: 1003, message: '请填写分组名称' });
  }

  const db = getDb();
  const id = uuid();
  const maxOrder = (db.select({ m: sql<number>`coalesce(max(sort_order), 0)` }).from(bindingGroups).get()?.m ?? 0) + 1;

  db.insert(bindingGroups).values({
    id,
    name: String(name).trim(),
    sortOrder: maxOrder,
  }).run();

  const group = db.select().from(bindingGroups).where(eq(bindingGroups.id, id)).get();
  res.json({ code: 0, data: group });
});

router.put('/api/groups/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  const db = getDb();
  const id = req.params.id as string;
  const existing = db.select().from(bindingGroups).where(eq(bindingGroups.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '分组不存在' });
  }

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (name !== undefined) updates.name = String(name).trim();

  db.update(bindingGroups).set(updates).where(eq(bindingGroups.id, id)).run();
  const group = db.select().from(bindingGroups).where(eq(bindingGroups.id, id)).get();
  res.json({ code: 0, data: group });
});

router.delete('/api/groups/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = req.params.id as string;
  const existing = db.select().from(bindingGroups).where(eq(bindingGroups.id, id)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '分组不存在' });
  }

  // 将分组下的绑定移出分组
  db.update(bindings).set({ groupId: null, updatedAt: new Date().toISOString() }).where(eq(bindings.groupId, id)).run();
  db.delete(bindingGroups).where(eq(bindingGroups.id, id)).run();

  res.json({ code: 0, message: '已删除' });
});

// ════════════════════════════════════════════════════════════════════
// 绑定分组分配与排序（v1.1.29.8 引入）
// ════════════════════════════════════════════════════════════════════

router.post('/api/bindings/:id/group', requireAuth, (req, res) => {
  const { groupId } = req.body; // null = 移出分组
  const db = getDb();
  const bindingId = req.params.id as string;
  const existing = db.select().from(bindings).where(eq(bindings.id, bindingId)).get();
  if (!existing) {
    return res.json({ code: 1004, message: '绑定不存在' });
  }

  if (groupId !== null && groupId !== undefined) {
    const group = db.select().from(bindingGroups).where(eq(bindingGroups.id, groupId)).get();
    if (!group) {
      return res.json({ code: 1004, message: '分组不存在' });
    }
  }

  db.update(bindings).set({
    groupId: groupId ?? null,
    updatedAt: new Date().toISOString(),
  }).where(eq(bindings.id, bindingId)).run();

  res.json({ code: 0, message: '已更新' });
});

router.post('/api/bindings/reorder', requireAuth, (req, res) => {
  const { items } = req.body; // [{ id: string, sortOrder: number }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ code: 1003, message: '请提供排序列表' });
  }

  const db = getDb();
  const now = new Date().toISOString();

  try {
    for (const item of items) {
      db.update(bindings).set({ sortOrder: item.sortOrder, updatedAt: now }).where(eq(bindings.id, item.id)).run();
    }
    res.json({ code: 0, message: '排序已更新' });
  } catch (e: any) {
    res.json({ code: 1001, message: '排序更新失败: ' + e.message });
  }
});

export default router;
