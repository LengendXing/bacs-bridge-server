import { getAdapter, type CliAdapter } from '../cli/factory.js';
import type { ChoicePanel } from '../cli/types.js';
import { getExecutor } from '../executor/factory.js';
import type { RemoteExecutor } from '../executor/types.js';
import config from '../config.js';

export interface SessionState {
  processName: string;
  cliKind: string;
  progressTimer: ReturnType<typeof setInterval> | null;
  stableTimer: ReturnType<typeof setTimeout> | null;
  hardDeadlineTimer: ReturnType<typeof setTimeout> | null;
  accumulated: string;
  startedAt: number;
  replied: boolean;
  ctx: SessionContext;
  /** 当前是否在等待用户决策（cc/codex 弹出 Yes/No 面板时设置） */
  awaiting: null | {
    panel: ChoicePanel;
    /** 已推送给用户的面板"指纹"，用于避免重复推送同一面板 */
    panelKey: string;
    pushedAt: number;
  };
}

export interface SessionContext {
  feishuAppId: string;
  feishuAppSecret: string;
  targetType: string;
  targetId: string;
  msgText: string;
  processName: string;
  cliKind: string;
  machineId: number | null;
}

const sessions: Map<string, SessionState> = new Map();

function clearSessionTimers(processName: string): void {
  const s = sessions.get(processName);
  if (!s) return;
  if (s.progressTimer) { clearInterval(s.progressTimer); s.progressTimer = null; }
  if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }
  if (s.hardDeadlineTimer) { clearTimeout(s.hardDeadlineTimer); s.hardDeadlineTimer = null; }
}

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
    awaiting: null,
  };
  sessions.set(ctx.processName, session);
  return session;
}

/** 计算面板指纹（标题+所有选项），用于判断是否还是同一个面板 */
export function panelFingerprint(panel: ChoicePanel): string {
  return `${panel.title}|${panel.options.join('|')}`;
}

export function endSession(processName: string): void {
  clearSessionTimers(processName);
  sessions.delete(processName);
}

export function getSession(processName: string): SessionState | undefined {
  return sessions.get(processName);
}

export function hasActiveSession(processName: string): boolean {
  return sessions.has(processName);
}

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

export interface PollingHandlers {
  /** 终态完成回复（cc 输出完毕、回到 idle） */
  onReply: (session: SessionState, reply: string) => void;
  /** 检测到 cc 在等用户决策时触发：把面板推送给用户，session 不结束
   *  会被去重：同一个 panelFingerprint 只会触发一次
   */
  onAwaiting: (session: SessionState, panel: ChoicePanel) => void;
}

export function startOutputPolling(
  session: SessionState,
  handlers: PollingHandlers,
): void {
  const adapter = getAdapter(session.cliKind);
  const stableMs = Math.max(3, (config.bridge.pollInterval || 2) * 2) * 1000;
  let lastLength = 0;
  const pollInterval = config.bridge.pollInterval * 1000;

  let _executor: RemoteExecutor | null = null;
  async function getEx(): Promise<RemoteExecutor> {
    if (!_executor) _executor = await getExecutor(session.ctx.machineId);
    return _executor;
  }

  const timerId = setInterval(() => {
    getEx()
      .then((executor) =>
        adapter.capturePane(
          `${adapter.sessionPrefix}-${session.processName}`,
          undefined,
          executor,
        ),
      )
      .then((res) => {
        if (res.error) {
          clearInterval(timerId);
          import('../middleware/logger.js').then((m) =>
            m.default.log('error', '轮询 capturePane 失败，停止轮询', res.error),
          );
          return;
        }

        // 已经回复并结束 → 停轮询；
        // 但 awaiting_choice 状态下 session.replied=false，要继续轮询直到用户回复后回到 idle
        if (session.replied && !session.awaiting) {
          clearInterval(timerId);
          return;
        }

        session.accumulated = res.output;

        // 优先：决策面板探测——一旦面板出现立刻推送，不必等 stable
        const panel = adapter.extractChoicePanel(res.output);
        if (panel) {
          const fp = panelFingerprint(panel);
          if (!session.awaiting || session.awaiting.panelKey !== fp) {
            session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };
            handlers.onAwaiting(session, panel);
          }
          // 面板出现期间，"长度变化驱动 stable→tryFinish" 那套不应触发：清掉 stableTimer
          if (session.stableTimer) {
            clearTimeout(session.stableTimer);
            session.stableTimer = null;
          }
          lastLength = res.output.length;
          return;
        }

        // 之前在等待，但当前 pane 已无面板 → 用户决策已被消化，cc 进入 working/idle
        // 清掉 awaiting，让后续 tryFinish 走常规终态流程
        if (session.awaiting) {
          session.awaiting = null;
          // 触发 stable 重新计时（输出已经在变化）
        }

        if (res.output.length > lastLength || res.output.length < lastLength * 0.5) {
          lastLength = res.output.length;
          if (session.stableTimer) clearTimeout(session.stableTimer);
          session.stableTimer = setTimeout(() => {
            tryFinish(session, adapter, handlers);
          }, stableMs);
        }
        lastLength = res.output.length;
      })
      .catch((e: Error) => {
        clearInterval(timerId);
        import('../middleware/logger.js').then((m) =>
          m.default.log('error', '轮询异常，停止轮询', e.message),
        );
      });
  }, pollInterval);

  setTimeout(() => tryFinish(session, adapter, handlers), 7000);
}

function tryFinish(
  session: SessionState,
  adapter: CliAdapter,
  handlers: PollingHandlers,
): void {
  if (session.replied) return;
  const { processName } = session;

  const sess = sessions.get(processName);
  if (!sess || sess !== session) return;

  let _executor: RemoteExecutor | null = null;
  async function getEx(): Promise<RemoteExecutor> {
    if (!_executor) _executor = await getExecutor(session.ctx.machineId);
    return _executor;
  }

  getEx()
    .then((executor) => adapter.detectState(processName, executor))
    .then((state) => {
      if (session.replied) return;
      if (sessions.get(processName) !== session) return;

      // awaiting_choice：交给轮询循环里的面板推送逻辑处理；这里不结束 session
      if (state === 'awaiting_choice') return;
      if (state === 'working') return;

      // state === 'idle'：双重确认（500ms 后再 detectState 一次，避免过渡帧误判）
      setTimeout(() => {
        if (session.replied) return;
        if (sessions.get(processName) !== session) return;

        getEx()
          .then((executor) => adapter.detectState(processName, executor))
          .then((state2) => {
            if (state2 !== 'idle') return;

            return adapter
              .capturePane(
                `${adapter.sessionPrefix}-${processName}`,
                undefined,
                _executor!,
              )
              .then((fresh) => {
                if (
                  !fresh.error &&
                  fresh.output.length > (session.accumulated || '').length
                ) {
                  session.accumulated = fresh.output;
                }

                const reply = adapter.extractReply(
                  session.accumulated,
                  session.ctx.msgText,
                );
                if (!reply) {
                  handlers.onReply(session, '');
                  return;
                }

                handlers.onReply(session, reply);
              });
          })
          .catch((e: Error) => {
            import('../middleware/logger.js').then((m) =>
              m.default.log('error', 'tryFinish 完成检测异常', e.message),
            );
            session.replied = true;
            handlers.onReply(session, '');
          });
      }, 500);
    })
    .catch((e: Error) => {
      import('../middleware/logger.js').then((m) =>
        m.default.log('error', 'tryFinish detectState 异常', e.message),
      );
    });
}
