import { getDb } from '../db/index.js';
import { bindings, providers, models } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAdapter, type CliAdapter, type CliStartConfig } from '../cli/factory.js';
import { getExecutor, getLocalExecutor } from '../executor/factory.js';
import type { RemoteExecutor } from '../executor/types.js';
import config from '../config.js';

export function buildCliConfig(binding: typeof bindings.$inferSelect): CliStartConfig {
  const db = getDb();
  const cfg: CliStartConfig = {
    providerKind: 'local',
    envVars: {},
    modelId: undefined,
  };

  if (!binding.providerId) return cfg;

  const provider = db.select().from(providers).where(eq(providers.id, binding.providerId)).get();
  if (!provider || provider.kind === 'local') return cfg;

  cfg.providerKind = 'custom';

  if (binding.modelId) {
    const model = db.select().from(models).where(eq(models.id, binding.modelId)).get();
    if (model) cfg.modelId = model.modelId;
  }

  if (binding.cliKind === 'cc') {
    // 仅注入 ANTHROPIC_AUTH_TOKEN：CLI 检测到 ANTHROPIC_API_KEY 时会弹出
    // "Do you want to use this API key?" 交互确认，阻塞 tmux 会话
    cfg.envVars = {
      ANTHROPIC_BASE_URL: provider.baseUrl || undefined,
      ANTHROPIC_AUTH_TOKEN: provider.apiKey || undefined,
    };
  } else if (binding.cliKind === 'codex') {
    cfg.envVars = {
      OPENAI_BASE_URL: provider.baseUrl || undefined,
      OPENAI_API_KEY: provider.apiKey || undefined,
      CODEX_HOME: undefined,
    };
  }

  return cfg;
}

export async function startCliProcess(
  processName: string,
  cliKind: string,
  cfg: CliStartConfig,
  machineId: number | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const adapter = getAdapter(cliKind);
  const executor = await getExecutor(machineId);
  const sessionName = `${adapter.sessionPrefix}-${processName}`;

  const maxConcurrent = config.bridge.maxConcurrent;
  const allSessions = await listAllSessions(machineId);
  if (allSessions.length >= maxConcurrent) {
    return { ok: false, error: `已达到最大并发数 ${maxConcurrent}` };
  }

  const exists = await adapter.sessionExists(processName, executor);
  if (exists) {
    return { ok: false, error: `进程 ${processName} 已在运行` };
  }

  const cmd = adapter.buildStartCmd(sessionName, cfg);
  const r = await executor.exec(cmd, { shell: '/bin/bash' });
  if (!r.ok) {
    return { ok: false, error: `启动失败: ${r.error || r.stderr}` };
  }
  return { ok: true };
}

export async function listAllSessions(machineId?: number | null): Promise<string[]> {
  const all: string[] = [];
  const executor = machineId !== undefined
    ? await getExecutor(machineId)
    : getLocalExecutor();

  for (const kind of ['cc', 'codex']) {
    const adapter = getAdapter(kind);
    all.push(...await adapter.listSessions(executor));
  }
  return all;
}

export async function listUnboundSessions(machineId?: number | null): Promise<string[]> {
  const db = getDb();
  const allBindings = db.select().from(bindings).all();
  const boundNames = new Set(
    machineId !== undefined
      ? allBindings.filter(b => b.machineId === machineId).map(b => b.processName)
      : allBindings.map(b => b.processName),
  );
  const allSessions = await listAllSessions(machineId);
  return allSessions.filter(s => !boundNames.has(s));
}
