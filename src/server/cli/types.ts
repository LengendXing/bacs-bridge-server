/**
 * @module cli/types
 * @description CLI Adapter 接口定义
 *
 * 所有 CLI 后端（Claude Code / Codex / 未来 Gemini CLI 等）必须实现此接口。
 * bridge 主流程只跟 CliAdapter 打交道，不感知具体 CLI 的输入输出细节。
 */

/** CLI 启动所需的环境变量映射 */
export interface CliEnvVars {
  [key: string]: string | undefined;
}

/** CLI 进程启动配置 */
export interface CliStartConfig {
  /** 服务商类型：'local'（继承系统 env）/ 'custom'（注入凭据） */
  providerKind: 'local' | 'custom';
  /** 需要注入的环境变量（仅 custom 模式有值） */
  envVars: CliEnvVars;
  /** 使用的模型 ID（如 'claude-sonnet-4-20250514'） */
  modelId?: string;
}

/** CliAdapter 统一接口 */
export interface CliAdapter {
  /** CLI 种类标识 */
  kind: 'cc' | 'codex';

  /** 构建 tmux new-session 启动命令
   *  @param sessionName - tmux 会话名（如 'cc-work' / 'codex-dev'）
   *  @param config - 启动配置（环境变量 + 模型）
   */
  buildStartCmd(sessionName: string, config: CliStartConfig): string;

  /** 发送 prompt 到 tmux 会话（安全：base64 + load-buffer）
   *  @param sessionName - tmux 会话名
   *  @param text - 用户输入的 prompt 文本
   */
  sendInput(sessionName: string, text: string): { ok: boolean; error?: string };

  /** 抓取 pane 当前内容
   *  @param sessionName - tmux 会话名
   *  @param lines - 抓取行数（从底部往上）
   */
  capturePane(sessionName: string, lines?: number): { output: string; error?: string };

  /** 从 pane 原始文本提取本轮回复纯文本
   *  @param raw - capturePane 返回的原始输出
   *  @param userMessage - 本轮用户消息（用于截断定位）
   */
  extractReply(raw: string, userMessage: string): string;

  /** 判断 CLI 是否空闲（等待新输入）
   *  @param processName - 进程名（不含前缀）
   */
  isIdle(processName: string): boolean;

  /** 列出该类 CLI 的 tmux 会话（返回进程名，不含前缀） */
  listSessions(): string[];

  /** 检查 tmux 会话是否存在
   *  @param processName - 进程名
   */
  sessionExists(processName: string): boolean;

  /** tmux 会话名前缀（如 'cc' / 'codex'） */
  sessionPrefix: string;
}
