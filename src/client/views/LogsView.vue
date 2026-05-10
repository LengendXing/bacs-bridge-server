<!--
  LogsView - 实时系统日志 + 审计日志
-->
<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">日志</h2>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1" style="background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 2px">
          <button
            class="btn-mac btn-mac-sm"
            :class="{ 'btn-mac-primary': tab === 'system' }"
            @click="tab = 'system'"
          >
            系统日志
          </button>
          <button
            class="btn-mac btn-mac-sm"
            :class="{ 'btn-mac-primary': tab === 'audit' }"
            @click="tab = 'audit'; refreshAudit()"
          >
            审计日志
          </button>
        </div>
        <span v-if="tab === 'system' && connected" class="badge badge-online" style="font-size: 11px">实时</span>
      </div>
    </div>

    <!-- 系统日志（实时） -->
    <div v-if="tab === 'system'" class="glass-card" ref="logContainer" style="max-height: 70vh; overflow-y: auto; padding: 16px">
      <div v-if="systemLogs.length === 0 && !connected" class="text-center py-8" style="color: var(--text-secondary)">连接中...</div>
      <div v-else-if="systemLogs.length === 0" class="text-center py-8" style="color: var(--text-secondary)">等待日志...</div>
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

    <!-- 审计日志 -->
    <div v-else class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>对象</th>
            <th>详情</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="auditLoading">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">加载中...</td>
          </tr>
          <tr v-else-if="auditLogs.length === 0">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">暂无审计日志</td>
          </tr>
          <tr v-for="a in auditLogs" :key="a.id">
            <td style="color: var(--text-secondary); font-family: monospace; font-size: 12px">{{ a.createdAt }}</td>
            <td><span class="badge badge-info">{{ a.action }}</span></td>
            <td>{{ a.target || '-' }}</td>
            <td style="color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ a.detail || '-' }}</td>
            <td style="color: var(--text-secondary)">{{ a.ipAddress || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useApi } from '../composables/useApi';

const api = useApi();

const tab = ref<'system' | 'audit'>('system');
const logContainer = ref<HTMLElement | null>(null);

// ── 系统日志（SSE 实时） ──
const systemLogs = ref<any[]>([]);
const connected = ref(false);
let eventSource: EventSource | null = null;

function connectSSE() {
  if (eventSource) { eventSource.close(); }
  // SSE 需要认证，token 放 URL query
  const auth = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
  eventSource = new EventSource(`/api/logs/stream?token=${encodeURIComponent(auth)}`);

  eventSource.onopen = () => { connected.value = true; };
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      systemLogs.value.push(data);
      // 保留最近 500 条
      if (systemLogs.value.length > 500) {
        systemLogs.value = systemLogs.value.slice(-500);
      }
      // 自动滚到底
      nextTick(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      });
    } catch { /* ignore parse errors */ }
  };
  eventSource.onerror = () => {
    connected.value = false;
    // 3 秒后重连
    setTimeout(() => { if (tab.value === 'system') connectSSE(); }, 3000);
  };
}

// ── 审计日志 ──
const auditLogs = ref<any[]>([]);
const auditLoading = ref(false);

async function refreshAudit() {
  auditLoading.value = true;
  try {
    const res = await api.get<any[]>('/api/logs');
    if (res.code === 0) auditLogs.value = res.data || [];
  } catch { /* */ } finally { auditLoading.value = false; }
}

function levelClass(level: string): string {
  switch (level) {
    case 'error': return 'level-error';
    case 'warn': return 'level-warn';
    default: return 'level-info';
  }
}

// SSE 端点不支持 X-Auth-Token header，需要后端也接受 query param
// 暂时先在 query 传 token，后端需要适配

onMounted(() => {
  connectSSE();
});
onUnmounted(() => {
  if (eventSource) eventSource.close();
});
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
.log-entry:last-child {
  border-bottom: none;
}
.log-time {
  color: var(--text-secondary);
  font-family: monospace;
  font-size: 11px;
  white-space: nowrap;
  min-width: 80px;
}
.log-level {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
  min-width: 48px;
  text-align: center;
}
.level-info {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text);
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
  flex: 1;
}
</style>
