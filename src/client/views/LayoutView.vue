<template>
  <div class="layout-root" :class="{ 'layout-left': menuLayout === 'left' }">
    <!-- 左侧菜单模式：侧边栏 -->
    <aside v-if="menuLayout === 'left'" class="sidebar">
      <div class="sidebar-header">
        <BacsLogo :size="28" />
        <span class="sidebar-title">笨迪桥接</span>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="tab in tabs"
          :key="tab.path"
          class="sidebar-btn"
          :class="{ active: isTabActive(tab) }"
          @click="router.push(tab.path)"
        >
          <component :is="tab.icon" class="sidebar-icon" :size="18" :stroke-width="1.5" />
          <span class="sidebar-label">{{ tab.label }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-btn" @click="auth.logout(); router.push('/login')">
          <LogOut class="sidebar-icon" :size="18" :stroke-width="1.5" />
          <span class="sidebar-label">退出</span>
        </button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-area">
      <!-- 顶部标签模式 -->
      <template v-if="menuLayout === 'top'">
        <header class="flex items-center justify-between mb-8 px-6 pt-6">
          <div>
            <div class="flex items-center gap-3">
              <BacsLogo :size="32" />
              <span class="header-title">笨迪桥接</span>
            </div>
            <p class="text-sm mt-1" style="color: var(--text-secondary)">Bridge Admin Control System</p>
          </div>
          <div class="flex items-center gap-2">
            <Moon :size="16" :stroke-width="1.5" />
            <div class="theme-toggle" @click="toggleTheme"></div>
            <Sun :size="16" :stroke-width="1.5" />
          </div>
        </header>

        <div class="tab-bar mx-6">
          <button
            v-for="tab in tabs"
            :key="tab.path"
            class="tab-btn"
            :class="{ active: isTabActive(tab) }"
            @click="router.push(tab.path)"
          >
            <component :is="tab.icon" :size="16" :stroke-width="1.5" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </template>

      <!-- 左侧模式：简化顶栏（仅主题切换） -->
      <header v-if="menuLayout === 'left'" class="flex items-center justify-end mb-6 px-6 pt-6">
        <div class="flex items-center gap-2">
          <Moon :size="16" :stroke-width="1.5" />
          <div class="theme-toggle" @click="toggleTheme"></div>
          <Sun :size="16" :stroke-width="1.5" />
        </div>
      </header>

      <div class="px-6 pb-6">
        <router-view v-slot="{ Component }">
          <keep-alive include="BindingsView">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import BacsLogo from '../components/BacsLogo.vue';
import { Home, Link, Server, Cloud, FileText, Settings, LogOut, Moon, Sun } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const auth = useAuth();

const tabs = [
  { path: '/', label: '首页', icon: Home },
  { path: '/machines', label: '机器', icon: Server },
  { path: '/providers', label: '服务商', icon: Cloud },
  { path: '/bindings', label: '绑定', icon: Link },
  { path: '/logs', label: '日志', icon: FileText },
  { path: '/settings', label: '设置', icon: Settings },
];

const menuLayout = ref<'top' | 'left'>(
  (localStorage.getItem('menuLayout') as 'top' | 'left') || 'top'
);

window.addEventListener('storage', (e) => {
  if (e.key === 'menuLayout' && e.newValue) {
    menuLayout.value = e.newValue as 'top' | 'left';
  }
});

let lastLayout = menuLayout.value;
setInterval(() => {
  const current = localStorage.getItem('menuLayout') as 'top' | 'left' || 'top';
  if (current !== lastLayout) {
    lastLayout = current;
    menuLayout.value = current;
  }
}, 300);

function isTabActive(tab: { path: string }): boolean {
  if (tab.path === '/') return route.path === '/';
  return route.path === tab.path || route.path.startsWith(tab.path + '/');
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

const saved = localStorage.getItem('theme');
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
</script>

<style scoped>
.layout-root {
  min-height: 100vh;
}

.layout-left {
  display: flex;
  flex-direction: row;
}

/* 侧边栏 */
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--border);
}
.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.01em;
  white-space: nowrap;
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
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.sidebar-label {
  flex: 1;
  line-height: 1;
}
.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border);
}

/* 顶部模式标题 */
.header-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.01em;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}
.tab-btn :deep(svg) {
  flex-shrink: 0;
  display: block;
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
</style>
