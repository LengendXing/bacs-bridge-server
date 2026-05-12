/**
 * @module terminal/ws-server
 * @description Web Terminal 的 WebSocket 端点
 *
 * 路径：/ws/terminal?bindingId=<id>&token=<JWT>
 *
 * 协议：
 *   ← 二进制：客户端按键流（写入 PTY）
 *   ← 文本 JSON：{ type: 'resize', cols, rows }
 *   → 二进制：PTY 输出
 *   → 文本 JSON：{ type: 'ready' } / { type: 'error', message }
 *
 * 关闭语义：ws close → close PTY → tmux 客户端 detach。
 * **绝不调用 tmux kill-session**，业务进程保留。
 *
 * 限制：每个 binding 同时刻最多 1 个活跃终端，重复连接会被拒。
 */

import type { Server as HttpServer, IncomingMessage } from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { eq } from 'drizzle-orm';

import logger from '../middleware/logger.js';
import { verifyToken } from '../auth/jwt.js';
import { getDb } from '../db/index.js';
import { bindings, machines, auditLogs } from '../db/schema.js';
import { getExecutor } from '../executor/factory.js';
import { getAdapter } from '../cli/factory.js';
import { isSafeSessionName, openLocalTerminal, openSshTerminal, type TerminalSession } from './pty-bridge.js';
import type { SshExecutor } from '../executor/ssh.js';

const WS_PATH = '/ws/terminal';

/** 每个 binding 同时最多一个 active 终端 */
const activeByBinding: Map<string, WebSocket> = new Map();

interface OpenParams {
  bindingId: string;
  cols: number;
  rows: number;
  token: string;
}

function parseParams(req: IncomingMessage): OpenParams | null {
  try {
    const url = new URL(req.url || '', 'http://x');
    const bindingId = url.searchParams.get('bindingId');
    const token = url.searchParams.get('token');
    if (!bindingId || !token) return null;
    const cols = Math.max(2, parseInt(url.searchParams.get('cols') || '80', 10) || 80);
    const rows = Math.max(2, parseInt(url.searchParams.get('rows') || '24', 10) || 24);
    return { bindingId, cols, rows, token };
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, obj: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function writeAudit(action: string, userId: number, target: string, ip: string, detail?: Record<string, unknown>) {
  try {
    const db = getDb();
    db.insert(auditLogs).values({
      userId,
      action,
      target,
      ipAddress: ip,
      detail: detail ? JSON.stringify(detail) : null,
    } as any).run();
  } catch (e: any) {
    logger.log('warn', 'audit 写入失败', e.message);
  }
}

async function handleConnection(ws: WebSocket, req: IncomingMessage, params: OpenParams): Promise<void> {
  const ip = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

  // 1) 鉴权
  const payload = verifyToken(params.token);
  if (!payload || (payload.username || '').endsWith(':2fa-pending')) {
    sendJson(ws, { type: 'error', message: '未登录或会话已过期' });
    ws.close(1008, 'unauthorized');
    return;
  }

  // 2) 找 binding
  const db = getDb();
  const b = db.select().from(bindings).where(eq(bindings.id, params.bindingId)).get();
  if (!b) {
    sendJson(ws, { type: 'error', message: '绑定不存在' });
    ws.close(1008, 'not found');
    return;
  }

  if (!isSafeSessionName(b.processName)) {
    sendJson(ws, { type: 'error', message: '不安全的进程名' });
    ws.close(1008, 'invalid name');
    return;
  }

  // 3) 单连接限制：顶掉旧的（也可改为拒绝新的；这里选"最新者赢"，老连接被关闭）
  const prev = activeByBinding.get(b.id);
  if (prev && prev.readyState === WebSocket.OPEN && prev !== ws) {
    sendJson(prev, { type: 'error', message: '此终端已被另一个连接接管' });
    try { prev.close(4001, 'superseded'); } catch { /* */ }
  }
  activeByBinding.set(b.id, ws);

  // 4) 解析 session 名
  const adapter = getAdapter(b.cliKind);
  const sessionName = `${adapter.sessionPrefix}-${b.processName}`;

  // 5) 解析 executor
  let machineKind: 'local' | 'ssh' = 'local';
  let machineLabel = 'local';
  if (b.machineId != null) {
    const m = db.select().from(machines).where(eq(machines.id, b.machineId)).get();
    if (m && !m.builtin) {
      machineKind = 'ssh';
      machineLabel = `${m.username}@${m.host}:${m.port}`;
    }
  }

  const executor = await getExecutor(b.machineId);

  // 6) 业务 session 在线检查
  const exists = await executor.sessionExists(sessionName);
  if (!exists) {
    sendJson(ws, { type: 'error', message: `tmux 会话 ${sessionName} 不存在，请先 mount 或重启绑定` });
    ws.close(1011, 'no tmux session');
    activeByBinding.delete(b.id);
    return;
  }

  // 7) 开 PTY
  let term: TerminalSession;
  try {
    if (machineKind === 'ssh') {
      term = await openSshTerminal(executor as SshExecutor, sessionName, params.cols, params.rows);
    } else {
      term = openLocalTerminal(sessionName, params.cols, params.rows);
    }
  } catch (e: any) {
    logger.log('error', `web-terminal 启动失败 binding=${b.id}`, e.message);
    sendJson(ws, { type: 'error', message: `终端启动失败: ${e.message}` });
    try { ws.close(1011, 'pty open failed'); } catch { /* */ }
    activeByBinding.delete(b.id);
    return;
  }

  const startedAt = Date.now();
  writeAudit('terminal:open', payload.sub, b.processName, ip, {
    bindingId: b.id, sessionName, machine: machineLabel,
  });
  logger.log('info', `web-terminal 打开 user=${payload.username} binding=${b.processName} (${machineLabel})`);
  sendJson(ws, { type: 'ready', sessionName, machine: machineLabel });

  // 8) PTY → ws
  term.onData((chunk) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(chunk); } catch { /* */ }
    }
  });

  let closed = false;
  const cleanup = (reason: string) => {
    if (closed) return;
    closed = true;
    try { term.close(); } catch { /* */ }
    if (activeByBinding.get(b.id) === ws) activeByBinding.delete(b.id);
    const durationMs = Date.now() - startedAt;
    writeAudit('terminal:close', payload.sub, b.processName, ip, {
      bindingId: b.id, sessionName, durationMs, reason,
    });
    logger.log('info', `web-terminal 关闭 binding=${b.processName} duration=${durationMs}ms reason=${reason}`);
  };

  term.onExit((code, signal) => {
    sendJson(ws, { type: 'exit', code, signal });
    try { ws.close(1000, 'pty exit'); } catch { /* */ }
    cleanup(`pty-exit code=${code} sig=${signal ?? ''}`);
  });

  // 9) ws → PTY
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      term.write(data as Buffer);
      return;
    }
    // 文本帧：JSON 控制
    try {
      const msg = JSON.parse(data.toString('utf8'));
      if (msg && msg.type === 'resize') {
        const c = Math.max(2, parseInt(msg.cols, 10) || 80);
        const r = Math.max(2, parseInt(msg.rows, 10) || 24);
        term.resize(c, r);
      } else if (msg && msg.type === 'input' && typeof msg.data === 'string') {
        // 兼容文本帧输入（非 binary 模式 client）
        term.write(msg.data);
      }
    } catch {
      // 非 JSON 文本一律按原始输入透传
      term.write(data.toString('utf8'));
    }
  });

  ws.on('close', () => cleanup('ws-close'));
  ws.on('error', (err) => {
    logger.log('warn', `web-terminal ws 错误 binding=${b.processName}`, err.message);
    cleanup('ws-error');
  });
}

/**
 * 把 ws 服务挂到现有 http server 上。
 * 必须在 `server.listen()` 之前或之后调用都行，但要在 server 实例创建后。
 */
export function mountTerminalWs(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url || '', 'http://x');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== WS_PATH) return; // 让其他 upgrade 处理器接管

    const params = parseParams(req);
    if (!params) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, req, params).catch((e) => {
        logger.log('error', 'web-terminal handleConnection 异常', e?.message || String(e));
        try { ws.close(1011, 'internal error'); } catch { /* */ }
      });
    });
  });

  logger.log('info', `Web Terminal WS 挂载: ${WS_PATH}`);
}
