/**
 * @module cli/types
 * @description CLI Adapter 接口定义
 *
 * 所有 CLI 后端（Claude Code / Codex / 未来 Gemini CLI 等）必须实现此接口。
 * bridge 主流程只跟 CliAdapter 打交道，不感知具体 CLI 的输入输出细节。
 */

import type { RemoteExecutor } from '../executor/types.js';

/** CLI 启动所需的环境变量映射 */
export interface CliEnvVars {
  [key: string]: string | undefined;
}

/** CLI 运行态三态
 *  - idle：等待新输入（输入框光标空闲）
 *  - working：正在思考/执行（thinking / esc to interrupt）
 *  - awaiting_choice：正在等待用户选择（Yes/No 决策面板、工具调用确认面板等）
 */
export type CliState = 'idle' | 'working' | 'awaiting_choice';

/** 选择面板提取结果 */
export interface ChoicePanel {
  /** 面板标题/问题文本 */
  title: string;
  /** 选项列表（保持原 1/2/3... 序号），每项形如 "1. Yes" / "2. No (recommended)" */
  options: string[];
  /** 默认/当前高亮的选项序号（1-based），未识别返回 0 */
  defaultIndex: number;
}

/** CLI 进程启动配置 */
export interface CliStartConfig {
  /** 服务商类型：'local'（继承系统 env）/ 'custom'（注入凭据） */
  providerKind: 'local' | 'custom';
  /** 需要注入的环境变量（仅 custom 模式有值） */
  envVars: CliEnvVars;
  /** 使用的模型 ID（如 'claude-sonnet-4-20250514'） */
  modelId?: string;
  /** 推理 effort 档位
   *  - cc：low|medium|high|xhigh|max（注入为 `--effort <level>`）
   *  - codex：minimal|low|medium|high|xhigh（注入为 `-c model_reasoning_effort=<level>`）
   *  不支持 effort 的模型（如 haiku）应在前端就不让用户选；此处仅保留字段不做硬校验
   */
  effort?: string;
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
   *  @param executor - 远程执行器
   */
  sendInput(sessionName: string, text: string, executor: RemoteExecutor): Promise<{ ok: boolean; error?: string }>;

  /** 抓取 pane 当前内容
   *  @param sessionName - tmux 会话名
   *  @param lines - 抓取行数（从底部往上）
   *  @param executor - 远程执行器
   */
  capturePane(sessionName: string, lines: number | undefined, executor: RemoteExecutor): Promise<{ output: string; error?: string }>;

  /** 从 pane 原始文本提取本轮回复纯文本
   *  @param raw - capturePane 返回的原始输出
   *  @param userMessage - 本轮用户消息（用于截断定位）
   */
  extractReply(raw: string, userMessage: string): string;

  /** 判断 CLI 是否空闲（等待新输入）
   *  @param processName - 进程名（不含前缀）
   *  @param executor - 远程执行器
   *  @deprecated 使用 detectState() 获取三态；保留以兼容旧调用
   */
  isIdle(processName: string, executor: RemoteExecutor): Promise<boolean>;

  /** 探测 CLI 当前运行态（idle/working/awaiting_choice）
   *  实现应优先识别 awaiting_choice（避免被 working 或 idle 误判覆盖）
   *  @param processName - 进程名（不含前缀）
   *  @param executor - 远程执行器
   */
  detectState(processName: string, executor: RemoteExecutor): Promise<CliState>;

  /** 从 pane 文本里提取「等待选择」面板（Yes/No、工具调用确认等）
   *  仅在 detectState 返回 awaiting_choice 时调用；否则返回 null。
   *  @param raw - capturePane 返回的原始输出
   */
  extractChoicePanel(raw: string): ChoicePanel | null;

  /** 在「等待选择」面板下，把用户的飞书自由文本回复（如 "1" / "yes" / "确认"）
   *  转换为对应的 tmux key 序列并发送（数字键 / 方向键 + 回车）
   *  @param sessionName - tmux 会话名
   *  @param userReply  - 用户在飞书的回复原文
   *  @param panel      - 当前选择面板（用于把"yes"映射到具体序号）
   *  @param executor   - 远程执行器
   *  @returns ok 表示已发送；error 表示无法解析或发送失败
   */
  sendChoice(
    sessionName: string,
    userReply: string,
    panel: ChoicePanel,
    executor: RemoteExecutor,
  ): Promise<{ ok: boolean; error?: string; chosenIndex?: number }>;

  /** 列出该类 CLI 的 tmux 会话（返回进程名，不含前缀）
   *  @param executor - 远程执行器
   */
  listSessions(executor: RemoteExecutor): Promise<string[]>;

  /** 检查 tmux 会话是否存在
   *  @param processName - 进程名
   *  @param executor - 远程执行器
   */
  sessionExists(processName: string, executor: RemoteExecutor): Promise<boolean>;

  /** tmux 会话名前缀（如 'cc' / 'codex'） */
  sessionPrefix: string;
}
