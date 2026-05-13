<template>
  <div class="term-page">
    <header class="term-header">
      <div class="left">
        <span class="dot" :class="statusClass" />
        <span class="title">{{ titleText }}</span>
        <span v-if="meta.machine" class="meta">{{ meta.machine }}</span>
        <span v-if="meta.session" class="meta">tmux: {{ meta.session }}</span>
      </div>
      <div class="right">
        <span v-if="status === 'closed'" class="hint">业务进程仍在运行（关闭终端不会 kill）</span>
        <button class="btn-mac btn-mac-sm" v-if="status === 'closed'" @click="connect">重新连接</button>
        <button class="btn-mac btn-mac-sm" @click="closeWindow">关闭</button>
      </div>
    </header>

    <div ref="termHostRef" class="term-host" />

    <div v-if="status === 'connecting'" class="overlay">
      <div class="msg">正在连接终端…</div>
    </div>
    <div v-else-if="status === 'closed'" class="overlay">
      <div class="msg">
        <div class="title-line">终端已断开</div>
        <div class="sub">{{ lastError || '连接已关闭，业务 tmux 会话保留中。' }}</div>
        <button class="btn-mac btn-mac-sm" style="margin-top:12px" @click="connect">重新连接</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Web Terminal 页面（v1.1.3）
 *
 * - 独立路由 /terminal/:bindingId，由 window.open 打开
 * - 通过 ?boot=<short JWT> 接收主窗口的快捷登录 token，调 /api/auth/exchange
 *   换长 token 存 sessionStorage（子窗口不共享 sessionStorage）
 * - 用 xterm + WebSocket(/ws/terminal) 直连 tmux attach pane
 * - 关闭终端只关 PTY/WS，不 kill tmux session
 */
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const route = useRoute();
const bindingId = String(route.params.bindingId || '');

const termHostRef = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let ws: WebSocket | null = null;
let resizeObserver: ResizeObserver | null = null;

type Status = 'connecting' | 'open' | 'closed';
const status = ref<Status>('connecting');
const lastError = ref<string>('');
const meta = ref<{ session?: string; machine?: string }>({});

const statusClass = computed(() => ({
  'dot-green': status.value === 'open',
  'dot-yellow': status.value === 'connecting',
  'dot-red': status.value === 'closed',
}));

const titleText = computed(() => {
  if (status.value === 'open') return `Terminal · ${meta.value.session || bindingId}`;
  if (status.value === 'connecting') return 'Terminal · 连接中…';
  return 'Terminal · 已断开';
});

function getToken(): string | null {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

async function bootstrapTokenIfNeeded(): Promise<string | null> {
  const url = new URL(window.location.href);
  const boot = url.searchParams.get('boot');
  let token = getToken();
  if (token) {
    if (boot) {
      url.searchParams.delete('boot');
      window.history.replaceState({}, '', url.toString());
    }
    return token;
  }
  if (!boot) return null;
  try {
    const res = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: boot }),
      credentials: 'same-origin',
    });
    const json = await res.json();
    if (json && json.code === 0 && json.data?.token) {
      token = String(json.data.token);
      sessionStorage.setItem('auth_token', token);
      url.searchParams.delete('boot');
      window.history.replaceState({}, '', url.toString());
      return token;
    }
  } catch (e: any) {
    lastError.value = `登录态交换失败: ${e?.message || e}`;
  }
  return null;
}

function buildWsUrl(token: string, cols: number, rows: number): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({
    bindingId,
    token,
    cols: String(cols),
    rows: String(rows),
  });
  return `${proto}://${window.location.host}/ws/terminal?${params.toString()}`;
}

function ensureTerminal(): Terminal {
  if (term) return term;
  term = new Terminal({
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    convertEol: false,
    theme: {
      background: '#0b0b0c',
      foreground: '#e6e6e6',
      cursor: '#e6e6e6',
    },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  if (termHostRef.value) {
    term.open(termHostRef.value);
    try { fit.fit(); } catch { /* 容器尚未布局完成 */ }
  }

  resizeObserver = new ResizeObserver(() => {
    if (!fit || !term) return;
    try {
      fit.fit();
      const cols = term.cols;
      const rows = term.rows;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    } catch { /* */ }
  });
  if (termHostRef.value) resizeObserver.observe(termHostRef.value);

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  });

  return term;
}

async function connect() {
  status.value = 'connecting';
  lastError.value = '';

  const token = await bootstrapTokenIfNeeded();
  if (!token) {
    lastError.value = '未登录或登录态已过期，请回主窗口重新登录后再打开终端。';
    status.value = 'closed';
    return;
  }

  const t = ensureTerminal();
  try { fit?.fit(); } catch { /* */ }
  const cols = t.cols || 80;
  const rows = t.rows || 24;

  const url = buildWsUrl(token, cols, rows);
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    // 等待服务端 ready/error 控制帧；此处不立刻置 open
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ready') {
          meta.value = { session: msg.sessionName, machine: msg.machine };
          status.value = 'open';
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }));
          }
          return;
        }
        if (msg.type === 'error') {
          lastError.value = msg.message || '终端错误';
          return;
        }
        if (msg.type === 'exit') {
          // PTY 退出（用户在 tmux 里 Ctrl-b d 等），等 ws.onclose 收尾
          return;
        }
      } catch {
        t.write(ev.data);
      }
      return;
    }
    // 二进制
    const buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ev.data;
    t.write(buf as Uint8Array);
  };

  ws.onerror = () => {
    if (!lastError.value) lastError.value = 'WebSocket 错误';
  };

  ws.onclose = () => {
    status.value = 'closed';
    ws = null;
  };
}

function closeWindow() {
  try { ws?.close(); } catch { /* */ }
  if (window.opener) window.close();
  else history.back();
}

onMounted(() => {
  ensureTerminal();
  connect();
});

onBeforeUnmount(() => {
  try { ws?.close(); } catch { /* */ }
  ws = null;
  try { resizeObserver?.disconnect(); } catch { /* */ }
  try { term?.dispose(); } catch { /* */ }
  term = null;
  fit = null;
});
</script>

<style scoped>
.term-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0b0b0c;
  color: #e6e6e6;
}
.term-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #161617;
  border-bottom: 1px solid #2a2a2c;
  font-size: 12px;
  flex: 0 0 auto;
}
.term-header .left { display: flex; align-items: center; gap: 8px; }
.term-header .right { display: flex; align-items: center; gap: 8px; }
.title { font-weight: 600; }
.meta { color: #888; }
.hint { color: #888; font-size: 11px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-green { background: #4ade80; }
.dot-yellow { background: #facc15; }
.dot-red { background: #ef4444; }
.term-host {
  flex: 1 1 auto;
  min-height: 0;
  padding: 4px 6px 0 6px;
  background: #0b0b0c;
}
.overlay {
  position: absolute;
  inset: 28px 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(11, 11, 12, 0.85);
}
.overlay .msg { text-align: center; pointer-events: auto; }
.overlay .title-line { font-size: 14px; margin-bottom: 6px; }
.overlay .sub { color: #aaa; font-size: 12px; max-width: 480px; }
</style>
