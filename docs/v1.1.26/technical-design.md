# v1.1.26 技术方案

## 版本信息
- 版本号：1.1.26
- 日期：2026-05-17

---

## 一、整体架构变更

```
src/client/
├── i18n/                    ← 新增：i18n 初始化
│   └── index.ts
├── locales/                 ← 新增：语言文件
│   ├── zh.ts
│   └── en.ts
├── components/
│   ├── Breadcrumb.vue       ← 新增：面包屑组件
│   ├── Pagination.vue       （已有）
│   ├── TerminalPanel.vue    （已有）
│   └── BacsLogo.vue         （已有）
├── views/
│   ├── HelpView.vue         ← 新增：帮助页面
│   ├── LayoutView.vue       （修改：Header 图标 + 侧边栏修复 + 面包屑插槽）
│   └── ...                  （修改：所有 view 硬编码中文 → i18n key）
└── router/
    └── index.ts             （修改：新增 /help 路由）
```

---

## 二、R1 主题切换改为图标切换

### 改动文件
- `src/client/views/LayoutView.vue`

### 实现方案
1. 移除 `Moon` + `.theme-toggle` + `Sun` 三件套
2. 引入 lucide 的 `Sun` 和 `Moon` 图标，根据当前主题显示其中一个：
   - 亮色模式 → 显示 `Moon` 图标（提示"点击切换到暗色"）
   - 暗色模式 → 显示 `Sun` 图标（提示"点击切换到亮色"）
3. 用 computed `isDark` 判断当前主题：`document.documentElement.classList.contains('dark')`
4. 图标尺寸统一 `:size="20" :stroke-width="1.5"`，加 `cursor-pointer` 样式 + hover 效果
5. 顶部模式和左侧模式两处 header 同步修改
6. 删除 `.theme-toggle` 相关 CSS（约 20 行滑块样式）

### 模板结构
```html
<!-- 替换原有的 Moon + toggle + Sun -->
<button class="icon-btn" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
  <Sun v-if="isDark" :size="20" :stroke-width="1.5" />
  <Moon v-else :size="20" :stroke-width="1.5" />
</button>
```

---

## 三、R2 语言切换 + i18n 框架

### 新增依赖
- `vue-i18n@^10` （Vue 3 官方 i18n 库）

### 文件结构
```
src/client/
├── i18n/index.ts          — createI18n + install
├── locales/
│   ├── zh.ts              — 中文语言包（全量）
│   └── en.ts              — 英文语言包（全量）
```

### i18n/index.ts
```ts
import { createI18n } from 'vue-i18n';
import zh from '../locales/zh';
import en from '../locales/en';

const i18n = createI18n({
  legacy: false,           // Composition API 模式
  locale: localStorage.getItem('locale') || 'zh',
  fallbackLocale: 'zh',
  messages: { zh, en },
});

export default i18n;
```

### main.ts 改动
```ts
import i18n from './i18n';
app.use(i18n);
```

### 语言文件结构（zh.ts / en.ts）
```ts
export default {
  common: {
    loading: '加载中...',
    noData: '暂无数据',
    confirm: '确认',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    save: '保存',
    refresh: '刷新',
    detail: '详情',
  },
  nav: {
    home: '首页',
    ops: '运维中心',
    machine: '机器',
    bindGroup: '绑定管理',
    bots: 'Bots',
    providers: '服务商',
    bindings: '绑定',
    logs: '日志',
    realtimeLogs: '实时日志',
    auditLogs: '审计日志',
    billingLogs: '扣费日志',
    settings: '设置',
    help: '帮助',
  },
  header: {
    appName: '笨迪桥接',
    appSubtitle: 'Bridge Admin Control System',
  },
  // ... 各 view 独立 section
  home: { ... },
  bindings: { ... },
  // ...
};
```

### 语言切换按钮实现（LayoutView.vue）
1. 引入 lucide `Languages` 图标
2. 在主题切换图标**左侧**放置语言按钮
3. 点击切换：`locale.value = locale.value === 'zh' ? 'en' : 'zh'`
4. 持久化：`localStorage.setItem('locale', locale.value)`
5. 图标尺寸 `:size="20" :stroke-width="1.5"`

```html
<button class="icon-btn" @click="toggleLocale" :title="locale === 'zh' ? 'Switch to English' : '切换中文'">
  <Languages :size="20" :stroke-width="1.5" />
</button>
```

### i18n 迁移策略
- 本次先迁移 LayoutView + 帮助页面 + 面包屑中的文案
- 其余 view 的硬编码中文在本次迭代中一并迁移（必须全部走 key，不留硬编码）
- 每个语言包约 2600+ 中文字符需拆分为 key

---

## 四、R3 帮助按钮 + 帮助页面

### 新增文件
- `src/client/views/HelpView.vue`

### 路由
```ts
{ path: 'help', name: 'help', component: () => import('../views/HelpView.vue') }
```

### 帮助按钮（LayoutView.vue）
1. 引入 lucide `Info` 图标
2. 放在语言切换和主题切换图标**右侧**（即最右边）
3. 点击跳转 `/help`
4. 图标尺寸 `:size="20" :stroke-width="1.5"`

```html
<button class="icon-btn" @click="router.push('/help')" :title="t('nav.help')">
  <Info :size="20" :stroke-width="1.5" />
</button>
```

### HelpView.vue 结构
```html
<template>
  <div>
    <h2>{{ t('help.title') }}</h2>

    <!-- 飞书板块 -->
    <div class="glass-card">
      <h3>飞书机器人接入指引</h3>
      <ol>
        <li>登录飞书开放平台 → 创建企业自建应用</li>
        <li>应用能力 → 添加「机器人」能力</li>
        <li>权限管理 → 开通消息相关权限（im:message:send_as_bot 等）</li>
        <li>凭证与基础信息 → 获取 App ID 和 App Secret</li>
        <li>在 BACS 管理面板 → Bots 页面创建机器人，填入 App ID / Secret</li>
        <li>在绑定页面关联机器人到 CC 进程</li>
        <li>在飞书应用配置 → 事件订阅 → 配置 WebSocket 接收消息</li>
      </ol>
    </div>

    <!-- 其他平台占位 -->
    <div class="glass-card" style="opacity: 0.6">
      <h3>Telegram</h3>
      <p>待实现</p>
    </div>
    <div class="glass-card" style="opacity: 0.6">
      <h3>QQ / 微信</h3>
      <p>待实现</p>
    </div>
  </div>
</template>
```

---

## 五、R4 面包屑导航

### 新增文件
- `src/client/components/Breadcrumb.vue`

### 路由元信息配置
在 router/index.ts 中为每个路由添加 `meta.breadcrumb`：

```ts
{
  path: '',
  name: 'home',
  component: ...,
  meta: { breadcrumb: [{ label: 'nav.home' }] }
},
{
  path: 'machines',
  name: 'machines',
  component: ...,
  meta: { breadcrumb: [{ label: 'nav.ops' }, { label: 'nav.machine', route: '/machines' }] }
},
// ...
```

### Breadcrumb.vue 实现
```ts
const route = useRoute();
const items = computed(() => route.meta.breadcrumb as Array<{label: string; route?: string}> || []);
```

```html
<nav class="breadcrumb">
  <template v-for="(item, i) in items" :key="i">
    <router-link v-if="item.route && i < items.length - 1" :to="item.route" class="breadcrumb-link">
      {{ t(item.label) }}
    </router-link>
    <span v-else class="breadcrumb-current">{{ t(item.label) }}</span>
    <span v-if="i < items.length - 1" class="breadcrumb-sep">›</span>
  </template>
</nav>
```

### 样式
```css
.breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 12px; }
.breadcrumb-link { color: var(--text-secondary); text-decoration: none; }
.breadcrumb-link:hover { color: var(--text); }
.breadcrumb-current { color: var(--text); font-weight: 500; }
.breadcrumb-sep { color: var(--text-secondary); }
```

### 插入位置
LayoutView.vue 的 `<div class="px-6 pb-6">` 内部，`<router-view>` 上方：

```html
<div class="px-6 pb-6">
  <Breadcrumb />   ← 新增
  <router-view ...>
```

---

## 六、R5 版本升级

- package.json: `"version": "1.1.26"`
- docs/maintain.md: 新增 v1.1.26 条目
- docs/plan.md: 标记完成

---

## 七、R6 侧边栏菜单展开 bug

### 问题
`expandedGroups` 默认值硬编码了所有分组：
```ts
const expandedGroups = ref<Set<string>>(new Set(['运维中心', '绑定管理', '日志']));
```

### 修复
1. 默认值为空 Set：`new Set()`
2. 用 computed 根据当前路由自动确定应展开的分组：
   - 路由在 `/machines` → 展开「运维中心」
   - 路由在 `/bots`、`/providers`、`/bindings` → 展开「绑定管理」
   - 路由在 `/logs/*` → 展开「日志」
3. watch route 变化，自动展开对应分组 + 收起其余：

```ts
const expandedGroups = ref<Set<string>>(new Set());

function autoExpandForRoute(path: string) {
  const next = new Set<string>();
  if (path.startsWith('/machines')) next.add('运维中心');
  if (path.startsWith('/bots') || path.startsWith('/providers') || path.startsWith('/bindings')) next.add('绑定管理');
  if (path.startsWith('/logs')) next.add('日志');
  expandedGroups.value = next;
}

watch(() => route.path, (p) => autoExpandForRoute(p), { immediate: true });
```

---

## 八、执行顺序

1. 安装 vue-i18n，搭建 i18n 框架 + 语言文件骨架
2. 修改 LayoutView：主题图标 + 语言按钮 + 帮助按钮 + 侧边栏修复
3. 新增 Breadcrumb 组件 + 路由 meta 配置
4. 新增 HelpView + 路由
5. 全量迁移所有 view 硬编码中文到 i18n key
6. 版本号 + 文档更新
7. lint / build / test / commit / push

---

## 九、风险点

1. **i18n 迁移量大**：13 个 view 共 ~2600 中文字符需拆 key，工作量大但机械性强
2. **i18n key 命名规范**：统一用 `viewName.section.key` 格式，避免冲突
3. **keep-alive 兼容**：BindingsView 被 keep-alive 缓存，i18n 切换后需确保响应式更新（vue-i18n Composition API 模式天然支持）
4. **面包屑与二级路由**：`/logs` redirect 到 `/logs/realtime`，breadcrumb meta 需配置在实际子路由上
