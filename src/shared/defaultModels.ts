/**
 * @module shared/defaultModels
 * @description 服务商不支持模型探查（/v1/models 4xx/5xx）时的回退默认模型清单，
 *              以及各模型对 effort 参数的支持情况。
 *
 * 注入语法：
 * - Claude Code：`claude --model <id> --effort <level>`（level: low|medium|high|xhigh|max）
 * - Codex：`codex -m <id> -c model_reasoning_effort=<level>`（level: minimal|low|medium|high|xhigh）
 */

export type CliKind = 'cc' | 'codex';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type CodexEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const CLAUDE_EFFORT_LEVELS: readonly ClaudeEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const CODEX_EFFORT_LEVELS: readonly CodexEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export interface DefaultModel {
  id: string;
  label: string;
  supportsEffort: boolean;
  /** 该模型支持的最高 effort 档；undefined 表示不支持 */
  maxEffort?: ClaudeEffort | CodexEffort;
}

export const DEFAULT_MODELS: Record<CliKind, readonly DefaultModel[]> = {
  cc: [
    { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7',   supportsEffort: true,  maxEffort: 'max' },
    { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6', supportsEffort: true,  maxEffort: 'max' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',  supportsEffort: false },
    { id: 'claude-opus-4-6',            label: 'Claude Opus 4.6',   supportsEffort: true,  maxEffort: 'max' },
    { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5', supportsEffort: true,  maxEffort: 'max' },
  ],
  codex: [
    { id: 'gpt-5.5',         label: 'GPT-5.5',         supportsEffort: true, maxEffort: 'xhigh' },
    { id: 'gpt-5.4-codex',   label: 'GPT-5.4 Codex',   supportsEffort: true, maxEffort: 'xhigh' },
    { id: 'gpt-5.3-codex',   label: 'GPT-5.3 Codex',   supportsEffort: true, maxEffort: 'xhigh' },
    { id: 'gpt-5.4-mini',    label: 'GPT-5.4 Mini',    supportsEffort: true, maxEffort: 'high' },
    { id: 'gpt-5.2',         label: 'GPT-5.2',         supportsEffort: true, maxEffort: 'xhigh' },
  ],
} as const;

/** 取某 CLI 在某模型下可选的 effort 列表（按 maxEffort 截断）；若模型未知或不支持则返回空数组 */
export function getEffortOptions(cliKind: CliKind, modelId: string | undefined | null): readonly string[] {
  if (!modelId) return [];
  const known = DEFAULT_MODELS[cliKind].find(m => m.id === modelId);
  // 未知模型（用户手输）：默认开放全集让用户自行判断
  if (!known) return cliKind === 'cc' ? CLAUDE_EFFORT_LEVELS : CODEX_EFFORT_LEVELS;
  if (!known.supportsEffort) return [];
  const all: readonly string[] = cliKind === 'cc' ? CLAUDE_EFFORT_LEVELS : CODEX_EFFORT_LEVELS;
  const idx = all.indexOf(known.maxEffort as string);
  return idx === -1 ? all : all.slice(0, idx + 1);
}

/** 判断某 cliKind+modelId 是否支持 effort（前端用来决定是否显示 effort 下拉） */
export function modelSupportsEffort(cliKind: CliKind, modelId: string | undefined | null): boolean {
  return getEffortOptions(cliKind, modelId).length > 0;
}
