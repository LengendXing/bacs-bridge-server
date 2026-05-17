<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">{{ t('providers.title') }}</h2>
      <div class="flex items-center gap-2">
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="openCreate">{{ t('providers.add') }}</button>
        <button class="btn-mac btn-mac-sm" :disabled="loading" @click="refresh">{{ t('common.refresh') }}</button>
      </div>
    </div>

    <!-- Providers table -->
    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>{{ t('providers.thName') }}</th>
            <th>{{ t('providers.thKind') }}</th>
            <th>{{ t('providers.thBaseUrl') }}</th>
            <th>{{ t('providers.apiKeyLabel') }}</th>
            <th>{{ t('providers.thAction') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">{{ t('common.loading') }}</td>
          </tr>
          <tr v-else-if="pagedProviders.length === 0">
            <td colspan="5" class="text-center" style="color: var(--text-secondary)">{{ t('common.noData') }}</td>
          </tr>
          <tr
            v-for="p in pagedProviders"
            :key="p.id"
            :style="selectedId === p.id ? 'background: rgba(0,0,0,0.04)' : ''"
            @click="selectedId = p.id"
            style="cursor: pointer"
          >
            <td style="font-weight: 500">{{ p.name }}</td>
            <td>{{ kindLabel(p.kind) }}</td>
            <td style="color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ p.baseUrl || '-' }}</td>
            <td style="color: var(--text-secondary); font-family: monospace">{{ maskKey(p.apiKey) }}</td>
            <td>
              <div class="flex items-center gap-1">
                <button class="btn-mac btn-mac-sm" @click.stop="openEdit(p)">{{ t('common.edit') }}</button>
                <button class="btn-mac btn-mac-danger btn-mac-sm" @click.stop="confirmDelete(p)">{{ t('common.delete') }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination
        v-model:page="providerPage"
        v-model:pageSize="providerPageSize"
        :total="providers.length"
        :disabled="loading"
      />
    </div>

    <!-- Models section -->
    <div v-if="selectedProvider" class="glass-card mt-6" style="padding: 0; overflow: hidden">
      <div style="padding: 16px 16px 0">
        <h3 class="text-base font-semibold" style="color: var(--text)">
          {{ t('providers.modelsTitle') }} — {{ selectedProvider.name }}
        </h3>
      </div>
      <table v-if="models.length > 0" class="table-mac" style="margin-top: 12px">
        <thead>
          <tr>
            <th>Model ID</th>
            <th>{{ t('providers.modelsThDisplayName') }}</th>
            <th>{{ t('providers.modelsThCliKind') }}</th>
            <th>{{ t('providers.modelsThFetchedAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in pagedModels" :key="m.id">
            <td style="font-family: monospace">{{ m.modelId }}</td>
            <td>{{ m.displayName || '-' }}</td>
            <td>{{ m.cliKind }}</td>
            <td style="color: var(--text-secondary)">{{ formatDate(m.fetchedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="models.length === 0" class="text-sm" style="color: var(--text-secondary); padding: 16px">{{ t('providers.noModels') }}</p>
      <Pagination
        v-if="models.length > 0"
        v-model:page="modelPage"
        v-model:pageSize="modelPageSize"
        :total="models.length"
      />
    </div>

    <!-- 新建/编辑弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ isEdit ? t('providers.editTitle') : t('providers.createTitle') }}</h3>
        <form @submit.prevent="handleSubmit">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('providers.nameLabel') }}</label>
          <input v-model="form.name" type="text" class="input-mac mb-3" :placeholder="t('providers.namePlaceholder')" required />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('providers.kindLabel') }}</label>
          <select v-model="form.kind" class="input-mac mb-3">
            <option value="custom">{{ t('providers.kindCustom') }}</option>
            <option value="local">{{ t('providers.kindLocal') }}</option>
          </select>

          <template v-if="form.kind === 'custom'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('providers.baseUrlLabel') }}</label>
            <input v-model="form.baseUrl" type="text" class="input-mac mb-3" placeholder="https://api.anthropic.com" required />

            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('providers.apiKeyLabel') }}</label>
            <input v-model="form.apiKey" type="password" class="input-mac mb-3" placeholder="sk-..." required />
          </template>

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">{{ formError }}</p>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="formLoading">
              {{ formLoading ? t('common.submitting') : (isEdit ? t('common.save') : t('common.creating')) }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showModal = false">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '../composables/useApi';
import Pagination from '../components/Pagination.vue';
import type { Provider, Model } from '@shared/types';

const { t } = useI18n();
const { get, post, put, del } = useApi();

const providers = ref<Provider[]>([]);
const models = ref<Model[]>([]);
const loading = ref(false);
const selectedId = ref<number | null>(null);

const providerPage = ref(1);
const providerPageSize = ref(20);
const pagedProviders = computed(() => {
  const start = (providerPage.value - 1) * providerPageSize.value;
  return providers.value.slice(start, start + providerPageSize.value);
});

const modelPage = ref(1);
const modelPageSize = ref(20);
const pagedModels = computed(() => {
  const start = (modelPage.value - 1) * modelPageSize.value;
  return models.value.slice(start, start + modelPageSize.value);
});

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

function kindLabel(kind: string): string {
  if (kind === 'custom') return t('providers.kindCustomFull');
  if (kind === 'local') return t('providers.kindLocalFull');
  return kind;
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

watch(selectedId, () => { modelPage.value = 1; loadModels(); });

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
      formError.value = res?.message || t('common.operationFailed');
    }
  } catch {
    formError.value = t('common.networkError');
  } finally {
    formLoading.value = false;
  }
}

async function confirmDelete(p: Provider) {
  if (!confirm(t('providers.deleteConfirm'))) return;
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
