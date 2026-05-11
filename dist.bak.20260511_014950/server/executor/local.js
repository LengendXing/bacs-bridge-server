import { execSync } from 'child_process';
export class LocalExecutor {
    kind = 'local';
    machineId = null;
    async exec(cmd, options) {
        try {
            const stdout = execSync(cmd, {
                encoding: 'utf-8',
                timeout: options?.timeout ?? 10000,
                shell: options?.shell ?? '/bin/bash',
                cwd: options?.cwd,
                env: options?.env ? { ...process.env, ...options.env } : process.env,
            });
            return { stdout, stderr: '', exitCode: 0, ok: true };
        }
        catch (e) {
            return {
                stdout: e.stdout ?? '',
                stderr: e.stderr ?? '',
                exitCode: e.status ?? null,
                ok: false,
                error: e.message,
            };
        }
    }
    async sessionExists(sessionName) {
        const r = await this.exec(`tmux has-session -t ${sessionName} 2>/dev/null`, { timeout: 5000 });
        return r.ok;
    }
    async listSessionsByPrefix(prefix) {
        const r = await this.exec('tmux list-sessions 2>/dev/null');
        if (!r.ok)
            return [];
        const sessions = [];
        for (const line of r.stdout.split('\n')) {
            const m = line.match(new RegExp(`^${prefix}-([^:]+):`));
            if (m)
                sessions.push(m[1]);
        }
        return sessions;
    }
    async capturePane(sessionName, lines = 500) {
        const r = await this.exec(`tmux capture-pane -t ${sessionName} -p -S -${lines}`, { timeout: 15000 });
        if (!r.ok)
            return { output: '', error: r.error };
        return { output: r.stdout };
    }
    async sendInput(sessionName, text) {
        const exists = await this.sessionExists(sessionName);
        if (!exists)
            return { ok: false, error: `会话 ${sessionName} 不在线` };
        try {
            const b64 = Buffer.from(text, 'utf-8').toString('base64');
            await this.exec(`echo ${b64} | base64 -d | tmux load-buffer -b cli_in -`);
            await this.exec(`tmux paste-buffer -b cli_in -t ${sessionName}`);
            await this.exec(`tmux delete-buffer -b cli_in 2>/dev/null || true`);
            await this.exec(`tmux send-keys -t ${sessionName} Enter`);
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: `send-keys 失败: ${e.message}` };
        }
    }
    async killSession(sessionName) {
        await this.exec(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
    }
}
