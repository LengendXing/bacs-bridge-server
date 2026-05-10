<template>
  <div class="grid grid-cols-4 gap-4">
    <div class="glass-card text-center">
      <div class="text-3xl font-bold">{{ stats.total }}</div>
      <div class="text-xs mt-1" style="color: var(--text-secondary)">总绑定数</div>
    </div>
    <div class="glass-card text-center">
      <div class="text-3xl font-bold" style="color: var(--success)">{{ stats.online }}</div>
      <div class="text-xs mt-1" style="color: var(--text-secondary)">在线进程</div>
    </div>
    <div class="glass-card text-center">
      <div class="text-3xl font-bold" style="color: var(--danger)">{{ stats.offline }}</div>
      <div class="text-xs mt-1" style="color: var(--text-secondary)">离线进程</div>
    </div>
    <div class="glass-card text-center">
      <div class="text-3xl font-bold" style="color: var(--accent)">{{ stats.sessions }}</div>
      <div class="text-xs mt-1" style="color: var(--text-secondary)">活跃会话</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * HomeView - 首页仪表盘
 * 显示绑定/在线/离线/会话数统计
 */
import { ref, onMounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { Binding } from '@shared/types';

const { get } = useApi();

const stats = ref({
  total: 0,
  online: 0,
  offline: 0,
  sessions: 0,
});

/** 刷新统计数据 */
async function refreshStats() {
  try {
    const [statusRes, sessionsRes] = await Promise.all([
      get<Binding[]>('/api/status'),
      get<string[]>('/api/sessions'),
    ]);
    const bindings = statusRes.data || [];
    stats.value = {
      total: bindings.length,
      online: bindings.filter(b => b.status === 'online').length,
      offline: bindings.filter(b => b.status === 'offline').length,
      sessions: (sessionsRes.data || []).length,
    };
  } catch { /* ignore */ }
}

onMounted(refreshStats);
</script>
