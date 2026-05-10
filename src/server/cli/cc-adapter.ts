/**
 * @module cli/cc-adapter
 * @description Claude Code CLI Adapter
 *
 * 从现有 communicator.js 平移，保持全部已有逻辑：
 * - extractReply: ● 块分组提取 + box-drawing 表格保留 + 兜底
 * - isIdle: "Esc to interrupt" 忙碌优先 + ❯ 提示符双确认
 * - sendInput: base64 + load-buffer 安全模式
 * - buildStartCmd: ANTHROPIC_BASE_URL/ANTHROPIC_API_KEY 环境变量注入
 */

import { execSync } from 'child_process';
import type { CliAdapter, CliStartConfig } from './types.js';
import * as base from './base.js';
import config from '../config.js';

/** Claude Code tmux 会话名前缀 */
const SESSION_PREFIX = 'cc';

/** Claude Code 可执行文件路径 */
const CLAUDE_BIN = process.env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`;

/**
 * 构建 tmux new-session 启动命令
 *
 * custom 模式：在命令字符串中前缀注入 ANTHROPIC_* 环境变量
 * local 模式：不注入，CLI 子进程继承 bridge-server 的环境变量
 *
 * @param sessionName - tmux 会话名（如 'cc-work'）
 * @param cfg - 启动配置
 * @returns 可直接执行的 tmux new-session 命令字符串
 */
function buildStartCmd(sessionName: string, cfg: CliStartConfig): string {
  let innerCmd = CLAUDE_BIN;

  if (cfg.providerKind === 'custom') {
    const parts: string[] = [];
    if (cfg.envVars.ANTHROPIC_BASE_URL) {
      const safeUrl = cfg.envVars.ANTHROPIC_BASE_URL.replace(/'/g, "'\\''");
      parts.push(`ANTHROPIC_BASE_URL='${safeUrl}'`);
    }
    if (cfg.envVars.ANTHROPIC_API_KEY) {
      const safeKey = cfg.envVars.ANTHROPIC_API_KEY.replace(/'/g, "'\\''");
      parts.push(`ANTHROPIC_API_KEY='${safeKey}'`);
    }
    // 清除可能残留的 AUTH_TOKEN，避免冲突
    parts.push('ANTHROPIC_AUTH_TOKEN=');
    if (parts.length) {
      innerCmd = `env ${parts.join(' ')} ${innerCmd}`;
    }
  }

  // 转义 tmux 命令中的双引号
  const escaped = innerCmd.replace(/"/g, '\\"');
  return `tmux new-session -d -s ${sessionName} "${escaped}"`;
}

/**
 * 检查 CC 是否处于待命状态
 *
 * 空闲判定逻辑（"忙碌优先"）：
 * 1. 先检查 "Esc to interrupt" — 有则必定忙碌（直接返回 false）
 * 2. 再检查 ❯ 提示符或 "? for shortcuts" — 有且无 "Esc" 则空闲
 *
 * @param processName - 进程名（不含前缀）
 * @returns true 表示 CC 已完成处理，等待新输入
 */
function isIdle(processName: string): boolean {
  const sessionName = `${SESSION_PREFIX}-${processName}`;
  const res = base.capturePane(sessionName, 15);
  if (res.error) return false;

  const tail = res.output;
  // CC 处理中会在状态栏显示 "Esc to interrupt"，有此字样则必定处于忙碌状态
  if (/esc to interrupt/i.test(tail)) return false;
  // 空闲：底部出现 ❯ 提示符或 shortcuts 提示，且无"esc to interrupt"
  return /❯/.test(tail) || /\? for shortcuts/.test(tail);
}

/**
 * 从 TUI 纯文本中提取最终回复
 *
 * 策略（三步走）：
 * Step 0: 截断到本轮对话起点（找到 ❯ {userMessage}，只取其后内容）
 * Step 1: 去除 TUI 装饰行（框架/头部/输入框/提示符/操作提示等）
 * Step 2: 按 ● 块分组，跳过工具调用块（● ToolName(...)），拼接助手回复块
 * 兜底：找不到任何 ● 块时，返回去 TUI 装饰后的全部纯文本
 *
 * @param raw - capturePane 返回的完整 pane 文本
 * @param userMessage - 本轮用户消息（用于截断定位）
 * @returns 提取的回复纯文本
 */
function extractReply(raw: string, userMessage: string): string {
  if (!raw) return '';

  let rawLines = raw.split(/\r?\n/);

  // ── Step 0: 截断到本轮对话起点 ──
  // CC TUI 中用户消息提交后会回显为 `❯ {userMessage}`
  // 反向找最后一次包含本次消息的 ❯ 行，只对该行之后做提取
  if (userMessage && userMessage.trim()) {
    const needle = userMessage.trim();
    const probe = needle.slice(0, 60);
    let cutIdx = -1;
    for (let i = rawLines.length - 1; i >= 0; i--) {
      const line = rawLines[i];
      if (/^\s*❯\s/.test(line) && line.includes(probe)) {
        cutIdx = i;
        break;
      }
    }
    if (cutIdx >= 0) {
      rawLines = rawLines.slice(cutIdx + 1);
    }
  }

  // ── Step 1: 去除 TUI 装饰行 ──
  const cleaned: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();

    // 仅由框架字符组成的行
    if (trimmed && /^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(trimmed)) continue;
    // 框架顶/底边 ╭...╮ / ╰...╯
    if (/^\s*[╭╰]/.test(line)) continue;
    // CC 头部/侧边栏英文提示行（带 │ 边框）
    if (/^\s*│.*(Welcome back|Tips for getting started|Claude Code v|What.s new|Fixed:|API Usage|\/release-notes|\/login|\/logout|\/settings|cwd:|Try ")/.test(line)) continue;
    // 输入框 │ > xxx │（用户输入回显）
    if (/^\s*│\s*>\s/.test(line)) continue;
    // ❯ 提示符行
    if (/^\s*❯/.test(line)) continue;
    // ✻ 处理时间提示
    if (/^\s*✻/.test(line)) continue;
    // CC 操作提示
    if (/(\? for shortcuts|ctrl\+o to expand|ctrl\+r to redo|ctrl\+c to)/i.test(line)) continue;
    if (/^\s*Listed\s+\d+\s+(director|file)/i.test(line)) continue;

    cleaned.push(line);
  }

  // ── Step 2: 按 ● 块分组，跳过工具调用块 ──
  const blocks: { skip: boolean; lines: string[] }[] = [];
  let current: { skip: boolean; lines: string[] } | null = null;

  function commit() {
    if (current && current.lines.length) {
      // 去掉块内尾部空行
      while (current.lines.length && !current.lines[current.lines.length - 1].trim()) {
        current.lines.pop();
      }
      if (current.lines.length) blocks.push(current);
    }
    current = null;
  }

  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i];
    const trimmed = line.trim();

    // ● 块起点
    const bulletMatch = line.match(/^(\s*)●\s*(.*)$/);
    if (bulletMatch) {
      commit();
      const content = bulletMatch[2];
      // 工具调用：● ToolName( 或 ● ToolName 单词后接括号/参数
      if (/^[A-Za-z_][\w.-]*\s*\(/.test(content)) {
        // 工具调用：建一个 skip 块吃掉后续缩进/⎿ 行
        current = { skip: true, lines: [] };
        continue;
      }
      current = { skip: false, lines: content ? [content] : [] };
      continue;
    }

    // ⎿ 工具结果
    if (/^\s*⎿/.test(line)) {
      // 让当前 skip 块继续吸收
      continue;
    }

    if (!current) continue; // 块外的杂行直接丢
    if (current.skip) continue; // 工具调用块内任何续行都跳过

    // 助手块续行：保留缩进续行 + 段内空行
    if (!trimmed) {
      current.lines.push('');
      continue;
    }
    if (/^\s{2,}/.test(line)) {
      current.lines.push(trimmed);
      continue;
    }

    // box-drawing 表格行：不管缩进，视为块续行
    const isTableLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(line) ||
      (line.match(/│/g) || []).length >= 2;
    if (isTableLine) {
      current.lines.push(trimmed);
      continue;
    }

    // 顶格非 ● 行：结束当前助手块
    commit();
  }
  commit();

  // ── Step 3: 拼接最终回复 ──
  // 如果有助手块，全部拼接（CC 一次响应可能输出多个 ● 块）
  if (blocks.length > 0) {
    const out = blocks.map(b => b.lines.join('\n').trim()).filter(Boolean).join('\n\n').trim();
    if (out) return out;
  }

  // ── 兜底：返回去 TUI 装饰后的全部纯文本 ──
  const fallback = cleaned
    .map(l => {
      // box-drawing 表格行保留原行，不剥边框
      const isTableLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(l) || (l.match(/│/g) || []).length >= 2;
      if (isTableLine) return l.trimEnd();
      // 普通 TUI 侧边框行剥掉单个 │
      return l.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '').trimEnd();
    })
    .filter(l => l.trim())
    .join('\n')
    .trim();

  // 如果用户消息也在里面（回显），尝试切掉用户消息之前的部分
  if (userMessage && userMessage.length > 4) {
    const idx = fallback.indexOf(userMessage);
    if (idx >= 0) {
      const after = fallback.slice(idx + userMessage.length).trim();
      if (after) return after;
    }
  }

  return fallback;
}

/** Claude Code Adapter 实现 */
const ccAdapter: CliAdapter = {
  kind: 'cc',
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

export default ccAdapter;
