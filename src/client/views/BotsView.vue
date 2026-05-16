<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">Bots 管理</h2>
      <button
        v-if="activePlatform === 'feishu'"
        class="btn-mac btn-mac-sm"
        :disabled="loading"
        @click="refresh"
      >
        刷新
      </button>
    </div>

    <!-- 平台 Tabs -->
    <div class="tab-bar" style="margin-bottom: 16px; justify-content: flex-start">
      <button
        v-for="p in platforms"
        :key="p.id"
        class="tab-btn"
        :class="{ active: activePlatform === p.id }"
        @click="activePlatform = p.id"
      >
        <component :is="p.icon" :size="16" :stroke-width="1.5" />
        <span>{{ p.label }}</span>
      </button>
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
            <th>Name（机器人名称）</th>
            <th>AppID</th>
            <th>密钥（脱敏）</th>
            <th style="min-width: 220px">备注</th>
            <th style="width: 100px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 32px">
              加载中…
            </td>
          </tr>
          <tr v-else-if="bots.length === 0">
            <td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 32px">
              暂无机器人，下次启动时会自动从已有绑定迁移
            </td>
          </tr>
          <tr v-for="b in bots" :key="b.id">
            <td style="font-weight: 500">{{ b.name }}</td>
            <td style="font-family: monospace; font-size: 12px">{{ b.appId || '-' }}</td>
            <td
              style="color: var(--text-secondary); font-family: monospace; font-size: 12px"
            >
              {{ b.secret || '-' }}
            </td>
            <td>
              <input
                v-model="b.remark"
                class="input-mac input-mac-sm"
                placeholder="点击编辑备注"
                style="width: 100%"
                @blur="saveRemark(b)"
                @keyup.enter="onEnterBlur"
              />
            </td>
            <td>
              <button class="btn-mac btn-mac-sm" @click="saveRemark(b)">保存</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Bot } from 'lucide-vue-next';
import { useApi } from '../composables/useApi';

interface BotItem {
  id: number;
  platform: string;
  name: string;
  appId: string | null;
  secret: string | null;
  remark: string | null;
}

const platforms = [
  { id: 'feishu' as const, label: '飞书', icon: Bot },
  { id: 'telegram' as const, label: 'Telegram', icon: Bot },
  { id: 'qq' as const, label: 'QQ', icon: Bot },
  { id: 'wechat' as const, label: '微信', icon: Bot },
];

type Platform = (typeof platforms)[number]['id'];

const api = useApi();
const activePlatform = ref<Platform>('feishu');
const bots = ref<BotItem[]>([]);
const loading = ref(false);

const currentPlatform = computed(() =>
  platforms.find((p) => p.id === activePlatform.value),
);

function onEnterBlur(e: KeyboardEvent) {
  (e.target as HTMLInputElement).blur();
}

async function refresh() {
  if (activePlatform.value !== 'feishu') {
    bots.value = [];
    return;
  }
  loading.value = true;
  try {
    const r = await api.get<BotItem[]>(`/api/bots?platform=${activePlatform.value}`);
    bots.value = r.code === 0 ? r.data || [] : [];
  } finally {
    loading.value = false;
  }
}

async function saveRemark(b: BotItem) {
  await api.put(`/api/bots/${b.id}`, { remark: b.remark });
}

onMounted(refresh);
watch(activePlatform, refresh);
</script>
