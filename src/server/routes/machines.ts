import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { machines, bindings, auditLogs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import { encryptCredential, sanitizeMachine } from '../crypto/credentials.js';
import { invalidateExecutor } from '../executor/factory.js';

const router = Router();

// GET /api/machines
router.get('/api/machines', requireAuth, (_req, res) => {
  const db = getDb();
  const all = db.select().from(machines).all();
  const sanitized = all.map(m => sanitizeMachine(m));
  res.json({ code: 0, data: sanitized });
});

// GET /api/machines/:id
router.get('/api/machines/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const machine = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!machine) return res.json({ code: 1004, message: '机器不存在' });
  res.json({ code: 0, data: sanitizeMachine(machine) });
});

// POST /api/machines
router.post('/api/machines', requireAuth, (req, res) => {
  const { name, host, port, osType, authType, username, password, privateKey, passphrase, notes } = req.body;
  if (!name || !host || !username) {
    return res.json({ code: 1003, message: '名称、IP、用户名为必填项' });
  }
  if (authType === 'password' && !password) {
    return res.json({ code: 1003, message: '密码认证方式需填写密码' });
  }
  if (authType === 'key' && !privateKey) {
    return res.json({ code: 1003, message: '密钥认证方式需填写私钥' });
  }

  const db = getDb();
  try {
    const result = db.insert(machines).values({
      name,
      host,
      port: port || 22,
      osType: osType || 'linux',
      authType: authType || 'password',
      username,
      password: password ? encryptCredential(password) : null,
      privateKey: privateKey ? encryptCredential(privateKey) : null,
      passphrase: passphrase ? encryptCredential(passphrase) : null,
      notes: notes || null,
      status: 'unknown',
    }).returning().get();

    const userId = req.user?.sub;
    db.insert(auditLogs).values({
      userId,
      action: 'machine_create',
      target: name,
      detail: `host=${host}:${port || 22}`,
      ipAddress: req.ip,
    }).run();

    logger.log('info', `机器创建: ${name} (${host})`);
    res.json({ code: 0, data: sanitizeMachine({ ...result }) });
  } catch (e: any) {
    logger.log('error', '机器创建失败', e.message);
    res.json({ code: 1001, message: '创建失败: ' + e.message });
  }
});

// PUT /api/machines/:id
router.put('/api/machines/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!existing) return res.json({ code: 1004, message: '机器不存在' });
  if (existing.builtin) return res.json({ code: 1002, message: '本机记录为系统内置，不允许修改' });

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  const { name, host, port, osType, authType, username, password, privateKey, passphrase, notes } = req.body;

  if (name !== undefined) updates.name = name;
  if (host !== undefined) updates.host = host;
  if (port !== undefined) updates.port = port;
  if (osType !== undefined) updates.osType = osType;
  if (authType !== undefined) updates.authType = authType;
  if (username !== undefined) updates.username = username;
  if (notes !== undefined) updates.notes = notes;

  if (password !== undefined) {
    updates.password = password === '' ? null : encryptCredential(password);
  }
  if (privateKey !== undefined) {
    updates.privateKey = privateKey === '' ? null : encryptCredential(privateKey);
  }
  if (passphrase !== undefined) {
    updates.passphrase = passphrase === '' ? null : encryptCredential(passphrase);
  }

  db.update(machines).set(updates).where(eq(machines.id, id)).run();

  // 凭据变更时需刷新 executor 缓存
  if (password !== undefined || privateKey !== undefined || passphrase !== undefined ||
      host !== undefined || port !== undefined || username !== undefined) {
    await invalidateExecutor(id);
  }

  const updated = db.select().from(machines).where(eq(machines.id, id)).get();

  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'machine_update',
    target: String(id),
    detail: `updated_fields=${Object.keys(updates).filter(k => k !== 'updatedAt').join(',')}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `机器编辑: id=${id}`);
  res.json({ code: 0, data: sanitizeMachine(updated!) });
});

// DELETE /api/machines/:id
router.delete('/api/machines/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!existing) return res.json({ code: 1004, message: '机器不存在' });
  if (existing.builtin) return res.json({ code: 1002, message: '本机记录为系统内置，不允许删除' });

  // 检查是否有关联绑定
  const relatedBindings = db.select().from(bindings).all().filter(b => b.machineId === id);
  if (relatedBindings.length > 0) {
    return res.json({ code: 1003, message: '该机器上仍有绑定，请先解绑' });
  }

  await invalidateExecutor(id);
  db.delete(machines).where(eq(machines.id, id)).run();

  const userId = req.user?.sub;
  db.insert(auditLogs).values({
    userId,
    action: 'machine_delete',
    target: String(id),
    detail: `name=${existing.name}`,
    ipAddress: req.ip,
  }).run();

  logger.log('info', `机器删除: ${existing.name} (id=${id})`);
  res.json({ code: 0, message: '已删除' });
});

// POST /api/machines/:id/test
router.post('/api/machines/:id/test', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const machine = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!machine) return res.json({ code: 1004, message: '机器不存在' });
  if (machine.builtin) {
    return res.json({
      code: 0,
      data: { ok: true, hostname: 'localhost', os: machine.osVersion, latencyMs: 0 },
    });
  }

  try {
    const { createSshExecutor } = await import('../executor/ssh-factory.js');
    const executor = await createSshExecutor(id);

    const start = Date.now();
    const hostnameResult = await executor.exec('hostname', { timeout: 5000 });
    const osResult = await executor.exec('uname -a', { timeout: 5000 });
    const tmuxResult = await executor.exec('tmux -V', { timeout: 5000 });
    const latencyMs = Date.now() - start;

    if (executor.dispose) await executor.dispose();

    const ok = hostnameResult.ok;
    const userId = req.user?.sub;
    db.insert(auditLogs).values({
      userId,
      action: 'machine_test',
      target: String(id),
      detail: `ok=${ok}, latency=${latencyMs}ms`,
      ipAddress: req.ip,
    }).run();

    // 更新状态
    db.update(machines).set({
      status: ok ? 'online' : 'offline',
      lastHeartbeat: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(machines.id, id)).run();

    res.json({
      code: 0,
      data: {
        ok,
        hostname: hostnameResult.ok ? hostnameResult.stdout.trim() : undefined,
        os: osResult.ok ? osResult.stdout.trim() : undefined,
        tmuxVersion: tmuxResult.ok ? tmuxResult.stdout.trim() : undefined,
        latencyMs,
        error: ok ? undefined : hostnameResult.error,
      },
    });
  } catch (e: any) {
    // 更新状态为 offline
    db.update(machines).set({
      status: 'offline',
      lastHeartbeat: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(machines.id, id)).run();

    res.json({ code: 0, data: { ok: false, latencyMs: 0, error: e.message } });
  }
});

// POST /api/machines/:id/heartbeat
router.post('/api/machines/:id/heartbeat', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const machine = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!machine) return res.json({ code: 1004, message: '机器不存在' });

  try {
    const { getExecutor } = await import('../executor/factory.js');
    const executor = await getExecutor(id);
    const result = await executor.testConnection?.();

    const status = result?.ok ? 'online' : 'offline';
    db.update(machines).set({
      status,
      lastHeartbeat: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(machines.id, id)).run();

    res.json({
      code: 0,
      data: { status, lastHeartbeat: new Date().toISOString() },
    });
  } catch (e: any) {
    db.update(machines).set({
      status: 'offline',
      lastHeartbeat: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(machines.id, id)).run();

    res.json({ code: 0, data: { status: 'offline', error: e.message } });
  }
});

export default router;
