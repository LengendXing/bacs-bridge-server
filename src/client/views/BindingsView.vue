<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">进程绑定状态</h2>
      <div class="flex items-center gap-2">
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="openCreate">新建绑定</button>
        <button class="btn-mac btn-mac-sm" @click="openMount">挂载已有</button>
        <button class="btn-mac btn-mac-sm" :disabled="loading" @click="refresh">刷新</button>
      </div>
    </div>

    <!-- Bindings table -->
    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>进程名称</th>
            <th>飞书 App ID</th>
            <th>WS 状态</th>
            <th>状态</th>
            <th>CLI 类型</th>
            <th>运行机器</th>
            <th>服务商</th>
            <th>模型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" class="text-center" style="color: var(--text-secondary)">加载中...</td>
          </tr>
          <tr v-else-if="bindings.length === 0">
            <td colspan="9" class="text-center" style="color: var(--text-secondary)">暂无绑定数据</td>
          </tr>
          <tr v-for="b in bindings" :key="b.id">
            <td style="font-weight: 500">{{ b.processName }}</td>
            <td style="color: var(--text-secondary)">{{ b.feishuAppId || '-' }}</td>
            <td>
              <span :class="b.wsConnected ? 'badge badge-online' : 'badge badge-offline'">
                {{ b.wsConnected ? '已连接' : '未连接' }}
              </span>
            </td>
            <td>
              <span :class="b.status === 'online' ? 'badge badge-online' : 'badge badge-offline'">
                {{ b.status === 'online' ? '在线' : '离线' }}
              </span>
            </td>
            <td>{{ b.cliKind }}</td>
            <td style="color: var(--text-secondary)">{{ b.machineId ? (b.machineName || `#${b.machineId}`) : '本机' }}</td>
            <td style="color: var(--text-secondary)">{{ b.provider?.name || '-' }}</td>
            <td style="color: var(--text-secondary)">{{ b.modelOverride || b.model?.modelId || '-' }}</td>
            <td>
              <div class="flex items-center gap-1">
                <button class="btn-mac btn-mac-sm" @click="copyAttach(b)" title="复制 tmux attach 命令">Attach</button>
                <button class="btn-mac btn-mac-sm" @click="openEdit(b)">编辑</button>
                <button class="btn-mac btn-mac-danger btn-mac-sm" @click="confirmUnbind(b)">解绑</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新建/编辑/挂载弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card" style="width: 460px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ modalTitle }}</h3>
        <form @submit.prevent="handleSubmit">
          <template v-if="modalMode !== 'edit'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">进程名称</label>
            <input v-model="form.processName" type="text" class="input-mac mb-3"
              :placeholder="modalMode === 'mount' ? '选择已有 tmux 会话' : '如：work'"
              :readonly="modalMode === 'mount'"
              required
              @focus="modalMode === 'mount' && loadUnboundSessions()"
            />
            <div v-if="modalMode === 'mount' && unboundSessions.length > 0" class="mb-3">
              <select v-model="form.processName" class="input-mac">
                <option value="" disabled>选择 tmux 会话</option>
                <option v-for="s in unboundSessions" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </template>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">CLI 类型</label>
          <select v-model="form.cliKind" class="input-mac mb-3" :disabled="modalMode === 'edit'" @change="onCliOrProviderChange">
            <option value="cc">Claude Code</option>
            <option value="codex">Codex</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">运行机器</label>
          <select v-model="form.machineId" class="input-mac mb-3" @change="onMachineChange">
            <option :value="null">本机（默认）</option>
            <option v-for="m in machineList" :key="m.id" :value="m.id">{{ m.name }} ({{ m.host }}:{{ m.port }})</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">服务商</label>
          <select v-model="form.providerId" class="input-mac mb-3" @change="onCliOrProviderChange">
            <option :value="null">本机环境变量</option>
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">模型</label>
          <!-- 探查失败提示 -->
          <p v-if="probeFailed" class="text-xs mb-1" style="color: var(--warning)">
            服务商不支持模型探查，已展示默认模型；如需其他模型请直接手输 ID
          </p>
          <div class="flex items-center gap-2 mb-1">
            <select v-model="form.modelId" class="input-mac" style="flex:1" @change="onModelChange">
              <option :value="null">{{ modelOptions.length ? '默认（不指定模型）' : '暂无可用模型' }}</option>
              <option v-for="m in modelOptions" :key="m.id ?? m.modelId" :value="m.id ?? null" :data-model-id="m.modelId">
                {{ m.displayName || m.modelId }} <span v-if="m.displayName && m.displayName !== m.modelId">({{ m.modelId }})</span>
              </option>
            </select>
            <button type="button" class="btn-mac btn-mac-sm" @click="useCustomModel = !useCustomModel" :title="useCustomModel ? '切回列表选择' : '手输自定义模型 ID'">
              {{ useCustomModel ? '列表' : '手输' }}
            </button>
          </div>
          <input v-if="useCustomModel" v-model="form.modelOverride" type="text" class="input-mac mb-3"
            placeholder="如：claude-opus-4-7 或 gpt-5.5（支持任意模型 ID）" />

          <!-- effort 选择（仅当选了模型且该模型支持 effort 时显示） -->
          <template v-if="showEffortSelect">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">Effort（推理力度）</label>
            <select v-model="form.effort" class="input-mac mb-3">
              <option :value="null">默认（不指定）</option>
              <option v-for="e in effortOptions" :key="e" :value="e">{{ e }}</option>
            </select>
          </template>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">飞书 App ID</label>
          <input v-model="form.feishuAppId" type="text" class="input-mac mb-3" placeholder="cli_xxx" :required="modalMode !== 'edit'" />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            飞书 App Secret<span v-if="modalMode === 'edit'" style="color: var(--text-secondary); font-weight: normal">（留空不修改）</span>
          </label>
          <input v-model="form.feishuAppSecret" type="password" class="input-mac mb-3" placeholder="飞书应用密钥" :required="modalMode !== 'edit'" />

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">{{ formError }}</p>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="formLoading">
              {{ formLoading ? '提交中...' : submitLabel }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showModal = false">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { Binding, Provider, Machine, Model } from '@shared/types';
import { DEFAULT_MODELS, getEffortOptions, modelSupportsEffort } from '@shared/defaultModels';
import type { CliKind } from '@shared/defaultModels';

const { get, post, del } = useApi();

const bindings = ref<Binding[]>([]);
const loading = ref(false);
const providerList = ref<Provider[]>([]);
const machineList = ref<Machine[]>([]);
const modelList = ref<Model[]>([]);
const defaultModelList = ref<any[]>([]);  // 从 /api/models/defaults 拿到的内置回退列表
const probeFailed = ref(false);
const useCustomModel = ref(false);
const unboundSessions = ref<string[]>([]);

const showModal = ref(false);
const modalMode = ref<'create' | 'mount' | 'edit'>('create');
const editId = ref('');
const form = ref({
  processName: '',
  cliKind: 'cc' as 'cc' | 'codex',
  providerId: null as number | null,
  modelId: null as number | null,
  modelOverride: '' as string,
  effort: null as string | null,
  machineId: null as number | null,
  feishuAppId: '',
  feishuAppSecret: '',
});

// 模型按 CLI 类型 + 服务商过滤；探查失败时 fallback 到内置默认模型
const filteredModels = computed(() => {
  const byCli = modelList.value.filter(m => m.cliKind === form.value.cliKind);
  if (form.value.providerId) {
    return byCli.filter(m => m.providerId === form.value.providerId);
  }
  const seen = new Set<string>();
  return byCli.filter(m => {
    if (seen.has(m.modelId)) return false;
    seen.add(m.modelId);
    return true;
  });
});

// 合并探查结果与默认回退：探查成功用探查列表，失败时用默认清单
const modelOptions = computed(() => {
  if (probeFailed.value) {
    return defaultModelList.value.map(m => ({
      id: null,          // 不走 FK
      modelId: m.id,
      displayName: m.label,
      cliKind: form.value.cliKind,
      providerId: null,
    }));
  }
  return filteredModels.value;
});

// 当前选中的模型字符串 ID（用于判断 effort 支持）
const currentModelStrId = computed(() => {
  if (useCustomModel.value && form.value.modelOverride) return form.value.modelOverride;
  if (form.value.modelId) {
    const found = modelOptions.value.find(m => m.id === form.value.modelId);
    if (found) return found.modelId;
  }
  return '';
});

const effortOptions = computed(() => getEffortOptions(form.value.cliKind as CliKind, currentModelStrId.value));
const showEffortSelect = computed(() => effortOptions.value.length > 0);
const formLoading = ref(false);
const formError = ref('');

const modalTitle = computed(() =>
  modalMode.value === 'create' ? '新建绑定' :
  modalMode.value === 'mount' ? '挂载已有进程' : '编辑绑定'
);

const submitLabel = computed(() =>
  modalMode.value === 'create' ? '创建并启动' :
  modalMode.value === 'mount' ? '挂载' : '保存'
);

async function refresh() {
  loading.value = true;
  try {
    const res = await get<Binding[]>('/api/status');
    if (res.code === 0) bindings.value = res.data || [];
  } catch { /* */ } finally { loading.value = false; }
}

async function loadProviders() {
  try {
    const res = await get<Provider[]>('/api/providers');
    if (res.code === 0) providerList.value = res.data || [];
  } catch { /* */ }
}

async function loadMachines() {
  try {
    const res = await get<Machine[]>('/api/machines');
    if (res.code === 0) machineList.value = res.data || [];
  } catch { /* */ }
}

async function loadModels() {
  try {
    const res = await get<Model[]>('/api/models');
    if (res.code === 0) modelList.value = res.data || [];
  } catch { /* */ }
}

function onCliOrProviderChange() {
  // CLI 或服务商变更时，若当前 modelId 不在过滤后列表中则清空
  const stillValid = filteredModels.value.some(m => m.id === form.value.modelId);
  if (!stillValid) form.value.modelId = null;
  form.value.modelOverride = '';
  useCustomModel.value = false;
  form.value.effort = null;
  // 尝试按新 provider 刷新模型探查
  loadProviderModels();
}

function onModelChange() {
  // 从下拉选了模型后，同步 modelOverride（供后端 modelOverride 优先逻辑使用）
  const selected = modelOptions.value.find(m => m.id === form.value.modelId);
  form.value.modelOverride = selected?.modelId || '';
  // 选了新模型后清 effort 让用户重选
  form.value.effort = null;
}

async function loadProviderModels() {
  if (!form.value.providerId) { probeFailed.value = false; return; }
  try {
    const res = await get<Model[]>(`/api/models?providerId=${form.value.providerId}`);
    if (res.code === 0 && res.data && res.data.length > 0) {
      // 把拉到的合并进 modelList
      const existing = modelList.value.filter(m => m.providerId !== form.value.providerId);
      modelList.value = [...existing, ...res.data];
      probeFailed.value = false;
    } else {
      probeFailed.value = true;
    }
  } catch {
    probeFailed.value = true;
  }
  if (probeFailed.value) await loadDefaultModels();
}

async function loadDefaultModels() {
  try {
    const res = await get<any[]>(`/api/models/defaults?cliKind=${form.value.cliKind}`);
    if (res.code === 0) defaultModelList.value = res.data || [];
  } catch { /* */ }
}

async function loadUnboundSessions() {
  try {
    const query = form.value.machineId ? `?machineId=${form.value.machineId}` : '';
    const res = await get<string[]>(`/api/sessions/unbound${query}`);
    if (res.code === 0) unboundSessions.value = res.data || [];
  } catch { /* */ }
}

function onMachineChange() {
  if (modalMode.value === 'mount') {
    unboundSessions.value = [];
    loadUnboundSessions();
  }
}

function openCreate() {
  modalMode.value = 'create';
  editId.value = '';
  form.value = { processName: '', cliKind: 'cc', providerId: null, modelId: null, modelOverride: '', effort: null, machineId: null, feishuAppId: '', feishuAppSecret: '' };
  formError.value = '';
  useCustomModel.value = false;
  probeFailed.value = false;
  loadProviders();
  loadMachines();
  loadModels();
  showModal.value = true;
}

function openMount() {
  modalMode.value = 'mount';
  editId.value = '';
  form.value = { processName: '', cliKind: 'cc', providerId: null, modelId: null, modelOverride: '', effort: null, machineId: null, feishuAppId: '', feishuAppSecret: '' };
  formError.value = '';
  useCustomModel.value = false;
  probeFailed.value = false;
  loadProviders();
  loadMachines();
  loadModels();
  loadUnboundSessions();
  showModal.value = true;
}

function openEdit(b: Binding) {
  modalMode.value = 'edit';
  editId.value = b.id;
  form.value = {
    processName: b.processName,
    cliKind: b.cliKind,
    providerId: b.providerId,
    modelId: b.modelId,
    modelOverride: b.modelOverride || '',
    effort: b.effort || null,
    machineId: b.machineId,
    feishuAppId: b.feishuAppId || '',
    feishuAppSecret: '',
  };
  useCustomModel.value = !!b.modelOverride;
  formError.value = '';
  loadProviders();
  loadMachines();
  loadModels();
  showModal.value = true;
}

async function handleSubmit() {
  formError.value = '';
  formLoading.value = true;
  try {
    let res;
    if (modalMode.value === 'create') {
      res = await post('/api/bind', {
        ...form.value,
        modelOverride: useCustomModel.value ? form.value.modelOverride : undefined,
      });
    } else if (modalMode.value === 'mount') {
      res = await post('/api/bind/mount', {
        ...form.value,
        modelOverride: useCustomModel.value ? form.value.modelOverride : undefined,
      });
    } else {
      res = await post('/api/edit', {
        id: editId.value,
        feishuAppId: form.value.feishuAppId,
        feishuAppSecret: form.value.feishuAppSecret,
        providerId: form.value.providerId,
        modelId: form.value.modelId,
        modelOverride: useCustomModel.value ? form.value.modelOverride : (form.value.modelOverride || undefined),
        effort: form.value.effort,
        machineId: form.value.machineId,
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

async function confirmUnbind(b: Binding) {
  const kill = confirm(`确定解绑「${b.processName}」？\n\n勾选确定 = 同时终止 tmux 进程\n取消 = 仅解除绑定，保留进程`);
  try {
    await post('/api/unbind', { id: b.id, killProcess: kill });
    await refresh();
  } catch { /* */ }
}

function copyAttach(b: Binding) {
  const prefix = b.cliKind === 'codex' ? 'codex' : 'cc';
  const sessionName = `${prefix}-${b.processName}`;

  let cmd: string;
  if (b.machineId && b.machineName) {
    const m = machineList.value.find(m => m.id === b.machineId);
    if (m) {
      const portFlag = m.port && m.port !== 22 ? ` -p ${m.port}` : '';
      cmd = `ssh ${m.username}@${m.host}${portFlag} -t "tmux attach -t ${sessionName}"`;
    } else {
      cmd = `tmux attach -t ${sessionName}`;
    }
  } else {
    cmd = `tmux attach -t ${sessionName}`;
  }

  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(cmd).then(() => {
      alert(`已复制命令:\n${cmd}`);
    }).catch(() => {
      prompt('复制以下命令并在终端执行:', cmd);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = cmd;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { copied = document.execCommand('copy'); } catch { /* */ }
    document.body.removeChild(ta);
    if (copied) {
      alert(`已复制命令:\n${cmd}`);
    } else {
      prompt('复制以下命令并在终端执行:', cmd);
    }
  }
}

onMounted(() => { refresh(); loadMachines(); });
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
  align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(4px);
}
.modal-card {
  background: var(--card); border-radius: 12px; padding: 24px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
</style>

<!-- 全局：确保 warning 颜色变量存在 -->
<style>
:root {
  --warning: #f59e0b;
}
[data-theme="dark"] {
  --warning: #fbbf24;
}
</style>
