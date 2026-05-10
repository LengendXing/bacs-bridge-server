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
  killSession(sessionName: string): Promise<void>;
  testConnection?(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  dispose?(): Promise<void>;
}
