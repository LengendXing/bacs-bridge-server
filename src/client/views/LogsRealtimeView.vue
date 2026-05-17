<!--
  LogsRealtimeView - 实时系统日志（SSE）
  从 LogsView 拆分出来的实时日志 Tab
-->
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">{{ t('logs.realtime.title') }}</h2>
      <span v-if="connected" class="badge badge-online" style="font-size: 11px">{{ t('logs.realtime.connected') }}</span>
    </div>

    <div class="glass-card" ref="logContainer" style="max-height: 70vh; overflow-y: auto; padding: 16px">
      <div v-if="systemLogs.length === 0 && !connected" class="text-center py-8" style="color: var(--text-secondary)">{{ t('common.loading') }}</div>
      <div v-else-if="systemLogs.length === 0" class="text-center py-8" style="color: var(--text-secondary)">{{ t('common.noData') }}</div>
      <div
        v-for="(log, idx) in systemLogs"
        :key="idx"
        class="log-entry"
      >
        <span class="log-time">{{ log.time || log.timestamp || '-' }}</span>
        <span class="log-level" :class="levelClass(log.level || log.tag)">{{ log.level || log.tag || 'info' }}</span>
        <span class="log-msg">{{ log.message || log.msg || log.raw || JSON.stringify(log) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const logContainer = ref<HTMLElement | null>(null);
const systemLogs = ref<any[]>([]);
const connected = ref(false);
let eventSource: EventSource | null = null;

function connectSSE() {
  if (eventSource) { eventSource.close(); }
  const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || '';
  if (!token) {
    connected.value = false;
    return;
  }
  eventSource = new EventSource(`/api/logs/stream?token=${encodeURIComponent(token)}`);

  eventSource.onopen = () => { connected.value = true; };
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      systemLogs.value.push(data);
      if (systemLogs.value.length > 500) {
        systemLogs.value = systemLogs.value.slice(-500);
      }
      nextTick(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      });
    } catch { /* ignore parse errors */ }
  };
  eventSource.onerror = () => {
    connected.value = false;
    setTimeout(() => connectSSE(), 3000);
  };
}

function levelClass(level: string): string {
  switch (level) {
    case 'error': return 'level-error';
    case 'warn': return 'level-warn';
    default: return 'level-info';
  }
}

onMounted(() => { connectSSE(); });
onUnmounted(() => { if (eventSource) eventSource.close(); });
</script>

<style scoped>
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.log-entry:last-child { border-bottom: none; }
.log-time { color: var(--text-secondary); font-family: monospace; font-size: 11px; white-space: nowrap; min-width: 80px; }
.log-level {
  display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px;
  font-weight: 600; text-transform: uppercase; white-space: nowrap; min-width: 48px; text-align: center;
}
.level-info { background: rgba(0, 0, 0, 0.06); color: var(--text); }
.level-warn { background: rgba(234, 179, 8, 0.15); color: #ca8a04; }
.level-error { background: rgba(239, 68, 68, 0.12); color: var(--danger); }
.log-msg { color: var(--text); word-break: break-word; flex: 1; }
</style>
