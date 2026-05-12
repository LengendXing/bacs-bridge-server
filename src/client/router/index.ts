import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

/** 路由配置 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    // 独立页面，不嵌 LayoutView：window.open 新窗口打开
    path: '/terminal/:bindingId',
    name: 'terminal',
    component: () => import('../views/TerminalView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/',
    component: () => import('../views/LayoutView.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('../views/HomeView.vue'),
      },
      {
        path: 'bindings',
        name: 'bindings',
        component: () => import('../views/BindingsView.vue'),
      },
      {
        path: 'machines',
        name: 'machines',
        component: () => import('../views/MachinesView.vue'),
      },
      {
        path: 'providers',
        name: 'providers',
        component: () => import('../views/ProvidersView.vue'),
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('../views/LogsView.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/** 路由守卫：未登录则跳转登录页 */
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  // 已登录访问登录页则跳转首页
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' };
  }
});

export default router;
