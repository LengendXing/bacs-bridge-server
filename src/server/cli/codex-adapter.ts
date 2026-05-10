import type { CliAdapter, CliStartConfig } from './types.js';
import type { RemoteExecutor } from '../executor/types.js';

const SESSION_PREFIX = 'codex';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';

function buildStartCmd(sessionName: string, cfg: CliStartConfig): string {
  let innerCmd = CODEX_BIN;

  if (cfg.providerKind === 'custom') {
    const parts: string[] = [];

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

function isIdle(processName: string, executor: RemoteExecutor): Promise<boolean> {
  const sessionName = `${SESSION_PREFIX}-${processName}`;
  return executor.capturePane(sessionName, 15).then(res => {
    if (res.error) return false;
    const tail = res.output;
    if (/\(suggest\)|\(auto-edit\)|\(full-auto\)/.test(tail)) return true;
    if (/^\s*>\s*$/m.test(tail)) return true;
    const lastLines = tail.split('\n').slice(-5).join('\n');
    if (!/thinking|running|executing|processing/i.test(lastLines)) {
      const lastNonEmpty = lastLines.split('\n').filter(l => l.trim()).pop() || '';
      if (/^\s*>\s*$/.test(lastNonEmpty)) return true;
    }
    return false;
  });
}

function extractReply(raw: string, userMessage: string): string {
  if (!raw) return '';
  let lines = raw.split(/\r?\n/);

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

  return lines
    .filter(l => l.trim())
    .filter(l => !/^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(l.trim()))
    .map(l => l.replace(/^\s*│\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

const codexAdapter: CliAdapter = {
  kind: 'codex',
  sessionPrefix: SESSION_PREFIX,

  buildStartCmd,

  sendInput(sessionName: string, text: string, executor: RemoteExecutor) {
    return executor.sendInput(sessionName, text);
  },

  capturePane(sessionName: string, lines: number | undefined, executor: RemoteExecutor) {
    return executor.capturePane(sessionName, lines ?? 500);
  },

  extractReply,

  isIdle,

  listSessions(executor: RemoteExecutor) {
    return executor.listSessionsByPrefix(SESSION_PREFIX);
  },

  sessionExists(processName: string, executor: RemoteExecutor) {
    return executor.sessionExists(`${SESSION_PREFIX}-${processName}`);
  },
};

export default codexAdapter;
