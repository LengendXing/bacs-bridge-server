<template>
  <div class="bindings-page">
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">
        {{ activeTab === 'list' ? t('bindings.title') : t('bindings.terminal') }}
      </h2>
      <div class="flex items-center gap-2">
        <template v-if="activeTab === 'list'">
          <button class="btn-mac btn-mac-primary btn-mac-sm btn-icon" @click="openCreate" :title="t('bindings.add')"><Plus :size="14" /></button>
          <button class="btn-mac btn-mac-sm btn-icon" @click="openMount" :title="t('bindings.mount')"><FolderOpen :size="14" /></button>
          <button class="btn-mac btn-mac-sm btn-icon" :disabled="loading" @click="refresh" :title="t('common.refresh')"><RefreshCw :size="14" /></button>
        </template>
        <template v-else>
          <span v-if="terminalSession.bindingId.value" class="text-xs" style="color: var(--text-secondary)">
            {{ t('bindings.target') }}: {{ currentBindingName }}
          </span>
          <button v-if="terminalSession.status.value === 'open' || terminalSession.status.value === 'connecting'"
            class="btn-mac btn-mac-danger btn-mac-sm"
            @click="terminalSession.disconnect()"
          >{{ t('bindings.disconnect') }}</button>
        </template>
      </div>
    </div>

    <!-- Tab content area -->
    <div class="tab-area">
      <Transition :name="tabTransitionName" mode="out-in">
        <div v-if="activeTab === 'list'" key="list" class="tab-pane">
          <!-- Bindings table -->
          <div class="glass-card" style="padding: 0; overflow: hidden">
      <table class="table-mac">
        <thead>
          <tr>
            <th>{{ t('bindings.thProcess') }}</th>
            <th>{{ t('bindings.thBot') }}</th>
            <th>{{ t('bindings.thWs') }}</th>
            <th>{{ t('bindings.thStatus') }}</th>
            <th>{{ t('bindings.thCli') }}</th>
            <th>{{ t('bindings.thMachine') }}</th>
            <th>{{ t('bindings.thModel') }}</th>
            <th>{{ t('bindings.thAction') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center" style="color: var(--text-secondary)">{{ t('common.loading') }}</td>
          </tr>
          <tr v-else-if="bindings.length === 0">
            <td colspan="8" class="text-center" style="color: var(--text-secondary)">{{ t('common.noData') }}</td>
          </tr>
          <tr v-for="b in bindings" :key="b.id">
            <td style="font-weight: 500">{{ b.processName }}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px">
                <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary)">
                  {{ b.botPlatform === 'feishu' ? t('bindings.platform.feishu') : b.botPlatform === 'telegram' ? t('bindings.platform.telegram') : b.botPlatform === 'qq' ? t('bindings.platform.qq') : b.botPlatform === 'wechat' ? t('bindings.platform.wechat') : t('bindings.platform.feishu') }}
                </span>
                <span :title="b.feishuAppId || ''">{{ b.botName || t('bindings.unlinked') }}</span>
              </div>
            </td>
            <td>
              <span :class="b.wsConnected ? 'badge badge-online' : 'badge badge-offline'">
                {{ b.wsConnected ? t('bindings.wsConnected') : t('bindings.wsDisconnected') }}
              </span>
            </td>
            <td>
              <span :class="b.status === 'online' ? 'badge badge-online' : 'badge badge-offline'">
                {{ b.status === 'online' ? t('common.online') : t('common.offline') }}
              </span>
            </td>
            <td>{{ b.cliKind }}</td>
            <td style="color: var(--text-secondary)">{{ b.machineId ? (b.machineName || `#${b.machineId}`) : t('common.local') }}</td>
            <td style="color: var(--text-secondary)">{{ b.modelOverride || b.model?.modelId || '-' }}</td>
            <td>
              <div class="flex items-center gap-1">
                <button class="btn-mac btn-mac-sm btn-icon" @click="copyAttach(b)" :title="t('bindings.attachTitle')"><Paperclip :size="14" /></button>
                <button class="btn-mac btn-mac-sm btn-icon" :disabled="b.status !== 'online'"
                  @click="openTerminal(b)" :title="t('bindings.openTerminalTitle')"><Terminal :size="14" /></button>
                <button class="btn-mac btn-mac-sm btn-icon" @click="openEdit(b)" :title="t('bindings.edit')"><Pencil :size="14" /></button>
                <button class="btn-mac btn-mac-sm btn-icon" :disabled="rebindingMap[b.id] || b.status !== 'online'"
                  @click="rebind(b)" :title="t('bindings.rebindTitle')"><RefreshCw :size="14" :class="{ 'spin-icon': rebindingMap[b.id] }" /></button>
                <button class="btn-mac btn-mac-danger btn-mac-sm btn-icon" @click="confirmUnbind(b)" :title="t('bindings.unbind')"><Trash2 :size="14" /></button>
                <button class="btn-mac btn-mac-sm btn-icon" @click="openDetail(b)" :title="t('bindings.detail')"><Info :size="14" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
            <Pagination
              v-model:page="page"
              v-model:pageSize="pageSize"
              :total="total"
              :disabled="loading"
            />
          </div>
        </div>
        <div v-else key="terminal" class="tab-pane terminal-pane">
          <TerminalPanel :binding-id="terminalSession.bindingId.value" />
        </div>
      </Transition>
    </div>

    <!-- Bottom Tab Bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'list' }"
        @click="setTab('list')"
      >
        <span class="tab-icon">📋</span>
        <span>{{ t('bindings.bindList') }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'terminal' }"
        :disabled="!terminalSession.bindingId.value"
        @click="setTab('terminal')"
      >
        <span class="tab-icon">⌨</span>
        <span>Terminal</span>
        <span v-if="terminalSession.status.value === 'open'" class="tab-indicator dot-green" />
        <span v-else-if="terminalSession.status.value === 'connecting'" class="tab-indicator dot-yellow" />
        <span v-else-if="terminalSession.status.value === 'closed'" class="tab-indicator dot-red" />
      </button>
    </div>

    <!-- Attach 复制弹窗 -->
    <div v-if="showAttachModal" class="modal-overlay" @click.self="showAttachModal = false">
      <div class="modal-card" style="width: 520px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ t('bindings.copyAttachTitle') }}</h3>
        <div class="flex flex-col gap-3 mb-4">
          <label class="attach-option" :class="{ selected: attachChoice === 'simple' }" @click="attachChoice = 'simple'">
            <input type="radio" name="attachChoice" value="simple" :checked="attachChoice === 'simple'" />
            <div>
              <div class="text-sm font-medium" style="color: var(--text)">{{ t('bindings.attachSimple') }}</div>
              <code class="attach-cmd">{{ attachSimpleCmd }}</code>
            </div>
          </label>
          <label v-if="attachFullCmd" class="attach-option" :class="{ selected: attachChoice === 'full' }" @click="attachChoice = 'full'">
            <input type="radio" name="attachChoice" value="full" :checked="attachChoice === 'full'" />
            <div>
              <div class="text-sm font-medium" style="color: var(--text)">{{ t('bindings.attachFull') }}</div>
              <code class="attach-cmd">{{ attachFullCmd }}</code>
            </div>
          </label>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-mac btn-mac-primary btn-mac-sm" @click="copyAttachFromModal">{{ t('common.copy') }}</button>
          <button class="btn-mac btn-mac-sm" @click="showAttachModal = false">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 新建/编辑/挂载弹窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-card" style="width: 460px">
        <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ modalTitle }}</h3>
        <form @submit.prevent="handleSubmit">
          <template v-if="modalMode !== 'edit'">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.thProcess') }}</label>
            <input v-model="form.processName" type="text" class="input-mac mb-3"
              :placeholder="modalMode === 'mount' ? t('bindings.mountPlaceholder') : t('bindings.processPlaceholder')"
              :readonly="modalMode === 'mount'"
              required
              @focus="modalMode === 'mount' && loadUnboundSessions()"
            />
            <div v-if="modalMode === 'mount' && unboundSessions.length > 0" class="mb-3">
              <select v-model="form.processName" class="input-mac">
                <option value="" disabled>{{ t('bindings.selectTmuxSession') }}</option>
                <option v-for="s in unboundSessions" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </template>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.thCli') }}</label>
          <select v-model="form.cliKind" class="input-mac mb-3" :disabled="modalMode === 'edit'" @change="onCliOrProviderChange">
            <option value="cc">Claude Code</option>
            <option value="codex">Codex</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.thMachine') }}</label>
          <select v-model="form.machineId" class="input-mac mb-3" @change="onMachineChange">
            <option :value="null">{{ t('bindings.localDefault') }}</option>
            <option v-for="m in machineList" :key="m.id" :value="m.id">{{ m.name }} ({{ m.host }}:{{ m.port }})</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.thProvider') }}</label>
          <select v-model="form.providerId" class="input-mac mb-3" @change="onCliOrProviderChange">
            <option :value="null">{{ t('bindings.localEnv') }}</option>
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.thModel') }}</label>
          <!-- 探查失败提示 -->
          <p v-if="probeFailed" class="text-xs mb-1" style="color: var(--warning)">
            {{ t('bindings.probeFailedHint') }}
          </p>
          <div class="flex items-center gap-2 mb-1">
            <select v-model="form.modelId" class="input-mac" style="flex:1" @change="onModelChange">
              <option :value="null">{{ modelOptions.length ? t('bindings.defaultModel') : t('bindings.noModel') }}</option>
              <option v-for="m in modelOptions" :key="m.id ?? m.modelId" :value="m.id ?? null" :data-model-id="m.modelId">
                {{ m.displayName || m.modelId }} <span v-if="m.displayName && m.displayName !== m.modelId">({{ m.modelId }})</span>
              </option>
            </select>
            <button type="button" class="btn-mac btn-mac-sm" @click="useCustomModel = !useCustomModel" :title="useCustomModel ? t('bindings.listModelTitle') : t('bindings.customModelTitle')">
              {{ useCustomModel ? t('bindings.listModel') : t('bindings.customModel') }}
            </button>
          </div>
          <input v-if="useCustomModel" v-model="form.modelOverride" type="text" class="input-mac mb-3"
            :placeholder="t('bindings.customModelPlaceholder')" />

          <!-- effort 选择（仅当选了模型且该模型支持 effort 时显示） -->
          <template v-if="showEffortSelect">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.effortLabel') }}</label>
            <select v-model="form.effort" class="input-mac mb-3">
              <option :value="null">{{ t('bindings.effortDefault') }}</option>
              <option v-for="e in effortOptions" :key="e" :value="e">{{ e }}</option>
            </select>
          </template>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.platformLabel') }}</label>
          <select v-model="form.platform" @change="onPlatformChange" class="input-mac mb-3">
            <option value="feishu">{{ t('bindings.platform.feishu') }}</option>
            <option value="telegram" disabled>{{ t('bindings.telegramNotSupported') }}</option>
            <option value="qq" disabled>{{ t('bindings.qqNotSupported') }}</option>
            <option value="wechat" disabled>{{ t('bindings.wechatNotSupported') }}</option>
          </select>

          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('bindings.botLabel') }}</label>
          <template v-if="botList.length > 0">
            <select v-model="form.botId" class="input-mac mb-3" required>
              <option :value="null" disabled>{{ t('bindings.selectBot') }}</option>
              <option v-for="b in botList" :key="b.id" :value="b.id">
                {{ b.name }} ({{ b.appId.slice(0, 10) }}{{ b.appId.length > 10 ? '...' : '' }})
              </option>
            </select>
          </template>
          <div v-else class="mb-3 p-3 rounded text-xs" style="background: var(--bg-secondary); color: var(--text-secondary)">
            {{ t('bindings.noBotsHint') }}
            <router-link to="/bots" class="underline" style="color: var(--accent-color)">Bots</router-link>
            {{ t('bindings.noBotsAfterLink') }}
          </div>

          <p v-if="formError" class="text-sm mb-3" style="color: var(--danger)">{{ formError }}</p>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="formLoading">
              {{ formLoading ? t('common.submitting') : submitLabel }}
            </button>
            <button type="button" class="btn-mac btn-mac-sm" @click="showModal = false">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </div>
    </div>
    <!-- 详情抽屉 -->
    <div v-if="showDetailDrawer" class="drawer-overlay" @click.self="closeDetail">
      <div class="drawer-panel" :class="{ 'drawer-open': showDetailDrawer }">
        <div class="drawer-header">
          <h3>{{ t('bindings.detailTitle') }}</h3>
          <button class="btn-mac btn-mac-sm" @click="closeDetail">{{ t('common.close') }}</button>
        </div>
        <div class="drawer-body">
          <template v-if="detailLoading">
            <p style="color: var(--text-secondary)">{{ t('common.loading') }}</p>
          </template>
          <template v-else-if="detailData">
            <section class="detail-section">
              <h4>{{ t('bindings.detailBasic') }}</h4>
              <div class="detail-grid">
                <div class="detail-item"><label>{{ t('bindings.detailLabel.id') }}</label><span class="detail-value mono">{{ detailData.id }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.processName') }}</label><span>{{ detailData.processName }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.status') }}</label><span :class="detailData.status === 'online' ? 'badge badge-online' : 'badge badge-offline'">{{ detailData.status === 'online' ? t('common.online') : t('common.offline') }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.wsConnected') }}</label><span :class="detailData.wsConnected ? 'badge badge-online' : 'badge badge-offline'">{{ detailData.wsConnected ? t('bindings.wsConnected') : t('bindings.wsDisconnected') }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.createdAt') }}</label><span>{{ detailData.createdAt }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.updatedAt') }}</label><span>{{ detailData.updatedAt }}</span></div>
              </div>
            </section>
            <section v-if="detailData.botPlatform || detailData.botName" class="detail-section">
              <h4>{{ t('bindings.detailBot') }}</h4>
              <div class="detail-grid">
                <div class="detail-item"><label>{{ t('bindings.detailLabel.platform') }}</label><span>{{ detailData.botPlatform }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.botName') }}</label><span>{{ detailData.botName || '-' }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.feishuAppId') }}</label><span class="detail-value mono">{{ detailData.feishuAppId || '-' }}</span></div>
              </div>
            </section>
            <section class="detail-section">
              <h4>{{ t('bindings.detailCLI') }}</h4>
              <div class="detail-grid">
                <div class="detail-item"><label>{{ t('bindings.detailLabel.cliKind') }}</label><span>{{ detailData.cliKind }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.machine') }}</label><span>{{ detailData.machineName || t('common.local') }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.provider') }}</label><span>{{ detailData.provider?.name || '-' }}</span></div>
                <div class="detail-item"><label>{{ t('bindings.detailLabel.model') }}</label><span>{{ detailData.modelOverride || detailData.model?.modelId || '-' }}</span></div>
                <div v-if="detailData.effort" class="detail-item"><label>{{ t('bindings.detailLabel.effort') }}</label><span>{{ detailData.effort }}</span></div>
              </div>
            </section>
            <section class="detail-section">
              <h4>{{ t('bindings.detailRuntime') }}</h4>
              <div class="detail-grid">
                <div class="detail-item">
                  <label>{{ t('bindings.detailLabel.status') }}</label>
                  <span>{{ detailData.runtime.sessionExists ? t('bindings.sessionRunning') : t('bindings.sessionStopped') }}</span>
                </div>
                <div class="detail-item">
                  <label>{{ t('bindings.detailLabel.sessionName') }}</label>
                  <span class="detail-value mono">{{ detailData.runtime.sessionName }}</span>
                </div>
              </div>
              <div v-if="detailData.runtime.paneOutput" class="pane-output">
                <label class="block text-xs font-medium mb-2" style="color: var(--text-secondary)">{{ t('bindings.paneOutput') }}</label>
                <pre class="pane-output-pre">{{ detailData.runtime.paneOutput }}</pre>
              </div>
            </section>
          </template>
          <template v-else>
            <p style="color: var(--text-secondary)">{{ t('common.noData') }}</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '../composables/useApi';
import Pagination from '../components/Pagination.vue';
import TerminalPanel from '../components/TerminalPanel.vue';
import { useTerminalSession, IDLE_TIMEOUT } from '../composables/useTerminalSession';
import { Plus, FolderOpen, RefreshCw, Paperclip, Terminal, Pencil, Trash2, Info } from 'lucide-vue-next';

defineOptions({ name: 'BindingsView' });
import type { Binding, BindingDetail, Provider, Machine, Model } from '@shared/types';
import { DEFAULT_MODELS, getEffortOptions, modelSupportsEffort } from '@shared/defaultModels';
import type { CliKind } from '@shared/defaultModels';

const { get, post, del } = useApi();
const { t } = useI18n();

const bindings = ref<Binding[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const terminalSession = useTerminalSession();
type TabKey = 'list' | 'terminal';
const activeTab = ref<TabKey>('list');
const tabTransitionName = ref<'tab-forward' | 'tab-backward'>('tab-forward');

const currentBindingName = computed(() => {
  const id = terminalSession.bindingId.value;
  if (!id) return '';
  const b = bindings.value.find((x) => x.id === id);
  return b ? `${b.machine}:${b.workdir}` : id;
});

function setTab(t: TabKey) {
  if (t === activeTab.value) return;
  tabTransitionName.value = t === 'terminal' ? 'tab-forward' : 'tab-backward';
  activeTab.value = t;
  if (t === 'terminal') {
    terminalSession.cancelIdleTimer();
  } else {
    if (terminalSession.bindingId.value) {
      terminalSession.startIdleTimer(IDLE_TIMEOUT);
    }
  }
}

onActivated(() => {
  if (activeTab.value === 'terminal') {
    terminalSession.cancelIdleTimer();
  }
});
onDeactivated(() => {
  if (terminalSession.bindingId.value) {
    terminalSession.startIdleTimer(IDLE_TIMEOUT);
  }
});
onBeforeUnmount(() => {
  terminalSession.cancelIdleTimer();
});
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
  // v1.1.14：绑定改为关联 bacs_bots（先选平台再选 Bot）
  platform: 'feishu' as 'feishu' | 'telegram' | 'qq' | 'wechat',
  botId: null as number | null,
});

// v1.1.14：当前平台下可选的机器人列表（来自 /api/bots?platform=xxx）
interface BotItem { id: number; platform: string; name: string; appId: string; remark: string | null }
const botList = ref<BotItem[]>([]);

async function loadBots(platform: string) {
  try {
    const res = await get<BotItem[]>(`/api/bots?platform=${encodeURIComponent(platform)}`);
    if (res.code === 0) botList.value = res.data || [];
    else botList.value = [];
  } catch { botList.value = []; }
}

function onPlatformChange() {
  // 切换平台时清空已选 Bot 并重新加载该平台的 Bot 列表
  form.value.botId = null;
  loadBots(form.value.platform);
}

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
  modalMode.value === 'create' ? t('bindings.createTitle') :
  modalMode.value === 'mount' ? t('bindings.mountTitle') : t('bindings.editTitle')
);

const submitLabel = computed(() =>
  modalMode.value === 'create' ? t('bindings.createSubmit') :
  modalMode.value === 'mount' ? t('bindings.mountSubmit') : t('bindings.editSubmit')
);

async function refresh() {
  loading.value = true;
  try {
    const res = await get<{ items: Binding[]; total: number; page: number; pageSize: number }>(
      `/api/status?page=${page.value}&pageSize=${pageSize.value}`
    );
    if (res.code === 0 && res.data) {
      bindings.value = res.data.items || [];
      total.value = res.data.total || 0;
      if (bindings.value.length === 0 && page.value > 1 && total.value > 0) {
        page.value = Math.max(1, Math.ceil(total.value / pageSize.value));
      }
    }
  } catch { /* */ } finally { loading.value = false; }
}

watch([page, pageSize], () => { refresh(); });

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
  form.value = { processName: '', cliKind: 'cc', providerId: null, modelId: null, modelOverride: '', effort: null, machineId: null, platform: 'feishu', botId: null };
  formError.value = '';
  useCustomModel.value = false;
  probeFailed.value = false;
  loadProviders();
  loadMachines();
  loadModels();
  loadBots(form.value.platform);
  showModal.value = true;
}

function openMount() {
  modalMode.value = 'mount';
  editId.value = '';
  form.value = { processName: '', cliKind: 'cc', providerId: null, modelId: null, modelOverride: '', effort: null, machineId: null, platform: 'feishu', botId: null };
  formError.value = '';
  useCustomModel.value = false;
  probeFailed.value = false;
  loadProviders();
  loadMachines();
  loadModels();
  loadUnboundSessions();
  loadBots(form.value.platform);
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
    platform: (b.botPlatform as 'feishu' | 'telegram' | 'qq' | 'wechat') || 'feishu',
    botId: b.botId ?? null,
  };
  useCustomModel.value = !!b.modelOverride;
  formError.value = '';
  loadProviders();
  loadMachines();
  loadModels();
  loadBots(form.value.platform);
  showModal.value = true;
}

async function handleSubmit() {
  formError.value = '';
  // v1.1.14：先校验必须选了 Bot
  if (!form.value.botId) {
    formError.value = t('bindings.selectBot');
    return;
  }
  formLoading.value = true;
  try {
    let res;
    if (modalMode.value === 'create') {
      res = await post('/api/bind', {
        processName: form.value.processName,
        cliKind: form.value.cliKind,
        providerId: form.value.providerId,
        modelId: form.value.modelId,
        modelOverride: useCustomModel.value ? form.value.modelOverride : undefined,
        effort: form.value.effort,
        machineId: form.value.machineId,
        botId: form.value.botId,
      });
    } else if (modalMode.value === 'mount') {
      res = await post('/api/bind/mount', {
        processName: form.value.processName,
        cliKind: form.value.cliKind,
        providerId: form.value.providerId,
        modelId: form.value.modelId,
        modelOverride: useCustomModel.value ? form.value.modelOverride : undefined,
        effort: form.value.effort,
        machineId: form.value.machineId,
        botId: form.value.botId,
      });
    } else {
      res = await post('/api/edit', {
        id: editId.value,
        botId: form.value.botId,
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
      formError.value = res?.message || t('common.operationFailed');
    }
  } catch {
    formError.value = t('common.networkError');
  } finally {
    formLoading.value = false;
  }
}

const rebindingMap = ref<Record<string, boolean>>({});

async function rebind(b: Binding) {
  rebindingMap.value[b.id] = true;
  try {
    const res = await post('/api/rebind', { id: b.id });
    if (res && res.code === 0) {
      await refresh();
    } else {
      alert(res?.message || t('common.operationFailed'));
    }
  } catch {
    alert(t('common.networkError'));
  } finally {
    delete rebindingMap.value[b.id];
  }
}

async function confirmUnbind(b: Binding) {
  const kill = confirm(t('bindings.unbindConfirm', { name: b.processName }));
  try {
    await post('/api/unbind', { id: b.id, killProcess: kill });
    await refresh();
  } catch { /* */ }
}

const showAttachModal = ref(false);
const attachChoice = ref<'simple' | 'full'>('simple');
const attachSimpleCmd = ref('');
const attachFullCmd = ref('');

function copyAttach(b: Binding) {
  const prefix = b.cliKind === 'codex' ? 'codex' : 'cc';
  const sessionName = `${prefix}-${b.processName}`;

  attachSimpleCmd.value = `tmux attach -t ${sessionName}`;
  attachFullCmd.value = '';

  if (b.machineId && b.machineName) {
    const m = machineList.value.find(m => m.id === b.machineId);
    if (m) {
      const portFlag = m.port && m.port !== 22 ? ` -p ${m.port}` : '';
      attachFullCmd.value = `ssh ${m.username}@${m.host}${portFlag} -t "tmux attach -t ${sessionName}"`;
    }
  }

  attachChoice.value = 'simple';
  showAttachModal.value = true;
}

function copyAttachFromModal() {
  const cmd = attachChoice.value === 'full' ? attachFullCmd.value : attachSimpleCmd.value;
  if (!cmd) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(cmd).then(() => {
      showAttachModal.value = false;
    }).catch(() => {
      prompt(t('bindings.copyCommandPrompt'), cmd);
      showAttachModal.value = false;
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = cmd;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* */ }
    document.body.removeChild(ta);
    showAttachModal.value = false;
  }
}

function openTerminal(b: Binding) {
  terminalSession.connect(b.id);
  setTab('terminal');
}

onMounted(() => { refresh(); loadMachines(); });

// 详情抽屉
const showDetailDrawer = ref(false);
const detailLoading = ref(false);
const detailData = ref<BindingDetail | null>(null);

function truncateProviderName(name: string | undefined | null): string {
  if (!name) return '-';
  if (name.length <= 2) return name;
  return name.slice(0, 2) + '...';
}

async function openDetail(b: Binding) {
  showDetailDrawer.value = true;
  detailLoading.value = true;
  detailData.value = null;
  try {
    const res = await get<BindingDetail>(`/api/status/${b.id}/detail`);
    if (res.code === 0 && res.data) {
      detailData.value = res.data;
    }
  } catch { /* */ } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  showDetailDrawer.value = false;
  detailData.value = null;
}
</script>

<style scoped>
.bindings-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 120px);
}
.tab-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 520px;
  overflow: hidden;
}
.tab-pane {
  width: 100%;
}
.terminal-pane {
  height: calc(100vh - 220px);
  min-height: 480px;
}

.tab-forward-enter-active,
.tab-forward-leave-active,
.tab-backward-enter-active,
.tab-backward-leave-active {
  transition: transform 250ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 250ms ease;
  will-change: transform, opacity;
}
.tab-forward-enter-from { transform: translateX(40px); opacity: 0; }
.tab-forward-leave-to   { transform: translateX(-40px); opacity: 0; }
.tab-backward-enter-from { transform: translateX(-40px); opacity: 0; }
.tab-backward-leave-to   { transform: translateX(40px); opacity: 0; }

.tab-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  margin-top: 12px;
  background: var(--bg);
  z-index: 5;
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}
.tab-btn:hover:not(:disabled) {
  opacity: 0.85;
}
.tab-btn.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.tab-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tab-icon { font-size: 14px; }
.tab-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 4px;
}
.dot-green { background: #4ade80; }
.dot-yellow { background: #facc15; }
.dot-red { background: #ef4444; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
  align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(4px);
}
.modal-card {
  background: var(--card); border-radius: 12px; padding: 24px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.attach-option {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
  cursor: pointer; transition: border-color 150ms, background 150ms;
}
.attach-option:hover { border-color: var(--accent); }
.attach-option.selected { border-color: var(--accent); background: rgba(59,130,246,0.06); }
.attach-option input[type="radio"] { margin-top: 3px; accent-color: var(--accent); }
.attach-cmd {
  display: block; margin-top: 4px; font-size: 13px;
  padding: 4px 8px; border-radius: 4px; word-break: break-all;
  background: var(--bg); color: var(--text); font-family: ui-monospace, monospace;
}

.provider-name-truncate {
  cursor: default;
  border-bottom: 1px dotted var(--text-secondary);
}

.btn-icon {
  padding: 4px 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.drawer-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.35);
  display: flex; justify-content: flex-end; z-index: 200;
  backdrop-filter: blur(2px);
}
.drawer-panel {
  width: 420px; max-width: 90vw; height: 100%;
  background: var(--card); box-shadow: -4px 0 24px rgba(0,0,0,0.18);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.drawer-panel.drawer-open {
  transform: translateX(0);
}
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.drawer-header h3 {
  font-size: 16px; font-weight: 600; color: var(--text);
}
.drawer-body {
  flex: 1; overflow-y: auto; padding: 20px;
}
.detail-section {
  margin-bottom: 20px;
}
.detail-section h4 {
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.detail-grid {
  display: flex; flex-direction: column; gap: 8px;
}
.detail-item {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 13px;
}
.detail-item label {
  color: var(--text-secondary); flex-shrink: 0;
}
.detail-item span {
  color: var(--text); text-align: right; word-break: break-all;
}
.detail-value.mono {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
}

.pane-output {
  margin-top: 12px;
}
.pane-output-pre {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px; line-height: 1.5;
  padding: 12px; border-radius: 8px;
  background: #1e1e2e; color: #cdd6f4;
  max-height: 360px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-all;
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
