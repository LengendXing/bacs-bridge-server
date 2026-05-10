/**
 * @module session/manager
 * @description 会话管理器 — 创建/结束/超时 + 环境变量注入
 *
 * 管理一次飞书消息 → CLI 进程的完整问答生命周期：
 * 1. 收到飞书消息 → 查 binding 获取 cliKind + provider + model
 * 2. 从 provider 表读取凭据，构造 CliStartConfig
 * 3. 获取对应 adapter，调用 sendInput 发送 prompt
 * 4. 启动轮询 + isIdle 检测 + extractReply 提取回复
 * 5. 回复发送后清理会话
 */

import { getDb } from '../db/index.js';
import { bindings, providers, models } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAdapter, type CliAdapter, type CliStartConfig } from '../cli/factory.js';
import { execSync } from 'child_process';
import config from '../config.js';

/**
 * 从 binding 记录构造 CliStartConfig
 *
 * 根据服务商类型和 CLI 类型决定注入哪些环境变量：
 * - local → 不注入，CLI 子进程继承系统 env
 * - custom + cc → 注入 ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
 * - custom + codex → 注入 OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL + CODEX_HOME
 *
 * @param binding - 绑定记录
 * @returns CliStartConfig 实例
 */
export function buildCliConfig(binding: typeof bindings.$inferSelect): CliStartConfig {
  const db = getDb();

  // 默认 local 模式
  const cfg: CliStartConfig = {
    providerKind: 'local',
    envVars: {},
    modelId: undefined,
  };

  if (!binding.providerId) return cfg;

  // 查询服务商
  const provider = db.select().from(providers).where(eq(providers.id, binding.providerId)).get();
  if (!provider || provider.kind === 'local') return cfg;

  cfg.providerKind = 'custom';

  // 查询模型
  if (binding.modelId) {
    const model = db.select().from(models).where(eq(models.id, binding.modelId)).get();
    if (model) cfg.modelId = model.modelId;
  }

  // 根据 CLI 类型注入对应环境变量
  if (binding.cliKind === 'cc') {
    cfg.envVars = {
      ANTHROPIC_BASE_URL: provider.baseUrl || undefined,
      ANTHROPIC_API_KEY: provider.apiKey || undefined,
    };
  } else if (binding.cliKind === 'codex') {
    cfg.envVars = {
      OPENAI_BASE_URL: provider.baseUrl || undefined,
      OPENAI_API_KEY: provider.apiKey || undefined,
      // CODEX_HOME 隔离目录（可选）
      CODEX_HOME: undefined,
    };
  }

  return cfg;
}

/**
 * 启动 CLI 进程（创建 tmux 会话）
 *
 * @param processName - 进程名
 * @param cliKind - CLI 类型
 * @param cfg - 启动配置
 * @returns 操作结果
 */
export function startCliProcess(
  processName: string,
  cliKind: string,
  cfg: CliStartConfig,
): { ok: boolean; error?: string } {
  const adapter = getAdapter(cliKind);
  const sessionName = `${adapter.sessionPrefix}-${processName}`;

  // 检查是否已达最大并发
  const maxConcurrent = config.bridge.maxConcurrent;
  const allSessions = listAllSessions();
  if (allSessions.length >= maxConcurrent) {
    return { ok: false, error: `已达到最大并发数 ${maxConcurrent}` };
  }

  // 检查会话是否已存在
  if (adapter.sessionExists(processName)) {
    return { ok: false, error: `进程 ${processName} 已在运行` };
  }

  // 构建启动命令并执行
  const cmd = adapter.buildStartCmd(sessionName, cfg);
  try {
    execSync(cmd, { stdio: 'ignore', shell: '/bin/bash' });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `启动失败: ${e.message}` };
  }
}

/**
 * 列出所有 CLI 类型的 tmux 会话
 *
 * @returns 进程名数组
 */
export function listAllSessions(): string[] {
  const all: string[] = [];
  for (const kind of ['cc', 'codex']) {
    const adapter = getAdapter(kind);
    all.push(...adapter.listSessions());
  }
  return all;
}

/**
 * 列出未绑定的 tmux 会话
 *
 * @returns 进程名数组
 */
export function listUnboundSessions(): string[] {
  const db = getDb();
  const allBindings = db.select().from(bindings).all();
  const boundNames = new Set(allBindings.map(b => b.processName));
  return listAllSessions().filter(s => !boundNames.has(s));
}
