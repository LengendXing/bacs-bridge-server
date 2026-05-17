<template>
  <div class="layout-root" :class="{ 'layout-left': menuLayout === 'left' }">
    <!-- 左侧菜单模式：侧边栏 -->
    <aside v-if="menuLayout === 'left'" class="sidebar">
      <div class="sidebar-header">
        <BacsLogo :size="28" />
        <div class="sidebar-title-wrap">
          <span class="sidebar-title">{{ t('header.appName') }}</span>
          <span class="sidebar-version">v{{ appVersion }}</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <template v-for="item in menuItems" :key="item.labelKey">
          <!-- 单层菜单项 -->
          <button
            v-if="!item.children"
            class="sidebar-btn"
            :class="{ active: isItemActive(item.path!) }"
            @click="router.push(item.path!)"
          >
            <component :is="item.icon" class="sidebar-icon" :size="18" :stroke-width="1.5" />
            <span class="sidebar-label">{{ t(item.labelKey) }}</span>
          </button>
          <!-- 分组（含 children） -->
          <template v-else>
            <button
              class="sidebar-btn sidebar-group-btn"
              :class="{ 'group-active': isGroupActive(item) }"
              @click="toggleGroup(item.labelKey)"
            >
              <component :is="item.icon" class="sidebar-icon" :size="18" :stroke-width="1.5" />
              <span class="sidebar-label">{{ t(item.labelKey) }}</span>
              <component
                :is="expandedGroups.has(item.labelKey) ? ChevronDown : ChevronRight"
                :size="14"
                :stroke-width="1.5"
                class="sidebar-chevron"
              />
            </button>
            <div v-show="expandedGroups.has(item.labelKey)" class="sidebar-children">
              <button
                v-for="child in item.children"
                :key="child.path"
                class="sidebar-btn sidebar-child-btn"
                :class="{ active: isItemActive(child.path) }"
                @click="router.push(child.path)"
              >
                <component :is="child.icon" class="sidebar-icon" :size="16" :stroke-width="1.5" />
                <span class="sidebar-label">{{ t(child.labelKey) }}</span>
              </button>
            </div>
          </template>
        </template>
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-btn" @click="auth.logout(); router.push('/login')">
          <LogOut class="sidebar-icon" :size="18" :stroke-width="1.5" />
          <span class="sidebar-label">{{ t('nav.logout') }}</span>
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
              <span class="header-title">{{ t('header.appName') }}</span>
            </div>
            <p class="text-sm mt-1" style="color: var(--text-secondary)">
              {{ t('header.appSubtitle') }}
              <span class="version-badge">v{{ appVersion }}</span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button class="icon-btn" @click="toggleLocale" :title="t('header.switchLang')">
              <Languages :size="20" :stroke-width="1.5" />
            </button>
            <button class="icon-btn" @click="toggleTheme" :title="isDark ? t('header.switchLight') : t('header.switchDark')">
              <Sun v-if="isDark" :size="20" :stroke-width="1.5" />
              <Moon v-else :size="20" :stroke-width="1.5" />
            </button>
            <button class="icon-btn" @click="router.push('/help')" :title="t('header.helpTitle')">
              <Info :size="20" :stroke-width="1.5" />
            </button>
          </div>
        </header>

        <!-- 顶部模式：两级 Tab -->
        <div class="mx-6 mb-6">
          <!-- 一级菜单 -->
          <div class="tab-bar" style="margin-bottom: 8px">
            <button
              v-for="item in menuItems"
              :key="item.labelKey"
              class="tab-btn"
              :class="{ active: isTopLevelActive(item) }"
              @click="onTopLevelClick(item)"
            >
              <component :is="item.icon" :size="16" :stroke-width="1.5" />
              <span>{{ t(item.labelKey) }}</span>
            </button>
          </div>
          <!-- 二级菜单 -->
          <div v-if="activeTopChildren.length > 0" class="tab-bar" style="background: transparent; border-color: transparent; padding: 0">
            <button
              v-for="child in activeTopChildren"
              :key="child.path"
              class="tab-btn tab-btn-child"
              :class="{ active: isItemActive(child.path) }"
              @click="router.push(child.path)"
            >
              <component :is="child.icon" :size="14" :stroke-width="1.5" />
              <span>{{ t(child.labelKey) }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- 左侧模式：简化顶栏 -->
      <header v-if="menuLayout === 'left'" class="flex items-center justify-end mb-6 px-6 pt-6">
        <div class="flex items-center gap-3">
          <button class="icon-btn" @click="toggleLocale" :title="t('header.switchLang')">
            <Languages :size="20" :stroke-width="1.5" />
          </button>
          <button class="icon-btn" @click="toggleTheme" :title="isDark ? t('header.switchLight') : t('header.switchDark')">
            <Sun v-if="isDark" :size="20" :stroke-width="1.5" />
            <Moon v-else :size="20" :stroke-width="1.5" />
          </button>
          <button class="icon-btn" @click="router.push('/help')" :title="t('header.helpTitle')">
            <Info :size="20" :stroke-width="1.5" />
          </button>
        </div>
      </header>

      <div class="px-6 pb-6">
        <Breadcrumb />
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
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth';
import BacsLogo from '../components/BacsLogo.vue';
import Breadcrumb from '../components/Breadcrumb.vue';
import {
  Home,
  Link,
  Server,
  Cloud,
  FileText,
  Settings,
  LogOut,
  Moon,
  Sun,
  Bot,
  Wrench,
  ChevronDown,
  ChevronRight,
  Activity,
  Shield,
  DollarSign,
  Languages,
  Info,
} from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const auth = useAuth();
const { t, locale } = useI18n();
const appVersion = __APP_VERSION__;

interface MenuLeaf {
  path: string;
  labelKey: string;
  icon: any;
}
interface MenuItem {
  labelKey: string;
  icon: any;
  path?: string;
  children?: MenuLeaf[];
}

const menuItems: MenuItem[] = [
  { path: '/', labelKey: 'nav.home', icon: Home },
  {
    labelKey: 'nav.ops',
    icon: Wrench,
    children: [{ path: '/machines', labelKey: 'nav.machine', icon: Server }],
  },
  {
    labelKey: 'nav.bindGroup',
    icon: Link,
    children: [
      { path: '/bots', labelKey: 'nav.bots', icon: Bot },
      { path: '/providers', labelKey: 'nav.providers', icon: Cloud },
      { path: '/bindings', labelKey: 'nav.bindings', icon: Link },
    ],
  },
  {
    labelKey: 'nav.logs',
    icon: FileText,
    children: [
      { path: '/logs/realtime', labelKey: 'nav.realtimeLogs', icon: Activity },
      { path: '/logs/audit', labelKey: 'nav.auditLogs', icon: Shield },
      { path: '/logs/billing', labelKey: 'nav.billingLogs', icon: DollarSign },
    ],
  },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

// R6: 侧边栏只展开当前路由所在分组
const expandedGroups = ref<Set<string>>(new Set());

function autoExpandForRoute(path: string) {
  const next = new Set<string>();
  if (path.startsWith('/machines')) next.add('nav.ops');
  if (path.startsWith('/bots') || path.startsWith('/providers') || path.startsWith('/bindings')) next.add('nav.bindGroup');
  if (path.startsWith('/logs')) next.add('nav.logs');
  expandedGroups.value = next;
}

watch(() => route.path, (p) => autoExpandForRoute(p), { immediate: true });

function toggleGroup(labelKey: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(labelKey)) next.delete(labelKey);
  else next.add(labelKey);
  expandedGroups.value = next;
}

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

function isItemActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(path + '/');
}

function isGroupActive(item: MenuItem): boolean {
  if (item.path) return isItemActive(item.path);
  return item.children?.some((c) => isItemActive(c.path)) ?? false;
}

function isTopLevelActive(item: MenuItem): boolean {
  return isGroupActive(item);
}

function onTopLevelClick(item: MenuItem) {
  if (item.path) {
    router.push(item.path);
    return;
  }
  const first = item.children?.[0];
  if (first) router.push(first.path);
}

const activeTopChildren = computed<MenuLeaf[]>(() => {
  const active = menuItems.find((item) => isTopLevelActive(item));
  return active?.children ?? [];
});

// R1: 主题切换
const isDark = ref(document.documentElement.classList.contains('dark'));

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  isDark.value = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

const saved = localStorage.getItem('theme');
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
  isDark.value = true;
}

// R2: 语言切换
function toggleLocale() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
  localStorage.setItem('locale', locale.value);
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
.sidebar-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sidebar-version {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.version-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
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
/* 两级菜单 — 分组节点 */
.sidebar-group-btn {
  font-weight: 500;
}
.sidebar-btn.group-active {
  color: var(--text);
}
.sidebar-chevron {
  flex-shrink: 0;
  opacity: 0.6;
}
.sidebar-children {
  margin: 2px 0 4px 12px;
  padding-left: 8px;
  border-left: 1px solid var(--border);
}
.sidebar-child-btn {
  padding: 8px 10px;
  font-size: 13px;
}
/* 顶部模式 — 二级 Tab */
.tab-btn-child {
  padding: 4px 10px;
  font-size: 12px;
  opacity: 0.85;
}
.tab-btn-child.active {
  opacity: 1;
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

/* R1: 图标按钮替代滑块开关 */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}
.icon-btn:hover {
  color: var(--text);
  background: rgba(0, 0, 0, 0.04);
}
</style>
