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
            <td style="color: var(--text-secondary)">{{ b.model?.modelId || '-' }}</td>
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
          <select v-model="form.cliKind" class="input-mac mb-3" :disabled="modalMode === 'edit'">
            <option value="cc">Claude Code</option>
            <option value="codex">Codex</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">服务商</label>
          <select v-model="form.providerId" class="input-mac mb-3">
            <option :value="null">本机环境变量</option>
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">运行机器</label>
          <select v-model="form.machineId" class="input-mac mb-3" @change="onMachineChange">
            <option :value="null">本机（默认）</option>
            <option v-for="m in machineList" :key="m.id" :value="m.id">{{ m.name }} ({{ m.host }}:{{ m.port }})</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">飞书 App ID</label>
          <input v-model="form.feishuAppId" type="text" class="input-mac mb-3" placeholder="cli_xxx" required />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">飞书 App Secret</label>
          <input v-model="form.feishuAppSecret" type="password" class="input-mac mb-3" placeholder="飞书应用密钥" required />

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
import type { Binding, Provider, Machine } from '@shared/types';

const { get, post, del } = useApi();

const bindings = ref<Binding[]>([]);
const loading = ref(false);
const providerList = ref<Provider[]>([]);
const machineList = ref<Machine[]>([]);
const unboundSessions = ref<string[]>([]);

const showModal = ref(false);
const modalMode = ref<'create' | 'mount' | 'edit'>('create');
const editId = ref('');
const form = ref({
  processName: '',
  cliKind: 'cc',
  providerId: null as number | null,
  machineId: null as number | null,
  feishuAppId: '',
  feishuAppSecret: '',
});
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
  form.value = { processName: '', cliKind: 'cc', providerId: null, machineId: null, feishuAppId: '', feishuAppSecret: '' };
  formError.value = '';
  loadProviders();
  loadMachines();
  showModal.value = true;
}

function openMount() {
  modalMode.value = 'mount';
  editId.value = '';
  form.value = { processName: '', cliKind: 'cc', providerId: null, machineId: null, feishuAppId: '', feishuAppSecret: '' };
  formError.value = '';
  loadProviders();
  loadMachines();
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
    machineId: b.machineId,
    feishuAppId: b.feishuAppId || '',
    feishuAppSecret: '',
  };
  formError.value = '';
  loadProviders();
  loadMachines();
  showModal.value = true;
}

async function handleSubmit() {
  formError.value = '';
  formLoading.value = true;
  try {
    let res;
    if (modalMode.value === 'create') {
      res = await post('/api/bind', form.value);
    } else if (modalMode.value === 'mount') {
      res = await post('/api/bind/mount', form.value);
    } else {
      res = await post('/api/edit', {
        id: editId.value,
        feishuAppId: form.value.feishuAppId,
        feishuAppSecret: form.value.feishuAppSecret,
        providerId: form.value.providerId,
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

  navigator.clipboard.writeText(cmd).then(() => {
    alert(`已复制命令:\n${cmd}`);
  }).catch(() => {
    prompt('复制以下命令并在终端执行:', cmd);
  });
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
