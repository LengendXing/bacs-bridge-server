const { execSync } = require('child_process');
const config = require('../config').load();

const SESSION_PREFIX = 'claude';

function sessionName(processName) {
  return `${SESSION_PREFIX}-${processName}`;
}

function sessionExists(processName) {
  try {
    execSync(`tmux has-session -t ${sessionName(processName)} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sendInput(processName, text) {
  if (!sessionExists(processName)) {
    return { error: `进程 ${processName} 不在线` };
  }
  const safe = text.replace(/'/g, "'\\''");
  execSync(`tmux send-keys -t ${sessionName(processName)} '${safe}' Enter`, { stdio: 'ignore' });
  return { ok: true };
}

function captureOutput(processName, lines = 200) {
  if (!sessionExists(processName)) {
    return { error: `进程 ${processName} 不在线` };
  }
  try {
    const out = execSync(
      `tmux capture-pane -t ${sessionName(processName)} -p -S -${lines}`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return { output: out };
  } catch (e) {
    return { error: e.message };
  }
}

function listSessions() {
  try {
    const out = execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf-8' });
    const sessions = [];
    for (const line of out.split('\n')) {
      const m = line.match(/^(claude-[^:]+):/);
      if (m) sessions.push(m[1].replace('claude-', ''));
    }
    return sessions;
  } catch {
    return [];
  }
}

// ── 状态检测 ──

// 检查 CC 是否处于待命状态（❯ 提示符表示已完成，等待新输入）
function isIdle(processName) {
  const res = captureOutput(processName, 5);
  if (res.error) return false;
  const tail = res.output.trim();
  // 空闲状态：最后几行包含 ❯ 提示符或 shortcuts 提示
  return tail.includes('❯') || tail.includes('? for shortcuts');
}

// 检查 CC 是否在处理中（没有 ❯ 提示符 = 正在思考/执行工具）
function isProcessing(processName) {
  return sessionExists(processName) && !isIdle(processName);
}

// ── 从 TUI 纯文本中提取最终回复 ──
// CC 在交互模式下输出 TUI 渲染画面（非 stream-json），需要解析纯文本提取回复内容
function extractReplyContent(raw, userMessage) {
  if (!raw) return '';

  const lines = raw.split('\n');
  const replyLines = [];
  let inToolBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行
    if (!trimmed) continue;

    // TUI 边框/分隔线: ╭ ╰ │ 或纯 ─
    if (/^[╭╰─╯╮]+$/.test(trimmed.replace(/\s/g, ''))) continue;
    if (/^─+$/.test(trimmed)) continue;

    // TUI 框架线（╭ ╰ 开头属于 CC 头部/底部边框）
    if (trimmed.startsWith('╭') || trimmed.startsWith('╰')) continue;

    // TUI 框架竖边框行 — 只过滤含 CC 头部/侧边栏英文字段的行，保留表格的 │ 行
    if (trimmed.startsWith('│') || trimmed.endsWith('│')) {
      if (/Welcome back|Tips for getting|Claude Code v|What.s new|Fixed:|Opus|API Usage|\/release-notes|─+/.test(trimmed)) continue;
      // 侧边栏空白分隔行（│ 空格... │ 空格... │）
      if (/^│\s+│/.test(trimmed)) continue;
    }

    // TUI 操作提示（Listed N directory, ctrl+o to expand 等）
    if (/^Listed\s+\d+\s+directory/.test(trimmed)) continue;
    if (trimmed.includes('ctrl+o') || trimmed.includes('? for shortcuts')) continue;

    // ❯ 提示符行（用户输入或空提示符）
    if (trimmed.startsWith('❯')) continue;

    // ✻ Sautéed / 处理时间指示
    if (trimmed.startsWith('✻')) continue;

    // ● ToolName(args) — 工具调用
    if (/^●\s+\w+\(/.test(trimmed)) {
      inToolBlock = true;
      continue;
    }

    // ⎿ tool result — 工具执行结果
    if (trimmed.startsWith('⎿')) continue;

    // ● 开头的回复文本（● 当前工作目录是 /root。）
    if (trimmed.startsWith('●')) {
      inToolBlock = false;
      const content = trimmed.replace(/^●\s*/, '');
      // 二次确认不是工具调用（含括号）
      if (content && !/^\w+\(/.test(content)) {
        replyLines.push(content);
      }
      continue;
    }

    // 跳过用户消息回显（如果能在 pane 中找到）
    if (userMessage && trimmed === userMessage) continue;

    // 普通回复行
    if (!inToolBlock) {
      replyLines.push(line.trim());
    }
  }

  return replyLines.length > 0 ? replyLines.join('\n').trim() : '';
}

// ── 状态轮询 ──
const pollers = {};   // processName → { timerId }

function startPolling(processName, onNewOutput) {
  if (pollers[processName]) return;

  // 基线 = 当前 pane 长度，避免把历史内容当作新输出
  let lastLength = (captureOutput(processName).output || '').length;
  const timerId = setInterval(() => {
    const res = captureOutput(processName);
    if (res.error) {
      clearInterval(timerId);
      delete pollers[processName];
      return;
    }
    if (res.output.length > lastLength) {
      const delta = res.output.slice(lastLength);
      lastLength = res.output.length;
      onNewOutput(delta);
    }
  }, config.bridge.poll_interval * 1000);

  pollers[processName] = { timerId };
}

function stopPolling(processName) {
  if (!pollers[processName]) return;
  clearInterval(pollers[processName].timerId);
  delete pollers[processName];
}

module.exports = { sessionName, sessionExists, sendInput, captureOutput, listSessions, startPolling, stopPolling, extractReplyContent, isIdle, isProcessing };
