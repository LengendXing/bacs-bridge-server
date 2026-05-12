/** 命令执行结果 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ok: boolean;
  error?: string;
}

/** 命令执行选项 */
export interface ExecOptions {
  timeout?: number;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

/** 远程执行器接口 */
export interface RemoteExecutor {
  readonly kind: 'local' | 'ssh';
  readonly machineId: number | null;
  exec(cmd: string, options?: ExecOptions): Promise<ExecResult>;
  sessionExists(sessionName: string): Promise<boolean>;
  listSessionsByPrefix(prefix: string): Promise<string[]>;
  capturePane(sessionName: string, lines?: number): Promise<{ output: string; error?: string }>;
  sendInput(sessionName: string, text: string): Promise<{ ok: boolean; error?: string }>;
  /** 直接给 tmux send-keys 发送一组按键序列。
   *  例如 ['Down','Down','C-m'] 或 ['1','C-m']。
   *  与 sendInput 的区别：sendInput 走 paste-buffer 用于「输入框文本」；
   *  sendKeys 走 send-keys 直接模拟键盘事件，用于决策面板上下选 + 回车 / 数字键。
   *  @param sessionName tmux 会话名
   *  @param keys        tmux send-keys 接受的 key 名（参见 tmux man）
   *  @param betweenMs   每两次 send-keys 之间的延迟毫秒（默认 80ms，避免 TUI 抖动）
   */
  sendKeys(sessionName: string, keys: string[], betweenMs?: number): Promise<{ ok: boolean; error?: string }>;
  killSession(sessionName: string): Promise<void>;
  testConnection?(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  dispose?(): Promise<void>;
}
