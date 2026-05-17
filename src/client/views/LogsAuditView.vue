<!--
  LogsAuditView - 审计日志
  从 LogsView 拆分出来的审计日志 Tab
-->
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">审计日志</h2>
    </div>

    <div class="glass-card" style="padding: 0; overflow: hidden">
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
import { ref, onMounted } from 'vue';
import { useApi } from '../composables/useApi';

const api = useApi();
const auditLogs = ref<any[]>([]);
const auditLoading = ref(false);

async function refreshAudit() {
  auditLoading.value = true;
  try {
    const res = await api.get<any[]>('/api/logs');
    if (res.code === 0) auditLogs.value = res.data || [];
  } catch { /* */ } finally { auditLoading.value = false; }
}

onMounted(() => { refreshAudit(); });
</script>
