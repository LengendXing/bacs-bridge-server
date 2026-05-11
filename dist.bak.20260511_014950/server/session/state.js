import { getAdapter } from '../cli/factory.js';
import { getExecutor } from '../executor/factory.js';
import config from '../config.js';
const sessions = new Map();
function clearSessionTimers(processName) {
    const s = sessions.get(processName);
    if (!s)
        return;
    if (s.progressTimer) {
        clearInterval(s.progressTimer);
        s.progressTimer = null;
    }
    if (s.stableTimer) {
        clearTimeout(s.stableTimer);
        s.stableTimer = null;
    }
    if (s.hardDeadlineTimer) {
        clearTimeout(s.hardDeadlineTimer);
        s.hardDeadlineTimer = null;
    }
}
export function createSession(ctx) {
    const session = {
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
export function endSession(processName) {
    clearSessionTimers(processName);
    sessions.delete(processName);
}
export function getSession(processName) {
    return sessions.get(processName);
}
export function hasActiveSession(processName) {
    return sessions.has(processName);
}
export function startProgressTimer(session, onProgress) {
    const interval = (config.bridge.progressInterval || 60) * 1000;
    session.progressTimer = setInterval(() => {
        if (session.replied)
            return;
        onProgress(session);
    }, interval);
}
export function startHardDeadline(session, onTimeout) {
    const timeoutMs = (config.bridge.timeout || 600) * 1000;
    session.hardDeadlineTimer = setTimeout(() => {
        if (session.replied)
            return;
        onTimeout(session);
    }, timeoutMs);
}
export function startOutputPolling(session, onReply) {
    const adapter = getAdapter(session.cliKind);
    const stableMs = Math.max(3, (config.bridge.pollInterval || 2) * 2) * 1000;
    let lastLength = 0;
    const pollInterval = config.bridge.pollInterval * 1000;
    let _executor = null;
    async function getEx() {
        if (!_executor)
            _executor = await getExecutor(session.ctx.machineId);
        return _executor;
    }
    const timerId = setInterval(() => {
        getEx()
            .then((executor) => adapter.capturePane(`${adapter.sessionPrefix}-${session.processName}`, undefined, executor))
            .then((res) => {
            if (res.error) {
                clearInterval(timerId);
                import('../middleware/logger.js').then((m) => m.default.log('error', '轮询 capturePane 失败，停止轮询', res.error));
                return;
            }
            session.accumulated = res.output;
            if (res.output.length > lastLength || res.output.length < lastLength * 0.5) {
                lastLength = res.output.length;
                if (session.stableTimer)
                    clearTimeout(session.stableTimer);
                session.stableTimer = setTimeout(() => {
                    tryFinish(session, adapter, onReply);
                }, stableMs);
            }
            lastLength = res.output.length;
        })
            .catch((e) => {
            clearInterval(timerId);
            import('../middleware/logger.js').then((m) => m.default.log('error', '轮询异常，停止轮询', e.message));
        });
    }, pollInterval);
    setTimeout(() => tryFinish(session, adapter, onReply), 7000);
}
function tryFinish(session, adapter, onReply) {
    if (session.replied)
        return;
    const { processName } = session;
    const sess = sessions.get(processName);
    if (!sess || sess !== session)
        return;
    let _executor = null;
    async function getEx() {
        if (!_executor)
            _executor = await getExecutor(session.ctx.machineId);
        return _executor;
    }
    getEx()
        .then((executor) => adapter.isIdle(processName, executor))
        .then((idle) => {
        if (!idle || session.replied)
            return;
        if (sessions.get(processName) !== session)
            return;
        setTimeout(() => {
            if (session.replied)
                return;
            if (sessions.get(processName) !== session)
                return;
            getEx()
                .then((executor) => adapter.isIdle(processName, executor))
                .then((idle2) => {
                if (!idle2)
                    return;
                return adapter
                    .capturePane(`${adapter.sessionPrefix}-${processName}`, undefined, _executor)
                    .then((fresh) => {
                    if (!fresh.error &&
                        fresh.output.length > (session.accumulated || '').length) {
                        session.accumulated = fresh.output;
                    }
                    const reply = adapter.extractReply(session.accumulated, session.ctx.msgText);
                    if (!reply) {
                        onReply(session, '');
                        return;
                    }
                    onReply(session, reply);
                });
            })
                .catch((e) => {
                import('../middleware/logger.js').then((m) => m.default.log('error', 'tryFinish 完成检测异常', e.message));
                session.replied = true;
                onReply(session, '');
            });
        }, 500);
    })
        .catch((e) => {
        import('../middleware/logger.js').then((m) => m.default.log('error', 'tryFinish isIdle 异常', e.message));
    });
}
