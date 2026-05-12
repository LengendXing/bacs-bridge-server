/**
 * @module terminal/pty-bridge
 * @description Web Terminal 后端 PTY 桥接（v1.1.3）
 *
 * 给浏览器 xterm 提供一个 PTY 通道，让用户在网页里直接 attach 到
 * 绑定进程的 tmux session（cc-xxx / codex-xxx）。
 *
 * 关键约束：关闭 PTY = 关闭客户端连接，业务 tmux session 必须保留。
 * 所以 close() 只 destroy/end 通道，**绝不调用 tmux kill-session**。
 *
 * 两套实现：
 * - openLocalTerminal：本机用 node-pty 起 `bash -ilc 'exec tmux attach -t SESSION'`
 * - openSshTerminal：远程复用 SshExecutor 的 ssh2 client 开 shell channel
 */

import * as pty from 'node-pty';
import type { ClientChannel } from 'ssh2';
import type { SshExecutor } from '../executor/ssh.js';

/** Web Terminal 会话抽象接口 */
export interface TerminalSession {
  /** 客户端 → PTY（写入子进程 stdin） */
  write(data: string | Buffer): void;
  /** 同步窗口大小 */
  resize(cols: number, rows: number): void;
  /** PTY → 客户端 */
  onData(cb: (chunk: Buffer) => void): void;
  /** PTY 退出 / 通道关闭 */
  onExit(cb: (code: number | null, signal?: string | null) => void): void;
  /**
   * 关闭通道。**只做客户端 detach，不杀 tmux session**。
   * tmux 的 detached session 在客户端断开后会继续运行业务进程。
   */
  close(): void;
}

/**
 * 校验 tmux session 名只含安全字符。
 * 用于阻止 `processName` 里出现 shell 特殊字符或空格 → 防命令注入。
 *
 * tmux 自身允许更多字符，但我们只接受 [A-Za-z0-9_-]+ 。
 * cc/codex 的 sessionPrefix 是 cc/codex，processName 由 binding 表生成。
 */
export function isSafeSessionName(name: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(name) && name.length <= 128;
}

/**
 * 本机 PTY：node-pty + bash -ilc 'exec tmux attach -t SESSION'
 *
 * `exec` 让 tmux 替换 bash，PTY 关闭时直接走 SIGHUP，
 * tmux 客户端干净 detach。和 cc-adapter 启动套路一致。
 */
export function openLocalTerminal(
  sessionName: string,
  cols: number,
  rows: number,
): TerminalSession {
  if (!isSafeSessionName(sessionName)) {
    throw new Error(`不安全的 session 名: ${sessionName}`);
  }

  const term = pty.spawn(
    '/bin/bash',
    ['-ilc', `exec tmux attach -t ${sessionName}`],
    {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || '/tmp',
      env: process.env as Record<string, string>,
    },
  );

  return {
    write(data) {
      term.write(typeof data === 'string' ? data : data.toString('utf8'));
    },
    resize(c, r) {
      try {
        term.resize(Math.max(2, c | 0), Math.max(2, r | 0));
      } catch { /* PTY 已退出时 resize 会抛，忽略 */ }
    },
    onData(cb) {
      term.onData((chunk) => cb(Buffer.from(chunk, 'utf8')));
    },
    onExit(cb) {
      term.onExit(({ exitCode, signal }) => cb(exitCode, signal != null ? String(signal) : null));
    },
    close() {
      try { term.kill(); } catch { /* 已退出 */ }
    },
  };
}

/**
 * 远程 PTY：复用 SshExecutor 内的 ssh2 Client，开一个独立 shell channel。
 *
 * shell channel 是独立的 SSH channel，和 exec/heartbeat 不冲突。
 * 第一条命令 `exec tmux attach -t SESSION\n` 让远程 bash 被 tmux 替换，
 * channel 一关 → 远程 PTY 收到 SIGHUP → tmux 客户端 detach（不杀 session）。
 */
export async function openSshTerminal(
  executor: SshExecutor,
  sessionName: string,
  cols: number,
  rows: number,
): Promise<TerminalSession> {
  if (!isSafeSessionName(sessionName)) {
    throw new Error(`不安全的 session 名: ${sessionName}`);
  }

  const client = await executor.acquireClient();

  const channel = await new Promise<ClientChannel>((resolve, reject) => {
    client.shell(
      { term: 'xterm-256color', cols, rows },
      (err, ch) => {
        if (err) return reject(err);
        resolve(ch);
      },
    );
  });

  // 用 exec 让 tmux 替换 bash —— channel 关闭时干净 SIGHUP
  channel.write(`exec tmux attach -t ${sessionName}\n`);

  let exitCb: ((code: number | null, signal?: string | null) => void) | null = null;
  let exited = false;
  const fireExit = (code: number | null, signal?: string | null) => {
    if (exited) return;
    exited = true;
    exitCb?.(code, signal ?? null);
  };

  channel.on('close', () => fireExit(null, null));
  channel.on('exit', (code: number, signal?: string) => fireExit(code ?? null, signal ?? null));

  return {
    write(data) {
      try { channel.write(data as any); } catch { /* */ }
    },
    resize(c, r) {
      try {
        channel.setWindow(Math.max(2, r | 0), Math.max(2, c | 0), 0, 0);
      } catch { /* */ }
    },
    onData(cb) {
      channel.on('data', (chunk: Buffer) => cb(chunk));
      channel.stderr.on('data', (chunk: Buffer) => cb(chunk));
    },
    onExit(cb) {
      exitCb = cb;
      if (exited) cb(null, null);
    },
    close() {
      try { channel.end(); } catch { /* */ }
      try { channel.destroy(); } catch { /* */ }
    },
  };
}
