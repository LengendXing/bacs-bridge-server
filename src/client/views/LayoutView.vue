<template>
  <div class="layout-root" :class="{ 'layout-left': isLeftLayout }">
    <!-- 左侧菜单模式：侧边栏 -->
    <aside v-if="isLeftLayout" class="sidebar">
      <div class="sidebar-header">
        <span class="text-sm font-semibold" style="color: var(--text)">Bridge</span>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          custom
          v-slot="{ isExactActive, navigate }"
        >
          <button
            class="sidebar-btn"
            :class="{ active: tab.path === '/' ? isExactActive : isExactActive || $route.path.startsWith(tab.path + '/') }"
            @click="navigate"
          >
            <span class="sidebar-icon">{{ tab.icon }}</span>
            <span class="sidebar-label">{{ tab.label }}</span>
          </button>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-btn" @click="auth.logout(); router.push('/login')">
          <span class="sidebar-icon">↩</span>
          <span class="sidebar-label">退出</span>
        </button>
        <div class="flex items-center gap-1 px-3 mt-2">
          <span class="text-xs">🌙</span>
          <div class="theme-toggle-sm" @click="toggleTheme"></div>
          <span class="text-xs">☀️</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-area">
      <!-- 顶部标签模式：Header + Tab -->
      <template v-if="!isLeftLayout">
        <header class="flex items-center justify-between mb-8 px-6 pt-6">
          <div>
            <h1 class="text-2xl font-bold tracking-tight">飞书 × AI CLI 桥接管理</h1>
            <p class="text-sm mt-1" style="color: var(--text-secondary)">进程绑定状态监控与管理</p>
          </div>
          <div class="flex items-center gap-4">
            <button class="btn-mac btn-mac-sm" @click="auth.logout(); router.push('/login')">退出</button>
            <div class="flex items-center gap-2">
              <span class="text-sm">🌙</span>
              <div class="theme-toggle" @click="toggleTheme"></div>
              <span class="text-sm">☀️</span>
            </div>
          </div>
        </header>

        <div class="tab-bar mx-6">
          <router-link
            v-for="tab in tabs"
            :key="tab.path"
            :to="tab.path"
            custom
            v-slot="{ isExactActive, navigate }"
          >
            <button
              class="tab-btn"
              :class="{ active: tab.path === '/' ? isExactActive : isExactActive || $route.path.startsWith(tab.path + '/') }"
              @click="navigate"
            >
              {{ tab.label }}
            </button>
          </router-link>
        </div>
      </template>

      <!-- 左侧模式：顶栏只有标题 -->
      <header v-if="isLeftLayout" class="flex items-center justify-between mb-6 px-6 pt-6">
        <h1 class="text-lg font-bold tracking-tight" style="color: var(--text)">飞书 × AI CLI 桥接管理</h1>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <span class="text-sm">🌙</span>
            <div class="theme-toggle" @click="toggleTheme"></div>
            <span class="text-sm">☀️</span>
          </div>
        </div>
      </header>

      <div class="px-6 pb-6">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const auth = useAuth();
const authStore = useAuthStore();

const tabs = [
  { path: '/', label: '首页', icon: '◉' },
  { path: '/bindings', label: '绑定', icon: '⚡' },
  { path: '/providers', label: '服务商', icon: '☁' },
  { path: '/logs', label: '日志', icon: '▤' },
  { path: '/settings', label: '设置', icon: '⚙' },
];

const isLeftLayout = computed(() =>
  document.documentElement.getAttribute('data-layout') === 'left'
);

// 监听 layout 变化
const observer = new MutationObserver(() => {
  // 触发响应式更新
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

// 初始化主题
const saved = localStorage.getItem('theme');
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
</script>

<style scoped>
.layout-root {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}
.layout-left .layout-root,
.layout-left {
  flex-direction: row;
}

/* 左侧边栏 */
.sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
}
.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--border);
}
.sidebar-nav {
  flex: 1;
  padding: 8px;
}
.sidebar-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  text-align: left;
}
.sidebar-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text);
}
.sidebar-btn.active {
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
}
.sidebar-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}
.sidebar-label {
  flex: 1;
}
.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border);
}

.main-area {
  flex: 1;
  min-width: 0;
}

/* 顶部 Tab 栏 */
.tab-bar {
  display: flex;
  gap: 4px;
  justify-content: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 4px;
  margin-bottom: 24px;
}
.tab-btn {
  padding: 8px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}
.tab-btn:hover {
  color: var(--text);
  background: rgba(0, 0, 0, 0.04);
}
.tab-btn.active {
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
}

.theme-toggle {
  position: relative;
  width: 48px;
  height: 26px;
  background: var(--border);
  border-radius: 13px;
  cursor: pointer;
  transition: background 0.3s ease;
}
.theme-toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.dark .theme-toggle {
  background: var(--accent);
}
.dark .theme-toggle::after {
  transform: translateX(22px);
}

.theme-toggle-sm {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.3s ease;
}
.theme-toggle-sm::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.dark .theme-toggle-sm {
  background: var(--accent);
}
.dark .theme-toggle-sm::after {
  transform: translateX(16px);
}
</style>
