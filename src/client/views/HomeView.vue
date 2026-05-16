<template>
  <div>
    <!-- 统计卡片 -->
    <div class="grid grid-cols-4 gap-4">
      <div class="glass-card text-center">
        <div class="text-3xl font-bold">{{ stats.total }}</div>
        <div class="text-xs mt-1" style="color: var(--text-secondary)">总绑定数</div>
      </div>
      <div class="glass-card text-center">
        <div class="text-3xl font-bold" style="color: var(--success)">{{ stats.online }}</div>
        <div class="text-xs mt-1" style="color: var(--text-secondary)">在线进程</div>
      </div>
      <div class="glass-card text-center">
        <div class="text-3xl font-bold" style="color: var(--danger)">{{ stats.offline }}</div>
        <div class="text-xs mt-1" style="color: var(--text-secondary)">离线进程</div>
      </div>
      <div class="glass-card text-center">
        <div class="text-3xl font-bold" style="color: var(--accent)">{{ stats.sessions }}</div>
        <div class="text-xs mt-1" style="color: var(--text-secondary)">活跃会话</div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="glass-card mt-6" style="padding: 0; overflow: hidden">
      <div class="tl-header">
        <span class="tl-title">消息时间线</span>
        <span class="tl-badge" :class="{ 'tl-badge-live': sseActive }">
          {{ sseActive ? '● 实时' : '○ 已断开' }}
        </span>
      </div>

      <div class="tl-body" ref="tlBody">
        <div v-if="entries.length === 0" class="tl-empty">暂无消息记录</div>

        <TransitionGroup name="tl-slide" tag="div" class="tl-list">
          <div v-for="entry in entries" :key="entry.id" class="tl-item">
            <!-- 轨道：节点球 + 竖线 -->
            <div class="tl-track">
              <div class="tl-dot" :style="{ background: platformColor(entry.platform) }"></div>
              <div class="tl-line"></div>
            </div>
            <!-- 内容 -->
            <div class="tl-content" @click="toggleExpand(entry.id)">
              <div class="tl-meta">
                <span class="tl-tag" :style="{ background: platformColor(entry.platform) + '22', color: platformColor(entry.platform) }">
                  {{ platformLabel(entry.platform) }}
                </span>
                <span class="tl-ip">{{ entry.targetIp === 'localhost' ? '本机' : entry.targetIp }}</span>
                <span class="tl-proc">{{ entry.processName }}</span>
                <span class="tl-time">{{ formatTime(entry.createdAt) }}</span>
              </div>
              <div class="tl-text" :class="{ 'tl-text-expanded': expandedIds.has(entry.id) }">
                {{ entry.content }}
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import { useAuthStore } from '../stores/auth';
import type { Binding } from '@shared/types';

const { get } = useApi();
const authStore = useAuthStore();

// ── 统计 ──────────────────────────────────────────────────────────────────
const stats = ref({ total: 0, online: 0, offline: 0, sessions: 0 });

async function refreshStats() {
  try {
    const [statusRes, sessionsRes] = await Promise.all([
      get<Binding[]>('/api/status'),
      get<string[]>('/api/sessions'),
    ]);
    const bindings = statusRes.data || [];
    stats.value = {
      total: bindings.length,
      online: bindings.filter(b => b.status === 'online').length,
      offline: bindings.filter(b => b.status === 'offline').length,
      sessions: (sessionsRes.data || []).length,
    };
  } catch { /* ignore */ }
}

// ── Timeline ─────────────────────────────────────────────────────────────
interface TimelineEntry {
  id: number;
  platform: string;
  targetIp: string;
  processName: string;
  content: string;
  createdAt: string | null;
}

const MAX_ENTRIES = 20;
const entries = ref<TimelineEntry[]>([]);
const expandedIds = ref<Set<number>>(new Set());
const sseActive = ref(false);
const tlBody = ref<HTMLElement | null>(null);

let es: EventSource | null = null;

function platformLabel(platform: string): string {
  return { feishu: '飞书', telegram: 'Telegram', discord: 'Discord' }[platform] ?? platform;
}

function platformColor(platform: string): string {
  return { feishu: '#00b96b', telegram: '#229ed9', discord: '#5865f2' }[platform] ?? '#888';
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : '+08:00'));
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toggleExpand(id: number) {
  const s = new Set(expandedIds.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  expandedIds.value = s;
}

function prependEntry(entry: TimelineEntry) {
  // 插入顶部，保持最多 MAX_ENTRIES 条
  entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES);
}

async function loadInitial() {
  try {
    const res = await get<TimelineEntry[]>('/api/timeline');
    // 服务端返回升序（旧→新），前端展示倒序（新→旧）
    entries.value = (res.data || []).slice().reverse().slice(0, MAX_ENTRIES);
  } catch { /* ignore */ }
}

function connectSSE() {
  const token = authStore.token;
  if (!token) return;
  const url = `/api/timeline/stream?token=${encodeURIComponent(token)}`;
  es = new EventSource(url);

  es.addEventListener('message', (e) => {
    try {
      const entry: TimelineEntry = JSON.parse(e.data);
      prependEntry(entry);
    } catch { /* ignore */ }
  });

  es.addEventListener('open', () => { sseActive.value = true; });
  es.addEventListener('error', () => {
    sseActive.value = false;
    // EventSource 会自动重连，不需要手动处理
  });
}

onMounted(async () => {
  await Promise.all([refreshStats(), loadInitial()]);
  connectSSE();
});

onUnmounted(() => {
  es?.close();
  es = null;
});
</script>

<style scoped>
/* Timeline 容器 */
.tl-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.tl-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.tl-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--border);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  transition: all 0.3s;
}
.tl-badge-live {
  background: #00b96b22;
  color: #00b96b;
}

.tl-body {
  height: 440px;
  overflow-y: auto;
  padding: 8px 0;
}
.tl-empty {
  padding: 32px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 条目列表 */
.tl-list {
  display: flex;
  flex-direction: column;
}
.tl-item {
  display: flex;
  gap: 0;
  padding: 0 18px;
  align-items: stretch;
}

/* 左侧轨道 */
.tl-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
  margin-right: 12px;
  padding-top: 14px;
}
.tl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px var(--bg);
  z-index: 1;
}
.tl-line {
  flex: 1;
  width: 1px;
  background: var(--border);
  margin-top: 4px;
  min-height: 12px;
}
.tl-item:last-child .tl-line {
  display: none;
}

/* 内容区 */
.tl-content {
  flex: 1;
  min-width: 0;
  padding: 10px 0 14px;
  cursor: pointer;
}
.tl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}
.tl-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}
.tl-ip {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}
.tl-proc {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--border);
  padding: 1px 6px;
  border-radius: 4px;
}
.tl-time {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.tl-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: all 0.2s ease;
}
.tl-text-expanded {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}

/* 插入动画：新条目从顶部 scale + fade 进入，旧条目整体下沉 */
.tl-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.tl-slide-leave-active {
  transition: all 0.2s ease;
  position: absolute;
}
.tl-slide-enter-from {
  opacity: 0;
  transform: translateY(-16px) scaleY(0.85);
  transform-origin: top center;
}
.tl-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.tl-slide-move {
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
