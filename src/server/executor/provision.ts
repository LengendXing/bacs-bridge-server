import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSshExecutor } from './ssh-factory.js';
import { getDb } from '../db/index.js';
import { machines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../middleware/logger.js';
import type { ProvisionResult } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../../scripts/provision-remote.sh');

let cachedScript: string | null = null;

function loadScript(): string {
  if (!cachedScript) {
    cachedScript = readFileSync(SCRIPT_PATH, 'utf-8');
  }
  return cachedScript;
}

export async function provisionMachine(machineId: number): Promise<ProvisionResult> {
  const db = getDb();
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) {
    return { ok: false, error: `机器不存在: id=${machineId}` };
  }
  if (machine.builtin) {
    return { ok: false, error: '本机记录无需预装' };
  }

  const script = loadScript();
  const b64 = Buffer.from(script, 'utf-8').toString('base64');

  let executor;
  try {
    executor = await createSshExecutor(machineId);
    // 先测试 SSH 连通性
    if (!executor.testConnection) {
      return { ok: false, error: 'SSH executor 不支持 testConnection' };
    }
    const connTest = await executor.testConnection();
    if (!connTest.ok) {
      return { ok: false, error: `SSH 连接失败: ${connTest.error}` };
    }

    logger.log('info', `开始预装: machine=${machineId} host=${machine.host}`);

    // 通过 SSH 执行预装脚本（base64 传输避免转义问题）
    const r = await executor.exec(`echo '${b64}' | base64 -d | bash`, { timeout: 120_000 });

    if (!r.ok) {
      logger.log('error', `预装失败: machine=${machineId}`, r.stderr || r.error);
      db.update(machines).set({
        status: 'online',
        updatedAt: new Date().toISOString(),
      }).where(eq(machines.id, machineId)).run();
      return { ok: false, error: r.stderr || r.error || '脚本执行失败' };
    }

    // 从输出中提取最后一行 JSON
    const lines = r.stdout.trim().split('\n');
    let result: ProvisionResult;
    const lastLine = lines[lines.length - 1];

    try {
      result = JSON.parse(lastLine);
    } catch {
      // 解析失败，返回原始输出
      logger.log('warn', `预装结果解析失败: machine=${machineId}`, lastLine);
      result = { ok: false, error: `预装输出无法解析: ${lastLine?.slice(0, 200)}` };
    }

    // 更新机器状态
    if (result.ok) {
      const osInfo = [
        result.node || '',
        result.tmux || '',
        result.claude || '',
      ].filter(Boolean).join(' / ');

      db.update(machines).set({
        status: 'online',
        osVersion: osInfo || machine.osVersion,
        updatedAt: new Date().toISOString(),
      }).where(eq(machines.id, machineId)).run();

      logger.log('info', `预装完成: machine=${machineId}`, JSON.stringify(result.steps));
    } else {
      db.update(machines).set({
        status: 'online',
        updatedAt: new Date().toISOString(),
      }).where(eq(machines.id, machineId)).run();

      logger.log('error', `预装失败: machine=${machineId}`, result.error);
    }

    return result;
  } catch (e: any) {
    logger.log('error', `预装异常: machine=${machineId}`, e.message);
    return { ok: false, error: e.message };
  } finally {
    if (executor?.dispose) {
      try { await executor.dispose(); } catch { /* */ }
    }
  }
}
