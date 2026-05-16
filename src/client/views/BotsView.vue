<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">Bots</h2>
    </div>

    <!-- 工具栏：左侧 Tabbar，右侧 搜索/新增 -->
    <div class="bots-toolbar">
      <!-- 滑块式 Tabbar -->
      <div class="seg-tabs" :style="{ '--seg-count': platforms.length, '--seg-active': activeIndex }">
        <span class="seg-indicator" aria-hidden="true" />
        <button
          v-for="(p, i) in platforms"
          :key="p.id"
          type="button"
          class="seg-tab"
          :class="{ active: activeIndex === i }"
          @click="activePlatform = p.id"
        >
          <component :is="p.icon" :size="14" :stroke-width="1.6" />
          <span>{{ p.label }}</span>
        </button>
      </div>

      <!-- 右侧操作区 -->
      <div class="bots-toolbar-actions">
        <input
          v-model="searchInput"
          class="input-mac input-mac-sm"
          style="width: 180px"
          placeholder="搜索 Name / AppID / 备注"
          @keyup.enter="applySearch"
        />
        <button class="btn-mac btn-mac-sm" @click="applySearch">搜索</button>
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="openCreate">新增</button>
      </div>
    </div>

    <!-- 飞书：列表 -->
    <div
      v-if="activePlatform === 'feishu'"
      class="glass-card"
      style="padding: 0; overflow: hidden"
    >
      <table class="table-mac">
        <thead>
          <tr>
            <th>Name</th>
            <th>AppID</th>
            <th>密钥（脱敏）</th>
            <th>备注</th>
            <th style="width: 100px">关联绑定</th>
            <th style="width: 160px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="text-center" style="color: var(--text-secondary); padding: 32px">
              加载中…
            </td>
          </tr>
          <tr v-else-if="filteredBots.length === 0">
            <td colspan="6" class="text-center" style="color: var(--text-secondary); padding: 32px">
              {{ bots.length === 0 ? '暂无机器人，可点击「新增」创建' : '未匹配到结果' }}
            </td>
          </tr>
          <tr v-for="b in filteredBots" :key="b.id">
            <td style="font-weight: 500">{{ b.name }}</td>
            <td style="font-family: monospace; font-size: 12px">{{ b.appId || '-' }}</td>
            <td style="color: var(--text-secondary); font-family: monospace; font-size: 12px">
              {{ b.secret || '-' }}
            </td>
            <td style="color: var(--text-secondary)">{{ b.remark || '-' }}</td>
            <td>
              <span class="badge-count" :class="{ 'badge-zero': b.bindingCount === 0 }">
                {{ b.bindingCount }}
              </span>
            </td>
            <td>
              <div class="flex items-center gap-2">
                <button class="btn-mac btn-mac-sm" @click="openEdit(b)">编辑</button>
                <button class="btn-mac btn-mac-sm btn-danger" @click="openDelete(b)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 其他平台：占位 -->
    <div
      v-else
      class="glass-card text-center"
      style="padding: 60px 20px; color: var(--text-secondary)"
    >
      <component
        :is="currentPlatform?.icon"
        :size="40"
        :stroke-width="1.2"
        style="margin: 0 auto 12px"
      />
      <div>{{ currentPlatform?.label }} 暂未支持</div>
    </div>

    <!-- 编辑/新增 弹窗 -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal-card" style="width: 460px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">
          {{ isEditing ? '编辑机器人' : '新增机器人' }}
        </h3>
        <form @submit.prevent="submitForm">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            平台
          </label>
          <input
            class="input-mac mb-3"
            :value="currentPlatform?.label"
            disabled
          />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            Name（机器人名称）
          </label>
          <input
            v-model="form.name"
            type="text"
            class="input-mac mb-3"
            placeholder="如：feishu-prod-bot"
            required
          />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            AppID
            <span v-if="isEditing" style="color: var(--text-secondary); font-weight: normal">
              （不可修改，如需更换请删除后新建）
            </span>
          </label>
          <input
            v-model="form.appId"
            type="text"
            class="input-mac mb-3"
            placeholder="cli_xxx"
            :disabled="isEditing"
          />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            密钥（{{ isEditing ? '留空表示不修改' : 'App Secret' }}）
          </label>
          <input
            v-model="form.secret"
            type="password"
            class="input-mac mb-3"
            placeholder="•••••••••"
          />

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
            备注
          </label>
          <input
            v-model="form.remark"
            type="text"
            class="input-mac mb-3"
            placeholder="选填"
          />

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">
            {{ formError }}
          </p>

          <div class="flex items-center gap-2">
            <button
              type="submit"
              class="btn-mac btn-mac-primary btn-mac-sm"
              :disabled="formLoading"
            >
              {{ formLoading ? '提交中…' : isEditing ? '保存' : '创建' }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showFormModal = false">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal-card" style="width: 460px">
        <h3 class="text-base font-semibold mb-3" style="color: var(--text)">确认删除？</h3>
        <p class="text-sm mb-3" style="color: var(--text-secondary)">
          即将删除机器人
          <span style="color: var(--text); font-weight: 500">{{ deletingBot?.name }}</span>
        </p>
        <div
          v-if="deletingBot && deletingBot.bindingCount > 0"
          class="warning-box mb-4"
        >
          <strong>⚠️ 此机器人有 {{ deletingBot.bindingCount }} 个关联绑定</strong>
          <div class="mt-1" style="font-size: 12px">
            删除会级联清除全部关联绑定 <strong>并杀掉对应 CLI 进程</strong>，操作不可恢复。
          </div>
        </div>
        <p v-else class="text-sm mb-4" style="color: var(--text-secondary)">
          当前没有关联绑定，可以安全删除。
        </p>

        <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">
          {{ formError }}
        </p>

        <div class="flex items-center gap-2">
          <button class="btn-mac btn-mac-sm btn-danger" :disabled="formLoading" @click="confirmDelete">
            {{ formLoading ? '删除中…' : '确认删除' }}
          </button>
          <button class="btn-mac btn-mac-sm" @click="showDeleteModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { Bot, Send, MessageCircle, Smartphone } from 'lucide-vue-next';
import { useApi } from '../composables/useApi';

interface BotItem {
  id: number;
  platform: string;
  name: string;
  appId: string | null;
  secret: string | null;
  remark: string | null;
  bindingCount: number;
}

const platforms = [
  { id: 'feishu' as const, label: '飞书', icon: Bot },
  { id: 'telegram' as const, label: 'Telegram', icon: Send },
  { id: 'qq' as const, label: 'QQ', icon: MessageCircle },
  { id: 'wechat' as const, label: '微信', icon: Smartphone },
];

type Platform = (typeof platforms)[number]['id'];

const { get, post, put, del } = useApi();
const activePlatform = ref<Platform>('feishu');
const bots = ref<BotItem[]>([]);
const loading = ref(false);

const searchInput = ref('');
const searchKeyword = ref('');

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const isEditing = ref(false);
const editingId = ref<number | null>(null);
const deletingBot = ref<BotItem | null>(null);
const formLoading = ref(false);
const formError = ref('');

const form = reactive({
  name: '',
  appId: '',
  secret: '',
  remark: '',
});

const currentPlatform = computed(() =>
  platforms.find((p) => p.id === activePlatform.value),
);

const activeIndex = computed(() =>
  platforms.findIndex((p) => p.id === activePlatform.value),
);

const filteredBots = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw) return bots.value;
  return bots.value.filter(
    (b) =>
      b.name.toLowerCase().includes(kw) ||
      (b.appId || '').toLowerCase().includes(kw) ||
      (b.remark || '').toLowerCase().includes(kw),
  );
});

function applySearch() {
  searchKeyword.value = searchInput.value;
}

async function refresh() {
  if (activePlatform.value !== 'feishu') {
    bots.value = [];
    return;
  }
  loading.value = true;
  try {
    const r = await get<BotItem[]>(`/api/bots?platform=${activePlatform.value}`);
    bots.value = r.code === 0 ? r.data || [] : [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.name = '';
  form.appId = '';
  form.secret = '';
  form.remark = '';
  formError.value = '';
}

function openCreate() {
  if (activePlatform.value !== 'feishu') return;
  resetForm();
  isEditing.value = false;
  editingId.value = null;
  showFormModal.value = true;
}

function openEdit(b: BotItem) {
  resetForm();
  isEditing.value = true;
  editingId.value = b.id;
  form.name = b.name;
  form.appId = b.appId || '';
  form.secret = ''; // 编辑时留空表示不修改
  form.remark = b.remark || '';
  showFormModal.value = true;
}

async function submitForm() {
  formError.value = '';
  if (!form.name.trim()) {
    formError.value = '请填写 Name';
    return;
  }
  formLoading.value = true;
  try {
    if (isEditing.value && editingId.value) {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        remark: form.remark.trim() || null,
      };
      if (form.secret.trim()) body.secret = form.secret.trim();
      const r = await put(`/api/bots/${editingId.value}`, body);
      if (r.code !== 0) {
        formError.value = r.message || '更新失败';
        return;
      }
    } else {
      const r = await post('/api/bots', {
        platform: activePlatform.value,
        name: form.name.trim(),
        appId: form.appId.trim() || null,
        secret: form.secret.trim() || null,
        remark: form.remark.trim() || null,
      });
      if (r.code !== 0) {
        formError.value = r.message || '创建失败';
        return;
      }
    }
    showFormModal.value = false;
    await refresh();
  } finally {
    formLoading.value = false;
  }
}

function openDelete(b: BotItem) {
  deletingBot.value = b;
  formError.value = '';
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!deletingBot.value) return;
  formLoading.value = true;
  try {
    const r = await del(`/api/bots/${deletingBot.value.id}`);
    if (r.code !== 0) {
      formError.value = r.message || '删除失败';
      return;
    }
    showDeleteModal.value = false;
    deletingBot.value = null;
    await refresh();
  } finally {
    formLoading.value = false;
  }
}

onMounted(refresh);
watch(activePlatform, () => {
  searchInput.value = '';
  searchKeyword.value = '';
  refresh();
});
</script>

<style scoped>
/* ===== 工具栏 ===== */
.bots-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.bots-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== 滑块式 Tabbar（对齐项目主题变量） ===== */
.seg-tabs {
  position: relative;
  display: inline-flex;
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
  gap: 0;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
.seg-indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--seg-count));
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transform: translateX(calc(var(--seg-active) * 100%));
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    background-color 0.3s ease, border-color 0.3s ease;
  pointer-events: none;
}
.seg-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  transition: color 0.22s ease;
  flex: 1 1 0;
}
.seg-tab:hover {
  color: var(--text);
}
.seg-tab.active {
  color: var(--text);
}

/* ===== 关联绑定计数徽章 ===== */
.badge-count {
  display: inline-block;
  min-width: 24px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
}
.badge-count.badge-zero {
  color: var(--text-secondary);
}

/* ===== 危险按钮（使用主题 --danger 变量） ===== */
.btn-mac.btn-danger {
  color: var(--danger);
  border-color: var(--danger);
}
.btn-mac.btn-danger:hover:not(:disabled) {
  background: var(--danger);
  color: #fff;
}

/* ===== 警告框（删除弹窗用，light/dark 自适应） ===== */
.warning-box {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid var(--danger);
  border-radius: 6px;
  color: var(--danger);
  font-size: 13px;
}
.dark .warning-box {
  background: rgba(248, 113, 113, 0.12);
}

/* ===== 弹窗（对齐项目其他 View 的样式） ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-card {
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 460px;
  max-width: 90vw;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
</style>
