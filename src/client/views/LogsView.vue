<!--
  LogsView - 系统日志页
  展示日志条目列表，按级别颜色区分（info/warn/error）
-->
<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">系统日志</h2>
      <button class="btn-mac btn-mac-sm" :disabled="loading" @click="refresh">刷新</button>
    </div>

    <!-- Log list -->
    <div class="glass-card">
      <div v-if="loading" class="text-center py-8" style="color: var(--text-secondary)">加载中...</div>
      <div v-else-if="logs.length === 0" class="text-center py-8" style="color: var(--text-secondary)">暂无日志</div>
      <div v-else class="log-list">
        <div
          v-for="(log, idx) in logs"
          :key="idx"
          class="log-entry"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-level" :class="levelClass(log.level)">{{ log.level }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * LogsView - 系统日志页
 * 展示日志条目列表，按级别颜色区分
 * info=indigo, warn=yellow, error=red
 */
import { ref, onMounted } from 'vue';
import { useApi } from '../composables/useApi';

interface LogEntry {
  time: string;
  level: string;
  message: string;
}

const { get } = useApi();

const logs = ref<LogEntry[]>([]);
const loading = ref(false);

/** 根据 level 返回 CSS class */
function levelClass(level: string): string {
  switch (level) {
    case 'error':
      return 'level-error';
    case 'warn':
      return 'level-warn';
    default:
      return 'level-info';
  }
}

/** 加载日志 */
async function refresh() {
  loading.value = true;
  try {
    const res = await get<LogEntry[]>('/api/logs');
    if (res.code === 0) {
      logs.value = res.data || [];
    }
  } catch {
    /* TODO: toast error */
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.log-entry {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.log-entry:last-child {
  border-bottom: none;
}
.log-time {
  color: var(--text-secondary);
  font-family: monospace;
  font-size: 12px;
  white-space: nowrap;
}
.log-level {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}
.level-info {
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent);
}
.level-warn {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
}
.level-error {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
}
.log-msg {
  color: var(--text);
  word-break: break-word;
}
</style>
