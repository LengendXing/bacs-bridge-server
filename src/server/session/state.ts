import { getAdapter, type CliAdapter } from '../cli/factory.js';
import type { ChoicePanel } from '../cli/types.js';
import { getExecutor } from '../executor/factory.js';
import type { RemoteExecutor } from '../executor/types.js';
import config from '../config.js';

export interface SessionState {
  processName: string;
  cliKind: string;
  pollTimer: ReturnType<typeof setTimeout> | null;
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
  /** 最近一次轮询检测到的工具调用列表 */
  lastToolCalls: string[];
  /** 上次发送进度通知的时间戳，用于 1min/10min 降级逻辑 */
  lastProgressNotifiedAt: number;
  /** 用户刚做出决策（handler 已发送 sendChoice），轮询需要用更短间隔检测终态 */
  decisionJustMade: boolean;
  /** 最近决策的面板指纹，防止决策后面板仍在 pane 中时重复推送 */
  lastDecidedPanelKey: string | null;
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
  if (s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
  if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }
  if (s.hardDeadlineTimer) { clearTimeout(s.hardDeadlineTimer); s.hardDeadlineTimer = null; }
}

export function createSession(ctx: SessionContext): SessionState {
  const session: SessionState = {
    processName: ctx.processName,
    cliKind: ctx.cliKind,
    pollTimer: null,
    stableTimer: null,
    hardDeadlineTimer: null,
    accumulated: '',
    startedAt: Date.now(),
    replied: false,
    ctx,
    awaiting: null,
    lastToolCalls: [],
    lastProgressNotifiedAt: Date.now(),
    decisionJustMade: false,
    lastDecidedPanelKey: null,
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

export function startHardDeadline(
  session: SessionState,
  onTimeout: (session: SessionState) => void,
): void {
  const timeoutMs = (config.bridge.timeout || 3600) * 1000;
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
  /** 进度通知回调（前 10 分钟每 1 分钟，之后每 10 分钟） */
  onProgress?: (session: SessionState) => void;
}

export function startOutputPolling(
  session: SessionState,
  handlers: PollingHandlers,
): void {
  const adapter = getAdapter(session.cliKind);
  const stableMs = 20_000; // 20s — CC 输出稳定阈值

  let lastLength = 0;
  let pollCount = 0;
  const stateCheckEvery = 3; // 每 3 次轮询主动检测一次终态

  // 8～15 秒随机轮询间隔
  function randomPollMs(): number {
    return (8 + Math.random() * 7) * 1000;
  }

  let _executor: RemoteExecutor | null = null;
  async function getEx(): Promise<RemoteExecutor> {
    if (!_executor) _executor = await getExecutor(session.ctx.machineId);
    return _executor;
  }

  function scheduleNext(delay: number): void {
    if (session.replied && !session.awaiting) return;
    if (sessions.get(session.processName) !== session) return;
    session.pollTimer = setTimeout(poll, delay);
  }

  function poll(): void {
    if (sessions.get(session.processName) !== session) return;

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
          import('../middleware/logger.js').then((m) =>
            m.default.log('error', '轮询 capturePane 失败，停止轮询', res.error),
          );
          return;
        }

        // 已经回复并结束 → 停轮询
        if (session.replied && !session.awaiting) return;

        session.accumulated = res.output;
        session.lastToolCalls = extractRecentToolCalls(adapter, res.output);

        // 优先：决策面板探测——一旦面板出现立刻推送，不必等 stable
        const panel = adapter.extractChoicePanel(res.output);
        if (panel) {
          const fp = panelFingerprint(panel);
          // 已决策的面板不重复推送（决策后面板仍在 pane 中 fading out 或 scrollback 残留）
          const isDecidedPanel = session.lastDecidedPanelKey === fp;
          if (!isDecidedPanel && (!session.awaiting || session.awaiting.panelKey !== fp)) {
            session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };
            handlers.onAwaiting(session, panel);
          }
          // decisionJustMade 或已决策面板 → 不 return early，让 decisionJustMade 处理逻辑执行
          if (!session.decisionJustMade && !isDecidedPanel) {
            // 正常：用户尚未决策，清除 stable 计时器等待
            if (session.stableTimer) {
              clearTimeout(session.stableTimer);
              session.stableTimer = null;
            }
            lastLength = res.output.length;
            scheduleNext(randomPollMs());
            return;
          }
        } else {
          // 面板消失 → 清除决策面板跟踪
          session.lastDecidedPanelKey = null;
        }

        // 面板消失 → 用户决策已被消化，cc 进入 working/idle
        if (session.awaiting && !panel) {
          session.awaiting = null;
          if (session.stableTimer) clearTimeout(session.stableTimer);
          session.stableTimer = setTimeout(() => {
            tryFinish(session, adapter, handlers);
          }, stableMs);
        }

        // 用户刚做了决策 → 用更短间隔（5s）检测终态，避免等 20s stable 或 3 轮 pollCount
        if (session.decisionJustMade) {
          session.decisionJustMade = false;
          if (session.stableTimer) clearTimeout(session.stableTimer);
          session.stableTimer = setTimeout(() => {
            tryFinish(session, adapter, handlers);
          }, 5_000);
          lastLength = res.output.length;
          scheduleNext(3_000 + Math.random() * 2_000); // 3-5s 快速轮询
          return;
        }

        pollCount++;

        if (res.output.length > lastLength || res.output.length < lastLength * 0.5) {
          lastLength = res.output.length;
          if (session.stableTimer) clearTimeout(session.stableTimer);
          session.stableTimer = setTimeout(() => {
            tryFinish(session, adapter, handlers);
          }, stableMs);
        } else if (pollCount % stateCheckEvery === 0) {
          tryFinish(session, adapter, handlers);
        }
        lastLength = res.output.length;

        // 进度通知：前 10 分钟每 1 分钟，之后每 10 分钟
        if (!session.awaiting && !session.replied && handlers.onProgress) {
          const elapsedMs = Date.now() - session.startedAt;
          const sinceLastMs = Date.now() - session.lastProgressNotifiedAt;
          const progressIntervalMs = elapsedMs < 600_000 ? 60_000 : 600_000;
          if (sinceLastMs >= progressIntervalMs) {
            handlers.onProgress(session);
            session.lastProgressNotifiedAt = Date.now();
          }
        }

        scheduleNext(randomPollMs());
      })
      .catch((e: Error) => {
        import('../middleware/logger.js').then((m) =>
          m.default.log('error', '轮询异常', e.message),
        );
        // 异常后仍继续轮询（除非 session 已结束）
        scheduleNext(randomPollMs());
      });
  }

  // 7 秒后主动检测一次终态（快速响应场景的安全网）
  setTimeout(() => tryFinish(session, adapter, handlers), 7_000);
  // 启动轮询
  scheduleNext(randomPollMs());
}

/** 只提取最后一个 ❯ 提示符之后的工具调用，避免把旧对话的工具调用捞出来 */
function extractRecentToolCalls(adapter: CliAdapter, raw: string): string[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  // 找最后一个 ❯ 行（用户输入提示符）
  let lastPromptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*❯\s/.test(lines[i])) { lastPromptIdx = i; break; }
  }
  // 如果找不到 ❯，用整个 pane（兼容首次启动等场景）
  const recent = lastPromptIdx >= 0 ? lines.slice(lastPromptIdx).join('\n') : raw;
  return adapter.extractToolCalls(recent);
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
    .then(async (state) => {
      if (session.replied) return;
      if (sessions.get(processName) !== session) return;

      // awaiting_choice：如果 session 不在等决策 → scrollback 旧面板残留误判
      if (state === 'awaiting_choice') {
        if (!session.awaiting) {
          // 用户已做决策，但 detectState 因 scrollback 旧面板误判为 awaiting_choice
          // 检查 pane 底部是否实际为 idle
          try {
            const executor = await getEx();
            const fresh = await executor.capturePane(`${adapter.sessionPrefix}-${processName}`, 10);
            if (fresh.error || session.replied) return;
            if (sessions.get(processName) !== session) return;
            const lastLines = fresh.output.split(/\r?\n/).slice(-5).join('\n');
            if (/❯/.test(lastLines) && /\?\s*for shortcuts/.test(lastLines)) {
              // CC 实际 idle → 走 idle 确认流程
              state = 'idle';
            } else {
              // 还在工作 → 5s 后重试
              if (!session.stableTimer) {
                session.stableTimer = setTimeout(() => {
                  tryFinish(session, adapter, handlers);
                }, 5_000);
              }
              return;
            }
          } catch {
            if (!session.stableTimer) {
              session.stableTimer = setTimeout(() => {
                tryFinish(session, adapter, handlers);
              }, 5_000);
            }
            return;
          }
        } else {
          // 真正等待用户决策 → 交给轮询循环处理
          return;
        }
      }
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
