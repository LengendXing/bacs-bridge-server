import { execSync } from 'child_process';
import type { RemoteExecutor, ExecResult, ExecOptions } from './types.js';

export class LocalExecutor implements RemoteExecutor {
  readonly kind = 'local' as const;
  readonly machineId = null;

  async exec(cmd: string, options?: ExecOptions): Promise<ExecResult> {
    try {
      const stdout = execSync(cmd, {
        encoding: 'utf-8',
        timeout: options?.timeout ?? 10000,
        shell: options?.shell ?? '/bin/bash',
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : process.env,
      });
      return { stdout, stderr: '', exitCode: 0, ok: true };
    } catch (e: any) {
      return {
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
        exitCode: e.status ?? null,
        ok: false,
        error: e.message,
      };
    }
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    const r = await this.exec(`tmux has-session -t ${sessionName} 2>/dev/null`, { timeout: 5000 });
    return r.ok;
  }

  async listSessionsByPrefix(prefix: string): Promise<string[]> {
    const r = await this.exec('tmux list-sessions 2>/dev/null');
    if (!r.ok) return [];
    const sessions: string[] = [];
    for (const line of r.stdout.split('\n')) {
      const m = line.match(new RegExp(`^${prefix}-([^:]+):`));
      if (m) sessions.push(m[1]);
    }
    return sessions;
  }

  async capturePane(sessionName: string, lines = 500): Promise<{ output: string; error?: string }> {
    const r = await this.exec(`tmux capture-pane -t ${sessionName} -p -S -${lines}`, { timeout: 15000 });
    if (!r.ok) return { output: '', error: r.error };
    return { output: r.stdout };
  }

  async sendInput(sessionName: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const exists = await this.sessionExists(sessionName);
    if (!exists) return { ok: false, error: `会话 ${sessionName} 不在线` };
    try {
      // 与 ssh.ts 保持一致：合并为单条 shell 命令 + 短 sleep + C-m，避免 cc TUI 在
      // paste 后立刻收到 Enter 时机过早而吞掉 Enter，导致消息卡在输入框
      const b64 = Buffer.from(text, 'utf-8').toString('base64');
      const script =
        `echo ${b64} | base64 -d | tmux load-buffer -b cli_in - && ` +
        `tmux paste-buffer -b cli_in -t ${sessionName} && ` +
        `tmux delete-buffer -b cli_in 2>/dev/null; ` +
        `sleep 0.25 && tmux send-keys -t ${sessionName} C-m`;
      const r = await this.exec(script);
      if (!r.ok) return { ok: false, error: `sendInput 失败: ${r.error || r.stderr}` };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: `send-keys 失败: ${e.message}` };
    }
  }

  async killSession(sessionName: string): Promise<void> {
    await this.exec(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
  }
}
