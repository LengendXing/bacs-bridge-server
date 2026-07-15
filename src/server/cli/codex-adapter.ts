import type { CliAdapter, CliStartConfig, CliState, ChoicePanel } from './types.js';
import type { RemoteExecutor } from '../executor/types.js';
import { extractChoicePanel as ccExtractChoicePanel, sendChoice as ccSendChoice } from './cc-adapter.js';

const SESSION_PREFIX = 'codex';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';

function shellSingleQuote(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}

function buildStartCmd(sessionName: string, cfg: CliStartConfig): string {
  // 同 cc-adapter：ssh2 非交互非登录 shell 受 Ubuntu/Debian rc 守卫拦截，
  // 用 `bash -ilc` 强制加载远程 rc，使得 local 模式能拿到 ~/.bashrc 里的 OPENAI_*。
  const lines: string[] = [];

  if (cfg.providerKind === 'custom') {
    if (cfg.envVars.CODEX_HOME) lines.push(`export CODEX_HOME=${shellSingleQuote(cfg.envVars.CODEX_HOME)}`);
    if (cfg.envVars.OPENAI_BASE_URL) lines.push(`export OPENAI_BASE_URL=${shellSingleQuote(cfg.envVars.OPENAI_BASE_URL)}`);
    if (cfg.envVars.OPENAI_API_KEY) lines.push(`export OPENAI_API_KEY=${shellSingleQuote(cfg.envVars.OPENAI_API_KEY)}`);
    if (cfg.modelId) lines.push(`export OPENAI_MODEL=${shellSingleQuote(cfg.modelId)}`);
  }
  // codex CLI：模型用 `-m <id>`，effort 用 `-c model_reasoning_effort=<level>`（本地实测）
  const modelArg = cfg.modelId ? ` -m ${shellSingleQuote(cfg.modelId)}` : '';
  const effortArg = cfg.effort ? ` -c model_reasoning_effort=${shellSingleQuote(cfg.effort)}` : '';
  lines.push(`exec ${CODEX_BIN}${modelArg}${effortArg}`);

  const bashScript = lines.join('; ');
  const escapedScript = bashScript.replace(/'/g, `'\\''`);
  const innerCmd = `bash -ilc '${escapedScript}'`;
  const escapedForTmux = innerCmd.replace(/"/g, '\\"');
  return `tmux new-session -d -s ${sessionName} "${escapedForTmux}"`;
}

function isIdle(processName: string, executor: RemoteExecutor): Promise<boolean> {
  return detectState(processName, executor).then((s) => s === 'idle');
}

function detectState(processName: string, executor: RemoteExecutor): Promise<CliState> {
  const sessionName = `${SESSION_PREFIX}-${processName}`;
  return executor.capturePane(sessionName, 60).then((res) => {
    if (res.error) return 'working';
    const tail = res.output;

    // 优先：决策面板
    const panel = extractChoicePanel(tail);
    if (panel) return 'awaiting_choice';

    // 工作中
    if (/thinking|running|executing|processing/i.test(tail.split('\n').slice(-8).join('\n'))) {
      return 'working';
    }

    // 空闲：codex 输入光标 ">"（或带 mode 标记）
    if (/\(suggest\)|\(auto-edit\)|\(full-auto\)/.test(tail)) return 'idle';
    if (/^\s*>\s*$/m.test(tail)) return 'idle';
    const lastLines = tail.split('\n').slice(-5).join('\n');
    const lastNonEmpty = lastLines.split('\n').filter((l) => l.trim()).pop() || '';
    if (/^\s*>\s*$/.test(lastNonEmpty)) return 'idle';

    return 'working';
  });
}

/** codex 的决策面板与 cc 类似（同样是 ╭─...─╮ 框 + 数字./❯ 选项），复用 cc 的实现 */
function extractChoicePanel(raw: string): ChoicePanel | null {
  return ccExtractChoicePanel(raw);
}

function sendChoice(
  sessionName: string,
  userReply: string,
  panel: ChoicePanel,
  executor: RemoteExecutor,
): Promise<{ ok: boolean; error?: string; chosenIndex?: number }> {
  return ccSendChoice(sessionName, userReply, panel, executor);
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
  detectState,
  extractChoicePanel,
  sendChoice,

  listSessions(executor: RemoteExecutor) {
    return executor.listSessionsByPrefix(SESSION_PREFIX);
  },

  sessionExists(processName: string, executor: RemoteExecutor) {
    return executor.sessionExists(`${SESSION_PREFIX}-${processName}`);
  },

  async getConversationName(processName: string, executor: RemoteExecutor): Promise<string | null> {
    try {
      const result = await executor.exec(`tmux list-panes -t ${SESSION_PREFIX}-${processName} -F '#{pane_pid}' 2>/dev/null`);
      const panePid = (result?.stdout || '').trim();
      if (!panePid) return null;
      const sessionFile = `${process.env.HOME || '/root'}/.codex/sessions/${panePid}.json`;
      const catResult = await executor.exec(`cat ${sessionFile} 2>/dev/null`);
      if (!catResult?.stdout) return null;
      const sessionData = JSON.parse(catResult.stdout);
      return sessionData?.name || null;
    } catch {
      return null;
    }
  },

  extractToolCalls(_raw: string, _maxItems?: number): string[] {
    return [];
  },

  extractTiming(_raw: string): number {
    return 0;
  },

  extractToolCount(_raw: string): Record<string, number> {
    return {};
  },
};

export default codexAdapter;
