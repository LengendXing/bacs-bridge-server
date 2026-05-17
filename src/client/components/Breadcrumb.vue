<template>
  <nav v-if="crumbs.length > 0" class="breadcrumb">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <router-link
        v-if="crumb.to && i < crumbs.length - 1"
        :to="crumb.to"
        class="breadcrumb-link"
      >
        {{ crumb.label }}
      </router-link>
      <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
      <span v-if="i < crumbs.length - 1" class="breadcrumb-sep">/</span>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t } = useI18n();

interface Crumb {
  label: string;
  to?: string;
}

const crumbs = computed<Crumb[]>(() => {
  const meta = route.meta?.breadcrumb as string[] | undefined;
  if (!meta || meta.length === 0) return [];
  return meta.map((key, i) => ({
    label: t(key),
    to: i < meta.length - 1 ? getParentPath(key) : undefined,
  }));
});

function getParentPath(key: string): string | undefined {
  const map: Record<string, string> = {
    'nav.bindGroup': '/bots',
    'nav.logs': '/logs/realtime',
  };
  return map[key];
}
</script>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.breadcrumb-link {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s;
}
.breadcrumb-link:hover {
  color: var(--accent);
}
.breadcrumb-current {
  color: var(--text);
  font-weight: 500;
}
.breadcrumb-sep {
  opacity: 0.4;
  user-select: none;
}
</style>
