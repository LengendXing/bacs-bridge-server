import { ref, computed } from 'vue';

export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'closed';

interface TerminalMeta {
  session?: string;
  machine?: string;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const BUFFER_LIMIT = 1024 * 1024;

const bindingId = ref<string>('');
const status = ref<TerminalStatus>('idle');
const lastError = ref<string>('');
const meta = ref<TerminalMeta>({});
const outputBuffer = ref<Uint8Array[]>([]);
let bufferBytes = 0;

let ws: WebSocket | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let messageHandlers = new Set<(data: Uint8Array | string) => void>();
let cols = 80;
let rows = 24;

function getToken(): string | null {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

function pushBuffer(chunk: Uint8Array) {
  outputBuffer.value.push(chunk);
  bufferBytes += chunk.byteLength;
  while (bufferBytes > BUFFER_LIMIT && outputBuffer.value.length > 1) {
    const removed = outputBuffer.value.shift();
    if (removed) bufferBytes -= removed.byteLength;
  }
}

function clearBuffer() {
  outputBuffer.value = [];
  bufferBytes = 0;
}

function closeWs() {
  if (ws) {
    try { ws.close(); } catch { /* */ }
    ws = null;
  }
  status.value = 'closed';
}

function openWs(targetBindingId: string, c: number, r: number) {
  const token = getToken();
  if (!token) {
    lastError.value = '未登录或登录态已过期';
    status.value = 'closed';
    return;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({
    bindingId: targetBindingId,
    token,
    cols: String(c),
    rows: String(r),
  });
  const url = `${proto}://${window.location.host}/ws/terminal?${params.toString()}`;

  status.value = 'connecting';
  lastError.value = '';
  const sock = new WebSocket(url);
  sock.binaryType = 'arraybuffer';
  ws = sock;

  sock.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ready') {
          meta.value = { session: msg.sessionName, machine: msg.machine };
          status.value = 'open';
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
          return;
        }
        if (msg.type === 'error') {
          lastError.value = msg.message || '终端错误';
          messageHandlers.forEach((h) => h(`\r\n\x1b[31m${msg.message || '错误'}\x1b[0m\r\n`));
          return;
        }
        if (msg.type === 'exit') return;
      } catch {
        const txt = ev.data as string;
        const bytes = new TextEncoder().encode(txt);
        pushBuffer(bytes);
        messageHandlers.forEach((h) => h(bytes));
      }
      return;
    }
    const buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : (ev.data as Uint8Array);
    pushBuffer(buf);
    messageHandlers.forEach((h) => h(buf));
  };

  sock.onerror = () => {
    if (!lastError.value) lastError.value = 'WebSocket 错误';
  };

  sock.onclose = () => {
    if (ws === sock) ws = null;
    status.value = 'closed';
  };
}

function connect(targetBindingId: string, c?: number, r?: number) {
  cancelIdleTimer();
  if (!targetBindingId) return;
  if (typeof c === 'number') cols = c;
  if (typeof r === 'number') rows = r;

  if (ws && bindingId.value === targetBindingId && (status.value === 'open' || status.value === 'connecting')) {
    return;
  }
  if (ws) {
    try { ws.close(); } catch { /* */ }
    ws = null;
  }
  bindingId.value = targetBindingId;
  clearBuffer();
  meta.value = {};
  openWs(targetBindingId, cols, rows);
}

function reconnect() {
  if (!bindingId.value) return;
  if (ws) {
    try { ws.close(); } catch { /* */ }
    ws = null;
  }
  clearBuffer();
  meta.value = {};
  openWs(bindingId.value, cols, rows);
}

function disconnect() {
  cancelIdleTimer();
  closeWs();
  status.value = 'idle';
}

function sendInput(data: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(new TextEncoder().encode(data));
  }
}

function sendResize(c: number, r: number) {
  cols = c;
  rows = r;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', cols: c, rows: r }));
  }
}

function startIdleTimer(ms: number = IDLE_TIMEOUT_MS) {
  cancelIdleTimer();
  if (!ws) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    disconnect();
  }, ms);
}

function cancelIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function onMessage(handler: (data: Uint8Array | string) => void) {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

function replayBuffer(write: (data: Uint8Array) => void) {
  for (const chunk of outputBuffer.value) write(chunk);
}

export function useTerminalSession() {
  return {
    bindingId: computed(() => bindingId.value),
    status: computed(() => status.value),
    lastError: computed(() => lastError.value),
    meta: computed(() => meta.value),
    isIdleTimerActive: computed(() => idleTimer !== null),

    connect,
    reconnect,
    disconnect,
    sendInput,
    sendResize,
    startIdleTimer,
    cancelIdleTimer,
    onMessage,
    replayBuffer,
  };
}

export const IDLE_TIMEOUT = IDLE_TIMEOUT_MS;
