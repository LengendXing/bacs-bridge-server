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

// 安全发送多行/特殊字符到 tmux：使用 set-buffer + paste-buffer 避免 shell 注入
function sendInput(processName, text) {
  if (!sessionExists(processName)) {
    return { error: `进程 ${processName} 不在线` };
  }
  try {
    const session = sessionName(processName);
    // 用 base64 经 tmux load-buffer 传入，规避所有 shell 转义陷阱
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    execSync(`echo ${b64} | base64 -d | tmux load-buffer -b cc_in -`, { stdio: 'ignore', shell: '/bin/bash' });
    execSync(`tmux paste-buffer -b cc_in -t ${session}`, { stdio: 'ignore' });
    execSync(`tmux delete-buffer -b cc_in 2>/dev/null || true`, { stdio: 'ignore', shell: '/bin/bash' });
    // 触发 Enter
    execSync(`tmux send-keys -t ${session} Enter`, { stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    return { error: `send-keys 失败: ${e.message}` };
  }
}

function captureOutput(processName, lines = 500) {
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
    const out = execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf-8', shell: '/bin/bash' });
    const sessions = [];
    for (const line of out.split('\n')) {
      const m = line.match(/^(claude-[^:]+):/);
      if (m) sessions.push(m[1].replace(/^claude-/, ''));
    }
    return sessions;
  } catch {
    return [];
  }
}

// ── 状态检测 ──

// 检查 CC 是否处于待命状态（❯ 提示符表示已完成，等待新输入）
function isIdle(processName) {
  const res = captureOutput(processName, 15);
  if (res.error) return false;
  const tail = res.output;
  // CC 处理中会在状态栏显示 "Esc to interrupt"，有此字样则必定处于忙碌状态
  if (/esc to interrupt/i.test(tail)) return false;
  // 空闲：底部出现 ❯ 提示符或 shortcuts 提示，且无"esc to interrupt"
  return /❯/.test(tail) || /\? for shortcuts/.test(tail);
}

function isProcessing(processName) {
  return sessionExists(processName) && !isIdle(processName);
}

// ── 从 TUI 纯文本中提取最终回复 ──
// 策略：分块提取所有「●」标记的助手回复块，跳过工具调用块（● ToolName(...)）和工具结果（⎿）
// 兜底：找不到任何 ● 块时，返回去除 TUI 装饰后的全部纯文本
function extractReplyContent(raw, userMessage) {
  if (!raw) return '';

  const rawLines = raw.split(/\r?\n/);

  // ── Step 1: 去除 TUI 装饰行 ──
  const cleaned = [];
  for (const line of rawLines) {
    const trimmed = line.trim();

    // 仅由框架字符组成的行
    if (trimmed && /^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(trimmed)) continue;

    // 框架顶/底边 ╭...╮ / ╰...╯
    if (/^\s*[╭╰]/.test(line)) continue;

    // CC 头部/侧边栏英文提示行（带 │ 边框）
    if (/^\s*│.*(Welcome back|Tips for getting started|Claude Code v|What.s new|Fixed:|API Usage|\/release-notes|\/login|\/logout|\/settings|cwd:|Try ").*/.test(line)) continue;

    // 输入框 │ > xxx │（用户输入回显）
    if (/^\s*│\s*>\s/.test(line)) continue;

    // ❯ 提示符行
    if (/^\s*❯/.test(line)) continue;

    // ✻ 处理时间提示（"✻ Sautéed for 12s ⋯"）
    if (/^\s*✻/.test(line)) continue;

    // CC 操作提示
    if (/(\? for shortcuts|ctrl\+o to expand|ctrl\+r to redo|ctrl\+c to)/i.test(line)) continue;
    if (/^\s*Listed\s+\d+\s+(director|file)/i.test(line)) continue;

    cleaned.push(line);
  }

  // ── Step 2: 按 ● 块分组，跳过工具调用块 ──
  const blocks = [];
  let current = null;

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
      // 让当前 skip 块继续吸收（不破坏块结构）
      continue;
    }

    if (!current) continue; // 块外的杂行直接丢

    if (current.skip) continue; // 工具调用块内任何续行都跳过

    // 助手块续行：保留缩进续行 + 段内空行
    if (!trimmed) {
      // 段内空行允许（保留段落分隔）
      current.lines.push('');
      continue;
    }
    if (/^\s{2,}/.test(line)) {
      current.lines.push(trimmed);
      continue;
    }

    // 顶格非 ● 行：结束当前助手块
    commit();
  }
  commit();

  // ── Step 3: 拼接最终回复 ──
  // 如果有助手块，取最后一个（CC 一次响应可能输出多个 ●，最后一个通常是结论）
  // 但有时回复跨多个块（如先描述后总结），保险起见全部拼接
  if (blocks.length > 0) {
    const out = blocks.map(b => b.lines.join('\n').trim()).filter(Boolean).join('\n\n').trim();
    if (out) return out;
  }

  // ── 兜底：返回去 TUI 装饰后的全部纯文本 ──
  const fallback = cleaned
    .map(l => l.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '').trimEnd())
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
    } else if (res.output.length < lastLength) {
      // pane 被清屏（CC 重绘）→ 重置基线但不触发回调
      lastLength = res.output.length;
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
