import type { RemoteExecutor } from './types.js';
import { LocalExecutor } from './local.js';

const executorCache: Map<number | null, RemoteExecutor> = new Map();

export function getLocalExecutor(): RemoteExecutor {
  let ex = executorCache.get(null);
  if (!ex) {
    ex = new LocalExecutor();
    executorCache.set(null, ex);
  }
  return ex;
}

export async function getExecutor(machineId: number | null | undefined): Promise<RemoteExecutor> {
  if (machineId === null || machineId === undefined) {
    return getLocalExecutor();
  }

  // 内置本机记录走 LocalExecutor（不通过 SSH 自连接）
  const { getDb } = await import('../db/index.js');
  const { machines } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const db = getDb();
  const m = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (m?.builtin) return getLocalExecutor();

  let ex = executorCache.get(machineId);
  if (ex) return ex;

  // SshExecutor will be lazy-loaded to avoid importing ssh2 unless needed
  const { createSshExecutor } = await import('./ssh-factory.js');
  const sshExecutor = await createSshExecutor(machineId);
  executorCache.set(machineId, sshExecutor);
  return sshExecutor;
}

export async function invalidateExecutor(machineId: number): Promise<void> {
  const ex = executorCache.get(machineId);
  if (ex && ex.dispose) {
    await ex.dispose();
  }
  executorCache.delete(machineId);
}

export function getCachedRemoteExecutors(): RemoteExecutor[] {
  return [...executorCache.values()].filter(ex => ex.kind === 'ssh');
}
