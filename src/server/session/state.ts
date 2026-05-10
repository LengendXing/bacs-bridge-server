/**
 * @module session/state
 * @description 会话状态机 — 轮询 + isIdle 检测 + 回复提取
 *
 * 管理一次问答的全生命周期状态：
 * - 启动输出轮询（检测 CC/Codex 新输出）
 * - 稳定窗口判定（输出稳定 → isIdle 双确认）
 * - 硬超时兜底
 * - 提取回复内容
 * - 发送回复后清理定时器和轮询
 */

import { getAdapter, type CliAdapter } from '../cli/factory.js';
import config from '../config.js';

/** 一次问答的全部状态 */
export interface SessionState {
  /** 进程名 */
  processName: string;
  /** CLI 类型 */
  cliKind: string;
  /** 进度通知定时器 */
  progressTimer: ReturnType<typeof setInterval> | null;
  /** 稳定窗口定时器 */
  stableTimer: ReturnType<typeof setTimeout> | null;
  /** 硬超时定时器 */
  hardDeadlineTimer: ReturnType<typeof setTimeout> | null;
  /** 累积的 pane 内容 */
  accumulated: string;
  /** 会话开始时间 */
  startedAt: number;
  /** 是否已回复 */
  replied: boolean;
  /** 上下文（飞书凭据、目标等） */
  ctx: SessionContext;
}

/** 会话上下文（回复发送所需的信息） */
export interface SessionContext {
  feishuAppId: string;
  feishuAppSecret: string;
  targetType: string;
  targetId: string;
  msgText: string;
  processName: string;
  cliKind: string;
}

/** 运行中的会话: processName → SessionState */
const sessions: Map<string, SessionState> = new Map();

/**
 * 清除会话的所有定时器
 */
function clearSessionTimers(processName: string): void {
  const s = sessions.get(processName);
  if (!s) return;
  if (s.progressTimer) { clearInterval(s.progressTimer); s.progressTimer = null; }
  if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }
  if (s.hardDeadlineTimer) { clearTimeout(s.hardDeadlineTimer); s.hardDeadlineTimer = null; }
}

/**
 * 创建新会话
 *
 * @param ctx - 会话上下文
 * @returns 创建的 SessionState
 */
export function createSession(ctx: SessionContext): SessionState {
  const session: SessionState = {
    processName: ctx.processName,
    cliKind: ctx.cliKind,
    progressTimer: null,
    stableTimer: null,
    hardDeadlineTimer: null,
    accumulated: '',
    startedAt: Date.now(),
    replied: false,
    ctx,
  };
  sessions.set(ctx.processName, session);
  return session;
}

/**
 * 结束会话：清除定时器 + 停止轮询 + 删除会话记录
 */
export function endSession(processName: string): void {
  clearSessionTimers(processName);
  const adapter = getAdapterForSession(processName);
  if (adapter) {
    // adapter.stopPolling(processName); // TODO: 实现 stopPolling
  }
  sessions.delete(processName);
}

/**
 * 获取会话状态
 */
export function getSession(processName: string): SessionState | undefined {
  return sessions.get(processName);
}

/**
 * 检查进程是否有活跃会话（并发保护）
 */
export function hasActiveSession(processName: string): boolean {
  return sessions.has(processName);
}

/**
 * 启动进度通知定时器
 *
 * 每隔 progress_interval 秒调用 onProgress 回调
 *
 * @param session - 会话状态
 * @param onProgress - 进度回调（发送进度卡片）
 */
export function startProgressTimer(
  session: SessionState,
  onProgress: (session: SessionState) => void,
): void {
  const interval = (config.bridge.progressInterval || 60) * 1000;
  session.progressTimer = setInterval(() => {
    if (session.replied) return;
    onProgress(session);
  }, interval);
}

/**
 * 启动硬超时定时器
 *
 * 到达 timeout 秒后，无论 CLI 是否完成，强制结束等待
 *
 * @param session - 会话状态
 * @param onTimeout - 超时回调（发送超时卡片或兜底回复）
 */
export function startHardDeadline(
  session: SessionState,
  onTimeout: (session: SessionState) => void,
): void {
  const timeoutMs = (config.bridge.timeout || 600) * 1000;
  session.hardDeadlineTimer = setTimeout(() => {
    if (session.replied) return;
    onTimeout(session);
  }, timeoutMs);
}

/**
 * 启动输出轮询 + 稳定判定
 *
 * 轮询逻辑：
 * - 每隔 poll_interval 秒 capture pane
 * - pane 长度增长 → 有新输出，重置稳定窗口
 * - 稳定窗口到期 → isIdle 双确认 → 提取回复
 *
 * @param session - 会话状态
 * @param onReply - 回复就绪回调（提取到回复内容后调用）
 */
export function startOutputPolling(
  session: SessionState,
  onReply: (session: SessionState, reply: string) => void,
): void {
  const adapter = getAdapter(session.cliKind);
  const stableMs = Math.max(3, (config.bridge.pollInterval || 2) * 2) * 1000;

  let lastLength = 0;
  const pollInterval = config.bridge.pollInterval * 1000;

  const timerId = setInterval(() => {
    const res = adapter.capturePane(`${adapter.sessionPrefix}-${session.processName}`);
    if (res.error) {
      clearInterval(timerId);
      return;
    }

    // 累积 pane 内容
    session.accumulated = res.output;

    // 有新输出 → 重置稳定窗口
    if (res.output.length > lastLength || res.output.length < lastLength * 0.5) {
      lastLength = res.output.length;
      if (session.stableTimer) clearTimeout(session.stableTimer);
      session.stableTimer = setTimeout(() => {
        tryFinish(session, adapter, onReply);
      }, stableMs);
    }
    lastLength = res.output.length;
  }, pollInterval);

  // 7 秒后做第一次空闲探测（防止 CC 直接进入空闲未触发任何输出）
  setTimeout(() => tryFinish(session, adapter, onReply), 7000);
}

/**
 * 尝试完成会话：isIdle 双确认 + 提取回复
 *
 * 双确认逻辑：第一次 isIdle 为 true 后，等 500ms 再查一次
 * 两次都为 true 才认为真正空闲，避免 ❯ 短暂出现误判
 */
function tryFinish(
  session: SessionState,
  adapter: CliAdapter,
  onReply: (session: SessionState, reply: string) => void,
): void {
  if (session.replied) return;
  const { processName } = session;

  const sess = sessions.get(processName);
  if (!sess || sess !== session) return;

  if (!adapter.isIdle(processName)) return;

  // 双确认：500ms 后再查一次
  setTimeout(() => {
    if (session.replied) return;
    if (sessions.get(processName) !== session) return;
    if (!adapter.isIdle(processName)) return;

    // 最终发送前做一次全量抓取
    const fresh = adapter.capturePane(`${adapter.sessionPrefix}-${processName}`);
    if (!fresh.error && fresh.output.length > (session.accumulated || '').length) {
      session.accumulated = fresh.output;
    }

    const reply = adapter.extractReply(session.accumulated, session.ctx.msgText);
    if (!reply) {
      // 没拿到内容但已空闲 — 兜底通知
      onReply(session, '');
      return;
    }

    session.replied = true;
    onReply(session, reply);
  }, 500);
}

/**
 * 根据会话的 cliKind 获取对应 adapter
 */
function getAdapterForSession(processName: string): CliAdapter | null {
  const session = sessions.get(processName);
  if (!session) return null;
  return getAdapter(session.cliKind);
}
