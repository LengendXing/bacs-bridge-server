<template>
  <div class="help-page">
    <!-- 滑块式 TabBar -->
    <div ref="segTabsEl" class="seg-tabs">
      <span
        class="seg-indicator"
        aria-hidden="true"
        :style="{ left: indicatorLeft + 'px', width: indicatorWidth + 'px' }"
      />
      <button
        v-for="(p, i) in platforms"
        :key="p.id"
        :ref="(el) => setSegTabRef(el, i)"
        type="button"
        class="seg-tab"
        :class="{ active: activePlatform === p.id }"
        @click="activePlatform = p.id"
      >
        <component :is="p.icon" :size="14" :stroke-width="1.6" />
        <span>{{ p.label }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="help-content">
      <!-- 飞书 -->
      <template v-if="activePlatform === 'feishu'">
        <div class="glass-card">
          <h3 class="help-section-title">
            <component :is="platforms[0].icon" :size="20" :stroke-width="1.5" />
            {{ t('help.feishuTitle') }}
          </h3>
          <ol class="help-steps">
            <li v-for="(step, i) in feishuSteps" :key="i">{{ step }}</li>
          </ol>
        </div>
      </template>

      <!-- Telegram -->
      <template v-else-if="activePlatform === 'telegram'">
        <div class="glass-card">
          <h3 class="help-section-title">
            <component :is="platforms[1].icon" :size="20" :stroke-width="1.5" />
            {{ t('help.telegramTitle') }}
          </h3>
          <p class="help-placeholder">{{ t('help.notImplemented') }}</p>
        </div>
      </template>

      <!-- QQ -->
      <template v-else-if="activePlatform === 'qq'">
        <div class="glass-card">
          <h3 class="help-section-title">
            <component :is="platforms[2].icon" :size="20" :stroke-width="1.5" />
            QQ
          </h3>
          <p class="help-placeholder">{{ t('help.notImplemented') }}</p>
        </div>
      </template>

      <!-- WeChat -->
      <template v-else-if="activePlatform === 'wechat'">
        <div class="glass-card">
          <h3 class="help-section-title">
            <component :is="platforms[3].icon" :size="20" :stroke-width="1.5" />
            {{ t('help.qqWechatTitle') }}
          </h3>
          <p class="help-placeholder">{{ t('help.notImplemented') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, h } from 'vue';
import type { FunctionalComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessageCircle } from 'lucide-vue-next';

const { t } = useI18n();
const feishuSteps = computed(() => t('help.feishuSteps') as unknown as string[]);

/* ── 平台 Logo（复用 BotsView 同款 inline SVG）── */
interface LogoProps {
  size?: number | string;
}
function makeLogo(viewBox: string, path: string): FunctionalComponent<LogoProps> {
  const C: FunctionalComponent<LogoProps> = (props) =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: props.size ?? 16,
        height: props.size ?? 16,
        viewBox,
        fill: 'currentColor',
        'aria-hidden': 'true',
      },
      [h('path', { d: path })],
    );
  C.props = ['size'];
  return C;
}

const FeishuLogo = makeLogo(
  '0 0 24 24',
  'M3.5 4h13a1 1 0 0 1 1 1v3.2H9.4v3.1h6.5v3.2H9.4V20H6.2V5a1 1 0 0 1-2.7-1Z M19 7.5c1.4 0 2.5 1 2.5 2.5s-1.1 2.5-2.5 2.5S16.5 11.4 16.5 10 17.6 7.5 19 7.5Z',
);
const TelegramLogo = makeLogo(
  '0 0 24 24',
  'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42Z',
);
const QQLogo = makeLogo(
  '0 0 24 24',
  'M12 2.2c-3.6 0-6.3 2.6-6.3 6.4 0 1.6.5 3 1.3 4.1-.9 1.6-2 3.8-2 5.2 0 1 .6 1.6 1.5 1.6.9 0 2-.6 2.9-1.5.4.3.9.5 1.5.7-.5.5-.8 1.1-.8 1.7 0 1.1 1.3 1.4 3.9 1.4s3.9-.3 3.9-1.4c0-.6-.3-1.2-.8-1.7.6-.2 1.1-.4 1.5-.7.9.9 2 1.5 2.9 1.5.9 0 1.5-.6 1.5-1.6 0-1.4-1.1-3.6-2-5.2.8-1.1 1.3-2.5 1.3-4.1 0-3.8-2.7-6.4-6.3-6.4Zm-2.3 5.4c.8 0 1.5.9 1.5 2s-.7 2-1.5 2-1.5-.9-1.5-2 .7-2 1.5-2Zm4.6 0c.8 0 1.5.9 1.5 2s-.7 2-1.5 2-1.5-.9-1.5-2 .7-2 1.5-2Zm-4.5 1.1c-.4 0-.7.4-.7.9s.3.9.7.9.7-.4.7-.9-.3-.9-.7-.9Zm4.4 0c-.4 0-.7.4-.7.9s.3.9.7.9.7-.4.7-.9-.3-.9-.7-.9ZM9.6 20.4c-.4-.3-.6-.6-.6-.9 0-.6.9-1.1 1.9-1.1.3 0 .6 0 .9.1v2.1c-.9 0-1.7-.1-2.2-.2Zm4.8 0c-.5.1-1.3.2-2.2.2v-2.1c.3-.1.6-.1.9-.1 1 0 1.9.5 1.9 1.1 0 .3-.2.6-.6.9Z',
);
const WeChatLogo = makeLogo(
  '0 0 24 24',
  'M8.69 4C5 4 2 6.46 2 9.5c0 1.71 1 3.22 2.52 4.21L4 16l2.43-1.3c.6.15 1.23.24 1.86.27-.05-.32-.07-.65-.07-.97 0-3.27 3.13-5.95 7-5.95.27 0 .54.01.81.04C15.45 5.55 12.36 4 8.69 4Zm-2.3 3.5a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.6 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7ZM15.4 9.43c-3.21 0-5.81 2.13-5.81 4.77 0 2.63 2.6 4.77 5.81 4.77.62 0 1.22-.08 1.79-.23L19 20l-.55-1.74c1.27-.86 2.1-2.17 2.1-3.66 0-2.64-2.6-4.77-5.79-4.77ZM13.6 12.3a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Zm3.8 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Z',
);

type PlatformId = 'feishu' | 'telegram' | 'qq' | 'wechat';
const platforms = [
  { id: 'feishu' as PlatformId, label: t('bots.platformFeishu'), icon: FeishuLogo },
  { id: 'telegram' as PlatformId, label: 'Telegram', icon: TelegramLogo },
  { id: 'qq' as PlatformId, label: 'QQ', icon: QQLogo },
  { id: 'wechat' as PlatformId, label: t('bots.platformWechat'), icon: WeChatLogo },
];
const activePlatform = ref<PlatformId>('feishu');

/* ── 滑块指示器逻辑 ── */
const segTabsEl = ref<HTMLElement | null>(null);
const segTabRefs: HTMLElement[] = [];
const indicatorLeft = ref(3);
const indicatorWidth = ref(0);
const activeIndex = computed(() => platforms.findIndex((p) => p.id === activePlatform.value));

function setSegTabRef(el: unknown, i: number) {
  if (el instanceof HTMLElement) segTabRefs[i] = el;
}

function updateIndicator() {
  const idx = activeIndex.value;
  const el = segTabRefs[idx];
  const wrap = segTabsEl.value;
  if (!el || !wrap) return;
  indicatorLeft.value = el.offsetLeft;
  indicatorWidth.value = el.offsetWidth;
}

watch(activeIndex, () => nextTick(updateIndicator));
onMounted(() => nextTick(updateIndicator));
</script>

<style scoped>
.help-page {
  max-width: 720px;
}

/* 滑块式 TabBar（复用 BotsView 同款） */
.seg-tabs {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
  gap: 0;
  margin-bottom: 16px;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}
.seg-indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: left 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    width 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    background-color 0.3s ease, border-color 0.3s ease;
  pointer-events: none;
  will-change: left, width;
}
.seg-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  transition: color 0.22s ease;
}
.seg-tab:hover {
  color: var(--text);
}
.seg-tab.active {
  color: var(--text);
}

/* 内容区 */
.help-content {
  margin-top: 16px;
}
.help-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}
.help-steps {
  padding-left: 20px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 2;
}
.help-placeholder {
  color: var(--text-secondary);
  font-size: 14px;
  opacity: 0.7;
  font-style: italic;
}
</style>
