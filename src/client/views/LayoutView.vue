<template>
  <div class="max-w-6xl mx-auto px-6 py-8">
    <!-- Header -->
    <header class="flex items-center justify-between mb-8">
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

    <!-- Tab Bar -->
    <div class="tab-bar">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        custom
        v-slot="{ isActive, navigate }"
      >
        <button
          class="tab-btn"
          :class="{ active: isActive }"
          @click="navigate"
        >
          {{ tab.label }}
        </button>
      </router-link>
    </div>

    <!-- Router View -->
    <router-view />
  </div>
</template>

<script setup lang="ts">
/**
 * 布局组件 - 管理面板主框架
 * 包含 Header（退出/主题切换）+ Tab 导航 + 内容区
 */
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const auth = useAuth();
const authStore = useAuthStore();

const tabs = [
  { path: '/', label: '首页' },
  { path: '/bindings', label: '绑定' },
  { path: '/providers', label: '服务商' },
  { path: '/logs', label: '日志' },
  { path: '/settings', label: '设置' },
];

/** 主题切换 */
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem(
    'theme',
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
}

/** 初始化主题 */
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
</script>

<style scoped>
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
  background: rgba(99, 102, 241, 0.08);
}
.tab-btn.active {
  background: var(--accent);
  color: #ffffff;
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
</style>
