<template>
  <div class="term-panel" :class="{ embedded: !fullscreen, fullscreen }">
    <header class="term-header">
      <div class="left">
        <span class="dot" :class="statusClass" />
        <span class="title">{{ titleText }}</span>
        <span v-if="session.meta.value.machine" class="meta">{{ session.meta.value.machine }}</span>
        <span v-if="session.meta.value.session" class="meta">tmux: {{ session.meta.value.session }}</span>
      </div>
      <div class="right">
        <span v-if="session.status.value === 'closed'" class="hint">业务进程仍在运行（关闭终端不会 kill）</span>
        <button
          v-if="session.status.value === 'closed' || session.status.value === 'idle'"
          class="btn-mac btn-mac-sm"
          @click="reconnect"
        >重新连接</button>
      </div>
    </header>

    <div ref="termHostRef" class="term-host" />

    <div v-if="session.status.value === 'connecting'" class="overlay">
      <div class="msg">正在连接终端…</div>
    </div>
    <div v-else-if="session.status.value === 'closed' || session.status.value === 'idle'" class="overlay">
      <div class="msg">
        <div class="title-line">{{ session.status.value === 'idle' ? '终端未连接' : '终端已断开' }}</div>
        <div class="sub">{{ session.lastError.value || '业务 tmux 会话保留中，点击重新连接即可恢复。' }}</div>
        <button class="btn-mac btn-mac-sm" style="margin-top:12px" @click="reconnect">重新连接</button>
      </div>
    </div>
    <div v-else-if="!props.bindingId" class="overlay">
      <div class="msg">
        <div class="title-line">未选择绑定</div>
        <div class="sub">请在「绑定列表」中点击某行的 Terminal 按钮。</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { useTerminalSession } from '../composables/useTerminalSession';

interface Props {
  bindingId: string;
  fullscreen?: boolean;
}
const props = withDefaults(defineProps<Props>(), { fullscreen: false });

const session = useTerminalSession();
const termHostRef = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let unsubscribe: (() => void) | null = null;

const statusClass = computed(() => ({
  'dot-green': session.status.value === 'open',
  'dot-yellow': session.status.value === 'connecting',
  'dot-red': session.status.value === 'closed',
  'dot-gray': session.status.value === 'idle',
}));

const titleText = computed(() => {
  const st = session.status.value;
  if (st === 'open') return `Terminal · ${session.meta.value.session || props.bindingId}`;
  if (st === 'connecting') return 'Terminal · 连接中…';
  if (st === 'idle') return 'Terminal · 未连接';
  return 'Terminal · 已断开';
});

function ensureTerm() {
  if (term || !termHostRef.value) return;
  term = new Terminal({
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    convertEol: false,
    theme: { background: '#0b0b0c', foreground: '#e6e6e6', cursor: '#e6e6e6' },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(termHostRef.value);
  try { fit.fit(); } catch { /* */ }

  resizeObserver = new ResizeObserver(() => {
    if (!fit || !term) return;
    try {
      fit.fit();
      session.sendResize(term.cols, term.rows);
    } catch { /* */ }
  });
  resizeObserver.observe(termHostRef.value);

  term.onData((data) => { session.sendInput(data); });

  unsubscribe = session.onMessage((data) => {
    if (!term) return;
    if (typeof data === 'string') term.write(data);
    else term.write(data);
  });

  session.replayBuffer((chunk) => { term?.write(chunk); });
}

function reconnect() {
  if (!props.bindingId) return;
  if (term) {
    try { term.clear(); } catch { /* */ }
  }
  const c = term?.cols || 80;
  const r = term?.rows || 24;
  session.connect(props.bindingId, c, r);
}

watch(() => props.bindingId, (id, prev) => {
  if (!id || id === prev) return;
  if (term) {
    try { term.reset(); } catch { /* */ }
  }
  const c = term?.cols || 80;
  const r = term?.rows || 24;
  session.connect(id, c, r);
});

onMounted(() => {
  ensureTerm();
  if (props.bindingId) {
    const c = term?.cols || 80;
    const r = term?.rows || 24;
    if (session.bindingId.value === props.bindingId &&
        (session.status.value === 'open' || session.status.value === 'connecting')) {
      session.sendResize(c, r);
    } else {
      session.connect(props.bindingId, c, r);
    }
  }
});

onBeforeUnmount(() => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  try { resizeObserver?.disconnect(); } catch { /* */ }
  resizeObserver = null;
  try { term?.dispose(); } catch { /* */ }
  term = null;
  fit = null;
});
</script>

<style scoped>
.term-panel {
  display: flex;
  flex-direction: column;
  background: #0b0b0c;
  color: #e6e6e6;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}
.term-panel.fullscreen {
  position: fixed;
  inset: 0;
  border-radius: 0;
}
.term-panel.embedded {
  height: 100%;
  min-height: 480px;
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
.dot-gray { background: #6b7280; }
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
.overlay .sub { color: #aaa; font-size: 12px; max-width: 480px; padding: 0 12px; }
</style>
