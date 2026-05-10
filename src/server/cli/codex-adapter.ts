/**
 * @module cli/codex-adapter
 * @description Codex CLI Adapter（骨架实现）
 *
 * 基于 codex-cli-complete-guide-2026.md 调研成果：
 * - 启动命令：`CODEX_HOME=xxx OPENAI_BASE_URL=xxx OPENAI_API_KEY=xxx codex`
 * - REPL 模式（裸 `codex`，不要用 `codex "prompt"` 一次性模式）
 * - 发送输入：tmux send-keys + Enter
 * - isIdle / extractReply：**需 TUI 实测后填充**，当前标注 TODO
 *
 * 多实例隔离：
 * - 每个 Codex 进程独立 CODEX_HOME + 独立 tmux 会话
 * - npm 包名：@openai/codex（命令名：codex）
 */

import type { CliAdapter, CliStartConfig } from './types.js';
import * as base from './base.js';

/** Codex tmux 会话名前缀 */
const SESSION_PREFIX = 'codex';

/** Codex CLI 可执行文件路径 */
const CODEX_BIN = process.env.CODEX_BIN || 'codex';

/**
 * 构建 tmux new-session 启动命令
 *
 * custom 模式：注入 OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL + CODEX_HOME
 * local 模式：不注入，CLI 子进程继承系统环境变量
 *
 * @param sessionName - tmux 会话名（如 'codex-research'）
 * @param cfg - 启动配置
 */
function buildStartCmd(sessionName: string, cfg: CliStartConfig): string {
  let innerCmd = CODEX_BIN;

  if (cfg.providerKind === 'custom') {
    const parts: string[] = [];

    // CODEX_HOME 隔离目录（可选，防止多实例共享配置/历史）
    if (cfg.envVars.CODEX_HOME) {
      const safeHome = cfg.envVars.CODEX_HOME.replace(/'/g, "'\\''");
      parts.push(`CODEX_HOME='${safeHome}'`);
    }

    if (cfg.envVars.OPENAI_BASE_URL) {
      const safeUrl = cfg.envVars.OPENAI_BASE_URL.replace(/'/g, "'\\''");
      parts.push(`OPENAI_BASE_URL='${safeUrl}'`);
    }

    if (cfg.envVars.OPENAI_API_KEY) {
      const safeKey = cfg.envVars.OPENAI_API_KEY.replace(/'/g, "'\\''");
      parts.push(`OPENAI_API_KEY='${safeKey}'`);
    }

    // 模型指定（如 gpt-4.1）
    if (cfg.modelId) {
      parts.push(`OPENAI_MODEL=${cfg.modelId}`);
    }

    if (parts.length) {
      innerCmd = `env ${parts.join(' ')} ${innerCmd}`;
    }
  }

  const escaped = innerCmd.replace(/"/g, '\\"');
  return `tmux new-session -d -s ${sessionName} "${escaped}"`;
}

/**
 * 判断 Codex 是否空闲
 *
 * TODO: 需 TUI 实测确认 Codex 的空闲提示符
 * 当前使用保守策略：检查 pane 底部是否有输入提示符
 * Codex 可能的提示符：`>` / `▌` / `█` / 带颜色复合字符
 *
 * @param processName - 进程名
 * @returns true 表示 Codex 空闲
 */
function isIdle(processName: string): boolean {
  const sessionName = `${SESSION_PREFIX}-${processName}`;
  const res = base.capturePane(sessionName, 15);
  if (res.error) return false;

  const tail = res.output;

  // TODO: 实测后替换为 Codex 专属的忙碌/空闲判断逻辑
  // 保守策略：同时检测多种可能的提示符
  if (/\(suggest\)|\(auto-edit\)|\(full-auto\)/.test(tail)) return true;
  if (/^\s*>\s*$/m.test(tail)) return true;

  // 兜底：如果 pane 最后几行看起来像等待输入（无 "thinking" / "running" 等）
  const lastLines = tail.split('\n').slice(-5).join('\n');
  if (!/thinking|running|executing|processing/i.test(lastLines)) {
    // 简单启发式：最后非空行以 > 开头
    const lastNonEmpty = lastLines.split('\n').filter(l => l.trim()).pop() || '';
    if (/^\s*>\s*$/.test(lastNonEmpty)) return true;
  }

  return false;
}

/**
 * 从 TUI 纯文本中提取 Codex 回复
 *
 * TODO: 需 TUI 实测确认 Codex 的输出格式
 * 当前使用简化策略：去掉空行和 TUI 框架线后，返回全部文本
 *
 * @param raw - capturePane 返回的原始输出
 * @param userMessage - 本轮用户消息
 * @returns 提取的回复文本
 */
function extractReply(raw: string, userMessage: string): string {
  if (!raw) return '';

  // TODO: 实测后替换为 Codex 专属的回复提取逻辑
  // 简化版：截断到用户消息之后，去掉空行和明显的 TUI 框架

  let lines = raw.split(/\r?\n/);

  // 尝试截断到用户消息之后
  if (userMessage && userMessage.trim()) {
    const probe = userMessage.trim().slice(0, 60);
    let cutIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(probe)) {
        cutIdx = i;
        break;
      }
    }
    if (cutIdx >= 0) {
      lines = lines.slice(cutIdx + 1);
    }
  }

  // 去掉空行和可能的 TUI 框架线
  const cleaned = lines
    .filter(l => l.trim())
    .filter(l => !/^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(l.trim()))
    .map(l => l.replace(/^\s*│\s?/, '').trimEnd())
    .join('\n')
    .trim();

  return cleaned;
}

/** Codex Adapter 骨架实现 */
const codexAdapter: CliAdapter = {
  kind: 'codex',
  sessionPrefix: SESSION_PREFIX,

  buildStartCmd,

  sendInput(sessionName: string, text: string) {
    return base.sendInput(sessionName, text);
  },

  capturePane(sessionName: string, lines = 500) {
    return base.capturePane(sessionName, lines);
  },

  extractReply,

  isIdle,

  listSessions() {
    return base.listSessionsByPrefix(SESSION_PREFIX);
  },

  sessionExists(processName: string) {
    return base.sessionExists(`${SESSION_PREFIX}-${processName}`);
  },
};

export default codexAdapter;
