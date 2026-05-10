<!--
  ProvidersView - 服务商管理页
  展示服务商列表及所选服务商的模型列表，支持新建/刷新
-->
<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">服务商管理</h2>
      <div class="flex items-center gap-2">
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="showCreate = true">新建服务商</button>
        <button class="btn-mac btn-mac-sm" :disabled="loading" @click="refresh">刷新</button>
      </div>
    </div>

    <!-- Providers table -->
    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>名称</th>
            <th>类型</th>
            <th>Base URL</th>
            <th>API Key</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">加载中...</td>
          </tr>
          <tr v-else-if="providers.length === 0">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">暂无服务商</td>
          </tr>
          <tr
            v-for="p in providers"
            :key="p.id"
            :style="selectedId === p.id ? 'background: var(--accent); color: #fff' : ''"
            @click="selectedId = p.id"
            style="cursor: pointer"
          >
            <td style="font-weight: 500">{{ p.name }}</td>
            <td>{{ p.kind }}</td>
            <td style="color: var(--text-secondary)">{{ p.baseUrl || '-' }}</td>
            <td style="color: var(--text-secondary); font-family: monospace">
              {{ maskKey(p.apiKey) }}
            </td>
            <td>
              <div class="flex items-center gap-1">
                <!-- TODO: 编辑服务商弹窗 -->
                <button class="btn-mac btn-mac-sm" disabled title="编辑（待实现）">编辑</button>
                <!-- TODO: 删除确认弹窗 -->
                <button class="btn-mac btn-mac-danger btn-mac-sm" disabled title="删除（待实现）">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Models section -->
    <div v-if="selectedProvider" class="glass-card mt-6">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">
        模型列表 — {{ selectedProvider.name }}
      </h3>
      <table v-if="models.length > 0" class="table-mac">
        <thead>
          <tr>
            <th>Model ID</th>
            <th>显示名称</th>
            <th>CLI 类型</th>
            <th>抓取时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in models" :key="m.id">
            <td style="font-family: monospace">{{ m.modelId }}</td>
            <td>{{ m.displayName || '-' }}</td>
            <td>{{ m.cliKind }}</td>
            <td style="color: var(--text-secondary)">{{ formatDate(m.fetchedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-sm" style="color: var(--text-secondary)">该服务商暂无模型数据</p>
    </div>

    <!-- TODO: 新建服务商弹窗 / 编辑服务商弹窗 / 删除确认弹窗 -->
  </div>
</template>

<script setup lang="ts">
/**
 * ProvidersView - 服务商管理页
 * 展示服务商列表，点击行选中后显示其模型列表
 * 新建/编辑/删除弹窗为占位，后续迭代实现
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '../composables/useApi';
import type { Provider, Model } from '@shared/types';

const { get } = useApi();

const providers = ref<Provider[]>([]);
const models = ref<Model[]>([]);
const loading = ref(false);
const selectedId = ref<number | null>(null);
const showCreate = ref(false);

/** 当前选中的服务商对象 */
const selectedProvider = computed(() =>
  providers.value.find(p => p.id === selectedId.value) ?? null
);

/** 遮蔽 API Key，仅显示前4后4 */
function maskKey(key: string | null): string {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/** 格式化日期 */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** 加载服务商列表 */
async function refresh() {
  loading.value = true;
  try {
    const res = await get<Provider[]>('/api/providers');
    if (res.code === 0) {
      providers.value = res.data || [];
    }
  } catch {
    /* TODO: toast error */
  } finally {
    loading.value = false;
  }
}

/** 选中服务商后加载其模型 */
async function loadModels() {
  if (selectedId.value == null) {
    models.value = [];
    return;
  }
  try {
    const res = await get<Model[]>(`/api/providers/${selectedId.value}/models`);
    if (res.code === 0) {
      models.value = res.data || [];
    }
  } catch {
    models.value = [];
  }
}

watch(selectedId, loadModels);

onMounted(refresh);
</script>
