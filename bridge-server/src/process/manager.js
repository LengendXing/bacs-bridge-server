const { execSync } = require('child_process');
const comm = require('./communicator');
const store = require('../binding/store');

const MAX_CONCURRENT = require('../config').load().bridge.max_concurrent;

function start(processName) {
  const sessions = comm.listSessions();
  if (sessions.includes(processName)) {
    return { error: `进程 ${processName} 已在运行` };
  }
  if (sessions.length >= MAX_CONCURRENT) {
    return { error: `已达到最大并发数 ${MAX_CONCURRENT}` };
  }

  try {
    const claudeBin = process.env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`;
    const sessionName = comm.sessionName(processName);
    execSync(`tmux new-session -d -s ${sessionName} ${claudeBin}`, { stdio: 'ignore' });
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
    // 同步实际在线状态
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
    return { process_name: processName, feishu_target: null, feishu_type: null, status: 'online' };
  }
  return { process_name: processName, status: 'offline' };
}

module.exports = { start, stop, getStatus, getStatusFor };
