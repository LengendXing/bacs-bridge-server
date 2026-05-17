<!--
  LogsAuditView - 审计日志
  从 LogsView 拆分出来的审计日志 Tab
-->
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">{{ t('logs.audit.title') }}</h2>
    </div>

    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>{{ t('logs.audit.thTime') }}</th>
            <th>{{ t('logs.audit.thAction') }}</th>
            <th>{{ t('logs.audit.thTarget') }}</th>
            <th>{{ t('logs.audit.thDetail') }}</th>
            <th>{{ t('logs.audit.thIp') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="auditLoading">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">{{ t('common.loading') }}</td>
          </tr>
          <tr v-else-if="auditLogs.length === 0">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">{{ t('common.noData') }}</td>
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
import { useI18n } from 'vue-i18n';
import { useApi } from '../composables/useApi';

const { t } = useI18n();
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
