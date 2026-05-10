<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">服务商管理</h2>
      <div class="flex items-center gap-2">
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="openCreate">新建服务商</button>
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
            :style="selectedId === p.id ? 'background: rgba(0,0,0,0.04)' : ''"
            @click="selectedId = p.id"
            style="cursor: pointer"
          >
            <td style="font-weight: 500">{{ p.name }}</td>
            <td>{{ p.kind }}</td>
            <td style="color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ p.baseUrl || '-' }}</td>
            <td style="color: var(--text-secondary); font-family: monospace">{{ maskKey(p.apiKey) }}</td>
            <td>
              <div class="flex items-center gap-1">
                <button class="btn-mac btn-mac-sm" @click.stop="openEdit(p)">编辑</button>
                <button class="btn-mac btn-mac-danger btn-mac-sm" @click.stop="confirmDelete(p)">删除</button>
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

    <!-- 新建/编辑弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ isEdit ? '编辑服务商' : '新建服务商' }}</h3>
        <form @submit.prevent="handleSubmit">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">名称</label>
          <input v-model="form.name" type="text" class="input-mac mb-3" placeholder="如：Anthropic 官方" required />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">类型</label>
          <select v-model="form.kind" class="input-mac mb-3">
            <option value="custom">自定义（填写 URL + Key）</option>
            <option value="local">本机环境变量</option>
          </select>

          <template v-if="form.kind === 'custom'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">Base URL</label>
            <input v-model="form.baseUrl" type="text" class="input-mac mb-3" placeholder="https://api.anthropic.com" required />

            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">API Key</label>
            <input v-model="form.apiKey" type="password" class="input-mac mb-3" placeholder="sk-..." required />
          </template>

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">{{ formError }}</p>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="formLoading">
              {{ formLoading ? '提交中...' : (isEdit ? '保存' : '创建') }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showModal = false">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '../composables/useApi';
import type { Provider, Model } from '@shared/types';

const { get, post, put, del } = useApi();

const providers = ref<Provider[]>([]);
const models = ref<Model[]>([]);
const loading = ref(false);
const selectedId = ref<number | null>(null);

// 弹窗状态
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const form = ref({ name: '', kind: 'custom', baseUrl: '', apiKey: '' });
const formLoading = ref(false);
const formError = ref('');

const selectedProvider = computed(() =>
  providers.value.find(p => p.id === selectedId.value) ?? null
);

function maskKey(key: string | null): string {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

async function refresh() {
  loading.value = true;
  try {
    const res = await get<Provider[]>('/api/providers');
    if (res.code === 0) providers.value = res.data || [];
  } catch { /* */ } finally { loading.value = false; }
}

async function loadModels() {
  if (selectedId.value == null) { models.value = []; return; }
  try {
    const res = await get<Model[]>(`/api/providers/${selectedId.value}/models`);
    if (res.code === 0) models.value = res.data || [];
  } catch { models.value = []; }
}

watch(selectedId, loadModels);

function openCreate() {
  isEdit.value = false;
  editId.value = null;
  form.value = { name: '', kind: 'custom', baseUrl: '', apiKey: '' };
  formError.value = '';
  showModal.value = true;
}

function openEdit(p: Provider) {
  isEdit.value = true;
  editId.value = p.id;
  form.value = { name: p.name, kind: p.kind, baseUrl: p.baseUrl || '', apiKey: '' };
  formError.value = '';
  showModal.value = true;
}

async function handleSubmit() {
  formError.value = '';
  formLoading.value = true;
  try {
    let res;
    if (isEdit.value && editId.value) {
      res = await put(`/api/providers/${editId.value}`, {
        name: form.value.name,
        kind: form.value.kind,
        baseUrl: form.value.kind === 'local' ? '' : form.value.baseUrl,
        apiKey: form.value.kind === 'local' ? '' : form.value.apiKey || undefined,
      });
    } else {
      res = await post('/api/providers', {
        name: form.value.name,
        kind: form.value.kind,
        baseUrl: form.value.kind === 'local' ? '' : form.value.baseUrl,
        apiKey: form.value.kind === 'local' ? '' : form.value.apiKey,
      });
    }
    if (res && res.code === 0) {
      showModal.value = false;
      await refresh();
    } else {
      formError.value = res?.message || '操作失败';
    }
  } catch {
    formError.value = '网络错误，请重试';
  } finally {
    formLoading.value = false;
  }
}

async function confirmDelete(p: Provider) {
  if (!confirm(`确定删除服务商「${p.name}」？关联的模型列表也会被删除。`)) return;
  try {
    await del(`/api/providers/${p.id}`);
    if (selectedId.value === p.id) selectedId.value = null;
    await refresh();
  } catch { /* */ }
}

onMounted(refresh);
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
  align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(4px);
}
.modal-card {
  background: var(--card); border-radius: 12px; padding: 24px;
  width: 420px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
</style>
