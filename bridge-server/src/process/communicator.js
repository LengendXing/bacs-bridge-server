const { execSync, exec } = require('child_process');
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
  // 转义单引号防止命令注入
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

// ── 状态轮询 ──
const pollers = {};   // processName → { interval, lastLength, timerId, onNewOutput }

function startPolling(processName, onNewOutput) {
  if (pollers[processName]) return;

  let lastLength = 0;
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

  pollers[processName] = { timerId, lastLength };
}

function stopPolling(processName) {
  if (!pollers[processName]) return;
  clearInterval(pollers[processName].timerId);
  delete pollers[processName];
}

module.exports = { sessionName, sessionExists, sendInput, captureOutput, listSessions, startPolling, stopPolling };
