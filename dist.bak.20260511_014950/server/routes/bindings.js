import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { bindings, providers, models, machines, auditLogs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import { buildCliConfig, startCliProcess } from '../session/manager.js';
import { getAdapter } from '../cli/factory.js';
import { getExecutor } from '../executor/factory.js';
import { getChannel } from '../channel/router.js';
const router = Router();
router.use(requireAuth);
router.get('/api/status', async (_req, res) => {
    try {
        const db = getDb();
        const allBindings = db.select().from(bindings).all();
        const result = await Promise.all(allBindings.map(async (b) => {
            const adapter = getAdapter(b.cliKind);
            let isOnline = false;
            try {
                const executor = await getExecutor(b.machineId);
                isOnline = await adapter.sessionExists(b.processName, executor);
            }
            catch {
                // machines 表不存在或 executor 获取失败，降级用本地
                try {
                    const executor = await getExecutor(null);
                    isOnline = await adapter.sessionExists(b.processName, executor);
                }
                catch { /* ignore */ }
            }
            let wsConnected = false;
            if (b.feishuAppId) {
                const channel = getChannel('feishu');
                wsConnected = channel?.isConnected(b.feishuAppId) ?? false;
            }
            let provider = null;
            if (b.providerId) {
                provider = db.select().from(providers).where(eq(providers.id, b.providerId)).get() ?? null;
                if (provider?.apiKey) {
                    provider = { ...provider, apiKey: `${provider.apiKey.slice(0, 6)}...${provider.apiKey.slice(-4)}` };
                }
            }
            let model = null;
            if (b.modelId) {
                model = db.select().from(models).where(eq(models.id, b.modelId)).get() ?? null;
            }
            let machineName = null;
            if (b.machineId) {
                try {
                    const m = db.select().from(machines).where(eq(machines.id, b.machineId)).get();
                    machineName = m?.name ?? null;
                }
                catch { /* machines 表不存在 */ }
            }
            return {
                id: b.id,
                processName: b.processName,
                cliKind: b.cliKind,
                providerId: b.providerId,
                modelId: b.modelId,
                machineId: b.machineId ?? null,
                machineName,
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
        res.json({ code: 0, data: result });
    }
    catch (e) {
        logger.log('error', '获取绑定状态失败', e.message);
        res.json({ code: 1001, message: '获取状态失败: ' + e.message });
    }
});
router.post('/api/bind', async (req, res) => {
    const { processName, cliKind, providerId, modelId, feishuAppId, feishuAppSecret, machineId } = req.body;
    if (!processName) {
        return res.json({ code: 1003, message: '请填写进程名' });
    }
    if (!feishuAppId || !feishuAppSecret) {
        return res.json({ code: 1003, message: '请填写飞书 App ID 和 App Secret' });
    }
    const db = getDb();
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
            feishuAppId,
            feishuAppSecret,
            machineId: resolvedMachineId,
            status: 'offline',
        }).run();
    }
    catch (e) {
        logger.log('error', '绑定创建失败', e.message);
        return res.json({ code: 1001, message: '创建失败: ' + e.message });
    }
    const binding = db.select().from(bindings).where(eq(bindings.id, id)).get();
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
            const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get();
            await channel.start(updatedBinding);
        }
        catch (e) {
            logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
        }
    }
    const userId = req.user?.sub;
    db.insert(auditLogs).values({
        userId,
        action: 'bind_create',
        target: processName,
        detail: `cliKind=${kind}, feishuAppId=${feishuAppId}, machineId=${resolvedMachineId}`,
        ipAddress: req.ip,
    }).run();
    logger.log('info', `绑定创建成功: ${processName} (${kind})`);
    const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
    res.json({ code: 0, data: result });
});
router.post('/api/bind/mount', async (req, res) => {
    const { processName, cliKind, providerId, modelId, feishuAppId, feishuAppSecret, machineId } = req.body;
    if (!processName) {
        return res.json({ code: 1003, message: '请填写进程名' });
    }
    if (!feishuAppId || !feishuAppSecret) {
        return res.json({ code: 1003, message: '请填写飞书 App ID 和 App Secret' });
    }
    const kind = cliKind || 'cc';
    const adapter = getAdapter(kind);
    const resolvedMachineId = machineId || null;
    const executor = await getExecutor(resolvedMachineId);
    const sessionName = `${adapter.sessionPrefix}-${processName}`;
    if (!await adapter.sessionExists(processName, executor)) {
        return res.json({ code: 1004, message: `tmux 会话 ${sessionName} 不存在，请先启动 CLI 进程` });
    }
    const db = getDb();
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
            feishuAppId,
            feishuAppSecret,
            machineId: resolvedMachineId,
            status: 'online',
        }).run();
    }
    catch (e) {
        logger.log('error', '挂载绑定失败', e.message);
        return res.json({ code: 1001, message: '挂载失败: ' + e.message });
    }
    const channel = getChannel('feishu');
    if (channel) {
        try {
            const binding = db.select().from(bindings).where(eq(bindings.id, id)).get();
            await channel.start(binding);
        }
        catch (e) {
            logger.log('error', `飞书 WS 启动失败: ${processName}`, e.message);
        }
    }
    const userId = req.user?.sub;
    db.insert(auditLogs).values({
        userId,
        action: 'bind_mount',
        target: processName,
        detail: `cliKind=${kind}, mount existing session, machineId=${resolvedMachineId}`,
        ipAddress: req.ip,
    }).run();
    logger.log('info', `绑定挂载成功: ${processName} (${kind})`);
    const result = db.select().from(bindings).where(eq(bindings.id, id)).get();
    res.json({ code: 0, data: result });
});
router.post('/api/edit', async (req, res) => {
    const { id, feishuAppId, feishuAppSecret, providerId, modelId, machineId } = req.body;
    if (!id) {
        return res.json({ code: 1003, message: '请提供绑定 ID' });
    }
    const db = getDb();
    const existing = db.select().from(bindings).where(eq(bindings.id, id)).get();
    if (!existing) {
        return res.json({ code: 1004, message: '绑定不存在' });
    }
    const updates = { updatedAt: new Date().toISOString() };
    if (feishuAppId !== undefined)
        updates.feishuAppId = feishuAppId;
    if (feishuAppSecret !== undefined)
        updates.feishuAppSecret = feishuAppSecret;
    if (providerId !== undefined)
        updates.providerId = providerId || null;
    if (modelId !== undefined)
        updates.modelId = modelId || null;
    if (machineId !== undefined)
        updates.machineId = machineId || null;
    db.update(bindings).set(updates).where(eq(bindings.id, id)).run();
    const wsNeedsRestart = (feishuAppId !== undefined && feishuAppId !== existing.feishuAppId) ||
        (feishuAppSecret !== undefined && feishuAppSecret !== existing.feishuAppSecret);
    if (wsNeedsRestart) {
        const channel = getChannel('feishu');
        if (channel && existing.feishuAppId) {
            channel.stop(existing.feishuAppId);
        }
        if (channel && updates.feishuAppId && updates.feishuAppSecret) {
            try {
                const updatedBinding = db.select().from(bindings).where(eq(bindings.id, id)).get();
                await channel.start(updatedBinding);
            }
            catch (e) {
                logger.log('error', `飞书 WS 重启失败: ${existing.processName}`, e.message);
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
        }
        catch (e) {
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
export default router;
