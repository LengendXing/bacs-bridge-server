const SESSION_PREFIX = 'cc';
const CLAUDE_BIN = process.env.CLAUDE_BIN || `${process.env.HOME}/.local/bin/claude`;
function buildStartCmd(sessionName, cfg) {
    let innerCmd = CLAUDE_BIN;
    if (cfg.providerKind === 'custom') {
        const parts = [];
        if (cfg.envVars.ANTHROPIC_BASE_URL) {
            const safeUrl = cfg.envVars.ANTHROPIC_BASE_URL.replace(/'/g, "'\\''");
            parts.push(`ANTHROPIC_BASE_URL='${safeUrl}'`);
        }
        if (cfg.envVars.ANTHROPIC_API_KEY) {
            const safeKey = cfg.envVars.ANTHROPIC_API_KEY.replace(/'/g, "'\\''");
            parts.push(`ANTHROPIC_API_KEY='${safeKey}'`);
        }
        parts.push('ANTHROPIC_AUTH_TOKEN=');
        if (parts.length) {
            innerCmd = `env ${parts.join(' ')} ${innerCmd}`;
        }
    }
    const escaped = innerCmd.replace(/"/g, '\\"');
    return `tmux new-session -d -s ${sessionName} "${escaped}"`;
}
function isIdle(processName, executor) {
    const sessionName = `${SESSION_PREFIX}-${processName}`;
    return executor.capturePane(sessionName, 15).then(res => {
        if (res.error)
            return false;
        const tail = res.output;
        if (/esc to interrupt/i.test(tail))
            return false;
        return /❯/.test(tail) || /\? for shortcuts/.test(tail);
    });
}
function extractReply(raw, userMessage) {
    if (!raw)
        return '';
    let rawLines = raw.split(/\r?\n/);
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
    const cleaned = [];
    for (const line of rawLines) {
        const trimmed = line.trim();
        if (trimmed && /^[╭╰╯╮─━│┃┌┐└┘\s]+$/.test(trimmed))
            continue;
        if (/^\s*[╭╰]/.test(line))
            continue;
        if (/^\s*│.*(Welcome back|Tips for getting started|Claude Code v|What.s new|Fixed:|API Usage|\/release-notes|\/login|\/logout|\/settings|cwd:|Try ")/.test(line))
            continue;
        if (/^\s*│\s*>\s/.test(line))
            continue;
        if (/^\s*❯/.test(line))
            continue;
        if (/^\s*✻/.test(line))
            continue;
        if (/(\? for shortcuts|ctrl\+o to expand|ctrl\+r to redo|ctrl\+c to)/i.test(line))
            continue;
        if (/^\s*Listed\s+\d+\s+(director|file)/i.test(line))
            continue;
        cleaned.push(line);
    }
    const blocks = [];
    let current = null;
    function commit() {
        if (current && current.lines.length) {
            while (current.lines.length && !current.lines[current.lines.length - 1].trim()) {
                current.lines.pop();
            }
            if (current.lines.length)
                blocks.push(current);
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
        if (/^\s*⎿/.test(line))
            continue;
        if (!current)
            continue;
        if (current.skip)
            continue;
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
    if (blocks.length > 0) {
        const out = blocks.map(b => b.lines.join('\n').trim()).filter(Boolean).join('\n\n').trim();
        if (out)
            return out;
    }
    const fallback = cleaned
        .map(l => {
        const isTableLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(l) || (l.match(/│/g) || []).length >= 2;
        if (isTableLine)
            return l.trimEnd();
        return l.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '').trimEnd();
    })
        .filter(l => l.trim())
        .join('\n')
        .trim();
    if (userMessage && userMessage.length > 4) {
        const idx = fallback.indexOf(userMessage);
        if (idx >= 0) {
            const after = fallback.slice(idx + userMessage.length).trim();
            if (after)
                return after;
        }
    }
    return fallback;
}
const ccAdapter = {
    kind: 'cc',
    sessionPrefix: SESSION_PREFIX,
    buildStartCmd,
    sendInput(sessionName, text, executor) {
        return executor.sendInput(sessionName, text);
    },
    capturePane(sessionName, lines, executor) {
        return executor.capturePane(sessionName, lines ?? 500);
    },
    extractReply,
    isIdle,
    listSessions(executor) {
        return executor.listSessionsByPrefix(SESSION_PREFIX);
    },
    sessionExists(processName, executor) {
        return executor.sessionExists(`${SESSION_PREFIX}-${processName}`);
    },
};
export default ccAdapter;
