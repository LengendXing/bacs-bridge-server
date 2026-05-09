const { execSync } = require('child_process');
const comm = require('./communicator');
const store = require('../binding/store');
const config = require('../config').load();

const MAX_CONCURRENT = config.bridge.max_concurrent;

// 构建 tmux new-session 命令
// 自定义模式：在命令字符串里前缀注入 ANTHROPIC_* 环境变量，仅作用于该子进程
// 系统模式：不注入，CC 子进程继承 bridge-server 的环境变量
function buildTmuxStartCmd(sessionName, claudeMode, claudeBaseUrl, claudeApiKey) {
  const claudeBin = process.env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`;

  let innerCmd;
  if (claudeMode === 'custom' && claudeBaseUrl && claudeApiKey) {
    // 安全：通过 shell env 临时变量注入，不写入任何文件，不影响系统环境
    const safeBaseUrl = claudeBaseUrl.replace(/'/g, "'\\''");
    const safeApiKey = claudeApiKey.replace(/'/g, "'\\''");
    innerCmd = `env ANTHROPIC_BASE_URL='${safeBaseUrl}' ANTHROPIC_API_KEY='${safeApiKey}' ANTHROPIC_AUTH_TOKEN='' ${claudeBin}`;
  } else {
    innerCmd = claudeBin;
  }

  return `tmux new-session -d -s ${sessionName} "${innerCmd.replace(/"/g, '\\"')}"`;
}

function start(processName, opts = {}) {
  const { claude_mode, claude_base_url, claude_api_key } = opts;

  const sessions = comm.listSessions();
  if (sessions.includes(processName)) {
    return { error: `进程 ${processName} 已在运行` };
  }
  if (sessions.length >= MAX_CONCURRENT) {
    return { error: `已达到最大并发数 ${MAX_CONCURRENT}` };
  }

  try {
    const sessionName = comm.sessionName(processName);
    const cmd = buildTmuxStartCmd(sessionName, claude_mode, claude_base_url, claude_api_key);
    execSync(cmd, { stdio: 'ignore', shell: '/bin/bash' });
    return { ok: true, process_name: processName };
  } catch (e) {
    return { error: `启动失败: ${e.message}` };
  }
}

function stop(processName) {
  if (!comm.sessionExists(processName)) {
    return { error: `进程 ${processName} 未在运行` };
  }
  try {
    execSync(`tmux kill-session -t ${comm.sessionName(processName)}`, { stdio: 'ignore' });
    comm.stopPolling(processName);
    store.updateStatus(processName, 'offline');
    return { ok: true };
  } catch (e) {
    return { error: `停止失败: ${e.message}` };
  }
}

function getStatus() {
  const bindings = store.getAll();
  const sessions = comm.listSessions();
  return bindings.map(b => {
    const online = sessions.includes(b.process_name);
    if (b.status !== (online ? 'online' : 'offline')) {
      store.updateStatus(b.process_name, online ? 'online' : 'offline');
    }
    return { ...b, status: online ? 'online' : 'offline' };
  });
}

function getStatusFor(processName) {
  const binding = store.getByProcess(processName);
  const online = comm.sessionExists(processName);
  if (binding) {
    return { ...binding, status: online ? 'online' : 'offline' };
  }
  if (online) {
    return { process_name: processName, feishu_app_id: null, status: 'online' };
  }
  return { process_name: processName, status: 'offline' };
}

module.exports = { start, stop, getStatus, getStatusFor };
