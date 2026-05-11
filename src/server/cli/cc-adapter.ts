import type { CliAdapter, CliStartConfig } from './types.js';
import type { RemoteExecutor } from '../executor/types.js';
import config from '../config.js';

const SESSION_PREFIX = 'cc';
// 远端机器的 claude 路径默认走 PATH 查找，避免把本地 bridge 进程的 HOME 路径误带到远程
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function shellSingleQuote(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}

function buildStartCmd(sessionName: string, cfg: CliStartConfig): string {
  // 远程主机的登录态通常 export 在 ~/.bashrc（如 ANTHROPIC_AUTH_TOKEN / BASE_URL），
  // 但 ssh2 的非交互非登录 shell 受 Debian/Ubuntu `[ -z "$PS1" ] && return` 守卫拦截，
  // 导致 rc 被跳过、claude 报 "Not logged in"。
  // 通过 `bash -ilc` 强制交互+登录，绕过守卫并加载 .bash_profile/.bashrc；
  // custom 模式的 env 注入改写为 export ... ; exec claude，保证绑定值覆盖 rc 同名变量。
  const lines: string[] = [];

  if (cfg.providerKind === 'custom') {
    // 屏蔽远程 `claude login` 写入的 OAuth 凭据，确保绑定配置生效；不动远程文件
    lines.push('unset CLAUDE_CODE_OAUTH_TOKEN');
    if (cfg.envVars.ANTHROPIC_BASE_URL) {
      lines.push(`export ANTHROPIC_BASE_URL=${shellSingleQuote(cfg.envVars.ANTHROPIC_BASE_URL)}`);
    }
    const token = cfg.envVars.ANTHROPIC_AUTH_TOKEN ?? cfg.envVars.ANTHROPIC_API_KEY;
    if (token) {
      // 只设 ANTHROPIC_AUTH_TOKEN：claude CLI 检测到 ANTHROPIC_API_KEY 时会
      // 弹出 "Do you want to use this API key? 1/Yes 2/No" 交互确认，导致 tmux 阻塞。
      // AUTH_TOKEN 不触发该交互，且第三方中转站和官方 OAuth 都识别此字段。
      lines.push(`export ANTHROPIC_AUTH_TOKEN=${shellSingleQuote(token)}`);
    }
  }
  if (cfg.modelId) {
    lines.push(`export ANTHROPIC_MODEL=${shellSingleQuote(cfg.modelId)}`);
  }

  const modelArg = cfg.modelId ? ` --model ${shellSingleQuote(cfg.modelId)}` : '';
  lines.push(`exec ${CLAUDE_BIN}${modelArg}`);

  // bash 脚本整体用单引号包裹给 bash -ilc，对内部单引号做 `'\''` 闭合-转义-再开闭合
  const bashScript = lines.join('; ');
  const escapedScript = bashScript.replace(/'/g, `'\\''`);
  const innerCmd = `bash -ilc '${escapedScript}'`;
  // tmux 命令最外层用双引号包，需对内部双引号转义（bashScript 里目前不会出现双引号，但保留以防扩展）
  const escapedForTmux = innerCmd.replace(/"/g, '\\"');
  return `tmux new-session -d -s ${sessionName} "${escapedForTmux}"`;
}

function isIdle(processName: string, executor: RemoteExecutor): Promise<boolean> {
  const sessionName = `${SESSION_PREFIX}-${processName}`;
  return executor.capturePane(sessionName, 15).then(res => {
    if (res.error) return false;
    const tail = res.output;
    if (/esc to interrupt/i.test(tail)) return false;
    return /❯/.test(tail) || /\? for shortcuts/.test(tail);
  });
}

function extractReply(raw: string, userMessage: string): string {
  if (!raw) return '';

  const originalLines = raw.split(/\r?\n/);
  let rawLines = originalLines;
  const debug = {
    totalLines: originalLines.length,
    cutIdx: -1,
    cutBy: '' as 'exact-prompt' | 'exact-fullmsg' | 'prompt-probe' | 'loose-probe' | 'none' | '',
    lastPromptIdx: -1,
    lastPromptKept: false,
    cleanedLen: 0,
    blocksLen: 0,
    fallbackLen: 0,
    finalLen: 0,
  };

  // 切割本轮回复：定位"本轮用户输入行"，其后即为本轮回复。
  // TUI 中用户输入会以 `❯ <msg>` 形式回显。pane 含多轮历史 → 必须可靠切到"本轮"，且避免短消息在历史里误匹配。
  if (userMessage && userMessage.trim()) {
    const needle = userMessage.trim();
    // 先把 `❯` 的位置全部找出来，倒序遍历，优先精确匹配整行 = `❯ <fullmsg>`
    const promptIdxs: number[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (/^\s*❯\s/.test(rawLines[i])) promptIdxs.push(i);
    }

    // 策略 A：倒序找 `❯ <userMessage 完整>`（trim 后整行剥掉 `❯ ` 前缀严格相等）
    for (let k = promptIdxs.length - 1; k >= 0; k--) {
      const idx = promptIdxs[k];
      const body = rawLines[idx].replace(/^\s*❯\s?/, '').trim();
      if (body === needle) { debug.cutIdx = idx; debug.cutBy = 'exact-prompt'; break; }
    }

    // 策略 B：倒序找 `❯ <line>` 且 line 包含完整 userMessage（处理消息后接空格/光标残留）
    if (debug.cutIdx < 0) {
      for (let k = promptIdxs.length - 1; k >= 0; k--) {
        const idx = promptIdxs[k];
        if (rawLines[idx].includes(needle)) { debug.cutIdx = idx; debug.cutBy = 'exact-fullmsg'; break; }
      }
    }

    // 策略 C：消息可能被 TUI 换行框换行成 `❯ <part1>` + `  <part2>`，倒序找连续行拼起来等于 needle 的起始 `❯`
    if (debug.cutIdx < 0 && needle.length > 20) {
      for (let k = promptIdxs.length - 1; k >= 0; k--) {
        const start = promptIdxs[k];
        // 拼接从 start 开始，到下一个 ❯ / `●` / 空行为止
        let joined = rawLines[start].replace(/^\s*❯\s?/, '');
        for (let j = start + 1; j < rawLines.length; j++) {
          const l = rawLines[j];
          if (/^\s*❯\s/.test(l) || /^\s*●/.test(l) || !l.trim()) break;
          joined += l.replace(/^\s+/, '');
        }
        const norm = joined.replace(/\s+/g, '');
        const needleNorm = needle.replace(/\s+/g, '');
        if (norm.includes(needleNorm) || needleNorm.includes(norm) && norm.length >= needleNorm.length * 0.6) {
          debug.cutIdx = start; debug.cutBy = 'prompt-probe'; break;
        }
      }
    }

    // 策略 D（最宽松，仅长消息才用回退切片）：长 userMessage 用 30 字符 probe 在 `❯` 行里搜
    if (debug.cutIdx < 0 && needle.length >= 12) {
      const probe = needle.slice(0, Math.min(30, needle.length));
      for (let k = promptIdxs.length - 1; k >= 0; k--) {
        const idx = promptIdxs[k];
        if (rawLines[idx].includes(probe)) { debug.cutIdx = idx; debug.cutBy = 'prompt-probe'; break; }
      }
    }

    if (debug.cutIdx >= 0) {
      rawLines = rawLines.slice(debug.cutIdx + 1);
    } else {
      debug.cutBy = 'none';
      // 切不到：不丢弃任何行，让后续的"最后一个 ❯ 待命光标行"防御 + blocks 提取处理整 pane
    }
  }

  // 二次防御：处理 pane 末尾的 `❯` 行（空闲光标 vs. 历史/本轮 prompt）
  // 关键：必须先按 promptBody 是否为空区分，再看其后是否有内容。
  // 之前的 bug：先判 after.length > 0，导致空闲光标 `❯` + ` ? for shortcuts` 被当成"历史 prompt 后还有内容"
  // → 走 slice(lastPromptIdx + 1) 把整段真实回复全部丢掉 → blocks/cleaned 为空 → 飞书"未能提取"
  // 同时：cc 的 TUI 输入框是 `│ ❯ ... │`，光标行也可能是 `│ ❯ │`（被边框包裹）→ 一并识别
  const promptLineRe = /^\s*(?:│\s*)?❯(?:\s|$)/;
  let lastPromptIdx = -1;
  for (let i = rawLines.length - 1; i >= 0; i--) {
    if (promptLineRe.test(rawLines[i])) { lastPromptIdx = i; break; }
  }
  debug.lastPromptIdx = lastPromptIdx;
  if (lastPromptIdx >= 0) {
    // 提取 promptBody：去掉左侧 `│` 边框 + `❯ ` 前缀，再去掉右侧 `│` 边框
    const promptBody = rawLines[lastPromptIdx]
      .replace(/^\s*(?:│\s*)?❯\s?/, '')
      .replace(/\s*│\s*$/, '')
      .trim();
    // "真实内容"严格定义：排除框线、快捷键/状态提示行
    const after = rawLines.slice(lastPromptIdx + 1).filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/^[\s│┃─━╭╰╯╮┌┐└┘]+$/.test(t)) return false;
      if (/(\? for shortcuts|esc to interrupt|ctrl\+[a-z]|to expand|to redo)/i.test(t)) return false;
      return true;
    });

    if (!promptBody) {
      // 空 ❯（光标待命行，含被边框包裹的 `│ ❯ │`）→ 总是丢掉它及之后，保留前面的回复
      rawLines = rawLines.slice(0, lastPromptIdx);
      debug.lastPromptKept = true;
    } else if (after.length > 0) {
      // 有 body 的 ❯ 且其后仍有真实内容 → 是历史 prompt，丢它之前 + 它本身
      rawLines = rawLines.slice(lastPromptIdx + 1);
    } else {
      // 有 body 的 ❯ 但后面只剩框线/快捷键提示 → 该 ❯ 大概率是本轮 user 输入回显
      // 此时本轮回复在 ❯ 之前已被前面的 cutIdx 裁掉，留下的是历史；保留 ❯ 之前内容更安全
      rawLines = rawLines.slice(0, lastPromptIdx);
    }
  }

  const cleaned: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();

    if (trimmed && /^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(trimmed)) continue;
    if (/^\s*[╭╰]/.test(line)) continue;
    if (/^\s*│.*(Welcome back|Tips for getting started|Claude Code v|What.s new|Fixed:|API Usage|\/release-notes|\/login|\/logout|\/settings|cwd:|Try ")/.test(line)) continue;
    if (/^\s*│\s*>\s/.test(line)) continue;
    if (/^\s*❯/.test(line)) continue;
    if (/^\s*│\s*❯/.test(line)) continue;
    if (/^\s*✻/.test(line)) continue;
    if (/(\? for shortcuts|ctrl\+o to expand|ctrl\+r to redo|ctrl\+c to)/i.test(line)) continue;
    if (/^\s*Listed\s+\d+\s+(director|file)/i.test(line)) continue;

    cleaned.push(line);
  }

  const blocks: { skip: boolean; lines: string[] }[] = [];
  let current: { skip: boolean; lines: string[] } | null = null;

  function commit() {
    if (current && current.lines.length) {
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

    const bulletMatch = line.match(/^(\s*)●\s*(.*)$/);
    if (bulletMatch) {
      commit();
      const content = bulletMatch[2];
      if (/^[A-Za-z_][\w.-]*\s*\(/.test(content)) {
        current = { skip: true, lines: [] };
        continue;
      }
      current = { skip: false, lines: content ? [content] : [] };
      continue;
    }

    if (/^\s*⎿/.test(line)) continue;

    if (!current) continue;
    if (current.skip) continue;

    if (!trimmed) {
      current.lines.push('');
      continue;
    }
    if (/^\s{2,}/.test(line)) {
      current.lines.push(trimmed);
      continue;
    }

    const isTableLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(line) ||
      (line.match(/│/g) || []).length >= 2;
    if (isTableLine) {
      current.lines.push(trimmed);
      continue;
    }

    commit();
  }
  commit();

  debug.cleanedLen = cleaned.length;
  debug.blocksLen = blocks.length;

  if (blocks.length > 0) {
    const out = blocks.map(b => b.lines.join('\n').trim()).filter(Boolean).join('\n\n').trim();
    if (out) {
      debug.finalLen = out.length;
      logExtractDebug('blocks', debug);
      return out;
    }
  }

  const fallback = cleaned
    .map(l => {
      const isTableLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(l) || (l.match(/│/g) || []).length >= 2;
      if (isTableLine) return l.trimEnd();
      return l.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '').trimEnd();
    })
    .filter(l => l.trim())
    .join('\n')
    .trim();
  debug.fallbackLen = fallback.length;

  if (userMessage && userMessage.length > 4) {
    const idx = fallback.indexOf(userMessage);
    if (idx >= 0) {
      const after = fallback.slice(idx + userMessage.length).trim();
      if (after) {
        debug.finalLen = after.length;
        logExtractDebug('fallback-after-msg', debug);
        return after;
      }
    }
  }

  if (fallback) {
    debug.finalLen = fallback.length;
    logExtractDebug('fallback', debug);
    return fallback;
  }

  // 最终兜底：blocks 空 + fallback 空。在 raw 里**整段**搜 `●` 后内容，避免严格切割误删本轮回复
  // 这是为了避免出现 "[CC 已完成处理，但未能提取到回复内容]" 这种空回复的兜底
  const rescued = rescueFromRaw(originalLines, userMessage);
  debug.finalLen = rescued.length;
  logExtractDebug(rescued ? 'rescue' : 'empty', debug);
  return rescued;
}

function rescueFromRaw(originalLines: string[], userMessage: string): string {
  // 倒序找最后一段连续 `●` bullet 块，返回其内容
  const bullets: string[] = [];
  let inBullet = false;
  let currentBullet: string[] = [];
  const collected: string[][] = [];

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i];
    const m = line.match(/^(\s*)●\s*(.*)$/);
    if (m) {
      if (inBullet && currentBullet.length) collected.push(currentBullet);
      currentBullet = [];
      inBullet = true;
      const content = m[2];
      // 跳过工具调用形式 `● Bash(...)` `● Read(...)`
      if (/^[A-Za-z_][\w.-]*\s*\(/.test(content)) {
        inBullet = false;
        currentBullet = [];
        continue;
      }
      if (content) currentBullet.push(content);
      continue;
    }
    if (!inBullet) continue;
    // bullet 块的延续：缩进行 / 表格行 / 空行
    if (/^\s*⎿/.test(line)) continue;
    if (/^\s*❯\s/.test(line)) {
      // 遇到下一个用户输入 → bullet 块结束
      if (currentBullet.length) collected.push(currentBullet);
      currentBullet = [];
      inBullet = false;
      continue;
    }
    if (/^\s{2,}/.test(line) || /[┌┐└┘├┤┬┴┼╪╫│]/.test(line)) {
      currentBullet.push(line.replace(/^\s+/, ''));
      continue;
    }
    if (!line.trim()) {
      currentBullet.push('');
      continue;
    }
    // 顶格非空行 → 块结束
    if (currentBullet.length) collected.push(currentBullet);
    currentBullet = [];
    inBullet = false;
  }
  if (inBullet && currentBullet.length) collected.push(currentBullet);

  if (!collected.length) {
    // 实在没有 `●` 内容 → 把整 pane 清洗一遍返回，至少飞书能看到 cc 的原始输出而不是冷冰冰的"未能提取"
    const lastResort = originalLines
      .filter(l => l.trim() && !/^[\s│┃─━╭╰╯╮┌┐└┘─━]+$/.test(l.trim()))
      .filter(l => !/^\s*❯/.test(l))
      .filter(l => !/(\? for shortcuts|esc to interrupt|ctrl\+[a-z])/i.test(l))
      .map(l => l.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '').trimEnd())
      .filter(l => l.trim())
      .join('\n')
      .trim();
    return lastResort.slice(0, 8000); // 防止异常情况下输出过长
  }

  // 取最后 N 个 bullet 块拼起来（启发：本轮回复总在最后；若有 userMessage，截 userMessage 之后的）
  const joined = collected.map(b => {
    while (b.length && !b[b.length - 1].trim()) b.pop();
    return b.join('\n').trim();
  }).filter(Boolean).join('\n\n').trim();

  if (userMessage && userMessage.length > 4) {
    const idx = joined.lastIndexOf(userMessage);
    if (idx >= 0) {
      const after = joined.slice(idx + userMessage.length).trim();
      if (after) return after;
    }
  }
  return joined;
}

function logExtractDebug(outcome: string, d: {
  totalLines: number; cutIdx: number; cutBy: string; lastPromptIdx: number;
  cleanedLen: number; blocksLen: number; fallbackLen: number; finalLen: number;
}): void {
  // 仅在异常或调试场景输出，避免污染正常日志
  if (outcome === 'empty' || outcome === 'rescue' || process.env.CC_ADAPTER_DEBUG === '1') {
    const tag = outcome === 'empty' ? 'ERROR' : outcome === 'rescue' ? 'WARN' : 'DEBUG';
    console.log(`[cc-adapter:${tag}] extractReply outcome=${outcome} totalLines=${d.totalLines} cutIdx=${d.cutIdx} cutBy=${d.cutBy} lastPromptIdx=${d.lastPromptIdx} cleanedLen=${d.cleanedLen} blocksLen=${d.blocksLen} fallbackLen=${d.fallbackLen} finalLen=${d.finalLen}`);
  }
}

const ccAdapter: CliAdapter = {
  kind: 'cc',
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

export default ccAdapter;
