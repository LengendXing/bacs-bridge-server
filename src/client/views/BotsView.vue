<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">Bots</h2>
    </div>

    <!-- 工具栏：左侧 Tabbar，右侧 搜索/新增 -->
    <div class="bots-toolbar">
      <!-- 滑块式 Tabbar（每个 tab 按文字宽度撑开，滑块自适应宽度） -->
      <div ref="segTabsEl" class="seg-tabs">
        <span
          class="seg-indicator"
          aria-hidden="true"
          :style="{ left: indicatorLeft + 'px', width: indicatorWidth + 'px' }"
        />
        <button
          v-for="(p, i) in platforms"
          :key="p.id"
          :ref="(el) => setSegTabRef(el, i)"
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
          class="input-mac input-mac-sm bots-search-input"
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
import { ref, computed, reactive, onMounted, nextTick, watch, h } from 'vue';
import type { FunctionalComponent } from 'vue';
import { useApi } from '../composables/useApi';

/* ─────────────────────────────────────────────────────────────
 * 平台 Logo（inline SVG，单色 currentColor，简洁风）
 * 通过 functional component 形式声明，可直接传给 <component :is>
 * ──────────────────────────────────────────────────────────── */
interface LogoProps {
  size?: number | string;
}
function makeLogo(viewBox: string, path: string): FunctionalComponent<LogoProps> {
  const C: FunctionalComponent<LogoProps> = (props) =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: props.size ?? 16,
        height: props.size ?? 16,
        viewBox,
        fill: 'currentColor',
        'aria-hidden': 'true',
      },
      [h('path', { d: path })],
    );
  C.props = ['size'];
  return C;
}

// 飞书（Feishu / Lark）—— 简化版「F」标志
const FeishuLogo = makeLogo(
  '0 0 24 24',
  'M3.5 4h13a1 1 0 0 1 1 1v3.2H9.4v3.1h6.5v3.2H9.4V20H6.2V5a1 1 0 0 1-2.7-1Z M19 7.5c1.4 0 2.5 1 2.5 2.5s-1.1 2.5-2.5 2.5S16.5 11.4 16.5 10 17.6 7.5 19 7.5Z',
);
// Telegram 纸飞机
const TelegramLogo = makeLogo(
  '0 0 24 24',
  'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42Z',
);
// QQ 企鹅（简化版）
const QQLogo = makeLogo(
  '0 0 24 24',
  'M12 2c-3.5 0-6 2.5-6 6 0 1.5.4 2.9 1.2 4.1-.7 1.4-1.4 3.1-1.4 4.4 0 .8.5 1.1 1.1 1.1.5 0 1.3-.3 1.9-.8.3.3.8.6 1.4.9-.4.5-.7 1-.7 1.5 0 .9.9 1.3 2.5 1.3s2.5-.4 2.5-1.3c0-.5-.3-1-.7-1.5.6-.3 1.1-.6 1.4-.9.6.5 1.4.8 1.9.8.6 0 1.1-.3 1.1-1.1 0-1.3-.7-3-1.4-4.4C17.6 10.9 18 9.5 18 8c0-3.5-2.5-6-6-6Zm-2 5c.55 0 1 .67 1 1.5S10.55 10 10 10s-1-.67-1-1.5S9.45 7 10 7Zm4 0c.55 0 1 .67 1 1.5s-.45 1.5-1 1.5-1-.67-1-1.5.45-1.5 1-1.5Z',
);
// WeChat 微信对话气泡
const WeChatLogo = makeLogo(
  '0 0 24 24',
  'M8.69 4C5 4 2 6.46 2 9.5c0 1.71 1 3.22 2.52 4.21L4 16l2.43-1.3c.6.15 1.23.24 1.86.27-.05-.32-.07-.65-.07-.97 0-3.27 3.13-5.95 7-5.95.27 0 .54.01.81.04C15.45 5.55 12.36 4 8.69 4Zm-2.3 3.5a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.6 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7ZM15.4 9.43c-3.21 0-5.81 2.13-5.81 4.77 0 2.63 2.6 4.77 5.81 4.77.62 0 1.22-.08 1.79-.23L19 20l-.55-1.74c1.27-.86 2.1-2.17 2.1-3.66 0-2.64-2.6-4.77-5.79-4.77ZM13.6 12.3a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Zm3.8 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Z',
);

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
  { id: 'feishu' as const, label: '飞书', icon: FeishuLogo },
  { id: 'telegram' as const, label: 'Telegram', icon: TelegramLogo },
  { id: 'qq' as const, label: 'QQ', icon: QQLogo },
  { id: 'wechat' as const, label: '微信', icon: WeChatLogo },
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

/* ─── 滑块指示器：根据 active tab 的实际宽度/位置动态计算 ─── */
const segTabsEl = ref<HTMLElement | null>(null);
const segTabRefs: HTMLElement[] = [];
const indicatorLeft = ref(3);
const indicatorWidth = ref(0);

function setSegTabRef(el: unknown, i: number) {
  if (el instanceof HTMLElement) segTabRefs[i] = el;
}

function updateIndicator() {
  const idx = activeIndex.value;
  const el = segTabRefs[idx];
  const wrap = segTabsEl.value;
  if (!el || !wrap) return;
  // offsetLeft 已经是相对父容器（content-box 起点），padding 自然被包含
  indicatorLeft.value = el.offsetLeft;
  indicatorWidth.value = el.offsetWidth;
}

watch(activeIndex, () => nextTick(updateIndicator));
onMounted(() => {
  nextTick(updateIndicator);
  // 字体加载/窗口尺寸变化都重新测量一次
  if (typeof ResizeObserver !== 'undefined' && segTabsEl.value) {
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(segTabsEl.value);
  }
  window.addEventListener('resize', updateIndicator);
});

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
/* ===== 工具栏：支持窄屏 wrap，避免搜索框被挤掉 ===== */
.bots-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.bots-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.bots-search-input {
  width: 220px;
  min-width: 160px;
}

/* ===== 滑块式 Tabbar：每个 tab 按内容宽度撑开，滑块用 JS 测量位置 ===== */
.seg-tabs {
  position: relative;
  display: inline-flex;
  align-items: stretch;
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
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: left 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    width 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    background-color 0.3s ease, border-color 0.3s ease;
  pointer-events: none;
  /* 初始隐藏，避免首次渲染时跳一下 */
  will-change: left, width;
}
.seg-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  transition: color 0.22s ease;
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
