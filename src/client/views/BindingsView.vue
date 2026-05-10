<!--
  BindingsView - 进程绑定状态页
  展示所有进程绑定列表，支持新建/刷新，编辑/删除为占位
-->
<template>
  <div>
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold" style="color: var(--text)">进程绑定状态</h2>
      <div class="flex items-center gap-2">
        <button class="btn-mac btn-mac-primary btn-mac-sm" @click="showCreate = true">新建</button>
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
            <th>服务商</th>
            <th>模型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center" style="color: var(--text-secondary)">加载中...</td>
          </tr>
          <tr v-else-if="bindings.length === 0">
            <td colspan="8" class="text-center" style="color: var(--text-secondary)">暂无绑定数据</td>
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
            <td style="color: var(--text-secondary)">{{ b.provider?.name || '-' }}</td>
            <td style="color: var(--text-secondary)">{{ b.model?.modelId || '-' }}</td>
            <td>
              <div class="flex items-center gap-1">
                <!-- TODO: 编辑绑定弹窗 -->
                <button class="btn-mac btn-mac-sm" disabled title="编辑（待实现）">编辑</button>
                <!-- TODO: 删除确认弹窗 -->
                <button class="btn-mac btn-mac-danger btn-mac-sm" disabled title="删除（待实现）">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TODO: 新建绑定弹窗 / 编辑绑定弹窗 / 删除确认弹窗 -->
  </div>
</template>

<script setup lang="ts">
/**
 * BindingsView - 进程绑定状态页
 * 展示所有进程绑定列表，支持新建/刷新
 * 编辑/删除弹窗为占位，后续迭代实现
 */
import { ref, onMounted } from 'vue';
import { useApi } from '../composables/useApi';
import type { Binding } from '@shared/types';

const { get } = useApi();

const bindings = ref<Binding[]>([]);
const loading = ref(false);
const showCreate = ref(false);

/** 加载绑定列表 */
async function refresh() {
  loading.value = true;
  try {
    const res = await get<Binding[]>('/api/status');
    if (res.code === 0) {
      bindings.value = res.data || [];
    }
  } catch {
    /* TODO: toast error */
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
