import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
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
        meta: { breadcrumb: ['nav.home'] },
      },
      {
        path: 'bindings',
        name: 'bindings',
        component: () => import('../views/BindingsView.vue'),
        meta: { breadcrumb: ['nav.bindGroup', 'nav.bindings'] },
      },
      {
        path: 'machines',
        name: 'machines',
        component: () => import('../views/MachinesView.vue'),
        meta: { breadcrumb: ['nav.ops', 'nav.machine'] },
      },
      {
        path: 'providers',
        name: 'providers',
        component: () => import('../views/ProvidersView.vue'),
        meta: { breadcrumb: ['nav.bindGroup', 'nav.providers'] },
      },
      {
        path: 'bots',
        name: 'bots',
        component: () => import('../views/BotsView.vue'),
        meta: { breadcrumb: ['nav.bindGroup', 'nav.bots'] },
      },
      {
        path: 'logs',
        name: 'logs',
        redirect: '/logs/realtime',
      },
      {
        path: 'logs/realtime',
        name: 'logs-realtime',
        component: () => import('../views/LogsRealtimeView.vue'),
        meta: { breadcrumb: ['nav.logs', 'nav.realtimeLogs'] },
      },
      {
        path: 'logs/audit',
        name: 'logs-audit',
        component: () => import('../views/LogsAuditView.vue'),
        meta: { breadcrumb: ['nav.logs', 'nav.auditLogs'] },
      },
      {
        path: 'logs/billing',
        name: 'logs-billing',
        component: () => import('../views/LogsBillingView.vue'),
        meta: { breadcrumb: ['nav.logs', 'nav.billingLogs'] },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { breadcrumb: ['nav.settings'] },
      },
      {
        path: 'help',
        name: 'help',
        component: () => import('../views/HelpView.vue'),
        meta: { breadcrumb: ['nav.help'] },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' };
  }
});

export default router;
