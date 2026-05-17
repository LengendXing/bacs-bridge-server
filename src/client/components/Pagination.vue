<template>
  <div class="pagination-mac">
    <div class="pagination-info">
      共 <span class="pagination-num">{{ total }}</span> 条
    </div>
    <div class="pagination-controls">
      <button
        class="btn-mac btn-mac-sm"
        :disabled="page <= 1 || disabled"
        @click="goTo(page - 1)"
        aria-label="上一页"
      >‹</button>

      <template v-for="(p, i) in pageList" :key="`${p}-${i}`">
        <button
          v-if="p !== '...'"
          class="btn-mac btn-mac-sm pagination-page"
          :class="{ 'btn-mac-primary': p === page }"
          :disabled="disabled"
          @click="goTo(p as number)"
        >{{ p }}</button>
        <span v-else class="pagination-ellipsis">…</span>
      </template>

      <button
        class="btn-mac btn-mac-sm"
        :disabled="page >= totalPages || disabled"
        @click="goTo(page + 1)"
        aria-label="下一页"
      >›</button>

      <select
        class="input-mac pagination-size"
        :value="pageSize"
        :disabled="disabled"
        @change="onSizeChange"
      >
        <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} 条/页</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  pageSizes?: number[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  pageSizes: () => [10, 20, 50, 100],
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:pageSize', value: number): void;
}>();

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize)))
);

const pageList = computed<(number | '...')[]>(() => {
  const tp = totalPages.value;
  const cur = props.page;
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);
  const result: (number | '...')[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(tp - 1, cur + 1);
  if (start > 2) result.push('...');
  for (let i = start; i <= end; i++) result.push(i);
  if (end < tp - 1) result.push('...');
  result.push(tp);
  return result;
});

function goTo(p: number) {
  if (props.disabled) return;
  const clamped = Math.min(Math.max(1, p), totalPages.value);
  if (clamped !== props.page) emit('update:page', clamped);
}

function onSizeChange(e: Event) {
  const next = Number((e.target as HTMLSelectElement).value);
  if (Number.isFinite(next) && next > 0) emit('update:pageSize', next);
}
</script>

<style scoped>
.pagination-mac {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--card);
}
.pagination-info {
  font-size: 12px;
  color: var(--text-secondary);
}
.pagination-num {
  font-weight: 600;
  color: var(--text);
}
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pagination-page {
  min-width: 32px;
}
.pagination-ellipsis {
  padding: 0 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
.pagination-size {
  width: auto;
  margin-left: 8px;
  height: 28px;
  font-size: 12px;
  padding: 0 8px;
}
</style>
