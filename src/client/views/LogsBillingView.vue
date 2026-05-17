<!--
  LogsBillingView - 扣费日志
  v1.1.25 新增：展示每轮对话的计费记录
-->
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">{{ t('logs.billing.title') }}</h2>
      <button class="btn-mac btn-mac-sm" @click="loadBilling">{{ t('common.refresh') }}</button>
    </div>

    <!-- 汇总卡片 -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="glass-card" style="padding: 16px">
        <div style="color: var(--text-secondary); font-size: 12px">{{ t('logs.billing.today') }}</div>
        <div style="font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums">${{ summary.todayCost.toFixed(4) }}</div>
      </div>
      <div class="glass-card" style="padding: 16px">
        <div style="color: var(--text-secondary); font-size: 12px">{{ t('logs.billing.week') }}</div>
        <div style="font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums">${{ summary.weekCost.toFixed(4) }}</div>
      </div>
      <div class="glass-card" style="padding: 16px">
        <div style="color: var(--text-secondary); font-size: 12px">{{ t('logs.billing.month') }}</div>
        <div style="font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums">${{ summary.monthCost.toFixed(4) }}</div>
      </div>
      <div class="glass-card" style="padding: 16px">
        <div style="color: var(--text-secondary); font-size: 12px">{{ t('logs.billing.total') }}</div>
        <div style="font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums">${{ summary.totalCost.toFixed(4) }}</div>
      </div>
    </div>

    <!-- 计费表格 -->
    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>{{ t('logs.billing.thTime') }}</th>
            <th>{{ t('logs.billing.thProcess') }}</th>
            <th>{{ t('logs.billing.thModel') }}</th>
            <th>{{ t('logs.billing.thElapsed') }}</th>
            <th>{{ t('logs.billing.thCost') }}</th>
            <th>{{ t('logs.billing.thSource') }}</th>
            <th>{{ t('logs.billing.thAction') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="text-center" style="color: var(--text-secondary)">{{ t('common.loading') }}</td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td colspan="7" class="text-center" style="color: var(--text-secondary)">{{ t('common.noData') }}</td>
          </tr>
          <tr v-for="row in rows" :key="row.id">
            <td style="color: var(--text-secondary); font-family: monospace; font-size: 12px">{{ row.created_at }}</td>
            <td>{{ row.process_name }}</td>
            <td style="font-size: 12px">{{ formatModel(row.model_id) }}</td>
            <td style="font-variant-numeric: tabular-nums">{{ formatElapsed(row.elapsed_sec) }}</td>
            <td style="font-variant-numeric: tabular-nums; font-weight: 600">
              {{ row.cost_source === 'precise' ? '' : '≈' }}${{ formatCost(row) }}
            </td>
            <td>
              <span class="badge" :class="row.cost_source === 'precise' ? 'badge-online' : 'badge-info'" style="font-size: 11px">
                {{ row.cost_source === 'precise' ? t('logs.billing.sourcePrecise') : t('logs.billing.sourceEstimated') }}
              </span>
            </td>
            <td>
              <button class="btn-mac btn-mac-sm" @click="showDetail(row.id)">{{ t('common.detail') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination
        :total="total"
        v-model:page="page"
        v-model:pageSize="pageSize"
      />
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detailVisible" class="modal-overlay" @click.self="detailVisible = false">
      <div class="glass-card modal-card" style="padding: 24px">
        <div class="flex items-center justify-between mb-4">
          <h3 style="font-size: 16px; font-weight: 600; color: var(--text)">{{ t('logs.billing.detailTitle') }}</h3>
          <button style="color: var(--text-secondary); cursor: pointer; font-size: 18px" @click="detailVisible = false">&times;</button>
        </div>

        <div v-if="detailLoading" class="text-center py-6" style="color: var(--text-secondary)">{{ t('common.loading') }}</div>
        <template v-else-if="detail">
          <!-- 基础信息 -->
          <div class="detail-section">
            <div class="detail-label">{{ t('logs.billing.process') }}</div>
            <div class="detail-value">{{ detail.record.process_name }}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">{{ t('logs.billing.model') }}</div>
            <div class="detail-value">{{ detail.record.model_id || t('logs.billing.defaultModel') }}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">{{ t('logs.billing.elapsed') }}</div>
            <div class="detail-value">{{ formatElapsed(detail.record.elapsed_sec) }}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">{{ t('logs.billing.cost') }}</div>
            <div class="detail-value">
              {{ detail.record.cost_source === 'precise' ? '' : '≈' }}${{ formatCost(detail.record) }}
              <span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px">
                {{ detail.record.cost_source === 'precise' ? t('logs.billing.precise') : t('logs.billing.estimated') }}
              </span>
            </div>
          </div>

          <!-- 工具调用 -->
          <div v-if="detail.record.tool_calls_json" class="detail-section" style="margin-top: 12px">
            <div class="detail-label">{{ t('logs.billing.toolCalls') }}</div>
            <div class="detail-value">
              <template v-for="(count, name) in parseToolCalls(detail.record.tool_calls_json)" :key="name">
                <span class="badge badge-info" style="margin-right: 6px; font-size: 11px">{{ name }}&times;{{ count }}</span>
              </template>
            </div>
          </div>

          <!-- 对话关联 -->
          <div v-if="detail.conversations && detail.conversations.length > 0" style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px">
            <div class="detail-label" style="margin-bottom: 8px">{{ t('logs.billing.conversation') }}</div>
            <div v-for="conv in detail.conversations" :key="conv.id" style="font-size: 12px; color: var(--text-secondary)">
              {{ t('logs.billing.platform') }}: {{ conv.platform }} &middot; {{ t('logs.billing.target') }}: {{ conv.target_id || '-' }}
            </div>
          </div>

          <!-- 用户消息 -->
          <div v-if="detail.conversations && detail.conversations[0]?.user_message_full" style="margin-top: 12px">
            <div class="detail-label">{{ t('logs.billing.userMessage') }}</div>
            <div class="detail-value" style="font-size: 12px; max-height: 80px; overflow-y: auto">
              {{ detail.conversations[0].user_message_full }}
            </div>
          </div>

          <!-- 回复摘要 -->
          <div v-if="detail.record.reply_snippet" style="margin-top: 12px">
            <div class="detail-label">{{ t('logs.billing.replySnippet') }}</div>
            <div class="detail-value" style="font-size: 12px; max-height: 80px; overflow-y: auto">
              {{ detail.record.reply_snippet }}
            </div>
          </div>

          <!-- 提示 -->
          <div v-if="detail.record.cost_source === 'estimated'" style="margin-top: 16px; padding: 8px 12px; border-radius: 8px; background: rgba(234, 179, 8, 0.1); font-size: 11px; color: #ca8a04">
            {{ t('logs.billing.estimateNote') }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '../composables/useApi';
import Pagination from '../components/Pagination.vue';

const { t } = useI18n();
const api = useApi();

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

const summary = ref({
  totalCost: 0, totalPrecise: 0, totalEstimated: 0, recordCount: 0,
  todayCost: 0, weekCost: 0, monthCost: 0,
});

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

async function loadBilling() {
  loading.value = true;
  try {
    const res = await api.get<any>(`/api/billing?page=${page.value}&pageSize=${pageSize.value}`);
    if (res.code === 0 && res.data) {
      rows.value = res.data.rows || [];
      total.value = res.data.total || 0;
    }
  } catch { /* */ } finally { loading.value = false; }
}

async function loadSummary() {
  try {
    const res = await api.get<any>('/api/billing/summary');
    if (res.code === 0 && res.data) summary.value = res.data;
  } catch { /* */ }
}

async function showDetail(id: number) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const res = await api.get<any>(`/api/billing/${id}`);
    if (res.code === 0 && res.data) detail.value = res.data;
  } catch { /* */ } finally { detailLoading.value = false; }
}

function formatModel(modelId: string | null): string {
  if (!modelId) return t('logs.billing.defaultModel');
  if (modelId.includes('opus')) return 'Opus 4';
  if (modelId.includes('sonnet')) return 'Sonnet 4';
  if (modelId.includes('haiku')) return 'Haiku 4';
  return modelId.length > 20 ? modelId.slice(0, 20) + '...' : modelId;
}

function formatElapsed(sec: number): string {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

function formatCost(row: any): string {
  const cost = row.cost_source === 'precise' ? row.cost_usd : row.cost_usd_estimated;
  if (cost == null) return '0.0000';
  return cost.toFixed(4);
}

function parseToolCalls(json: string): Record<string, number> {
  try { return JSON.parse(json); } catch { return {}; }
}

watch([page, pageSize], () => { loadBilling(); });
onMounted(() => { loadBilling(); loadSummary(); });
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.modal-card {
  width: 90%; max-width: 560px; max-height: 80vh; overflow-y: auto;
}
.detail-section {
  display: flex; gap: 12px; margin-bottom: 8px;
}
.detail-label {
  color: var(--text-secondary); font-size: 12px; min-width: 60px; flex-shrink: 0;
}
.detail-value {
  color: var(--text); font-size: 13px; flex: 1; word-break: break-word;
}
</style>
