<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">机器管理</h2>
      <button class="btn-mac btn-mac-primary btn-mac-sm" @click="openCreate">添加机器</button>
    </div>

    <!-- Machines table -->
    <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>名称</th>
            <th>IP:端口</th>
            <th>系统</th>
            <th>认证</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="text-center" style="color: var(--text-secondary)">加载中...</td>
          </tr>
          <tr v-else-if="machineList.length === 0">
            <td colspan="6" class="text-center" style="color: var(--text-secondary)">暂无机器，点击「添加机器」注册远程服务器</td>
          </tr>
          <tr v-for="m in machineList" :key="m.id">
            <td style="font-weight: 500">
              {{ m.name }}
              <span v-if="m.builtin" class="badge badge-info" style="margin-left: 6px; font-size: 10px">本机</span>
            </td>
            <td style="color: var(--text-secondary)">{{ m.host }}:{{ m.port }}</td>
            <td>{{ m.osVersion || m.osType }}</td>
            <td>{{ m.builtin ? '-' : (m.authType === 'password' ? '密码' : '密钥') }}</td>
            <td>
              <span :class="statusClass(m.status)">{{ statusLabel(m.status) }}</span>
            </td>
            <td>
              <span v-if="m.builtin" style="color: var(--text-secondary)">-</span>
              <div v-else class="flex items-center gap-1">
                <button class="btn-mac btn-mac-sm" @click="openEdit(m)">编辑</button>
                <button class="btn-mac btn-mac-sm" :disabled="testingId === m.id" @click="testConn(m)">
                  {{ testingId === m.id ? '测试中...' : '测试连接' }}
                </button>
                <button class="btn-mac btn-mac-danger btn-mac-sm" @click="confirmDelete(m)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 测试结果弹窗 -->
    <div v-if="testResult" class="modal-overlay" @click.self="testResult = null">
      <div class="modal-card" style="width: 400px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">连接测试结果</h3>
        <div v-if="testResult.ok" class="mb-3">
          <p style="color: var(--text-secondary)">状态: <span class="badge badge-online">成功</span></p>
          <p v-if="testResult.hostname" style="color: var(--text-secondary)">主机名: {{ testResult.hostname }}</p>
          <p v-if="testResult.os" style="color: var(--text-secondary)">系统: {{ testResult.os }}</p>
          <p v-if="testResult.tmuxVersion" style="color: var(--text-secondary)">tmux: {{ testResult.tmuxVersion }}</p>
          <p v-if="testResult.latencyMs" style="color: var(--text-secondary)">延迟: {{ testResult.latencyMs }}ms</p>
        </div>
        <div v-else>
          <p style="color: var(--danger)">连接失败: {{ testResult.error }}</p>
          <p v-if="testResult.latencyMs" style="color: var(--text-secondary)">耗时: {{ testResult.latencyMs }}ms</p>
        </div>
        <button class="btn-mac btn-mac-sm mt-4" @click="testResult = null">关闭</button>
      </div>
    </div>

    <!-- 添加/编辑弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card" style="width: 460px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ editId ? '编辑机器' : '添加机器' }}</h3>
        <form @submit.prevent="handleSubmit">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">名称</label>
          <input v-model="form.name" type="text" class="input-mac mb-3" placeholder="如：生产服务器" required />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">IP / 域名</label>
          <input v-model="form.host" type="text" class="input-mac mb-3" placeholder="192.168.1.100" required />

          <div class="flex gap-3 mb-3">
            <div class="flex-1">
              <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">端口</label>
              <input v-model.number="form.port" type="number" class="input-mac" min="1" max="65535" />
            </div>
            <div class="flex-1">
              <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">系统类型</label>
              <select v-model="form.osType" class="input-mac">
                <option value="linux">Linux</option>
                <option value="mac">Mac</option>
              </select>
            </div>
          </div>

          <div class="flex gap-3 mb-3">
            <div class="flex-1">
              <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">认证方式</label>
              <select v-model="form.authType" class="input-mac">
                <option value="password">密码</option>
                <option value="key">密钥</option>
              </select>
            </div>
            <div class="flex-1">
              <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">用户名</label>
              <input v-model="form.username" type="text" class="input-mac" placeholder="root" required />
            </div>
          </div>

          <template v-if="form.authType === 'password'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">密码{{ editId ? '（留空不修改）' : '' }}</label>
            <input v-model="form.password" type="password" class="input-mac mb-3" :required="!editId" />
          </template>

          <template v-if="form.authType === 'key'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">私钥{{ editId ? '（留空不修改）' : '' }}</label>
            <textarea v-model="form.privateKey" class="input-mac mb-3" rows="4" :required="!editId" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">私钥密码（可选）</label>
            <input v-model="form.passphrase" type="password" class="input-mac mb-3" />
          </template>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">备注</label>
          <textarea v-model="form.notes" class="input-mac mb-3" rows="2" placeholder="可选" />

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">{{ formError }}</p>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="formLoading">
              {{ formLoading ? '提交中...' : (editId ? '保存' : '添加') }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showModal = false">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { Machine, MachineTestResult } from '@shared/types';

const { get, post, put, del } = useApi();

const machineList = ref<Machine[]>([]);
const loading = ref(false);
const testingId = ref<number | null>(null);
const testResult = ref<MachineTestResult | null>(null);

const showModal = ref(false);
const editId = ref<number | null>(null);
const form = ref({
  name: '',
  host: '',
  port: 22,
  osType: 'linux' as 'linux' | 'mac',
  authType: 'password' as 'password' | 'key',
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
  notes: '',
});
const formLoading = ref(false);
const formError = ref('');

function statusClass(status: string) {
  if (status === 'online') return 'badge badge-online';
  if (status === 'offline') return 'badge badge-offline';
  return 'badge';
}

function statusLabel(status: string) {
  if (status === 'online') return '在线';
  if (status === 'offline') return '离线';
  return '未知';
}

async function refresh() {
  loading.value = true;
  try {
    const res = await get<Machine[]>('/api/machines');
    if (res.code === 0) machineList.value = res.data || [];
  } catch { /* */ } finally { loading.value = false; }
}

function openCreate() {
  editId.value = null;
  form.value = { name: '', host: '', port: 22, osType: 'linux', authType: 'password', username: '', password: '', privateKey: '', passphrase: '', notes: '' };
  formError.value = '';
  showModal.value = true;
}

function openEdit(m: Machine) {
  editId.value = m.id;
  form.value = {
    name: m.name,
    host: m.host,
    port: m.port,
    osType: m.osType as 'linux' | 'mac',
    authType: m.authType,
    username: m.username,
    password: '',
    privateKey: '',
    passphrase: '',
    notes: m.notes || '',
  };
  formError.value = '';
  showModal.value = true;
}

async function handleSubmit() {
  formError.value = '';
  formLoading.value = true;
  try {
    let res;
    if (editId.value) {
      res = await put(`/api/machines/${editId.value}`, form.value);
    } else {
      res = await post('/api/machines', form.value);
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

async function testConn(m: Machine) {
  testingId.value = m.id;
  try {
    const res = await post<MachineTestResult>(`/api/machines/${m.id}/test`, {});
    if (res.code === 0 && res.data) {
      testResult.value = res.data;
    }
    await refresh();
  } catch { /* */ } finally {
    testingId.value = null;
  }
}

async function confirmDelete(m: Machine) {
  if (!confirm(`确定删除机器「${m.name}」？`)) return;
  try {
    const res = await del(`/api/machines/${m.id}`);
    if (res.code === 1003) {
      alert(res.message);
    }
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
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
</style>
