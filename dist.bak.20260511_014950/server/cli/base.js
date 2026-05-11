/**
 * @module cli/base
 * @description 公共 tmux 工具函数
 *
 * 所有 CLI Adapter 共享的 tmux 操作：
 * - sessionExists / listSessionsByPrefix — 会话查询
 * - capturePane — 抓取 pane 内容
 * - sendInput — 安全输入（base64 + load-buffer）
 * - killSession — 终止会话
 */
import { execSync } from 'child_process';
/**
 * 检查 tmux 会话是否存在
 *
 * @param sessionName - 完整 tmux 会话名（含前缀，如 'cc-work'）
 * @returns true 表示会话存在
 */
export function sessionExists(sessionName) {
    try {
        execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 列出指定前缀的 tmux 会话（返回进程名，不含前缀）
 *
 * @param prefix - 会话名前缀（如 'cc' / 'codex'）
 * @returns 进程名数组
 *
 * @example
 * ```ts
 * listSessionsByPrefix('cc');   // ['work', 'dev']
 * listSessionsByPrefix('codex'); // ['research']
 * ```
 */
export function listSessionsByPrefix(prefix) {
    try {
        const out = execSync('tmux list-sessions 2>/dev/null', {
            encoding: 'utf-8',
            shell: '/bin/bash',
        });
        const sessions = [];
        for (const line of out.split('\n')) {
            const m = line.match(new RegExp(`^${prefix}-([^:]+):`));
            if (m)
                sessions.push(m[1]);
        }
        return sessions;
    }
    catch {
        return [];
    }
}
/**
 * 抓取 tmux pane 当前内容
 *
 * @param sessionName - 完整 tmux 会话名
 * @param lines - 从底部往上抓取的行数，默认 500
 * @returns pane 文本内容，或错误信息
 */
export function capturePane(sessionName, lines = 500) {
    try {
        const out = execSync(`tmux capture-pane -t ${sessionName} -p -S -${lines}`, { encoding: 'utf-8', timeout: 5000 });
        return { output: out };
    }
    catch (e) {
        return { output: '', error: e.message };
    }
}
/**
 * 安全发送多行/特殊字符到 tmux 会话
 *
 * 使用 base64 编码 + tmux load-buffer/paste-buffer 模式，
 * 避免所有 shell 转义陷阱（多行消息 / $(cmd) / 反引号 / 单双引号）。
 *
 * @param sessionName - 完整 tmux 会话名
 * @param text - 用户输入的 prompt 文本
 * @returns 操作结果
 */
export function sendInput(sessionName, text) {
    if (!sessionExists(sessionName)) {
        return { ok: false, error: `会话 ${sessionName} 不在线` };
    }
    try {
        // base64 编码传入 tmux buffer，规避所有 shell 转义
        const b64 = Buffer.from(text, 'utf-8').toString('base64');
        execSync(`echo ${b64} | base64 -d | tmux load-buffer -b cli_in -`, {
            stdio: 'ignore',
            shell: '/bin/bash',
        });
        execSync(`tmux paste-buffer -b cli_in -t ${sessionName}`, { stdio: 'ignore' });
        execSync(`tmux delete-buffer -b cli_in 2>/dev/null || true`, {
            stdio: 'ignore',
            shell: '/bin/bash',
        });
        // 触发 Enter 提交
        execSync(`tmux send-keys -t ${sessionName} Enter`, { stdio: 'ignore' });
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: `send-keys 失败: ${e.message}` };
    }
}
/**
 * 终止 tmux 会话
 *
 * @param sessionName - 完整 tmux 会话名
 */
export function killSession(sessionName) {
    try {
        execSync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`, {
            stdio: 'ignore',
            shell: '/bin/bash',
        });
    }
    catch { /* ignore */ }
}
