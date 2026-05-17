<template>
  <div class="help-page">
    <!-- 飞书 -->
    <section class="help-section">
      <h2 class="help-section-title">
        <Bot :size="20" :stroke-width="1.5" />
        {{ t('help.feishuTitle') }}
      </h2>
      <ol class="help-steps">
        <li v-for="(step, i) in feishuSteps" :key="i">{{ step }}</li>
      </ol>
    </section>

    <!-- Telegram -->
    <section class="help-section">
      <h2 class="help-section-title">
        <Send :size="20" :stroke-width="1.5" />
        {{ t('help.telegramTitle') }}
      </h2>
      <p class="help-placeholder">{{ t('help.notImplemented') }}</p>
    </section>

    <!-- QQ / WeChat -->
    <section class="help-section">
      <h2 class="help-section-title">
        <MessageCircle :size="20" :stroke-width="1.5" />
        {{ t('help.qqWechatTitle') }}
      </h2>
      <p class="help-placeholder">{{ t('help.notImplemented') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bot, Send, MessageCircle } from 'lucide-vue-next';

const { t } = useI18n();
const feishuSteps = computed(() => t('help.feishuSteps') as unknown as string[]);
</script>

<style scoped>
.help-page {
  max-width: 720px;
}
.help-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
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
